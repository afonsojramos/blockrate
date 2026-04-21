/**
 * Operator admin overview — unit + query-shape tests.
 *
 * Two layers:
 *   1. isAdminEmail allowlist logic — pure function, exhaustive cases
 *      around case-sensitivity, whitespace, empty env, unset email.
 *   2. Aggregation query shape — mirrors the queries in
 *      apps/web/src/server/admin.ts against a fresh PGlite instance.
 *      The server fn's auth gate is tested separately (requireAdmin is
 *      a thin wrapper over auth.api.getSession + isAdminEmail, both
 *      covered by other tests).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import { count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { isAdminEmail } from "@/lib/admin.server";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

async function seedAccount(
  db: TestDb,
  opts: {
    userId: string;
    email: string;
    plan?: string;
    eventCount: number;
    eventTimestamp?: Date;
    userCreatedAt?: Date;
  },
) {
  const {
    userId,
    email,
    plan = "free",
    eventCount,
    eventTimestamp = new Date(),
    userCreatedAt = new Date(),
  } = opts;

  await db.insert(userTable).values({
    id: userId,
    name: email.split("@")[0]!,
    email,
    emailVerified: true,
    createdAt: userCreatedAt,
    updatedAt: userCreatedAt,
  });

  const [account] = await db.insert(schema.appAccounts).values({ userId, plan }).returning();
  if (!account) throw new Error("seed: app_account insert returned no row");

  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account.id,
      name: "test key",
      keyPrefix: "br_test_",
      keyHash: `hash_${userId}`,
      service: "default",
    })
    .returning();
  if (!apiKey) throw new Error("seed: api_key insert returned no row");

  if (eventCount > 0) {
    const rows = Array.from({ length: eventCount }, (_, i) => ({
      accountId: account.id,
      apiKeyId: apiKey.id,
      service: "default",
      timestamp: eventTimestamp,
      url: `/page/${i}`,
      userAgent: "Chrome 131",
      provider: "posthog",
      status: "loaded" as const,
      latency: 100,
    }));
    await db.insert(schema.events).values(rows);
  }

  return { account, apiKey };
}

// Mirrors the query set in apps/web/src/server/admin.ts. Kept in test so
// changes to one signal changes to the other.
async function computeOverview(db: TestDb) {
  const now = Date.now();
  const since24h = new Date(now - 86_400_000);
  const since7d = new Date(now - 7 * 86_400_000);
  const since30d = new Date(now - 30 * 86_400_000);

  const eventCount = sql<number>`COUNT(*)`.mapWith(Number);

  const [eventWindows, totalUsers, signups7d, activeAccounts, planRows, topAccounts] =
    await Promise.all([
      db
        .select({
          last24h:
            sql<number>`COUNT(*) FILTER (WHERE ${schema.events.timestamp} >= ${since24h})`.mapWith(
              Number,
            ),
          last7d:
            sql<number>`COUNT(*) FILTER (WHERE ${schema.events.timestamp} >= ${since7d})`.mapWith(
              Number,
            ),
          last30d:
            sql<number>`COUNT(*) FILTER (WHERE ${schema.events.timestamp} >= ${since30d})`.mapWith(
              Number,
            ),
        })
        .from(schema.events)
        .where(gte(schema.events.timestamp, since30d)),
      db.select({ value: count() }).from(userTable),
      db.select({ value: count() }).from(userTable).where(gte(userTable.createdAt, since7d)),
      db
        .select({ value: countDistinct(schema.events.accountId) })
        .from(schema.events)
        .where(gte(schema.events.timestamp, since7d)),
      db
        .select({ plan: schema.appAccounts.plan, value: count() })
        .from(schema.appAccounts)
        .groupBy(schema.appAccounts.plan),
      db
        .select({
          accountId: schema.events.accountId,
          plan: schema.appAccounts.plan,
          value: eventCount.as("value"),
        })
        .from(schema.events)
        .innerJoin(schema.appAccounts, eq(schema.events.accountId, schema.appAccounts.id))
        .where(gte(schema.events.timestamp, since7d))
        .groupBy(schema.events.accountId, schema.appAccounts.plan)
        .orderBy(desc(sql`value`))
        .limit(10),
    ]);

  const windows = eventWindows[0] ?? { last24h: 0, last7d: 0, last30d: 0 };

  return {
    events24h: windows.last24h,
    events7d: windows.last7d,
    events30d: windows.last30d,
    totalUsers: totalUsers[0]?.value ?? 0,
    signups7d: signups7d[0]?.value ?? 0,
    activeAccounts7d: activeAccounts[0]?.value ?? 0,
    planDistribution: planRows.map((r) => ({ plan: r.plan, count: r.value })),
    topAccounts7d: topAccounts.map((r) => ({
      accountId: r.accountId,
      plan: r.plan,
      count: r.value,
    })),
  };
}

// ─── isAdminEmail ──────────────────────────────────────────────────────

describe("isAdminEmail", () => {
  it("returns false when allowlist is unset (fail-closed)", () => {
    expect(isAdminEmail("anyone@example.com", undefined)).toBe(false);
    expect(isAdminEmail("anyone@example.com", "")).toBe(false);
  });

  it("returns false when email is null or undefined", () => {
    expect(isAdminEmail(null, "admin@example.com")).toBe(false);
    expect(isAdminEmail(undefined, "admin@example.com")).toBe(false);
    expect(isAdminEmail("", "admin@example.com")).toBe(false);
  });

  it("matches a single-entry allowlist", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com", "admin@example.com")).toBe(false);
  });

  it("matches any entry in a multi-entry allowlist", () => {
    const list = "alice@example.com,bob@example.com,carol@example.com";
    expect(isAdminEmail("alice@example.com", list)).toBe(true);
    expect(isAdminEmail("bob@example.com", list)).toBe(true);
    expect(isAdminEmail("carol@example.com", list)).toBe(true);
    expect(isAdminEmail("dave@example.com", list)).toBe(false);
  });

  it("is case-insensitive on both sides", () => {
    expect(isAdminEmail("Admin@Example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("admin@example.com", "ADMIN@EXAMPLE.COM")).toBe(true);
  });

  it("trims whitespace around allowlist entries and the input email", () => {
    expect(isAdminEmail("admin@example.com", "  admin@example.com  ,  other@example.com  ")).toBe(
      true,
    );
    expect(isAdminEmail("  admin@example.com  ", "admin@example.com")).toBe(true);
  });

  it("ignores empty entries in the allowlist", () => {
    expect(isAdminEmail("admin@example.com", ",,admin@example.com,,")).toBe(true);
    expect(isAdminEmail("admin@example.com", ",,")).toBe(false);
  });
});

// ─── Aggregation query shape ───────────────────────────────────────────

describe("admin overview queries", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("returns all zeros on an empty database", async () => {
    const o = await computeOverview(db);
    expect(o.events24h).toBe(0);
    expect(o.events7d).toBe(0);
    expect(o.events30d).toBe(0);
    expect(o.totalUsers).toBe(0);
    expect(o.signups7d).toBe(0);
    expect(o.activeAccounts7d).toBe(0);
    expect(o.planDistribution).toEqual([]);
    expect(o.topAccounts7d).toEqual([]);
  });

  it("counts events in the correct time windows", async () => {
    const now = Date.now();
    await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 3,
      eventTimestamp: new Date(now - 3600_000), // 1h ago → inside 24h/7d/30d
    });
    await seedAccount(db, {
      userId: "u2",
      email: "bob@example.com",
      eventCount: 5,
      eventTimestamp: new Date(now - 3 * 86_400_000), // 3d ago → inside 7d/30d only
    });
    await seedAccount(db, {
      userId: "u3",
      email: "carol@example.com",
      eventCount: 7,
      eventTimestamp: new Date(now - 15 * 86_400_000), // 15d ago → inside 30d only
    });

    const o = await computeOverview(db);
    expect(o.events24h).toBe(3);
    expect(o.events7d).toBe(8);
    expect(o.events30d).toBe(15);
  });

  it("counts active accounts (distinct accountId over 7d)", async () => {
    const now = Date.now();
    await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 10,
      eventTimestamp: new Date(now - 3600_000),
    });
    await seedAccount(db, {
      userId: "u2",
      email: "bob@example.com",
      eventCount: 5,
      eventTimestamp: new Date(now - 2 * 86_400_000),
    });
    // Third user signed up but no events → not active
    await seedAccount(db, {
      userId: "u3",
      email: "carol@example.com",
      eventCount: 0,
    });

    const o = await computeOverview(db);
    expect(o.activeAccounts7d).toBe(2);
    expect(o.totalUsers).toBe(3);
  });

  it("counts signups in last 7 days only", async () => {
    const now = Date.now();
    await seedAccount(db, {
      userId: "u1",
      email: "old@example.com",
      eventCount: 0,
      userCreatedAt: new Date(now - 30 * 86_400_000),
    });
    await seedAccount(db, {
      userId: "u2",
      email: "recent@example.com",
      eventCount: 0,
      userCreatedAt: new Date(now - 2 * 86_400_000),
    });
    await seedAccount(db, {
      userId: "u3",
      email: "today@example.com",
      eventCount: 0,
      userCreatedAt: new Date(now - 3600_000),
    });

    const o = await computeOverview(db);
    expect(o.totalUsers).toBe(3);
    expect(o.signups7d).toBe(2);
  });

  it("groups plan distribution correctly", async () => {
    await seedAccount(db, { userId: "u1", email: "a@example.com", plan: "free", eventCount: 0 });
    await seedAccount(db, { userId: "u2", email: "b@example.com", plan: "free", eventCount: 0 });
    await seedAccount(db, { userId: "u3", email: "c@example.com", plan: "pro", eventCount: 0 });
    await seedAccount(db, { userId: "u4", email: "d@example.com", plan: "team", eventCount: 0 });

    const o = await computeOverview(db);
    const map = Object.fromEntries(o.planDistribution.map((p) => [p.plan, p.count]));
    expect(map.free).toBe(2);
    expect(map.pro).toBe(1);
    expect(map.team).toBe(1);
  });

  it("ranks top accounts by 7d event count and limits to 10", async () => {
    const now = Date.now();
    // Seed 12 accounts with descending event counts inside the 7d window.
    for (let i = 0; i < 12; i++) {
      await seedAccount(db, {
        userId: `u${i}`,
        email: `user${i}@example.com`,
        plan: i % 2 === 0 ? "free" : "pro",
        eventCount: 12 - i, // u0: 12, u1: 11, ..., u11: 1
        eventTimestamp: new Date(now - 3600_000),
      });
    }

    const o = await computeOverview(db);
    expect(o.topAccounts7d).toHaveLength(10);
    expect(o.topAccounts7d[0]!.count).toBe(12);
    expect(o.topAccounts7d[9]!.count).toBe(3);
    // Top entry carries the plan label via the join
    expect(o.topAccounts7d[0]!.plan).toBe("free");
  });

  it("excludes events outside the 7d window from top accounts", async () => {
    const now = Date.now();
    await seedAccount(db, {
      userId: "u1",
      email: "recent@example.com",
      eventCount: 3,
      eventTimestamp: new Date(now - 3600_000),
    });
    await seedAccount(db, {
      userId: "u2",
      email: "old@example.com",
      eventCount: 100,
      eventTimestamp: new Date(now - 20 * 86_400_000),
    });

    const o = await computeOverview(db);
    expect(o.topAccounts7d).toHaveLength(1);
    expect(o.topAccounts7d[0]!.count).toBe(3);
  });
});
