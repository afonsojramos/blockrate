/**
 * Public server function — no auth. Returns the all-time per-provider block
 * rate from the daily_provider_stats rollup table, used by the landing page
 * hero chart. Each provider's rate is volume-weighted (total blocked / total
 * checks across every day) so high-traffic days carry their real weight.
 * Returns null if no data exists.
 *
 * The aggregation runs as a single GROUP BY so the result is bounded to the
 * provider count regardless of how many days accumulate. The rollup only
 * changes once a day, so results are cached in-process for CACHE_TTL_MS to
 * spare the DB a query on every homepage hit.
 */

import { createServerFn } from "@tanstack/react-start";

export interface HeroProvider {
  name: string;
  rate: number; // raw all-time block rate, 0..1 (unfloored; consumers apply applyFloor)
  blocked: number; // total blocked checks (numerator)
  total: number; // total checks measured (sample size; for min-sample floors)
}

export interface HeroStats {
  providers: HeroProvider[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; value: HeroStats | null } | null = null;

async function computeHeroStats(): Promise<HeroStats | null> {
  const { db } = await import("@/lib/db/index.server");
  const { dailyProviderStats } = await import("@/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  // SUM() comes back from the pg/pglite drivers as a *string*; `.mapWith(Number)`
  // coerces at the driver boundary so the block rate is computed on real numbers,
  // never on a string the `<number>` annotation merely claims to be.
  const rows = await db
    .select({
      provider: dailyProviderStats.provider,
      total: sql<number>`SUM(${dailyProviderStats.totalChecks})`.mapWith(Number),
      blocked: sql<number>`SUM(${dailyProviderStats.blocked})`.mapWith(Number),
    })
    .from(dailyProviderStats)
    .groupBy(dailyProviderStats.provider);

  if (rows.length === 0) return null;

  const providers: HeroProvider[] = [];
  for (const r of rows) {
    if (r.total === 0) continue;
    providers.push({
      name: r.provider,
      rate: r.blocked / r.total,
      blocked: r.blocked,
      total: r.total,
    });
  }

  // Worst first.
  providers.sort((a, b) => b.rate - a.rate);

  return { providers };
}

export const getHeroStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<HeroStats | null> => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
    const value = await computeHeroStats();
    cache = { at: Date.now(), value };
    return value;
  },
);
