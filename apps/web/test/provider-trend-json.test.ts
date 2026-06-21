/**
 * /block-rate/$provider/trend.json — public CORS-open trend endpoint. Real route
 * handler against the index.server PGlite singleton (same harness as
 * alerts-cron / retention). getProviderTrend caches per (slug, days), so each
 * test uses a DISTINCT real provider slug to avoid cross-test cache hits.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import * as schema from "@/lib/db/schema";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");
type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const { Route } = await import("@/routes/block-rate/$provider/trend[.]json");
const GET = (
  Route as unknown as {
    options: {
      server: { handlers: { GET: (ctx: { params: { provider: string } }) => Promise<Response> } };
    };
  }
).options.server.handlers.GET;

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
  await db.delete(schema.dailyProviderStats);
});

describe("GET /block-rate/$provider/trend.json", () => {
  it("returns 404 for an unknown provider", async () => {
    const res = await GET({ params: { provider: "not-a-provider" } });
    expect(res.status).toBe(404);
  });

  it("serves CORS-open JSON with points and a summary for a known provider", async () => {
    // Distinct slug 'ga4' — seeded with two qualifying rising days.
    await seedDay("ga4", 40, 200, 40); // 20%
    await seedDay("ga4", 5, 200, 62); // 31%

    const res = await GET({ params: { provider: "ga4" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");

    const body = (await res.json()) as {
      provider: string;
      minSampleChecks: number;
      points: { rate: number | null }[];
      summary: { changePoints: number } | null;
    };
    expect(body.provider).toBe("ga4");
    expect(body.points.length).toBe(2);
    expect(body.summary).not.toBeNull();
    expect(body.summary!.changePoints).toBeCloseTo(11, 1);
  });

  it("serves summary:null when there isn't enough qualifying history", async () => {
    // Distinct slug 'posthog' — a single thin (sub-floor) day → no trend.
    await seedDay("posthog", 5, 10, 9); // 10 checks < MIN_SAMPLE_CHECKS → floored to null
    const res = await GET({ params: { provider: "posthog" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: unknown; points: { rate: number | null }[] };
    expect(body.summary).toBeNull();
    expect(body.points[0]!.rate).toBeNull();
  });
});
