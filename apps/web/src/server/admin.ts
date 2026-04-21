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

const requireAdmin = async () => {
  const { auth } = await import("@/lib/auth.server");
  const { isAdminEmail } = await import("@/lib/admin.server");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  // Non-admins and unauth'd callers get the same redirect — no enumeration oracle.
  // An unauth'd request lands on /app first, which the _authed layout bounces to /login.
  if (!session || !isAdminEmail(session.user.email)) {
    throw redirect({ to: "/app", search: { since: 7 } });
  }
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
    const since24h = new Date(now - 86_400_000);
    const since7d = new Date(now - 7 * 86_400_000);
    const since30d = new Date(now - 30 * 86_400_000);

    const eventCount = sql<number>`COUNT(*)`.mapWith(Number);

    const [
      eventWindows,
      totalUsersRows,
      signups7dRows,
      activeAccountsRows,
      planRows,
      topAccountRows,
    ] = await Promise.all([
      db
        .select({
          last24h: sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since24h})`.mapWith(
            Number,
          ),
          last7d: sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since7d})`.mapWith(
            Number,
          ),
          last30d: sql<number>`COUNT(*) FILTER (WHERE ${events.timestamp} >= ${since30d})`.mapWith(
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
