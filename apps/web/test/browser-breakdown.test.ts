/**
 * getBrowserBreakdownForAccount — per-browser block-rate aggregation.
 * The data already exists: events.user_agent holds "Family Major"
 * (e.g. "Chrome 131") from truncateUserAgent at ingest; this aggregates it,
 * collapsing major versions into families. DB-real against a fresh
 * in-memory PGlite (the freshDb pattern from admin-overview.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { getBrowserBreakdownForAccount } from "@/server/stats";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

const DAY_MS = 86_400_000;

async function seedAccount(userId: string): Promise<{ accountId: number; apiKeyId: number }> {
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
  const [key] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account.id,
      name: "k",
      keyPrefix: `br_${userId}_`,
      keyHash: `h_${userId}`,
    })
    .returning();
  if (!key) throw new Error("seed: no key");
  return { accountId: account.id, apiKeyId: key.id };
}

async function seedEvents(
  accountId: number,
  apiKeyId: number,
  events: {
    userAgent: string;
    status?: "loaded" | "blocked";
    service?: string;
    timestamp?: Date;
  }[],
) {
  await db.insert(schema.events).values(
    events.map((e, i) => ({
      accountId,
      apiKeyId,
      service: e.service ?? "default",
      timestamp: e.timestamp ?? new Date(),
      url: `/p/${i}`,
      userAgent: e.userAgent,
      provider: "posthog",
      status: e.status ?? "loaded",
      latency: 100,
    })),
  );
}

describe("getBrowserBreakdownForAccount", () => {
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

  it("collapses major versions into families with summed counts and rates", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    await seedEvents(accountId, apiKeyId, [
      { userAgent: "Chrome 131" },
      { userAgent: "Chrome 131", status: "blocked" },
      { userAgent: "Chrome 130", status: "blocked" },
      { userAgent: "Firefox 124", status: "blocked" },
    ]);
    const rows = await getBrowserBreakdownForAccount(db, accountId, 7);
    expect(rows).toEqual([
      { family: "Chrome", total: 3, blocked: 2, blockRate: 2 / 3 },
      { family: "Firefox", total: 1, blocked: 1, blockRate: 1 },
    ]);
  });

  it("keeps unknown and other as their own families", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    await seedEvents(accountId, apiKeyId, [
      { userAgent: "unknown", status: "blocked" },
      { userAgent: "other" },
      { userAgent: "Samsung Internet 25" },
    ]);
    const rows = await getBrowserBreakdownForAccount(db, accountId, 7);
    const map = Object.fromEntries(rows.map((r) => [r.family, r]));
    expect(map.unknown?.blocked).toBe(1);
    expect(map.other?.total).toBe(1);
    // Multi-word families keep their name once the version is stripped
    expect(map["Samsung Internet"]?.total).toBe(1);
  });

  it("excludes events outside the window", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    await seedEvents(accountId, apiKeyId, [
      { userAgent: "Chrome 131" },
      { userAgent: "Firefox 124", timestamp: new Date(Date.now() - 30 * DAY_MS) },
    ]);
    const rows = await getBrowserBreakdownForAccount(db, accountId, 7);
    expect(rows).toEqual([{ family: "Chrome", total: 1, blocked: 0, blockRate: 0 }]);
  });

  it("excludes events from other accounts", async () => {
    const a = await seedAccount("a");
    const b = await seedAccount("b");
    await seedEvents(a.accountId, a.apiKeyId, [{ userAgent: "Chrome 131" }]);
    await seedEvents(b.accountId, b.apiKeyId, [{ userAgent: "Firefox 124", status: "blocked" }]);
    const rows = await getBrowserBreakdownForAccount(db, a.accountId, 7);
    expect(rows).toEqual([{ family: "Chrome", total: 1, blocked: 0, blockRate: 0 }]);
  });

  it("restricts to the requested service", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    await seedEvents(accountId, apiKeyId, [
      { userAgent: "Chrome 131", service: "web" },
      { userAgent: "Firefox 124", service: "docs" },
    ]);
    const rows = await getBrowserBreakdownForAccount(db, accountId, 7, "web");
    expect(rows).toEqual([{ family: "Chrome", total: 1, blocked: 0, blockRate: 0 }]);
  });

  it("sorts by total volume, not block rate", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    await seedEvents(accountId, apiKeyId, [
      { userAgent: "Safari 17", status: "blocked" }, // 100% blocked, n=1
      { userAgent: "Chrome 131" },
      { userAgent: "Chrome 131" },
      { userAgent: "Chrome 130" },
    ]);
    const rows = await getBrowserBreakdownForAccount(db, accountId, 7);
    expect(rows.map((r) => r.family)).toEqual(["Chrome", "Safari"]);
  });

  it("returns an empty list for an account with no events", async () => {
    const { accountId } = await seedAccount("u1");
    expect(await getBrowserBreakdownForAccount(db, accountId, 7)).toEqual([]);
  });
});
