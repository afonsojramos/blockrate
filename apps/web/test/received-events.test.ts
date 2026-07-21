/**
 * hasReceivedEventsForAccount — the onboarding-checklist signal. Derived
 * from usage_counters (authoritative aggregate) rather than
 * api_keys.last_used_at (best-effort). DB-real against a fresh in-memory
 * PGlite (the freshDb pattern from admin-overview.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { hasReceivedEventsForAccount } from "@/server/stats";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

async function seedAccount(userId: string): Promise<number> {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db.insert(schema.appAccounts).values({ userId }).returning();
  if (!account) throw new Error("seed: no account");
  return account.id;
}

describe("hasReceivedEventsForAccount", () => {
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

  it("is false for an account with no usage counter rows", async () => {
    const accountId = await seedAccount("u1");
    expect(await hasReceivedEventsForAccount(db, accountId)).toBe(false);
  });

  it("is false when the only counter row has zero events", async () => {
    const accountId = await seedAccount("u1");
    await db
      .insert(schema.usageCounters)
      .values({ accountId, yearMonth: "2026-07", eventCount: 0 });
    expect(await hasReceivedEventsForAccount(db, accountId)).toBe(false);
  });

  it("is true once any counter row has a positive count", async () => {
    const accountId = await seedAccount("u1");
    await db
      .insert(schema.usageCounters)
      .values({ accountId, yearMonth: "2026-07", eventCount: 42 });
    expect(await hasReceivedEventsForAccount(db, accountId)).toBe(true);
  });

  it("does not leak across accounts", async () => {
    const a = await seedAccount("a");
    const b = await seedAccount("b");
    await db
      .insert(schema.usageCounters)
      .values({ accountId: a, yearMonth: "2026-07", eventCount: 10 });
    expect(await hasReceivedEventsForAccount(db, b)).toBe(false);
    expect(await hasReceivedEventsForAccount(db, a)).toBe(true);
  });
});
