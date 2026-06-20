import { createFileRoute } from "@tanstack/react-router";

import { blockRateBadge } from "@/lib/badge";
import { applyFloor, badgeColor, formatRatePercent, getProviderMeta } from "@/lib/providers";
import { getHeroStats } from "@/server/hero-stats";

/**
 * Embeddable per-provider block-rate badge (shields.io-style SVG).
 *
 * GET /block-rate/$provider/badge.svg → image/svg+xml. Reuses the cached
 * getHeroStats aggregate so the number matches the public pages, and applies
 * the same min-sample floor: below the floor (or no data) renders a gray
 * "no data" badge rather than a noisy percentage. Unknown provider → 404.
 *
 * Cache 5 minutes to match the getHeroStats in-process cache.
 */
export const Route = createFileRoute("/block-rate/$provider/badge.svg")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const meta = getProviderMeta(params.provider);
        if (!meta) return new Response("Unknown provider", { status: 404 });

        const stats = await getHeroStats();
        const entry = stats?.providers.find((p) => p.name === meta.slug);
        const rate = entry ? applyFloor(entry.rate, entry.total) : null;

        const svg = blockRateBadge({
          label: `${meta.label} blocked`,
          value: rate === null ? "no data" : formatRatePercent(rate),
          color: badgeColor(rate),
        });

        return new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
