/**
 * Alert evaluation cron — bearer auth, threshold crossing, min-sample + cooldown
 * suppression, and window scoping. Same harness as retention.test.ts: the real
 * route handler runs against the index.server db singleton pointed at in-memory
 * PGlite, so handler and test share one database. RESEND_API_KEY is unset in
 * test/setup.ts, so sendEmail logs instead of sending — no network.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { alertEmailBody } from "@/lib/mailer.server";

const CRON_SECRET = process.env.CRON_SECRET!;
const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const { Route } = await import("@/routes/api/internal/alerts");
const POST = (
  Route as unknown as {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;

const HOUR = 3_600_000;

async function reset() {
  await db.delete(userTable);
  await db.delete(schema.alertRules);
}

async function seedAccount(
  userId: string,
  plan = "pro",
): Promise<{ accountId: number; apiKeyId: number }> {
  await db.insert(userTable).values({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db.insert(schema.appAccounts).values({ userId, plan }).returning();
  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({ accountId: account!.id, name: "k", keyPrefix: "br_test_", keyHash: `h_${userId}` })
    .returning();
  return { accountId: account!.id, apiKeyId: apiKey!.id };
}

async function insertEvents(
  accountId: number,
  apiKeyId: number,
  opts: {
    provider?: string;
    service?: string;
    blocked: number;
    loaded: number;
    ageHours?: number;
  },
) {
  const { provider = "ga4", service = "default", blocked, loaded, ageHours = 1 } = opts;
  const rows = [];
  for (let i = 0; i < blocked + loaded; i++) {
    rows.push({
      accountId,
      apiKeyId,
      service,
      timestamp: new Date(Date.now() - ageHours * HOUR),
      url: "/p",
      userAgent: "Chrome",
      provider,
      status: (i < blocked ? "blocked" : "loaded") as "blocked" | "loaded",
      latency: 100,
    });
  }
  await db.insert(schema.events).values(rows);
}

async function seedRule(accountId: number, overrides: Partial<schema.NewAlertRule> = {}) {
  const [rule] = await db
    .insert(schema.alertRules)
    .values({
      accountId,
      name: "rule",
      provider: "ga4",
      comparator: "gte",
      threshold: 30,
      windowHours: 24,
      minSample: 1,
      cooldownHours: 24,
      enabled: true,
      ...overrides,
    })
    .returning();
  return rule!;
}

function request(token: string | null): Request {
  return new Request("http://localhost/api/internal/alerts", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function run(): Promise<{
  fired: number;
  skippedCooldown: number;
  skippedMinSample: number;
  skippedUnentitled: number;
  rulesEvaluated: number;
}> {
  const res = await POST({ request: request(CRON_SECRET) });
  expect(res.status).toBe(200);
  return res.json();
}

describe("alerts cron — auth (fail closed)", () => {
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

describe("alerts cron — threshold evaluation", () => {
  beforeEach(reset);

  it("fires when the block rate is at or above a gte threshold", async () => {
    const { accountId, apiKeyId } = await seedAccount("u1");
    const rule = await seedRule(accountId, { threshold: 30, comparator: "gte" });
    await insertEvents(accountId, apiKeyId, { blocked: 4, loaded: 6 }); // 40%

    const body = await run();
    expect(body.fired).toBe(1);
    const fresh = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    expect(fresh.lastFiredAt).not.toBeNull();
  });

  it("does not fire when below a gte threshold", async () => {
    const { accountId, apiKeyId } = await seedAccount("u2");
    const rule = await seedRule(accountId, { threshold: 30, comparator: "gte" });
    await insertEvents(accountId, apiKeyId, { blocked: 1, loaded: 9 }); // 10%

    expect((await run()).fired).toBe(0);
    const fresh = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    expect(fresh.lastFiredAt).toBeNull();
  });

  it("fires an lte rule when the rate drops to or below its threshold", async () => {
    const { accountId, apiKeyId } = await seedAccount("u3");
    await seedRule(accountId, { threshold: 5, comparator: "lte" });
    await insertEvents(accountId, apiKeyId, { blocked: 2, loaded: 98 }); // 2%
    expect((await run()).fired).toBe(1);
  });

  it("does not evaluate a disabled rule", async () => {
    const { accountId, apiKeyId } = await seedAccount("u4");
    await seedRule(accountId, { enabled: false });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%
    const body = await run();
    expect(body.rulesEvaluated).toBe(0);
    expect(body.fired).toBe(0);
  });
});

describe("alerts cron — suppression", () => {
  beforeEach(reset);

  it("skips a rule below its min sample even when the rate exceeds threshold", async () => {
    const { accountId, apiKeyId } = await seedAccount("u5");
    await seedRule(accountId, { threshold: 30, minSample: 100 });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90% but only 10 checks

    const body = await run();
    expect(body.fired).toBe(0);
    expect(body.skippedMinSample).toBe(1);
  });

  it("skips a rule inside its cooldown window", async () => {
    const { accountId, apiKeyId } = await seedAccount("u6");
    await seedRule(accountId, {
      threshold: 30,
      cooldownHours: 24,
      lastFiredAt: new Date(Date.now() - 1 * HOUR), // fired 1h ago
    });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%

    const body = await run();
    expect(body.fired).toBe(0);
    expect(body.skippedCooldown).toBe(1);
  });

  it("excludes events older than the rule's window from the rate", async () => {
    const { accountId, apiKeyId } = await seedAccount("u7");
    await seedRule(accountId, { threshold: 30, windowHours: 24, minSample: 1 });
    // All blocked but 48h old → outside a 24h window → no qualifying checks.
    await insertEvents(accountId, apiKeyId, { blocked: 10, loaded: 0, ageHours: 48 });

    const body = await run();
    expect(body.fired).toBe(0);
    expect(body.skippedMinSample).toBe(1); // 0 checks in window < minSample
  });

  it("scopes the rate to the rule's provider", async () => {
    const { accountId, apiKeyId } = await seedAccount("u8");
    await seedRule(accountId, { provider: "ga4", threshold: 30, minSample: 1 });
    await insertEvents(accountId, apiKeyId, { provider: "ga4", blocked: 0, loaded: 10 }); // 0%
    await insertEvents(accountId, apiKeyId, { provider: "posthog", blocked: 10, loaded: 0 }); // 100%

    // Rule watches ga4 (0%), so it must not fire on posthog's 100%.
    expect((await run()).fired).toBe(0);
  });
});

describe("alerts cron — edge triggering & re-gating", () => {
  beforeEach(reset);

  it("fires once on the crossing and does not re-fire while still matching", async () => {
    const { accountId, apiKeyId } = await seedAccount("e1");
    // cooldown 0 so ONLY the edge (lastMatched), not the cooldown, suppresses re-fire.
    await seedRule(accountId, { threshold: 30, comparator: "gte", cooldownHours: 0 });
    await insertEvents(accountId, apiKeyId, { blocked: 4, loaded: 6 }); // 40%

    expect((await run()).fired).toBe(1);
    expect((await run()).fired).toBe(0); // still 40% → no new crossing
  });

  it("re-arms after recovery and fires again on a fresh crossing", async () => {
    const { accountId, apiKeyId } = await seedAccount("e2");
    await seedRule(accountId, { threshold: 30, comparator: "gte", cooldownHours: 0 });

    await insertEvents(accountId, apiKeyId, { blocked: 4, loaded: 6 }); // 40%
    expect((await run()).fired).toBe(1);

    // Recover → condition unmet → edge re-arms.
    await db.delete(schema.events).where(eq(schema.events.accountId, accountId));
    await insertEvents(accountId, apiKeyId, { blocked: 0, loaded: 10 }); // 0%
    expect((await run()).fired).toBe(0);

    // Cross again → fires again.
    await db.delete(schema.events).where(eq(schema.events.accountId, accountId));
    await insertEvents(accountId, apiKeyId, { blocked: 5, loaded: 5 }); // 50%
    expect((await run()).fired).toBe(1);
  });

  it("skips rules whose account plan no longer permits alerting", async () => {
    const { accountId, apiKeyId } = await seedAccount("downgraded", "free");
    await seedRule(accountId, { threshold: 30 });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%

    const body = await run();
    expect(body.fired).toBe(0);
    expect(body.skippedUnentitled).toBe(1);
  });

  it("after Team→Pro downgrade, only the oldest maxAlertRules rules fire", async () => {
    // Pro allows 10; seed 12 enabled rules, only the 10 lowest ids may fire.
    const { accountId, apiKeyId } = await seedAccount("team-to-pro", "pro");
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%
    for (let i = 0; i < 12; i++) {
      await seedRule(accountId, {
        name: `r${i}`,
        threshold: 30,
        cooldownHours: 0,
      });
    }

    const body = await run();
    expect(body.fired).toBe(10);
    expect(body.skippedUnentitled).toBe(2);
  });

  it("fires a gte rule at exactly the threshold (boundary)", async () => {
    const { accountId, apiKeyId } = await seedAccount("b1");
    await seedRule(accountId, { threshold: 30, comparator: "gte" });
    await insertEvents(accountId, apiKeyId, { blocked: 3, loaded: 7 }); // exactly 30%
    expect((await run()).fired).toBe(1);
  });

  it("fires an lte rule at exactly the threshold (boundary)", async () => {
    const { accountId, apiKeyId } = await seedAccount("b2");
    await seedRule(accountId, { threshold: 30, comparator: "lte" });
    await insertEvents(accountId, apiKeyId, { blocked: 3, loaded: 7 }); // exactly 30%
    expect((await run()).fired).toBe(1);
  });
});

describe("alerts cron — delivery channels", () => {
  let fetchCalls: { url: string; body: unknown }[];
  let nextOk = true;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    await reset();
    fetchCalls = [];
    nextOk = true;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const raw = init?.body;
      fetchCalls.push({ url: String(url), body: raw ? JSON.parse(raw as string) : null });
      return new Response(nextOk ? "ok" : "fail", { status: nextOk ? 200 : 500 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("delivers a webhook POST with a JSON payload on a crossing", async () => {
    const { accountId, apiKeyId } = await seedAccount("w1");
    await seedRule(accountId, {
      channel: "webhook",
      webhookUrl: "https://hooks.test/x",
      threshold: 30,
    });
    await insertEvents(accountId, apiKeyId, { blocked: 4, loaded: 6 }); // 40%

    expect((await run()).fired).toBe(1);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]!.url).toBe("https://hooks.test/x");
    expect(fetchCalls[0]!.body).toMatchObject({
      provider: "ga4",
      threshold: 30,
      comparator: "gte",
    });
  });

  it("delivers a slack POST shaped as { text }", async () => {
    const { accountId, apiKeyId } = await seedAccount("s1");
    await seedRule(accountId, {
      channel: "slack",
      webhookUrl: "https://hooks.slack.com/x",
      threshold: 30,
    });
    await insertEvents(accountId, apiKeyId, { blocked: 5, loaded: 5 }); // 50%

    await run();
    expect(fetchCalls.length).toBe(1);
    expect(typeof (fetchCalls[0]!.body as { text?: unknown }).text).toBe("string");
  });

  it("does not POST for an email-channel rule (uses sendEmail)", async () => {
    const { accountId, apiKeyId } = await seedAccount("e9");
    await seedRule(accountId, { channel: "email", threshold: 30 });
    await insertEvents(accountId, apiKeyId, { blocked: 4, loaded: 6 }); // 40%

    expect((await run()).fired).toBe(1);
    expect(fetchCalls.length).toBe(0);
  });

  it("does not stamp lastFiredAt when the webhook POST fails (retries next sweep)", async () => {
    const { accountId, apiKeyId } = await seedAccount("f1");
    const rule = await seedRule(accountId, {
      channel: "webhook",
      webhookUrl: "https://hooks.test/x",
      threshold: 30,
    });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%
    nextOk = false; // webhook responds 500

    expect((await run()).fired).toBe(0);
    const afterFail = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    expect(afterFail.lastFiredAt).toBeNull();
    // lastMatched must stay false so the edge can retry while still matching.
    expect(afterFail.lastMatched).toBe(false);

    // Same condition still holds; delivery recovers → fires on the retry sweep.
    nextOk = true;
    expect((await run()).fired).toBe(1);
    const afterRetry = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    expect(afterRetry.lastFiredAt).not.toBeNull();
    expect(afterRetry.lastMatched).toBe(true);
  });

  it("fires after cooldown expires while still matching (cooldown does not silence the edge)", async () => {
    const { accountId, apiKeyId } = await seedAccount("cd1");
    const rule = await seedRule(accountId, {
      channel: "webhook",
      webhookUrl: "https://hooks.test/cd",
      threshold: 30,
      cooldownHours: 24,
      // Recent fire, but lastMatched false (e.g. recovered then re-crossed).
      lastFiredAt: new Date(Date.now() - 1 * HOUR),
      lastMatched: false,
    });
    await insertEvents(accountId, apiKeyId, { blocked: 9, loaded: 1 }); // 90%

    const cooled = await run();
    expect(cooled.fired).toBe(0);
    expect(cooled.skippedCooldown).toBe(1);
    const mid = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    // Cooldown must not stamp lastMatched — that would permanently silence the edge.
    expect(mid.lastMatched).toBe(false);

    // Cooldown window elapsed; condition still holds → fire.
    await db
      .update(schema.alertRules)
      .set({ lastFiredAt: new Date(Date.now() - 25 * HOUR) })
      .where(eq(schema.alertRules.id, rule.id));
    expect((await run()).fired).toBe(1);
    const done = (
      await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
    )[0]!;
    expect(done.lastMatched).toBe(true);
    expect(done.lastFiredAt).not.toBeNull();
  });
});

describe("alertEmailBody", () => {
  it("describes the scope, rate, threshold, and window in plain text", () => {
    const body = alertEmailBody({
      ruleName: "GA4 spike",
      provider: "ga4",
      service: "web",
      ratePct: 42.3,
      comparator: "gte",
      threshold: 30,
      windowHours: 24,
    });
    expect(body).toContain("GA4 spike");
    expect(body).toContain("ga4");
    expect(body).toContain("42.3%");
    expect(body).toContain("30%");
    expect(body).toContain("24h");
    expect(body).not.toContain("<"); // no HTML markup
  });

  it("renders 'all providers' for a null provider rule", () => {
    const body = alertEmailBody({
      ruleName: "any",
      provider: null,
      service: null,
      ratePct: 10,
      comparator: "lte",
      threshold: 5,
      windowHours: 12,
    });
    expect(body).toContain("all providers");
    expect(body).not.toContain("null");
  });
});
