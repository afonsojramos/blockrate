/**
 * Alert-rule CRUD cores — plan gating, ownership scoping, and input validation.
 *
 * The cores are account-id-parameterized (no Better Auth session needed), so
 * they run DB-real against a fresh in-memory PGlite, mirroring the freshDb
 * pattern in admin-overview.test.ts. The DB is never mocked.
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
import {
  alertRuleInput,
  createAlertRuleForAccount,
  deleteAlertRuleForAccount,
  listAlertRulesForAccount,
  toggleAlertRuleForAccount,
  updateAlertRuleForAccount,
} from "@/server/alerts";

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
  return account.id;
}

const validRule = {
  name: "GA4 spike",
  provider: "ga4",
  service: null,
  comparator: "gte" as const,
  threshold: 30,
  windowHours: 24,
  minSample: 100,
  cooldownHours: 24,
};

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as RealDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
});

describe("createAlertRuleForAccount — plan gating", () => {
  it("rejects every create on Free (maxAlertRules 0)", async () => {
    const accountId = await seedAccount("free1", "free");
    await expect(createAlertRuleForAccount(db, accountId, PLANS.free, validRule)).rejects.toThrow();
    const rules = await listAlertRulesForAccount(db, accountId);
    expect(rules.length).toBe(0);
  });

  it("allows creates up to the Pro cap and rejects the one over", async () => {
    const accountId = await seedAccount("pro1", "pro");
    for (let i = 0; i < PLANS.pro.maxAlertRules; i++) {
      await createAlertRuleForAccount(db, accountId, PLANS.pro, {
        ...validRule,
        name: `rule ${i}`,
      });
    }
    await expect(createAlertRuleForAccount(db, accountId, PLANS.pro, validRule)).rejects.toThrow(
      /limit/i,
    );
    const rules = await listAlertRulesForAccount(db, accountId);
    expect(rules.length).toBe(PLANS.pro.maxAlertRules);
  });
});

describe("alert-rule CRUD — happy path", () => {
  it("creates, lists, toggles, updates, and deletes a rule", async () => {
    const accountId = await seedAccount("pro2", "pro");

    const created = await createAlertRuleForAccount(db, accountId, PLANS.pro, validRule);
    expect(created.provider).toBe("ga4");
    expect(created.enabled).toBe(true);

    const listed = await listAlertRulesForAccount(db, accountId);
    expect(listed.map((r) => r.id)).toContain(created.id);

    await toggleAlertRuleForAccount(db, accountId, created.id, false);
    await updateAlertRuleForAccount(db, accountId, { id: created.id, threshold: 55 });
    const afterUpdate = (await listAlertRulesForAccount(db, accountId))[0]!;
    expect(afterUpdate.enabled).toBe(false);
    expect(afterUpdate.threshold).toBe(55);

    await deleteAlertRuleForAccount(db, accountId, created.id);
    expect((await listAlertRulesForAccount(db, accountId)).length).toBe(0);
  });
});

describe("alert-rule CRUD — ownership isolation", () => {
  it("never lets account B touch account A's rule", async () => {
    const a = await seedAccount("ownerA", "pro");
    const b = await seedAccount("ownerB", "pro");
    const rule = await createAlertRuleForAccount(db, a, PLANS.pro, validRule);

    // B cannot see it
    expect((await listAlertRulesForAccount(db, b)).length).toBe(0);
    // B cannot update/toggle/delete it
    await expect(
      updateAlertRuleForAccount(db, b, { id: rule.id, threshold: 10 }),
    ).rejects.toThrow();
    await expect(toggleAlertRuleForAccount(db, b, rule.id, false)).rejects.toThrow();
    await expect(deleteAlertRuleForAccount(db, b, rule.id)).rejects.toThrow();
    // A's rule is untouched
    const aRule = (await listAlertRulesForAccount(db, a))[0]!;
    expect(aRule.threshold).toBe(30);
    expect(aRule.enabled).toBe(true);
  });

  it("update only patches provided fields, leaving others intact", async () => {
    const accountId = await seedAccount("patch1", "pro");
    const rule = await createAlertRuleForAccount(db, accountId, PLANS.pro, validRule);
    await updateAlertRuleForAccount(db, accountId, { id: rule.id, name: "renamed" });
    const after = await db
      .select()
      .from(schema.alertRules)
      .where(eq(schema.alertRules.id, rule.id));
    expect(after[0]!.name).toBe("renamed");
    expect(after[0]!.threshold).toBe(30); // untouched
  });
});

describe("alertRuleInput validation", () => {
  it("rejects out-of-range threshold", () => {
    expect(() => alertRuleInput.parse({ ...validRule, threshold: 150 })).toThrow();
  });
  it("rejects an unknown comparator", () => {
    expect(() => alertRuleInput.parse({ ...validRule, comparator: "neq" })).toThrow();
  });
  it("rejects a zero window", () => {
    expect(() => alertRuleInput.parse({ ...validRule, windowHours: 0 })).toThrow();
  });
  it("normalises an empty provider string to null (any provider)", () => {
    const parsed = alertRuleInput.parse({ ...validRule, provider: "" });
    expect(parsed.provider).toBeNull();
  });
});
