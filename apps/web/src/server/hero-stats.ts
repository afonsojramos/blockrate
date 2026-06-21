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
import { z } from "zod";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import { DAY_MS } from "@/lib/time";
import { applyFloor, PROVIDER_META } from "@/lib/providers";

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

// ─── Per-provider daily trend ──────────────────────────────────────────────

/** One day in a provider's block-rate trend. `rate` is null when the day's
 *  sample is below the publish floor — a gap, never a noisy headline number. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  blocked: number;
  rate: number | null;
}

export interface ProviderTrend {
  slug: string;
  days: number;
  points: TrendPoint[];
}

export interface TrendSummary {
  first: { date: string; rate: number };
  last: { date: string; rate: number };
  /** (last.rate − first.rate) in percentage POINTS, one decimal. Sign = direction. */
  changePoints: number;
}

/**
 * Reduce a daily series to first/last qualifying rate + the change between them.
 * Computed ONLY over days above the publish floor (rate !== null) — never over
 * thin gap days. Returns null when fewer than two qualifying days exist, so a
 * trend is never fabricated from insufficient data. Pure (no DB).
 *
 * Order-independent: first/last are the chronologically earliest/latest
 * qualifying days (by YYYY-MM-DD date), NOT array positions — so feeding an
 * unsorted or descending series can never silently invert the change's sign.
 */
export function summarizeTrend(points: TrendPoint[]): TrendSummary | null {
  const qualifying = points.filter((p): p is TrendPoint & { rate: number } => p.rate !== null);
  if (qualifying.length < 2) return null;
  const first = qualifying.reduce((a, b) => (a.date <= b.date ? a : b));
  const last = qualifying.reduce((a, b) => (a.date >= b.date ? a : b));
  return {
    first: { date: first.date, rate: first.rate },
    last: { date: last.date, rate: last.rate },
    changePoints: Math.round((last.rate - first.rate) * 100 * 10) / 10,
  };
}

const TREND_MAX_DAYS = 365;
/** Default trailing window for the trend (page loader + public JSON endpoint). */
export const DEFAULT_TREND_DAYS = 90;
// Bound `slug` to the known provider set, not an arbitrary 1–64 char string.
// The fn is public and account-free, and its result is cached per (slug, days);
// an open string slug would let any caller mint unbounded distinct cache keys
// (a slow memory-growth vector). The enum caps keys at PROVIDER_META × days and
// rejects junk slugs at the boundary. PROVIDER_META slugs match core (parity test).
const PROVIDER_SLUGS = PROVIDER_META.map((m) => m.slug) as [string, ...string[]];
const trendInput = z.object({
  slug: z.enum(PROVIDER_SLUGS),
  days: z.number().int().min(1).max(TREND_MAX_DAYS).default(DEFAULT_TREND_DAYS),
});

const trendCache = new Map<string, { at: number; value: ProviderTrend }>();

/**
 * Account-free daily series for one provider over the last `days`, each day
 * floored by applyFloor (MIN_SAMPLE_CHECKS) so thin days are gaps. Parameterized
 * by db so it is DB-real testable; the server fn supplies the real singleton.
 *
 * `date` is YYYY-MM-DD text, which sorts chronologically, so a lexicographic
 * `>= cutoff` window + `order by date` needs no date casts.
 */
export async function computeProviderTrend(
  db: BunSQLDatabase<typeof schema>,
  slug: string,
  days: number,
): Promise<ProviderTrend> {
  const { dailyProviderStats } = await import("@/lib/db/schema");
  const { and, asc, eq, gte } = await import("drizzle-orm");

  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: dailyProviderStats.date,
      total: dailyProviderStats.totalChecks,
      blocked: dailyProviderStats.blocked,
    })
    .from(dailyProviderStats)
    .where(and(eq(dailyProviderStats.provider, slug), gte(dailyProviderStats.date, cutoff)))
    .orderBy(asc(dailyProviderStats.date));

  const points: TrendPoint[] = rows.map((r) => ({
    date: r.date,
    total: r.total,
    blocked: r.blocked,
    rate: applyFloor(r.total > 0 ? r.blocked / r.total : 0, r.total),
  }));
  return { slug, days, points };
}

export const getProviderTrend = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => trendInput.parse(input))
  .handler(async ({ data }): Promise<ProviderTrend> => {
    const key = `${data.slug}:${data.days}`;
    const hit = trendCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const { db } = await import("@/lib/db/index.server");
    const value = await computeProviderTrend(db, data.slug, data.days);
    trendCache.set(key, { at: Date.now(), value });
    return value;
  });
