/**
 * Weekly digest cron — bearer auth (fail closed), opt-out respected, active-only
 * sends. Real route handler against the index.server PGlite singleton (same
 * harness as alerts-cron). RESEND_API_KEY is unset in test/setup.ts, so the
 * digest is logged rather than sent — no network.
 */

import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import * as mailer from "@/lib/mailer.server";

const CRON_SECRET = process.env.CRON_SECRET!;
const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const { Route } = await import("@/routes/api/internal/digest");
const POST = (
  Route as unknown as {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;

async function reset() {
  await db.delete(userTable);
}

async function seedAccount(userId: string, weeklyDigest = true) {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db
    .insert(schema.appAccounts)
    .values({ userId, weeklyDigest })
    .returning();
  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({ accountId: account!.id, name: "k", keyPrefix: "br_test_", keyHash: `h_${userId}` })
    .returning();
  return { accountId: account!.id, apiKeyId: apiKey!.id };
}

async function insertEvent(
  accountId: number,
  apiKeyId: number,
  opts: { provider?: string; status?: "blocked" | "loaded" } = {},
) {
  await db.insert(schema.events).values({
    accountId,
    apiKeyId,
    service: "default",
    timestamp: new Date(),
    url: "/p",
    userAgent: "Chrome",
    provider: opts.provider ?? "ga4",
    status: opts.status ?? "blocked",
    latency: 100,
  });
}

function request(token: string | null): Request {
  return new Request("http://localhost/api/internal/digest", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function run() {
  const res = await POST({ request: request(CRON_SECRET) });
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    accountsConsidered: number;
    sent: number;
    skippedOptedOut: number;
    skippedNoData: number;
    skippedNoEmail: number;
  }>;
}

describe("digest cron — auth (fail closed)", () => {
  beforeEach(reset);

  it("rejects a missing Authorization header (401)", async () => {
    expect((await POST({ request: request(null) })).status).toBe(401);
  });
  it("rejects a wrong bearer token (401)", async () => {
    expect((await POST({ request: request("nope") })).status).toBe(401);
  });
  it("accepts the correct bearer token (200)", async () => {
    expect((await POST({ request: request(CRON_SECRET) })).status).toBe(200);
  });
});

describe("digest cron — sending rules", () => {
  beforeEach(reset);

  it("sends to an opted-in account that has events in the window", async () => {
    const { accountId, apiKeyId } = await seedAccount("active1", true);
    await insertEvent(accountId, apiKeyId);
    const body = await run();
    expect(body.sent).toBe(1);
  });

  it("does not send to an opted-out account, counting it skippedOptedOut", async () => {
    const { accountId, apiKeyId } = await seedAccount("optout1", false);
    await insertEvent(accountId, apiKeyId);
    const body = await run();
    expect(body.sent).toBe(0);
    expect(body.skippedOptedOut).toBe(1);
  });

  it("never considers an account with no events in the window", async () => {
    await seedAccount("idle1", true); // opted in but no events
    const body = await run();
    expect(body.accountsConsidered).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("orders providers worst-first in the email body", async () => {
    const { accountId, apiKeyId } = await seedAccount("worst1", true);
    // posthog: 1/2 blocked (50%); ga4: 1/4 blocked (25%). Worst first ⇒ posthog.
    await insertEvent(accountId, apiKeyId, { provider: "posthog", status: "blocked" });
    await insertEvent(accountId, apiKeyId, { provider: "posthog", status: "loaded" });
    await insertEvent(accountId, apiKeyId, { provider: "ga4", status: "blocked" });
    for (let i = 0; i < 3; i++) {
      await insertEvent(accountId, apiKeyId, { provider: "ga4", status: "loaded" });
    }

    const spy = spyOn(mailer, "sendEmail").mockResolvedValue(undefined);
    try {
      const body = await run();
      expect(body.sent).toBe(1);
      const text = spy.mock.calls[0]![0].text;
      const posthogAt = text.indexOf("PostHog");
      const ga4At = text.indexOf("Google Analytics 4");
      expect(posthogAt).toBeGreaterThanOrEqual(0);
      expect(ga4At).toBeGreaterThanOrEqual(0);
      expect(posthogAt).toBeLessThan(ga4At); // worse rate listed first
    } finally {
      spy.mockRestore();
    }
  });

  it("reconciles counters across a mixed multi-account run", async () => {
    const a = await seedAccount("mix-in", true);
    await insertEvent(a.accountId, a.apiKeyId);
    const b = await seedAccount("mix-out", false);
    await insertEvent(b.accountId, b.apiKeyId);
    await seedAccount("mix-idle", true); // opted in, no events ⇒ not considered

    const body = await run();
    expect(body.sent).toBe(1);
    expect(body.skippedOptedOut).toBe(1);
    expect(body.skippedNoData).toBe(0);
    expect(body.skippedNoEmail).toBe(0);
    expect(body.accountsConsidered).toBe(2); // idle account has no events ⇒ excluded
    // The four buckets must always sum to accountsConsidered.
    expect(body.sent + body.skippedOptedOut + body.skippedNoData + body.skippedNoEmail).toBe(
      body.accountsConsidered,
    );
  });
});
