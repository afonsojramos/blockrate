/**
 * Remediation Playbook server function (strategy Phase 3 — the measure → fix
 * bridge). For the caller's account it ranks the providers it currently sees
 * blocked by blocked-check volume and attaches each provider's VETTED
 * remediation metadata (src/lib/providers.ts). It never fabricates a fix — a
 * wrong fix that breaks a customer's analytics is worse than none.
 *
 * The core `buildRemediationPlaybook(db, accountId, plan)` is account-id
 * parameterized so it is DB-real testable without a session, mirroring
 * src/server/alerts.ts. The createServerFn wrapper does requireAccount() +
 * getPlan and gates on `plan.remediationPlaybook`.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, eq, gt, sql } from "drizzle-orm";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import type { Plan } from "@/lib/plans";
import type { Remediation } from "@/lib/providers";

import { DAY_MS } from "@/lib/time";
import { MIN_SAMPLE_CHECKS, getProviderMeta } from "@/lib/providers";

type Db = BunSQLDatabase<typeof schema>;

/**
 * A month of recent checks is representative for a remediation decision. The
 * paid tiers all retain ≥30 days, so this is a flat window (not plan-capped):
 * Free never reaches this code (gated below).
 */
const WINDOW_DAYS = 30;

export interface PlaybookItem {
  provider: string;
  /** Display label, or the raw slug for custom (non-built-in) providers. */
  label: string;
  total: number;
  /**
   * Checks recorded as blocked in the window. NOTE: blockrate records one
   * probe outcome per engaged session (3s probe, sessionDedup=false), NOT one
   * per analytics event — so this is blocked *checks/sessions*, a lower bound
   * on true lost events (real tools fire several events per session). The UI
   * labels it accordingly; it must never be presented as "lost events".
   */
  blocked: number;
  blockRate: number;
  /** Vetted fix metadata, or null for an unknown/custom provider. */
  remediation: Remediation | null;
}

export interface RemediationPlaybook {
  entitled: boolean;
  items: PlaybookItem[];
  /** Sum of `blocked` across listed providers — blocked checks, not events. */
  totalBlockedChecks: number;
  planLabel: string;
  windowDays: number;
}

export async function buildRemediationPlaybook(
  db: Db,
  accountId: number,
  plan: Plan,
): Promise<RemediationPlaybook> {
  if (!plan.remediationPlaybook) {
    return {
      entitled: false,
      items: [],
      totalBlockedChecks: 0,
      planLabel: plan.label,
      windowDays: WINDOW_DAYS,
    };
  }

  const { events } = await import("@/lib/db/schema");
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

  // count()/mapWith(Number) coerce pg/pglite's stringified bigint at the driver
  // boundary — the block rate must never be computed on a string (CLAUDE.md).
  const rows = await db
    .select({
      provider: events.provider,
      total: count(),
      blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(
        Number,
      ),
    })
    .from(events)
    .where(and(eq(events.accountId, accountId), gt(events.timestamp, since)))
    .groupBy(events.provider);

  const items: PlaybookItem[] = rows
    // Only providers with a trustworthy sample AND a real blocked count appear.
    .filter((r) => r.total >= MIN_SAMPLE_CHECKS && r.blocked > 0)
    .map((r) => {
      const meta = getProviderMeta(r.provider);
      return {
        provider: r.provider,
        label: meta?.label ?? r.provider,
        total: r.total,
        blocked: r.blocked,
        blockRate: r.blocked / r.total,
        remediation: meta?.remediation ?? null,
      };
    })
    // Rank by impact; tiebreak on slug so the order is deterministic across
    // loads (Postgres GROUP BY row order is otherwise unspecified).
    .sort((a, b) => b.blocked - a.blocked || a.provider.localeCompare(b.provider));

  const totalBlockedChecks = items.reduce((sum, i) => sum + i.blocked, 0);

  return {
    entitled: true,
    items,
    totalBlockedChecks,
    planLabel: plan.label,
    windowDays: WINDOW_DAYS,
  };
}

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
  return { account, db };
};

export const getRemediationPlaybook = createServerFn({ method: "GET" }).handler(async () => {
  const { account, db } = await requireAccount();
  const { getPlan } = await import("@/lib/plans");
  return buildRemediationPlaybook(db, account.id, getPlan(account.plan));
});
