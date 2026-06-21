/**
 * Server functions for alert-rule management (continuous monitoring).
 *
 * Each createServerFn wrapper resolves the caller's app_account + plan from
 * the Better Auth session, then delegates to a plain `…ForAccount(db, …)`
 * core function. The cores carry all the logic (gating, ownership scoping,
 * validation) and are DB-real testable against PGlite without forging a
 * session — see apps/web/test/alerts-crud.test.ts.
 *
 * Gating: a rule may be created only while the account has fewer than
 * `plan.maxAlertRules` rules. Free is 0 → alerting is a Pro/Team capability.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import type { Plan } from "@/lib/plans";
import { isBlockedWebhookHost } from "@/lib/webhook";

type Db = BunSQLDatabase<typeof schema>;

// ─── Validation ────────────────────────────────────────────────────────────

/** Trailing window cap: 30 days. Beyond that, use the dashboard, not an alert. */
const MAX_WINDOW_HOURS = 24 * 30;

const alertRuleObject = z.object({
  name: z.string().min(1).max(64),
  /** null / omitted = any provider. Empty string is normalised to null. */
  provider: z
    .string()
    .max(64)
    .nullish()
    .transform((v) => v || null),
  service: z
    .string()
    .max(64)
    .nullish()
    .transform((v) => v || null),
  comparator: z.enum(["gte", "lte"]),
  threshold: z.number().int().min(0).max(100),
  windowHours: z.number().int().min(1).max(MAX_WINDOW_HOURS),
  minSample: z.number().int().min(1).max(1_000_000).default(100),
  cooldownHours: z.number().int().min(0).max(MAX_WINDOW_HOURS).default(24),
  /** Delivery target. email → account owner; webhook/slack → POST to webhookUrl. */
  channel: z.enum(["email", "webhook", "slack"]).default("email"),
  webhookUrl: z
    .string()
    .max(2048)
    .nullish()
    .transform((v) => v?.trim() || null),
});

/**
 * Cross-field rule: webhook/slack channels require an https URL; email forbids
 * one. superRefine (object-level) is the only place this is expressible, so it
 * wraps the raw object — `updateInput` derives from the raw object below since
 * `.partial()` is unavailable on the refined (ZodEffects) schema.
 */
export const alertRuleInput = alertRuleObject.superRefine((val, ctx) => {
  if (val.channel === "email") {
    if (val.webhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "webhookUrl must be empty for the email channel",
        path: ["webhookUrl"],
      });
    }
    return;
  }
  if (!val.webhookUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `webhookUrl is required for the ${val.channel} channel`,
      path: ["webhookUrl"],
    });
    return;
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(val.webhookUrl);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "webhookUrl must be a valid https:// URL",
      path: ["webhookUrl"],
    });
    return;
  }
  if (isBlockedWebhookHost(parsed.hostname)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "webhookUrl host is not allowed (internal/loopback addresses are blocked)",
      path: ["webhookUrl"],
    });
  }
});

export type AlertRuleInput = z.infer<typeof alertRuleInput>;

// `channel`/`webhookUrl` are intentionally omitted from the update path: the
// cross-field https + host refinement lives only on `alertRuleInput` (a
// ZodEffects, so it can't be `.partial()`-ed). Dropping the delivery fields
// here means an update can never set an unvalidated webhook target. When an
// edit-delivery feature ships, re-add them with the same refinement applied.
const updateInput = alertRuleObject.omit({ channel: true, webhookUrl: true }).partial().extend({
  id: z.number().int().positive(),
});

const idInput = z.object({ id: z.number().int().positive() });
const toggleInput = z.object({ id: z.number().int().positive(), enabled: z.boolean() });

// ─── Account-parameterized cores (testable without a session) ───────────────

export async function listAlertRulesForAccount(db: Db, accountId: number) {
  const { alertRules } = await import("@/lib/db/schema");
  return db
    .select()
    .from(alertRules)
    .where(eq(alertRules.accountId, accountId))
    .orderBy(alertRules.createdAt);
}

export async function createAlertRuleForAccount(
  db: Db,
  accountId: number,
  plan: Plan,
  input: AlertRuleInput,
) {
  const { alertRules } = await import("@/lib/db/schema");

  // Gate on the plan cap. Free is 0, so this rejects every Free create.
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: count() })
    .from(alertRules)
    .where(eq(alertRules.accountId, accountId));
  if (existing >= plan.maxAlertRules) {
    throw new Error(
      plan.maxAlertRules === 0
        ? `Alerts are not available on the ${plan.label} plan — upgrade to add rules.`
        : `Alert-rule limit reached (${plan.maxAlertRules} on the ${plan.label} plan).`,
    );
  }

  const [rule] = await db
    .insert(alertRules)
    .values({
      accountId,
      name: input.name,
      provider: input.provider,
      service: input.service,
      comparator: input.comparator,
      threshold: input.threshold,
      windowHours: input.windowHours,
      minSample: input.minSample,
      cooldownHours: input.cooldownHours,
      channel: input.channel,
      webhookUrl: input.webhookUrl,
    })
    .returning();
  if (!rule) throw new Error("failed to create alert rule");
  return rule;
}

export async function updateAlertRuleForAccount(
  db: Db,
  accountId: number,
  input: z.infer<typeof updateInput>,
) {
  const { alertRules } = await import("@/lib/db/schema");
  const { id, ...fields } = input;
  // Drop undefined keys so a partial update doesn't null out untouched columns.
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  const result = await db
    .update(alertRules)
    .set(patch)
    .where(and(eq(alertRules.id, id), eq(alertRules.accountId, accountId)))
    .returning({ id: alertRules.id });
  if (result.length === 0) throw new Error("alert rule not found");
  return { id: result[0]!.id };
}

export async function toggleAlertRuleForAccount(
  db: Db,
  accountId: number,
  id: number,
  enabled: boolean,
) {
  const { alertRules } = await import("@/lib/db/schema");
  const result = await db
    .update(alertRules)
    .set({ enabled })
    .where(and(eq(alertRules.id, id), eq(alertRules.accountId, accountId)))
    .returning({ id: alertRules.id });
  if (result.length === 0) throw new Error("alert rule not found");
  return { id: result[0]!.id };
}

export async function deleteAlertRuleForAccount(db: Db, accountId: number, id: number) {
  const { alertRules } = await import("@/lib/db/schema");
  const result = await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.accountId, accountId)))
    .returning({ id: alertRules.id });
  if (result.length === 0) throw new Error("alert rule not found");
  return { id: result[0]!.id };
}

// ─── Auth-gated wrappers ─────────────────────────────────────────────────────

const requireAccount = async () => {
  const { auth } = await import("@/lib/auth.server");
  const { db } = await import("@/lib/db/index.server");
  const { appAccounts } = await import("@/lib/db/schema");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) throw new Error("unauthorized");

  const rows = await db
    .select()
    .from(appAccounts)
    .where(eq(appAccounts.userId, session.user.id))
    .limit(1);
  const account = rows[0];
  if (!account) throw new Error("no app_account for user — bootstrap hook missed");
  return { session, account, db };
};

export const listAlertRules = createServerFn({ method: "GET" }).handler(async () => {
  const { account, db } = await requireAccount();
  const { getPlan } = await import("@/lib/plans");
  const rules = await listAlertRulesForAccount(db, account.id);
  const plan = getPlan(account.plan);
  return { rules, maxAlertRules: plan.maxAlertRules, planLabel: plan.label };
});

export const createAlertRule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => alertRuleInput.parse(input))
  .handler(async ({ data }) => {
    const { account, db } = await requireAccount();
    const { getPlan } = await import("@/lib/plans");
    return createAlertRuleForAccount(db, account.id, getPlan(account.plan), data);
  });

export const toggleAlertRule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => toggleInput.parse(input))
  .handler(async ({ data }) => {
    const { account, db } = await requireAccount();
    return toggleAlertRuleForAccount(db, account.id, data.id, data.enabled);
  });

export const deleteAlertRule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { account, db } = await requireAccount();
    return deleteAlertRuleForAccount(db, account.id, data.id);
  });
