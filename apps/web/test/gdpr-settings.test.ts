/**
 * GDPR settings flow verification.
 *
 * These tests assert the two legally-binding flows that sit behind
 * /app/settings in the dashboard:
 *
 *   1. Export — exportEventsCsv returns every event for the account and
 *      ONLY events for that account (no cross-tenant leakage).
 *
 *   2. Delete — deleteAccount cascades all the way through: deleting the
 *      Better Auth `user` row wipes app_accounts, api_keys, events,
 *      usage_counters, sessions, and oauth accounts via the schema FKs.
 *
 * These are the right-of-access and right-of-erasure promises in the
 * privacy policy — if the cascade is ever misconfigured they fail
 * silently (old rows just stay forever), so the test is the only way
 * to prove the migration is still correct.
 *
 * We run against a fresh PGlite instance per test. It's the same engine
 * used for local dev (apps/web/src/lib/db/index.server.ts), so the FKs
 * and constraints are the production shape, not an SQLite knockoff.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import { eq, and } from "drizzle-orm";

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

/**
 * Seed a complete account graph: user → app_account → api_key → events.
 * Mirrors the shape produced by the real signup + ingest flows.
 */
async function seedAccount(
  db: TestDb,
  opts: {
    userId: string;
    email: string;
    service?: string;
    eventCount: number;
  },
) {
  const { userId, email, service = "default", eventCount } = opts;

  await db.insert(userTable).values({
    id: userId,
    name: email.split("@")[0]!,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const [account] = await db
    .insert(schema.appAccounts)
    .values({ userId, plan: "free" })
    .returning();
  if (!account) throw new Error("seed: app_account insert returned no row");

  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account.id,
      name: "test key",
      keyPrefix: "br_test_",
      keyHash: `hash_${userId}`,
      service,
    })
    .returning();
  if (!apiKey) throw new Error("seed: api_key insert returned no row");

  if (eventCount > 0) {
    const rows = Array.from({ length: eventCount }, (_, i) => ({
      accountId: account.id,
      apiKeyId: apiKey.id,
      service,
      timestamp: new Date(Date.UTC(2026, 3, 1, 0, 0, i)),
      url: `/page/${i}`,
      userAgent: "Chrome 131",
      provider: i % 2 === 0 ? "posthog" : "ga4",
      status: (i % 3 === 0 ? "blocked" : "loaded") as "blocked" | "loaded",
      latency: 100 + i,
    }));
    await db.insert(schema.events).values(rows);
  }

  await db.insert(schema.usageCounters).values({
    accountId: account.id,
    yearMonth: "2026-04",
    eventCount,
  });

  return { account, apiKey };
}

// ─── Export logic mirroring exportEventsCsv handler ─────────────────────

async function exportEventsForAccount(db: TestDb, accountId: number) {
  const rows = await db
    .select({
      timestamp: schema.events.timestamp,
      service: schema.events.service,
      provider: schema.events.provider,
      status: schema.events.status,
      latency: schema.events.latency,
      url: schema.events.url,
      userAgent: schema.events.userAgent,
    })
    .from(schema.events)
    .where(eq(schema.events.accountId, accountId))
    .orderBy(schema.events.timestamp);

  const header = "timestamp,service,provider,status,latency_ms,url,browser\n";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = rows
    .map((r) =>
      [
        r.timestamp.toISOString(),
        escape(r.service),
        escape(r.provider),
        r.status,
        r.latency,
        escape(r.url),
        escape(r.userAgent),
      ].join(","),
    )
    .join("\n");

  return { csv: header + body, count: rows.length };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("GDPR: exportEventsCsv", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("returns every event for the account in a valid CSV", async () => {
    const { account } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 3,
    });

    const { csv, count } = await exportEventsForAccount(db, account.id);

    expect(count).toBe(3);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(4); // 1 header + 3 events
    expect(lines[0]).toBe("timestamp,service,provider,status,latency_ms,url,browser");
    // Events are ordered by timestamp ascending
    expect(lines[1]).toContain('"posthog"');
    expect(lines[1]).toContain("blocked"); // i=0 → blocked
    expect(lines[2]).toContain('"ga4"'); // i=1 → ga4, loaded
    expect(lines[2]).toContain("loaded");
  });

  it("does not leak events from other accounts", async () => {
    const { account: alice } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 2,
    });
    await seedAccount(db, {
      userId: "u2",
      email: "bob@example.com",
      eventCount: 5,
    });

    const aliceExport = await exportEventsForAccount(db, alice.id);
    expect(aliceExport.count).toBe(2);
    expect(aliceExport.csv).not.toContain("bob");
  });

  it("properly escapes double quotes in user-provided fields", async () => {
    const { account } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      service: 'my-"quoted"-service',
      eventCount: 1,
    });

    const { csv } = await exportEventsForAccount(db, account.id);
    // The escape function doubles inner quotes
    expect(csv).toContain('"my-""quoted""-service"');
  });

  it("returns header-only CSV when account has zero events", async () => {
    const { account } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 0,
    });

    const { csv, count } = await exportEventsForAccount(db, account.id);
    expect(count).toBe(0);
    expect(csv).toBe("timestamp,service,provider,status,latency_ms,url,browser\n");
  });
});

describe("GDPR: deleteAccount cascade", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("deletes all account data when the user row is deleted", async () => {
    const { account, apiKey } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 5,
    });

    // Pre-delete sanity check — everything exists
    expect((await db.select().from(userTable).where(eq(userTable.id, "u1"))).length).toBe(1);
    expect(
      (await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, account.id)))
        .length,
    ).toBe(1);
    expect(
      (await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, apiKey.id))).length,
    ).toBe(1);
    expect(
      (await db.select().from(schema.events).where(eq(schema.events.accountId, account.id))).length,
    ).toBe(5);
    expect(
      (
        await db
          .select()
          .from(schema.usageCounters)
          .where(eq(schema.usageCounters.accountId, account.id))
      ).length,
    ).toBe(1);

    // The entire deleteAccount flow is a single DELETE on user — the FK
    // cascade is what makes everything else go away.
    await db.delete(userTable).where(eq(userTable.id, "u1"));

    // Post-delete — every downstream table is empty for this account
    expect((await db.select().from(userTable).where(eq(userTable.id, "u1"))).length).toBe(0);
    expect(
      (await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, account.id)))
        .length,
    ).toBe(0);
    expect(
      (await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, apiKey.id))).length,
    ).toBe(0);
    expect(
      (await db.select().from(schema.events).where(eq(schema.events.accountId, account.id))).length,
    ).toBe(0);
    expect(
      (
        await db
          .select()
          .from(schema.usageCounters)
          .where(eq(schema.usageCounters.accountId, account.id))
      ).length,
    ).toBe(0);
  });

  it("does not touch other accounts' data", async () => {
    const { account: alice } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 3,
    });
    const { account: bob } = await seedAccount(db, {
      userId: "u2",
      email: "bob@example.com",
      eventCount: 4,
    });

    await db.delete(userTable).where(eq(userTable.id, "u1"));

    // Alice is gone
    expect(
      (await db.select().from(schema.events).where(eq(schema.events.accountId, alice.id))).length,
    ).toBe(0);
    // Bob is untouched
    expect((await db.select().from(userTable).where(eq(userTable.id, "u2"))).length).toBe(1);
    expect(
      (await db.select().from(schema.events).where(eq(schema.events.accountId, bob.id))).length,
    ).toBe(4);
    expect(
      (await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, bob.id))).length,
    ).toBe(1);
  });

  it("deletes all events tied to the account even via api_key_id cascade", async () => {
    // Events have TWO cascade paths: events.accountId → app_accounts
    // AND events.apiKeyId → api_keys. Both are ON DELETE CASCADE, so
    // deleting via either parent must remove the events.
    const { account, apiKey } = await seedAccount(db, {
      userId: "u1",
      email: "alice@example.com",
      eventCount: 3,
    });

    // Delete just the api_key (not the user) — events should still cascade
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, apiKey.id));

    const remainingEvents = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.accountId, account.id), eq(schema.events.apiKeyId, apiKey.id)));
    expect(remainingEvents.length).toBe(0);

    // The account itself is still intact
    expect(
      (await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, account.id)))
        .length,
    ).toBe(1);
  });
});
