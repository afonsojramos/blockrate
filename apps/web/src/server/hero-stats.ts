/**
 * Public server function — no auth. Returns the last 7 days of per-provider
 * block rates from the daily_provider_stats rollup table. Used by the
 * landing page hero chart. Returns null if no data exists.
 */

import { createServerFn } from "@tanstack/react-start";

export interface HeroProvider {
  name: string;
  rates: (number | null)[]; // null for days with no data
}

export interface HeroStats {
  days: string[]; // ["Apr 3", "Apr 4", ...]
  providers: HeroProvider[];
  worstProvider: string | null;
  worstRate: number;
}

export const getHeroStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<HeroStats | null> => {
    const { db } = await import("@/lib/db/index.server");
    const { dailyProviderStats } = await import("@/lib/db/schema");
    const { gte, desc } = await import("drizzle-orm");

    const since = new Date(Date.now() - 7 * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(dailyProviderStats)
      .where(gte(dailyProviderStats.date, sinceStr))
      .orderBy(dailyProviderStats.date);

    if (rows.length === 0) return null;

    // Build the 7-day date labels
    const daySet = new Set<string>();
    for (const r of rows) daySet.add(r.date);
    const sortedDays = [...daySet].sort();

    const days = sortedDays.map((d) => {
      const date = new Date(d + "T00:00:00Z");
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    });

    // Group by provider
    const byProvider = new Map<
      string,
      Map<string, { total: number; blocked: number }>
    >();
    for (const r of rows) {
      if (!byProvider.has(r.provider)) byProvider.set(r.provider, new Map());
      byProvider.get(r.provider)!.set(r.date, {
        total: r.totalChecks,
        blocked: r.blocked,
      });
    }

    // Build provider rate arrays + find worst
    let worstProvider: string | null = null;
    let worstRate = 0;

    const providers: HeroProvider[] = [];
    for (const [name, dayMap] of byProvider) {
      const rates = sortedDays.map((d) => {
        const entry = dayMap.get(d);
        if (!entry || entry.total === 0) return null;
        return entry.blocked / entry.total;
      });

      // Average rate for ranking
      const validRates = rates.filter((r): r is number => r !== null);
      const avgRate =
        validRates.length > 0
          ? validRates.reduce((a, b) => a + b, 0) / validRates.length
          : 0;

      if (avgRate > worstRate) {
        worstRate = avgRate;
        worstProvider = name;
      }

      providers.push({ name, rates });
    }

    // Sort providers by avg rate desc (worst first)
    providers.sort((a, b) => {
      const avgA =
        a.rates.filter((r): r is number => r !== null).reduce((s, v) => s + v, 0) /
        Math.max(1, a.rates.filter((r) => r !== null).length);
      const avgB =
        b.rates.filter((r): r is number => r !== null).reduce((s, v) => s + v, 0) /
        Math.max(1, b.rates.filter((r) => r !== null).length);
      return avgB - avgA;
    });

    return { days, providers, worstProvider, worstRate };
  }
);
