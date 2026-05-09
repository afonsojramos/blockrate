/**
 * Cloudflare Worker that hosts blockrate's first-party reporter endpoint
 * at the customer's own domain — no app code change required.
 *
 * Why a worker rather than a route in your app?
 *
 *   The "reporter must be first-party" requirement
 *   (packages/core/README.md#why-the-reporter-endpoint-must-be-first-party)
 *   is load-bearing: if the browser posts directly to blockrate.app, the
 *   moment that domain lands on EasyPrivacy, blocked-from-reporting
 *   events stop arriving and the dashboard silently shows "everything
 *   loaded." A Cloudflare Worker bound to a route on the customer's
 *   own domain (e.g. `metrics.example.com/block-rate`) gives you a
 *   first-party endpoint with zero changes to your app.
 *
 * Setup (3 minutes):
 *
 *   1. Install wrangler:                  bun add -g wrangler
 *   2. Edit `wrangler.toml`:              fill in your account_id and the
 *                                          route on your domain.
 *   3. Set the BLOCKRATE_API_KEY secret:   wrangler secret put BLOCKRATE_API_KEY
 *   4. Deploy:                            wrangler deploy
 *
 *   Your reporter endpoint is now live at the route you configured.
 *   In your client code:
 *
 *     new BlockRate({
 *       providers: ["optimizely", "posthog", "ga4"],
 *       reporter: (r) => navigator.sendBeacon(
 *         "https://metrics.example.com/block-rate",
 *         JSON.stringify(r),
 *       ),
 *     }).check();
 *
 *   Critical: the URL is on YOUR domain, not blockrate.app.
 */

import { createWebHandler } from "blockrate";

export interface Env {
  /** Set via `wrangler secret put BLOCKRATE_API_KEY`. */
  BLOCKRATE_API_KEY: string;
  /** Optional: override the upstream ingest URL (e.g. for self-hosted). */
  BLOCKRATE_ENDPOINT?: string;
  /** Optional: comma-separated list of allowed origins for CORS. */
  BLOCKRATE_ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.BLOCKRATE_API_KEY) {
      // Surface the missing-secret case loudly rather than silently
      // posting `x-blockrate-key: undefined` upstream — that would 401
      // every request and the dashboard would go dark with no obvious
      // cause.
      return new Response("missing BLOCKRATE_API_KEY secret", { status: 500 });
    }

    const handler = createWebHandler({
      forward: {
        apiKey: env.BLOCKRATE_API_KEY,
        endpoint: env.BLOCKRATE_ENDPOINT,
        onError: (err) => {
          // Worker logs surface in Cloudflare dashboard → Workers → Logs.
          // Without onError, upstream non-2xx is invisible and the
          // dashboard silently stops receiving events.
          console.error("[blockrate] forward failed:", err);
        },
      },
    });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const response = await handler(request);
    // Mirror CORS headers so browsers will accept the response when the
    // page origin differs from the worker's route (typical: page is at
    // example.com, worker at metrics.example.com).
    const cors = corsHeaders(request, env);
    for (const [k, v] of Object.entries(cors)) {
      response.headers.set(k, v);
    }
    return response;
  },
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.BLOCKRATE_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) ?? [];
  // If no allowlist configured, mirror the request origin (lenient, but
  // safe because no cookies are involved and the worker forwards a
  // server-side API key — there's nothing for a CSRF attacker to steal).
  // For tighter posture, set BLOCKRATE_ALLOWED_ORIGINS.
  const allowOrigin = allowed.length === 0 ? origin || "*" : allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
