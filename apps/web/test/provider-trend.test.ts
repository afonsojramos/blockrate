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
import { computeProviderTrend } from "@/server/hero-stats";

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
