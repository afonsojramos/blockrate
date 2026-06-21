/**
 * Weekly digest — the pure email body and the opt-out persistence core.
 * digestEmailBody is pure; setWeeklyDigestForAccount runs DB-real against a
 * fresh in-memory PGlite (closed in afterEach so its WASM heap is reclaimed).
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
import { digestEmailBody } from "@/lib/mailer.server";
import { setWeeklyDigestForAccount } from "@/server/stats";

describe("digestEmailBody", () => {
  it("lists providers with rates in plain text, with a dashboard link and opt-out", () => {
    const body = digestEmailBody({
      providers: [
        { label: "Google Analytics 4", rate: 0.381, total: 12540 },
        { label: "PostHog", rate: 0.12, total: 5000 },
      ],
      windowDays: 7,
    });
    expect(body).toContain("Google Analytics 4");
    expect(body).toContain("38.1%");
    expect(body).toContain("PostHog");
    expect(body).toContain("/app");
    expect(body).toMatch(/turn this weekly digest off in settings/i);
    expect(body).not.toContain("<"); // plain text, no HTML
  });
});

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
  return account!.id;
}

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as RealDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await (db as unknown as { $client: { close: () => Promise<void> } }).$client.close();
});

describe("setWeeklyDigestForAccount", () => {
  it("defaults to on, then persists opt-out and opt-in", async () => {
    const accountId = await seedAccount("u1");
    const read = async () =>
      (await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, accountId)))[0]!
        .weeklyDigest;

    expect(await read()).toBe(true); // schema default

    await setWeeklyDigestForAccount(db, accountId, false);
    expect(await read()).toBe(false);

    await setWeeklyDigestForAccount(db, accountId, true);
    expect(await read()).toBe(true);
  });
});
