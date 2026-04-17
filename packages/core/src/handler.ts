import type { BlockRateResult } from "./types";
import { isValidBlockRateResult } from "./validate";

/**
 * Default hosted ingest base URL. `forward` appends `/ingest` to this.
 * Override via `forward.endpoint` when pointing at staging or a self-hosted
 * blockrate-server instance.
 */
const DEFAULT_FORWARD_ENDPOINT = "https://blockrate.app/api";

/** Default upstream fetch timeout, in ms. */
const DEFAULT_FORWARD_TIMEOUT_MS = 5000;

/**
 * Hosted API keys look like `br_<random>`. We validate at handler construction
 * time so typo'd or missing env vars fail loudly at deploy rather than
 * silently posting `x-blockrate-key: undefined` in production.
 */
const API_KEY_PATTERN = /^br_[A-Za-z0-9_-]+$/;

/**
 * Upstream error bodies are untrusted strings from the ingest server (or
 * whatever proxy/WAF sits between us and it). Cap them so a 4 MB HTML
 * error page does not flood logs, and so a misbehaving proxy that echoes
 * request payloads back cannot smuggle arbitrary data into customer logs.
 */
const MAX_FORWARD_ERROR_BODY = 2048;

/** Shape passed to `forward.onError`. Never contains the API key. */
export type ForwardError =
  | { kind: "network"; cause: unknown }
  | { kind: "upstream"; status: number; statusText: string; body: string };

export interface ForwardOptions {
  /**
   * Your blockrate API key (starts with `br_`). Pass explicitly, e.g.
   * `forward: { apiKey: process.env.BLOCKRATE_API_KEY! }`. The library
   * never reads environment variables itself.
   *
   * An empty, undefined, or malformed key throws at handler construction
   * time — intentional, so a missing env var surfaces at deploy rather
   * than as silent upstream 401s in production.
   */
  apiKey: string;
  /**
   * Override the upstream base URL. Defaults to `https://blockrate.app/api`
   * (hosted). The helper appends `/ingest` internally. Use this to target a
   * staging environment or to chain into a self-hosted `blockrate-server`.
   */
  endpoint?: string;
  /**
   * Optional observability hook. Invoked when the upstream request fails
   * (network error / abort / non-2xx response). Without this, upstream
   * failures are invisible — your dashboard silently stops receiving data.
   * Hook this into your existing logger / alerting.
   */
  onError?: (err: ForwardError) => void;
  /**
   * Upstream fetch timeout in ms. Defaults to 5000. Keep this well under
   * your platform's route timeout (Vercel Edge: 25s, Workers: 30s CPU).
   */
  timeoutMs?: number;
}

export interface BlockRateHandlerOptions {
  /**
   * Local side-effect hook. Invoked with the validated payload; runs in
   * parallel with `forward`. If it throws, the error is logged to
   * `console.error` and the browser still receives `204` — isolation is
   * guaranteed so a customer logger crash does not block hosted forwarding
   * (and a hosted outage does not block local logging).
   */
  onResult?: (result: BlockRateResult) => void | Promise<void>;
  /**
   * Enables server-side forwarding to the hosted (or self-hosted) blockrate
   * ingest endpoint. This is the recommended integration for
   * `blockrate.app` — your API key stays on the server and the browser
   * only sees your first-party `/api/block-rate` route.
   */
  forward?: ForwardOptions;
}

function assertValidApiKey(apiKey: unknown): asserts apiKey is string {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error(
      "createBlockRateHandler: forward.apiKey is required when forward is set. " +
        "Pass your blockrate API key explicitly, e.g. " +
        "forward: { apiKey: process.env.BLOCKRATE_API_KEY! }",
    );
  }
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new Error(
      "createBlockRateHandler: forward.apiKey does not match the expected format " +
        "(must start with `br_` and contain only alphanumeric, underscore, or dash). " +
        "Check that the env var is actually set at deploy time.",
    );
  }
}

function resolveForwardUrl(endpoint: string | undefined): string {
  const base = endpoint ?? DEFAULT_FORWARD_ENDPOINT;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(
      `createBlockRateHandler: forward.endpoint "${base}" is not a valid URL. ` +
        "Pass an absolute URL including scheme (e.g. https://blockrate.app/api).",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `createBlockRateHandler: forward.endpoint must use http or https (got "${parsed.protocol}").`,
    );
  }
  return `${base.replace(/\/$/, "")}/ingest`;
}

async function forwardToUpstream(
  url: string,
  payload: BlockRateResult,
  options: ForwardOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FORWARD_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
        "x-blockrate-key": options.apiKey,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
        if (body.length > MAX_FORWARD_ERROR_BODY) {
          body = body.slice(0, MAX_FORWARD_ERROR_BODY) + "…[truncated]";
        }
      } catch {
        // ignore body read failures; we still report status
      }
      reportError(options, {
        kind: "upstream",
        status: res.status,
        statusText: res.statusText,
        body,
      });
    }
  } catch (cause) {
    reportError(options, { kind: "network", cause });
  } finally {
    clearTimeout(timer);
  }
}

function reportError(options: ForwardOptions, err: ForwardError): void {
  if (!options.onError) return;
  try {
    options.onError(err);
  } catch (loggerErr) {
    // Customer-supplied logger should never affect the response. But a
    // throwing onError is a bug on their side worth surfacing — log once
    // per throw so it lands in platform logs without hiding the real
    // upstream error that triggered this path.
    try {
      console.warn("[blockrate] forward.onError threw:", loggerErr);
    } catch {
      // ignore logger-of-logger failures
    }
  }
}

/**
 * Framework-agnostic Web-standard handler. Takes a `Request`, returns a
 * `Response`. Used by every server-side adapter (Next.js App Router,
 * SvelteKit, TanStack Start, Bun, Cloudflare Workers, Hono — anywhere
 * Web-standard Request/Response is available).
 *
 * Contract:
 *   - Invalid JSON or wrong-shape payload → 400, nothing else runs.
 *   - Valid payload → runs `forward` and `onResult` in parallel via
 *     `Promise.allSettled`, then returns 204 regardless of either's
 *     outcome. Failure of one does not prevent the other.
 *   - Missing/malformed `forward.apiKey` → throws at construction time.
 */
export function createWebHandler(
  options: BlockRateHandlerOptions = {},
): (request: Request) => Promise<Response> {
  let forwardUrl: string | null = null;
  if (options.forward) {
    assertValidApiKey(options.forward.apiKey);
    forwardUrl = resolveForwardUrl(options.forward.endpoint);
  }
  const forward = options.forward;

  return async function handle(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("invalid payload", { status: 400 });
    }
    if (!isValidBlockRateResult(body)) {
      return new Response("invalid payload", { status: 400 });
    }

    const tasks: Promise<void>[] = [];
    if (forward && forwardUrl) {
      tasks.push(forwardToUpstream(forwardUrl, body, forward));
    }
    if (options.onResult) {
      const onResult = options.onResult;
      tasks.push(
        Promise.resolve()
          .then(() => onResult(body))
          .catch((err) => {
            // `onResult` is customer code. Errors are logged to the server's
            // stdout (visible in platform logs) but never propagate — the
            // browser always gets 204, and a thrown onResult does not
            // prevent `forward` from completing.
            try {
              console.error("[blockrate] onResult threw:", err);
            } catch {
              // ignore logger failures
            }
          }),
      );
    }
    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
    return new Response(null, { status: 204 });
  };
}
