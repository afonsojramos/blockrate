/**
 * Operator-only admin overview server function.
 *
 * Primary auth gate lives in the route's beforeLoad. `requireAdmin` here is
 * a second-layer defense so the server fn cannot be invoked directly over
 * RPC without an admin session. Both failure branches throw the same
 * opaque error to avoid leaking "logged in but not admin" as an enumeration
 * signal.
 *
 * Query shape mirrored in apps/web/test/admin-overview.test.ts — keep in sync.
 */

import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import { DAY_MS } from "@/lib/time";

// Shared operator gate. Verifies an admin session or throws the SAME opaque
// redirect for both "not logged in" and "logged in but not admin" — no
// enumeration oracle. An unauth'd request lands on /app first, which the
// _authed layout bounces to /login. Returns the session for callers that need it.
const adminSessionOrRedirect = async () => {
  const { auth } = await import("@/lib/auth.server");
  const { isAdminEmail } = await import("@/lib/admin.server");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session || !isAdminEmail(session.user.email)) {
    throw redirect({ to: "/app", search: { since: 7 } });
  }
  return session;
};

/**
 * Route-level authorization gate for /_authed/app/admin, used in the route's
 * beforeLoad. Redirecting non-operators here — before the loader runs — keeps
 * the authz redirect (handled by the router as navigation) separate from
 * genuine query failures in the loader, which surface as real errors through
 * the route's errorComponent instead of being swallowed as a fake logout.
 */
export const assertAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await adminSessionOrRedirect();
});

// ─── Onboarding funnel ──────────────────────────────────────────────────

export interface OnboardingFunnel {
  /** app_accounts rows — stage 1, "signed up". */
  accounts: number;
  /** Accounts with ≥1 api_keys row, revoked included — stage 2. */
  withKey: number;
  /** Accounts with ≥1 events row — stage 3. NOTE: retention deletes old
   *  events, so very old accounts eventually fall out of this stage. */
  withEvents: number;
  /** Median hours from app_accounts.created_at to the account's first
   *  api_keys.created_at, over accounts WITH a key. null when none. */
  medianHoursToKey: number | null;
  /** Median hours from app_accounts.created_at to MIN(events.timestamp),
   *  over accounts WITH events. null when none. */
  medianHoursToFirstEvent: number | null;
}

/** Median of a numeric list; null for the empty list. Averages the two
 *  middle elements on even counts. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const HOUR_MS = 3_600_000;

/**
 * Signup → first API key → first event, derived entirely from existing
 * timestamps (no schema support needed). DB-parameterized core so it is
 * DB-real testable without a session, mirroring buildRemediationPlaybook
 * in src/server/remediation.ts. Medians are computed in JS over per-account
 * firsts (percentile_cont is unverified on PGlite, and account counts are
 * small); each median only includes accounts that reached that stage, so
 * non-converters never drag it.
 */
export async function getOnboardingFunnel(
  db: BunSQLDatabase<typeof schema>,
): Promise<OnboardingFunnel> {
  const { appAccounts, apiKeys, events } = await import("@/lib/db/schema");
  const { countDistinct, min } = await import("drizzle-orm");

  const [accountRows, keyCountRows, eventCountRows, firstKeyRows, firstEventRows] =
    await Promise.all([
      db.select({ id: appAccounts.id, createdAt: appAccounts.createdAt }).from(appAccounts),
      db.select({ value: countDistinct(apiKeys.accountId) }).from(apiKeys),
      db.select({ value: countDistinct(events.accountId) }).from(events),
      db
        .select({ accountId: apiKeys.accountId, firstAt: min(apiKeys.createdAt) })
        .from(apiKeys)
        .groupBy(apiKeys.accountId),
      db
        .select({ accountId: events.accountId, firstAt: min(events.timestamp) })
        .from(events)
        .groupBy(events.accountId),
    ]);

  const createdById = new Map(accountRows.map((a) => [a.id, a.createdAt]));

  const hoursToKey: number[] = [];
  for (const row of firstKeyRows) {
    const created = createdById.get(row.accountId);
    if (created && row.firstAt) {
      hoursToKey.push((row.firstAt.getTime() - created.getTime()) / HOUR_MS);
    }
  }

  const hoursToFirstEvent: number[] = [];
  for (const row of firstEventRows) {
    const created = createdById.get(row.accountId);
    if (created && row.firstAt) {
      hoursToFirstEvent.push((row.firstAt.getTime() - created.getTime()) / HOUR_MS);
    }
  }

  return {
    accounts: accountRows.length,
    withKey: keyCountRows[0]?.value ?? 0,
    withEvents: eventCountRows[0]?.value ?? 0,
    medianHoursToKey: median(hoursToKey),
    medianHoursToFirstEvent: median(hoursToFirstEvent),
  };
}

export const getAdminFunnel = createServerFn({ method: "GET" }).handler(
  async (): Promise<OnboardingFunnel> => {
    await requireAdmin();
    const { db } = await import("@/lib/db/index.server");
    return getOnboardingFunnel(db);
  },
);

const requireAdmin = async () => {
  const session = await adminSessionOrRedirect();
  console.info("[admin] overview access", {
    event: "admin.overview.access",
    userId: session.user.id,
    email: session.user.email,
    timestamp: new Date().toISOString(),
  });
  return session;
};

export type AdminOverview = {
  events: { last24h: number; last7d: number; last30d: number };
  users: { total: number; signups7d: number };
  activeAccounts7d: number;
  planDistribution: { plan: string; count: number }[];
  topAccounts7d: { accountId: number; plan: string; count: number }[];
};

export const getAdminOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminOverview> => {
    await requireAdmin();
    const { db } = await import("@/lib/db/index.server");
    const { events, appAccounts, user } = await import("@/lib/db/schema");
    const { count, countDistinct, desc, eq, gte, sql } = await import("drizzle-orm");

    const now = Date.now();
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);
    const since30d = new Date(now - 30 * DAY_MS);

    const eventCount = sql<number>`COUNT(*)`.mapWith(Number);

    const [
      eventWindows,
      totalUsersRows,
      signups7dRows,
      activeAccountsRows,
      planRows,
      topAccountRows,
    ] = await Promise.all([
      // Dates must be pre-stringified before inlining into a raw sql`` template:
      // postgres.js's parameter binder runs Buffer.byteLength on the value and
      // throws ERR_INVALID_ARG_TYPE on a raw Date. The typed `gte` helper below
      // is fine because it carries encoder info; only the raw-template inlines
      // need .toISOString().
      db
        .select({
          last24h:
            sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since24h.toISOString()})`.mapWith(
              Number,
            ),
          last7d:
            sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since7d.toISOString()})`.mapWith(
              Number,
            ),
          last30d:
            sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since30d.toISOString()})`.mapWith(
              Number,
            ),
        })
        .from(events)
        .where(gte(events.timestamp, since30d)),
      db.select({ value: count() }).from(user),
      db.select({ value: count() }).from(user).where(gte(user.createdAt, since7d)),
      db
        .select({ value: countDistinct(events.accountId) })
        .from(events)
        .where(gte(events.timestamp, since7d)),
      db
        .select({ plan: appAccounts.plan, value: count() })
        .from(appAccounts)
        .groupBy(appAccounts.plan),
      db
        .select({
          accountId: events.accountId,
          plan: appAccounts.plan,
          value: eventCount.as("value"),
        })
        .from(events)
        .innerJoin(appAccounts, eq(events.accountId, appAccounts.id))
        .where(gte(events.timestamp, since7d))
        .groupBy(events.accountId, appAccounts.plan)
        .orderBy(desc(sql`value`))
        .limit(10),
    ]);

    const windows = eventWindows[0] ?? { last24h: 0, last7d: 0, last30d: 0 };

    return {
      events: windows,
      users: {
        total: totalUsersRows[0]?.value ?? 0,
        signups7d: signups7dRows[0]?.value ?? 0,
      },
      activeAccounts7d: activeAccountsRows[0]?.value ?? 0,
      planDistribution: planRows.map((r) => ({ plan: r.plan, count: r.value })),
      topAccounts7d: topAccountRows.map((r) => ({
        accountId: r.accountId,
        plan: r.plan,
        count: r.value,
      })),
    };
  },
);
