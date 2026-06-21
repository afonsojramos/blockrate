/**
 * Per-provider daily trend — ordering, per-day sample floor, date windowing,
 * provider scoping, and the empty case. Runs DB-real against a fresh in-memory
 * PGlite seeded with daily_provider_stats rows (the freshDb pattern). Never
 * mocks the DB.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { MIN_SAMPLE_CHECKS } from "@/lib/providers";
import { computeProviderTrend, summarizeTrend, type TrendPoint } from "@/server/hero-stats";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");
type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

const DAY = 86_400_000;
const dateAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

async function seedDay(provider: string, ageDays: number, total: number, blocked: number) {
  await db.insert(schema.dailyProviderStats).values({
    date: dateAgo(ageDays),
    provider,
    totalChecks: total,
    blocked,
  });
}

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as RealDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
});

describe("computeProviderTrend", () => {
  it("returns points ordered by date ascending", async () => {
    await seedDay("ga4", 3, 200, 80);
    await seedDay("ga4", 1, 200, 90);
    await seedDay("ga4", 2, 200, 100);
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points.map((p) => p.date)).toEqual([dateAgo(3), dateAgo(2), dateAgo(1)]);
  });

  it("floors a thin day to null but keeps a real rate above the floor", async () => {
    await seedDay("ga4", 2, MIN_SAMPLE_CHECKS - 1, 50); // below floor → null
    await seedDay("ga4", 1, 200, 80); // 40%, above floor
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points.find((p) => p.date === dateAgo(2))!.rate).toBeNull();
    expect(t.points.find((p) => p.date === dateAgo(1))!.rate).toBeCloseTo(0.4, 5);
  });

  it("excludes days older than the window", async () => {
    await seedDay("ga4", 200, 500, 200); // outside the 90-day window
    await seedDay("ga4", 10, 500, 200); // inside
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points.length).toBe(1);
    expect(t.points[0]!.date).toBe(dateAgo(10));
  });

  it("includes the cutoff day itself (inclusive lower bound)", async () => {
    await seedDay("ga4", 90, 500, 200); // exactly at the window edge
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points.map((p) => p.date)).toEqual([dateAgo(90)]);
  });

  it("floors a zero-sample day to null, never a fabricated 0%", async () => {
    await seedDay("ga4", 1, 0, 0); // empty rollup day → gap, not 0%
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points[0]!.rate).toBeNull();
  });

  it("scopes to the requested provider", async () => {
    await seedDay("ga4", 1, 200, 80);
    await seedDay("posthog", 1, 200, 80);
    const t = await computeProviderTrend(db, "ga4", 90);
    expect(t.points.length).toBe(1);
    expect(t.points[0]!.blocked).toBe(80);
  });

  it("returns an empty series for a provider with no rows", async () => {
    const t = await computeProviderTrend(db, "nope", 90);
    expect(t.points).toEqual([]);
  });
});

describe("summarizeTrend", () => {
  const pt = (date: string, rate: number | null): TrendPoint => ({
    date,
    total: rate === null ? 0 : 100,
    blocked: rate === null ? 0 : Math.round(rate * 100),
    rate,
  });

  it("reports a rising trend in percentage points", () => {
    const s = summarizeTrend([pt("2026-01-01", 0.2), pt("2026-02-01", 0.31)]);
    expect(s).not.toBeNull();
    expect(s!.first).toEqual({ date: "2026-01-01", rate: 0.2 });
    expect(s!.last).toEqual({ date: "2026-02-01", rate: 0.31 });
    expect(s!.changePoints).toBeCloseTo(11, 5);
  });

  it("reports a falling trend with a negative change", () => {
    const s = summarizeTrend([pt("2026-01-01", 0.3), pt("2026-02-01", 0.2)]);
    expect(s!.changePoints).toBeCloseTo(-10, 5);
  });

  it("reports zero change for a flat trend", () => {
    const s = summarizeTrend([pt("2026-01-01", 0.25), pt("2026-02-01", 0.25)]);
    expect(s!.changePoints).toBe(0);
  });

  it("returns null with fewer than two qualifying days", () => {
    expect(summarizeTrend([])).toBeNull();
    expect(summarizeTrend([pt("2026-01-01", 0.3)])).toBeNull();
    expect(summarizeTrend([pt("2026-01-01", null), pt("2026-02-01", 0.3)])).toBeNull();
  });

  it("ignores null-rate gap days for first/last and the count", () => {
    const s = summarizeTrend([
      pt("2026-01-01", 0.2),
      pt("2026-01-15", null), // gap — must not become first/last
      pt("2026-02-01", 0.4),
    ]);
    expect(s!.first.date).toBe("2026-01-01");
    expect(s!.last.date).toBe("2026-02-01");
    expect(s!.changePoints).toBeCloseTo(20, 5);
  });

  it("rounds changePoints to one decimal place", () => {
    const s = summarizeTrend([pt("2026-01-01", 0.201), pt("2026-02-01", 0.314)]);
    expect(s!.changePoints).toBe(11.3); // (0.314-0.201)*100 = 11.3, not 11.299999…
  });

  it("resolves first/last by date even when the input is not date-ascending", () => {
    // Descending input — positional [0]/[last] would invert the sign.
    const s = summarizeTrend([pt("2026-02-01", 0.4), pt("2026-01-01", 0.2)]);
    expect(s!.first.date).toBe("2026-01-01");
    expect(s!.last.date).toBe("2026-02-01");
    expect(s!.changePoints).toBeCloseTo(20, 5); // up, not -20
  });
});
