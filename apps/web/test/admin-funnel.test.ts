/**
 * Admin onboarding funnel — signup → first API key → first event, with
 * median transition times. The core is DB-parameterized, so it runs DB-real
 * against a fresh in-memory PGlite (the freshDb pattern from
 * admin-overview.test.ts). The DB is never mocked.
 *
 * The funnel derives entirely from existing timestamps — no schema support:
 *   stage 1 "signed up"     app_accounts.created_at
 *   stage 2 "key created"   MIN(api_keys.created_at) per account (revoked counts)
 *   stage 3 "first event"   MIN(events.timestamp) per account
 * Medians are computed only over the accounts that reached that stage — an
 * account that never converted must not drag the median.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { getOnboardingFunnel } from "@/server/admin";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

const HOUR_MS = 3_600_000;

async function seedUser(
  userId: string,
  opts: {
    accountCreatedAt: Date;
    /** null → no API key for this account. */
    key?: { createdAt: Date; revokedAt?: Date | null } | null;
    /** Event timestamps for this account. */
    eventTimestamps?: Date[];
  },
): Promise<number> {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: opts.accountCreatedAt,
    updatedAt: opts.accountCreatedAt,
  });
  const [account] = await db
    .insert(schema.appAccounts)
    .values({ userId, createdAt: opts.accountCreatedAt })
    .returning();
  if (!account) throw new Error("seed: no account");

  if (opts.key) {
    await db.insert(schema.apiKeys).values({
      accountId: account.id,
      name: "k",
      keyPrefix: `br_${userId}_`,
      keyHash: `h_${userId}`,
      createdAt: opts.key.createdAt,
      revokedAt: opts.key.revokedAt ?? null,
    });
  }

  if (opts.eventTimestamps && opts.eventTimestamps.length > 0) {
    const [key] = await db
      .select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.accountId, account.id));
    if (!key) throw new Error("seed: events require a key");
    await db.insert(schema.events).values(
      opts.eventTimestamps.map((ts, i) => ({
        accountId: account.id,
        apiKeyId: key.id,
        service: "default",
        timestamp: ts,
        url: `/p/${i}`,
        userAgent: "Chrome 131",
        provider: "posthog",
        status: "loaded" as const,
        latency: 100,
      })),
    );
  }

  return account.id;
}

describe("getOnboardingFunnel", () => {
  beforeEach(async () => {
    const client = new PGlite();
    const pgliteDb = drizzle(client, { schema });
    await migrate(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = pgliteDb as unknown as RealDb;
  });

  // Close the per-test PGlite so its WASM heap is reclaimed; otherwise instances
  // accumulate across the single bun-test process and OOM intermittently.
  afterEach(async () => {
    await (db as unknown as { $client: { close: () => Promise<void> } }).$client.close();
  });

  it("returns a zeroed funnel with null medians on an empty database", async () => {
    const f = await getOnboardingFunnel(db);
    expect(f).toEqual({
      accounts: 0,
      withKey: 0,
      withEvents: 0,
      medianHoursToKey: null,
      medianHoursToFirstEvent: null,
    });
  });

  it("counts an account with no API key only in the signed-up stage", async () => {
    await seedUser("u1", { accountCreatedAt: new Date(), key: null });
    const f = await getOnboardingFunnel(db);
    expect(f.accounts).toBe(1);
    expect(f.withKey).toBe(0);
    expect(f.withEvents).toBe(0);
  });

  it("counts an account with a key but no events in the first two stages only", async () => {
    const now = Date.now();
    await seedUser("u1", {
      accountCreatedAt: new Date(now),
      key: { createdAt: new Date(now + HOUR_MS) },
    });
    const f = await getOnboardingFunnel(db);
    expect(f.accounts).toBe(1);
    expect(f.withKey).toBe(1);
    expect(f.withEvents).toBe(0);
    expect(f.medianHoursToKey).toBeCloseTo(1, 5);
    expect(f.medianHoursToFirstEvent).toBeNull();
  });

  it("counts a revoked key as key-created", async () => {
    const now = Date.now();
    await seedUser("u1", {
      accountCreatedAt: new Date(now),
      key: { createdAt: new Date(now + HOUR_MS), revokedAt: new Date(now + 2 * HOUR_MS) },
    });
    const f = await getOnboardingFunnel(db);
    expect(f.withKey).toBe(1);
  });

  it("uses MIN(events.timestamp) as the first-event time", async () => {
    const now = Date.now();
    await seedUser("u1", {
      accountCreatedAt: new Date(now),
      key: { createdAt: new Date(now + HOUR_MS) },
      // Inserted out of order: the earliest timestamp must win, not the
      // insertion order.
      eventTimestamps: [new Date(now + 10 * HOUR_MS), new Date(now + 5 * HOUR_MS)],
    });
    const f = await getOnboardingFunnel(db);
    expect(f.withEvents).toBe(1);
    expect(f.medianHoursToFirstEvent).toBeCloseTo(5, 5);
  });

  it("computes medians only over accounts that reached that stage", async () => {
    const now = Date.now();
    // Converter: key after 2h, first event after 4h.
    await seedUser("fast", {
      accountCreatedAt: new Date(now),
      key: { createdAt: new Date(now + 2 * HOUR_MS) },
      eventTimestamps: [new Date(now + 4 * HOUR_MS)],
    });
    // Key but never an event: key after 100h. Must affect medianHoursToKey
    // but NOT medianHoursToFirstEvent.
    await seedUser("stalled", {
      accountCreatedAt: new Date(now),
      key: { createdAt: new Date(now + 100 * HOUR_MS) },
    });
    // Never made a key: excluded from both medians.
    await seedUser("bounced", { accountCreatedAt: new Date(now), key: null });

    const f = await getOnboardingFunnel(db);
    expect(f.accounts).toBe(3);
    expect(f.withKey).toBe(2);
    expect(f.withEvents).toBe(1);
    // median of [2, 100] = 51
    expect(f.medianHoursToKey).toBeCloseTo(51, 5);
    // median of [4] = 4 — the stalled account's 100h must not leak in
    expect(f.medianHoursToFirstEvent).toBeCloseTo(4, 5);
  });

  it("uses the middle element for odd-sized median sets", async () => {
    const now = Date.now();
    for (const [i, hours] of [1, 3, 10].entries()) {
      await seedUser(`u${i}`, {
        accountCreatedAt: new Date(now),
        key: { createdAt: new Date(now + hours * HOUR_MS) },
      });
    }
    const f = await getOnboardingFunnel(db);
    expect(f.medianHoursToKey).toBeCloseTo(3, 5);
  });
});
