/**
 * SPIKE — single-provider first-party reverse proxy (PostHog only).
 *
 * This is the proof-of-concept for the managed first-party proxy design
 * (docs/brainstorms/2026-07-21-managed-first-party-proxy.md). It answers one
 * question: can a customer serve a blocked provider's assets AND ingestion
 * API from their own domain, through a thin streaming worker, without
 * breaking the provider's SDK?
 *
 * Why a spike and not a feature: proxying a provider makes this worker part
 * of the customer's analytics critical path. The design doc — not this
 * directory — is where the rollout decision lives.
 *
 * Setup (3 minutes, mirroring examples/cloudflare-worker):
 *
 *   1. Install wrangler:             bun add -g wrangler
 *   2. Edit `wrangler.toml`:         uncomment the route on YOUR domain.
 *   3. Deploy:                       wrangler deploy
 *   4. Point your PostHog SDK at the proxy:
 *
 *        posthog.init("<project token>", {
 *          api_host: "https://metrics.example.com/ph",
 *          ui_host: "https://us.posthog.com", // keep the app UI on PostHog
 *        });
 *
 * Design notes:
 *   - The path prefix (`/ph`) is stripped before forwarding, so the SDK's
 *     usual paths (/static/array.js, /e/, /decide, /batch …) arrive at the
 *     upstream unchanged.
 *   - Bodies stream end-to-end: request.body is piped into the upstream
 *     fetch and the upstream response body is returned untouched. Nothing
 *     is buffered whole into memory.
 *   - No caching of any response in this spike. A production version may
 *     edge-cache /static/* GETs only; never event ingestion.
 */

export interface Env {
  /**
   * Upstream PostHog origin. Defaults to the US ingest host; set to
   * https://eu.i.posthog.com for EU projects. This mirrors the two smoke
   * targets in packages/core/test/probe-smoke.test.ts.
   */
  POSTHOG_UPSTREAM?: string;
}

const DEFAULT_UPSTREAM = "https://us.i.posthog.com";
const PATH_PREFIX = "/ph";

/** Hop-by-hop headers (RFC 9110 §7.6.1) must not be forwarded end-to-end. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== PATH_PREFIX && !url.pathname.startsWith(`${PATH_PREFIX}/`)) {
      return new Response("not found", { status: 404 });
    }

    const upstream = env.POSTHOG_UPSTREAM ?? DEFAULT_UPSTREAM;
    const upstreamUrl = new URL(upstream);
    // Strip the /ph prefix; keep the rest of the path and the query string.
    upstreamUrl.pathname = url.pathname.slice(PATH_PREFIX.length) || "/";
    upstreamUrl.search = url.search;

    const headers = new Headers(request.headers);
    // Snapshot the names first: deleting while iterating the live keys
    // iterator can skip entries.
    for (const name of Array.from(headers.keys())) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower) || lower.startsWith("cf-")) {
        headers.delete(name);
      }
    }
    // The upstream virtual-hosts on its own domain.
    headers.set("host", upstreamUrl.host);
    // Preserve the client IP for PostHog's geo resolution — the SDK's
    // documented reverse-proxy requirement.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      // Streaming passthrough: pipe the body, never buffer it whole.
      body: hasBody ? request.body : null,
      // @ts-expect-error — required by the Fetch spec when body is a stream;
      // the Workers types don't model it.
      duplex: hasBody ? "half" : undefined,
      // Never edge-cache in the spike: event ingestion must never be cached,
      // and correctness beats a faster array.js here.
      cf: { cacheEverything: false, cacheTtl: 0 },
    });

    // Pass the upstream response through untouched (streaming body, status,
    // headers). PostHog sets its own Cache-Control on /static/*; we honor it.
    return response;
  },
};
