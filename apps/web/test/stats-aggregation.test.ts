/**
 * Per-provider stats aggregation — query-shape correctness tests.
 *
 * Mirrors the aggregation query in apps/web/src/server/stats.ts against a
 * fresh PGlite instance (the server fn itself is auth-gated, same approach as
 * admin-overview.test.ts).
 *
 * The headline number this product sells is the per-provider block rate. The
 * load-bearing invariant here: COUNT/SUM/AVG come back from Postgres as
 * *strings* unless coerced at the driver boundary. If `total`/`blocked` are
 * strings, `blocked / total` silently produces a wrong rate. These tests fail
 * loudly if the `.mapWith(Number)` / `count()` coercion regresses.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import { and, count, eq, gte, sql } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

type SeedEvent = { provider: string; status: "loaded" | "blocked"; latency: number };

async function seed(db: TestDb, events: SeedEvent[]): Promise<number> {
  await db.insert(userTable).values({
    id: "u1",
    name: "u1",
    email: "u1@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db
    .insert(schema.appAccounts)
    .values({ userId: "u1", plan: "free" })
    .returning();
  if (!account) throw new Error("seed: no account");
  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account.id,
      name: "k",
      keyPrefix: "br_test_",
      keyHash: "hash",
      service: "default",
    })
    .returning();
  if (!apiKey) throw new Error("seed: no api key");

  if (events.length > 0) {
    await db.insert(schema.events).values(
      events.map((e, i) => ({
        accountId: account.id,
        apiKeyId: apiKey.id,
        service: "default",
        timestamp: new Date(),
        url: `/page/${i}`,
        userAgent: "Chrome 131",
        provider: e.provider,
        status: e.status,
        latency: e.latency,
      })),
    );
  }
  return account.id;
}

/** The exact aggregation from stats.ts getOverviewData. */
async function aggregate(db: TestDb, accountId: number) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const where = and(eq(schema.events.accountId, accountId), gte(schema.events.timestamp, since));

  const rows = await db
    .select({
      provider: schema.events.provider,
      total: count(),
      blocked:
        sql<number>`SUM(CASE WHEN ${schema.events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(
          Number,
        ),
      avgLatency: sql<
        number | null
      >`AVG(CASE WHEN ${schema.events.status} = 'loaded' THEN ${schema.events.latency} END)`.mapWith(
        Number,
      ),
    })
    .from(schema.events)
    .where(where)
    .groupBy(schema.events.provider);

  return rows
    .map((r) => ({
      provider: r.provider,
      total: r.total,
      blocked: r.blocked,
      blockRate: r.total > 0 ? r.blocked / r.total : 0,
      avgLatency: Math.round(r.avgLatency ?? 0),
    }))
    .sort((a, b) => b.blockRate - a.blockRate);
}

describe("per-provider stats aggregation", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("returns counts as real numbers, not driver strings", async () => {
    const accountId = await seed(db, [
      { provider: "posthog", status: "loaded", latency: 100 },
      { provider: "posthog", status: "blocked", latency: 3000 },
    ]);
    const [row] = await aggregate(db, accountId);
    expect(row).toBeDefined();
    expect(typeof row!.total).toBe("number");
    expect(typeof row!.blocked).toBe("number");
    expect(typeof row!.blockRate).toBe("number");
  });

  it("computes the block rate correctly (3 of 10 blocked → 0.3)", async () => {
    const events: SeedEvent[] = [
      ...Array.from({ length: 7 }, () => ({
        provider: "posthog" as const,
        status: "loaded" as const,
        latency: 100,
      })),
      ...Array.from({ length: 3 }, () => ({
        provider: "posthog" as const,
        status: "blocked" as const,
        latency: 3000,
      })),
    ];
    const accountId = await seed(db, events);
    const [row] = await aggregate(db, accountId);
    expect(row!.total).toBe(10);
    expect(row!.blocked).toBe(3);
    expect(row!.blockRate).toBeCloseTo(0.3, 10);
  });

  it("guards against the string-concatenation bug a wrong type would cause", async () => {
    // If `blocked` were the string "3" and `total` the string "10", then
    // `blocked / total` still coerces in JS — but `total + 1` would yield
    // "101". Assert arithmetic, not just division, behaves numerically.
    const events: SeedEvent[] = [
      { provider: "ga4", status: "blocked", latency: 3000 },
      { provider: "ga4", status: "loaded", latency: 50 },
    ];
    const accountId = await seed(db, events);
    const [row] = await aggregate(db, accountId);
    expect(row!.total + 1).toBe(3);
    expect(row!.blocked + 1).toBe(2);
  });

  it("averages latency only over loaded events, null-safe when none loaded", async () => {
    const accountId = await seed(db, [
      { provider: "ga4", status: "loaded", latency: 200 },
      { provider: "ga4", status: "loaded", latency: 400 },
      // segment has only blocked events → AVG is NULL → must become 0
      { provider: "segment", status: "blocked", latency: 3000 },
    ]);
    const rows = await aggregate(db, accountId);
    const ga4 = rows.find((r) => r.provider === "ga4")!;
    const segment = rows.find((r) => r.provider === "segment")!;
    expect(ga4.avgLatency).toBe(300);
    expect(typeof segment.avgLatency).toBe("number");
    expect(segment.avgLatency).toBe(0);
  });
});
