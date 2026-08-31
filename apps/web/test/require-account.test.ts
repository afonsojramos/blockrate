/**
 * The single tenancy boundary (src/lib/require-account.server.ts).
 *
 * Exercises both variants through their DB-parameterized cores against a
 * fresh in-memory PGlite (real schema, no mocked DB), mirroring
 * alerts-crud.test.ts:
 *
 *   requireAccountForSession       — server-function variant, throws
 *   requireAccountForApiForSession — API-route variant, returns Response
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import {
  requireAccountForApiForSession,
  requireAccountForSession,
} from "@/lib/require-account.server";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as RealDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
});

// Close the per-test PGlite so its WASM heap is reclaimed; otherwise instances
// accumulate across the single bun-test process and OOM intermittently.
afterEach(async () => {
  await (db as unknown as { $client: { close: () => Promise<void> } }).$client.close();
});

async function seedUser(userId: string): Promise<void> {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedAccount(userId: string): Promise<number> {
  await seedUser(userId);
  const [account] = await db
    .insert(schema.appAccounts)
    .values({ userId, plan: "free" })
    .returning();
  if (!account) throw new Error("seed: no account");
  return account.id;
}

const sessionFor = (userId: string) => ({
  user: { id: userId, email: `${userId}@example.com` },
});

describe("requireAccountForSession (server functions)", () => {
  it("rejects when there is no session", async () => {
    await expect(requireAccountForSession(db, null)).rejects.toThrow("unauthorized");
  });

  it("rejects a session whose user has no app_account", async () => {
    await seedUser("u-no-account");
    await expect(requireAccountForSession(db, sessionFor("u-no-account"))).rejects.toThrow(
      "no app_account for user — bootstrap hook missed",
    );
  });

  it("returns the caller's account, session, and db on the happy path", async () => {
    const accountId = await seedAccount("u-happy");
    const session = sessionFor("u-happy");
    const result = await requireAccountForSession(db, session);
    expect(result.account.id).toBe(accountId);
    expect(result.account.userId).toBe("u-happy");
    expect(result.session).toBe(session);
    expect(result.db).toBe(db);
  });

  it("resolves the account of the session user, not another tenant's", async () => {
    const aId = await seedAccount("tenant-a");
    await seedAccount("tenant-b");
    const result = await requireAccountForSession(db, sessionFor("tenant-a"));
    expect(result.account.id).toBe(aId);
  });
});

describe("requireAccountForApiForSession (API routes)", () => {
  it("returns a 401 Response when there is no session", async () => {
    const result = await requireAccountForApiForSession(db, null);
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns a 404 Response when the user has no app_account", async () => {
    await seedUser("api-no-account");
    const result = await requireAccountForApiForSession(db, sessionFor("api-no-account"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it("returns ok + account + narrowed session on the happy path", async () => {
    const accountId = await seedAccount("api-happy");
    const result = await requireAccountForApiForSession(db, sessionFor("api-happy"));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("unreachable");
    expect(result.ok).toBe(true);
    expect(result.account.id).toBe(accountId);
    expect(result.session).toEqual({
      user: { id: "api-happy", email: "api-happy@example.com" },
    });
  });
});
