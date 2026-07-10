/**
 * Hosted /api/ingest — API key auth, monthly quota, timestamp skew, write path.
 * Real route handler + in-memory PGlite (same harness as retention/stripe tests).
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { generateApiKey } from "@/lib/keys.server";
import { PLANS } from "@/lib/plans";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const { Route } = await import("@/routes/api/ingest");
const POST = (
  Route as unknown as {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;

async function reset() {
  await db.delete(userTable);
  await db.delete(schema.usageCounters);
}

async function seedKey(plan: keyof typeof PLANS = "free") {
  const userId = `ingest-${plan}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db.insert(schema.appAccounts).values({ userId, plan }).returning();
  const generated = generateApiKey();
  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      accountId: account!.id,
      name: "k",
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      service: "web",
    })
    .returning();
  return { accountId: account!.id, apiKeyId: apiKey!.id, plaintext: generated.plaintext };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    url: "/home",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    providers: [
      { name: "ga4", status: "blocked", latency: 12 },
      { name: "posthog", status: "loaded", latency: 5 },
    ],
    ...overrides,
  };
}

function request(key: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["x-blockrate-key"] = key;
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("hosted /api/ingest", () => {
  beforeEach(reset);

  it("rejects missing API key with 401", async () => {
    const res = await POST({ request: request(null, payload()) });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid API key with 401", async () => {
    await seedKey("free");
    const res = await POST({
      request: request("br_" + "0".repeat(48), payload()),
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid payload and writes one row per provider", async () => {
    const { accountId, plaintext } = await seedKey("free");
    const res = await POST({ request: request(plaintext, payload()) });
    expect(res.status).toBe(204);

    const events = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.accountId, accountId));
    expect(events.length).toBe(2);
    expect(events.map((e) => e.provider).sort()).toEqual(["ga4", "posthog"]);
    // UA is truncated to browser family + major version at the boundary.
    expect(events[0]!.userAgent).toMatch(/^Chrome \d+$/);

    const usage = await db
      .select()
      .from(schema.usageCounters)
      .where(eq(schema.usageCounters.accountId, accountId));
    expect(usage[0]!.eventCount).toBe(2);
  });

  it("rejects a far-past timestamp that could rewrite sealed rollup days", async () => {
    const { plaintext } = await seedKey("free");
    const farPast = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const res = await POST({
      request: request(plaintext, payload({ timestamp: farPast })),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("timestamp");
  });

  it("returns 429 when monthly free quota is exhausted", async () => {
    const { accountId, plaintext } = await seedKey("free");
    const ym = new Date().toISOString().slice(0, 7);
    await db.insert(schema.usageCounters).values({
      accountId,
      yearMonth: ym,
      eventCount: PLANS.free.eventsPerMonth,
    });

    const res = await POST({ request: request(plaintext, payload()) });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; limit: number };
    expect(body.error).toContain("quota");
    expect(body.limit).toBe(PLANS.free.eventsPerMonth);
  });

  it("rejects a revoked key", async () => {
    const { apiKeyId, plaintext } = await seedKey("free");
    await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, apiKeyId));

    const res = await POST({ request: request(plaintext, payload()) });
    expect(res.status).toBe(401);
  });
});
