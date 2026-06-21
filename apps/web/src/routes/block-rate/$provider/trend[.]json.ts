import { createFileRoute } from "@tanstack/react-router";

import { getProviderMeta, MIN_SAMPLE_CHECKS } from "@/lib/providers";
import { computeProviderTrend, DEFAULT_TREND_DAYS, summarizeTrend } from "@/server/hero-stats";

/**
 * Public per-provider daily block-rate trend as JSON — the machine-readable
 * sibling of the trend chart on /block-rate/$provider. CORS-open so it can be
 * fetched from any site (dashboards, status pages, Slack bots). Reuses
 * computeProviderTrend, which applies the same per-day min-sample floor as the
 * page, so the API can never report a day the page would suppress. HTTP-cached
 * 5 minutes (public, max-age=300). Unknown provider → 404.
 */
export const Route = createFileRoute("/block-rate/$provider/trend.json")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const meta = getProviderMeta(params.provider);
        if (!meta) {
          return new Response(JSON.stringify({ error: "unknown provider" }), {
            status: 404,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }

        try {
          const { db } = await import("@/lib/db/index.server");
          const trend = await computeProviderTrend(db, meta.slug, DEFAULT_TREND_DAYS);
          const summary = summarizeTrend(trend.points);
          const body = JSON.stringify(
            {
              provider: meta.slug,
              label: meta.label,
              days: trend.days,
              minSampleChecks: MIN_SAMPLE_CHECKS,
              points: trend.points,
              summary,
            },
            null,
            2,
          );
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=300",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          // Never serialize a thrown DB error (it can leak connection-string
          // fragments). Static 503, mirroring block-rate.json / api/health.
          return new Response(JSON.stringify({ error: "unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
      },
    },
  },
});
