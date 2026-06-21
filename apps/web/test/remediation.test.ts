/**
 * Remediation Playbook — impact ranking, lost-event estimation, min-sample
 * floor, plan gating, and number coercion. The core is account-id
 * parameterized, so it runs DB-real against a fresh in-memory PGlite (the
 * freshDb pattern from admin-overview.test.ts). The DB is never mocked.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";
import { PLANS } from "@/lib/plans";
import { MIN_SAMPLE_CHECKS } from "@/lib/providers";
import { buildRemediationPlaybook } from "@/server/remediation";

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

type RealDb = BunSQLDatabase<typeof schema>;
let db: RealDb;

async function seedAccount(userId: string, plan: string): Promise<number> {
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
  await db
    .insert(schema.apiKeys)
    .values({ accountId: account.id, name: "k", keyPrefix: "br_test_", keyHash: `h_${userId}` });
  return account.id;
}

const DAY = 86_400_000;

/** Insert `blocked` blocked + `loaded` loaded events for a provider, `ageDays` old. */
async function seedEvents(
  accountId: number,
  provider: string,
  blocked: number,
  loaded: number,
  ageDays = 0,
) {
  const [apiKey] = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.accountId, accountId))
    .limit(1);
  const ts = new Date(Date.now() - ageDays * DAY);
  const rows = [];
  for (let i = 0; i < blocked + loaded; i++) {
    rows.push({
      accountId,
      apiKeyId: apiKey!.id,
      service: "default",
      timestamp: ts,
      url: "/p",
      userAgent: "Chrome",
      provider,
      status: (i < blocked ? "blocked" : "loaded") as "blocked" | "loaded",
      latency: 100,
    });
  }
  await db.insert(schema.events).values(rows);
}

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as RealDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
});

describe("plan remediationPlaybook capability", () => {
  it("is off for Free and on for Pro/Team", () => {
    expect(PLANS.free.remediationPlaybook).toBe(false);
    expect(PLANS.pro.remediationPlaybook).toBe(true);
    expect(PLANS.team.remediationPlaybook).toBe(true);
  });
});

describe("buildRemediationPlaybook — gating", () => {
  it("returns entitled:false with empty items for a Free account", async () => {
    const accountId = await seedAccount("free1", "free");
    await seedEvents(accountId, "ga4", 80, 20); // 100 checks, 80% blocked
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.free);
    expect(pb.entitled).toBe(false);
    expect(pb.items.length).toBe(0);
    expect(pb.totalBlockedChecks).toBe(0);
  });

  it("is entitled for Pro/Team and reports a 30-day window", async () => {
    const accountId = await seedAccount("pro1", "pro");
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.entitled).toBe(true);
    expect(pb.windowDays).toBe(30);
    const team = await seedAccount("team1", "team");
    expect((await buildRemediationPlaybook(db, team, PLANS.team)).windowDays).toBe(30);
  });
});

describe("buildRemediationPlaybook — ranking & estimation", () => {
  it("ranks providers by estimated lost events and sums the total", async () => {
    const accountId = await seedAccount("pro2", "pro");
    await seedEvents(accountId, "ga4", 60, 40); // 60 blocked of 100
    await seedEvents(accountId, "posthog", 90, 30); // 90 blocked of 120

    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.map((i) => i.provider)).toEqual(["posthog", "ga4"]); // 90 > 60
    expect(pb.items[0]!.blocked).toBe(90);
    expect(pb.totalBlockedChecks).toBe(150);
  });

  it("breaks ties on provider slug for a deterministic order", async () => {
    const accountId = await seedAccount("tie1", "pro");
    // Equal blocked counts → order must fall back to slug, not GROUP BY order.
    await seedEvents(accountId, "segment", 50, 60);
    await seedEvents(accountId, "amplitude", 50, 60);
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.map((i) => i.provider)).toEqual(["amplitude", "segment"]);
  });

  it("computes blockRate as a real number (not a stringified aggregate)", async () => {
    const accountId = await seedAccount("pro3", "pro");
    await seedEvents(accountId, "ga4", 60, 40); // 60%
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    const ga4 = pb.items.find((i) => i.provider === "ga4")!;
    expect(ga4.total).toBe(100);
    expect(ga4.blocked).toBe(60);
    expect(ga4.blockRate).toBeCloseTo(0.6, 5);
    expect(Number.isFinite(ga4.blockRate)).toBe(true);
  });

  it("attaches vetted remediation metadata for a known provider", async () => {
    const accountId = await seedAccount("pro4", "pro");
    await seedEvents(accountId, "posthog", 70, 50);
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    const ph = pb.items.find((i) => i.provider === "posthog")!;
    expect(ph.label).toBe("PostHog");
    expect(ph.remediation?.supportLevel).toBe("official");
  });

  it("degrades gracefully for an unknown/custom provider slug", async () => {
    const accountId = await seedAccount("pro5", "pro");
    await seedEvents(accountId, "my-custom-tool", 75, 50);
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    const custom = pb.items.find((i) => i.provider === "my-custom-tool")!;
    expect(custom.label).toBe("my-custom-tool");
    expect(custom.remediation).toBeNull();
  });
});

describe("buildRemediationPlaybook — floors", () => {
  it("excludes providers below the min-sample floor even at 100% blocked", async () => {
    const accountId = await seedAccount("pro6", "pro");
    await seedEvents(accountId, "ga4", MIN_SAMPLE_CHECKS - 1, 0); // < floor, all blocked
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.find((i) => i.provider === "ga4")).toBeUndefined();
  });

  it("excludes a provider with zero blocked events", async () => {
    const accountId = await seedAccount("pro7", "pro");
    await seedEvents(accountId, "ga4", 0, 200); // healthy
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.length).toBe(0);
    expect(pb.totalBlockedChecks).toBe(0);
  });

  it("excludes events older than the 30-day window", async () => {
    const accountId = await seedAccount("pro8", "pro");
    await seedEvents(accountId, "ga4", 150, 50, 45); // all 45 days old → outside window
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.length).toBe(0);
    expect(pb.totalBlockedChecks).toBe(0);
  });

  it("totalBlockedChecks counts only listed providers in a mixed set", async () => {
    const accountId = await seedAccount("pro9", "pro");
    await seedEvents(accountId, "ga4", 70, 50); // listed: 70 blocked, 120 checks
    await seedEvents(accountId, "posthog", 0, 200); // zero-blocked → excluded
    await seedEvents(accountId, "mixpanel", 30, 10, 60); // old → excluded
    const pb = await buildRemediationPlaybook(db, accountId, PLANS.pro);
    expect(pb.items.map((i) => i.provider)).toEqual(["ga4"]);
    expect(pb.totalBlockedChecks).toBe(70);
  });
});
