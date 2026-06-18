/**
 * Retention cron handler — bearer-token auth + per-plan event deletion + rollup.
 *
 * Same approach as stripe-webhook.test.ts: the real route handler runs against
 * the real index.server db singleton, pointed at an in-memory PGlite so handler
 * and test share one database. The 503-when-CRON_SECRET-unset branch is trivial
 * defensive code (verified by inspection). Env (DATABASE_URL, CRON_SECRET) is
 * set by test/setup.ts (bun test preload) before any module reads it.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";

const CRON_SECRET = process.env.CRON_SECRET!;

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const { Route } = await import("@/routes/api/internal/retention");
const POST = (
  Route as unknown as {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;

const DAY = 86_400_000;

async function reset() {
  await db.delete(userTable);
  await db.delete(schema.dailyProviderStats);
}

/** Seed an account with one api key and return { accountId, apiKeyId }. */
async function seedAccount(userId: string, plan: string) {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db.insert(schema.appAccounts).values({ userId, plan }).returning();
  if (!account) throw new Error("seed: no account");
  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account.id,
      name: "k",
      keyPrefix: "br_test_",
      keyHash: `hash_${userId}`,
      service: "default",
    })
    .returning();
  if (!apiKey) throw new Error("seed: no api key");
  return { accountId: account.id, apiKeyId: apiKey.id };
}

async function insertEvent(
  accountId: number,
  apiKeyId: number,
  ageDays: number,
  status: "loaded" | "blocked" = "blocked",
) {
  await db.insert(schema.events).values({
    accountId,
    apiKeyId,
    service: "default",
    timestamp: new Date(Date.now() - ageDays * DAY),
    url: "/p",
    userAgent: "Chrome",
    provider: "posthog",
    status,
    latency: 100,
  });
}

async function countEvents(accountId: number): Promise<number> {
  const rows = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.accountId, accountId));
  return rows.length;
}

function request(token: string | null): Request {
  return new Request("http://localhost/api/internal/retention", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("retention cron — auth", () => {
  beforeEach(reset);

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST({ request: request(null) });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer token (401)", async () => {
    const res = await POST({ request: request("not-the-secret") });
    expect(res.status).toBe(401);
  });

  it("accepts the correct bearer token (200)", async () => {
    const res = await POST({ request: request(CRON_SECRET) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

describe("retention cron — deletion by plan", () => {
  beforeEach(reset);

  it("deletes free-plan events older than 30 days, keeps recent ones", async () => {
    const { accountId, apiKeyId } = await seedAccount("free1", "free");
    await insertEvent(accountId, apiKeyId, 40); // older than 30d → delete
    await insertEvent(accountId, apiKeyId, 31); // older than 30d → delete
    await insertEvent(accountId, apiKeyId, 5); // recent → keep

    const res = await POST({ request: request(CRON_SECRET) });
    const body = (await res.json()) as { eventsDeleted: number };
    expect(body.eventsDeleted).toBe(2);
    expect(await countEvents(accountId)).toBe(1);
  });

  it("retains 60-day-old events for a pro account (90-day retention)", async () => {
    const { accountId, apiKeyId } = await seedAccount("pro1", "pro");
    await insertEvent(accountId, apiKeyId, 60); // within 90d → keep
    await insertEvent(accountId, apiKeyId, 100); // older than 90d → delete

    await POST({ request: request(CRON_SECRET) });
    expect(await countEvents(accountId)).toBe(1);
  });

  it("applies each plan's own cutoff in a single run", async () => {
    const free = await seedAccount("free2", "free");
    const pro = await seedAccount("pro2", "pro");
    await insertEvent(free.accountId, free.apiKeyId, 45); // free: delete
    await insertEvent(pro.accountId, pro.apiKeyId, 45); // pro: keep (< 90d)

    await POST({ request: request(CRON_SECRET) });
    expect(await countEvents(free.accountId)).toBe(0);
    expect(await countEvents(pro.accountId)).toBe(1);
  });
});

describe("retention cron — daily rollup", () => {
  beforeEach(reset);

  it("rolls up provider stats before deleting and is idempotent on re-run", async () => {
    const { accountId, apiKeyId } = await seedAccount("free3", "free");
    // Same UTC day, mixed statuses → one daily_provider_stats row for posthog.
    await insertEvent(accountId, apiKeyId, 40, "blocked");
    await insertEvent(accountId, apiKeyId, 40, "blocked");
    await insertEvent(accountId, apiKeyId, 40, "loaded");

    await POST({ request: request(CRON_SECRET) });
    const first = await db.select().from(schema.dailyProviderStats);
    expect(first.length).toBe(1);
    expect(first[0]!.provider).toBe("posthog");
    expect(first[0]!.totalChecks).toBe(3);
    expect(first[0]!.blocked).toBe(2);

    // Re-run: events already deleted, ON CONFLICT upsert must not error or
    // duplicate the row.
    const res = await POST({ request: request(CRON_SECRET) });
    expect(res.status).toBe(200);
    const second = await db.select().from(schema.dailyProviderStats);
    expect(second.length).toBe(1);
  });
});
