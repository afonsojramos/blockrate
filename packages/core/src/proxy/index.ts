/**
 * First-party provider proxy — serve a blocked provider through a subpath on
 * your own domain.
 *
 * Filter lists match hostnames, so a provider served from
 * `yoursite.com/m/...` can't be blocked without blocking your whole site.
 * A subpath (rather than a subdomain) is the most block-resistant mount:
 * there is no separately-blockable hostname and no CNAME for blockers to
 * uncloak. Use an unguessable prefix (not `/analytics` or `/track`) so
 * generic path-token rules can't match either.
 *
 * v1 supports PostHog, whose reverse-proxy setup is officially documented
 * and whose blockrate detector is gated on the post-load global
 * (`posthog.__loaded`) — so once the SDK loads through your proxy, your
 * measured block rate honestly reflects the recovery. One timing caveat:
 * the SDK must finish loading within blockrate's check delay (default 3s)
 * for the global to be set when the check runs; slow proxied loads fall
 * through to the direct-CDN probe.
 *
 * Security properties:
 * - The upstream host is pinned per provider/region. Nothing in the request
 *   can redirect traffic elsewhere, so this is not an open proxy.
 * - `cookie` and `authorization` headers are stripped before forwarding.
 *   Same-origin requests carry your site's first-party cookies; those must
 *   never reach the vendor.
 * - Bodies stream through in both directions; nothing is buffered or cached
 *   by the handler (upstream cache headers pass through untouched).
 *
 * Usage (Next.js App Router, `app/m/[...path]/route.ts`):
 *
 * ```ts
 * import { createBlockRateProxy } from "blockrate/proxy";
 *
 * const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m" });
 * export const GET = proxy;
 * export const POST = proxy;
 * export const OPTIONS = proxy;
 * ```
 *
 * Then point the SDK at the proxy:
 *
 * ```ts
 * posthog.init(token, {
 *   api_host: "https://yoursite.com/m",
 *   ui_host: "https://us.posthog.com",
 * });
 * ```
 *
 * The handler is a Web-standard `(request: Request) => Promise<Response>`,
 * so it drops into any framework route that speaks Request/Response
 * (TanStack Start, SvelteKit, Nuxt via toWebRequest, Remix, Astro).
 */

export type ProxyProvider = "posthog";
export type ProxyRegion = "us" | "eu";

export interface BlockRateProxyOptions {
  provider: ProxyProvider;
  /**
   * The subpath the proxy is mounted under, e.g. "/m". Must start with "/"
   * and not be the root. Prefer something unguessable over "/analytics".
   */
  prefix: string;
  /** PostHog cloud region. Defaults to "us". */
  region?: ProxyRegion;
  /** Injectable for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * All paths go to the region ingest host — the same host the runtime
 * detector probes and the daily smoke suite verifies, so a proxy target
 * can never silently rot without the smoke test catching it first.
 * (PostHog's docs optionally split /static to an assets CDN host; that is
 * an optimization, not a correctness requirement — the ingest host serves
 * /static/array.js, which the smoke suite asserts daily.)
 */
const UPSTREAMS: Record<ProxyProvider, Record<ProxyRegion, string>> = {
  posthog: {
    us: "https://us.i.posthog.com",
    eu: "https://eu.i.posthog.com",
  },
};

const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

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

/** Never forward the customer's first-party credentials to the vendor. */
const STRIP_REQUEST = new Set(["cookie", "authorization", "host"]);

export function createBlockRateProxy(
  options: BlockRateProxyOptions,
): (request: Request) => Promise<Response> {
  const { provider, region = "us" } = options;

  if (!options.prefix.startsWith("/") || options.prefix === "/") {
    throw new Error(
      `createBlockRateProxy: prefix must start with "/" and not be the root (got "${options.prefix}")`,
    );
  }
  const prefix = options.prefix.endsWith("/") ? options.prefix.slice(0, -1) : options.prefix;

  const upstream = UPSTREAMS[provider]?.[region];
  if (!upstream) {
    throw new Error(`createBlockRateProxy: unknown provider/region "${provider}"/"${region}"`);
  }
  const fetchImpl = options.fetch ?? fetch;

  return async function proxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
      return new Response("not found", { status: 404 });
    }
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("method not allowed", { status: 405 });
    }

    const upstreamUrl = new URL(upstream);
    upstreamUrl.pathname = url.pathname.slice(prefix.length) || "/";
    upstreamUrl.search = url.search;

    const headers = new Headers(request.headers);
    for (const name of Array.from(headers.keys())) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower) || STRIP_REQUEST.has(lower) || lower.startsWith("cf-")) {
        headers.delete(name);
      }
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstreamResponse = await fetchImpl(upstreamUrl.toString(), {
      method: request.method,
      headers,
      // Streaming passthrough: pipe the body, never buffer it whole.
      body: hasBody ? request.body : null,
      // Follow redirects server-side so the browser never leaves the proxy
      // path (a passed-through 30x to posthog.com would go straight back
      // onto filter lists).
      redirect: "follow",
      // Required by the Fetch spec when body is a stream; not yet in the
      // TypeScript lib types.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);

    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const name of Array.from(responseHeaders.keys())) {
      if (HOP_BY_HOP.has(name.toLowerCase())) {
        responseHeaders.delete(name);
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  };
}
