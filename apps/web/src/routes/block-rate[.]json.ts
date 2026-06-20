import { createFileRoute } from "@tanstack/react-router";

import { buildProviderStats, MIN_SAMPLE_CHECKS } from "@/lib/providers";
import { getHeroStats } from "@/server/hero-stats";

/**
 * Public per-provider block-rate data as JSON — the `.json` sibling of the
 * /block-rate page. CORS-open so it can be fetched client-side from any site
 * (charts, badges, Slack bots). Reuses the cached getHeroStats aggregate and
 * the same min-sample floor as the pages, so the API can never report a
 * number the pages would suppress. Cached 5 minutes to match getHeroStats.
 */
export const Route = createFileRoute("/block-rate.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const stats = await getHeroStats();
          const providers = buildProviderStats(stats?.providers ?? []);
          const body = JSON.stringify({ minSampleChecks: MIN_SAMPLE_CHECKS, providers }, null, 2);
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=300",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          // A DB connection failure must not serialize a stringified error (which
          // can leak connection-string fragments) the way the framework default
          // might. Return a static 503, mirroring api/health.ts's anti-leak rule.
          return new Response(JSON.stringify({ error: "unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
      },
    },
  },
});
