import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly retention sweep. Deletes events older than each plan's
 * retentionDays. Triggered by Railway Cron via:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://blockrate.app/api/internal/retention
 *
 * Authentication is a single shared bearer token (env CRON_SECRET, ≥32 chars).
 * The endpoint fails CLOSED:
 *   - 503 if CRON_SECRET is unset (not deployed correctly)
 *   - 401 if the token is missing or wrong
 *
 * Strategy: group accounts by plan name, then run one DELETE per plan with
 * an `IN` filter on the matching account_ids. This is N queries where N is
 * the number of plan tiers (currently 3 — free/pro/team), not N accounts,
 * so it scales fine to thousands of users without per-row overhead.
 *
 * The PLANS map in src/lib/plans.ts is the single source of truth for
 * retentionDays — no SQL hardcoding.
 */

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/internal/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, { events, appAccounts }, { PLANS }, drizzle] =
          await Promise.all([
            import("@/lib/env.server"),
            import("@/lib/db/index.server"),
            import("@/lib/db/schema"),
            import("@/lib/plans"),
            import("drizzle-orm"),
          ]);
        const { and, eq, inArray, lt } = drizzle;

        if (!env.CRON_SECRET) {
          return jsonError(
            "CRON_SECRET not configured on this deployment",
            503
          );
        }

        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.replace(/^Bearer\s+/i, "");
        if (!provided || provided !== env.CRON_SECRET) {
          return jsonError("unauthorized", 401);
        }

        // Fetch every account once
        const accounts = await db
          .select({ id: appAccounts.id, plan: appAccounts.plan })
          .from(appAccounts);

        // Group by plan name
        const byPlan = new Map<string, number[]>();
        for (const a of accounts) {
          const list = byPlan.get(a.plan) ?? [];
          list.push(a.id);
          byPlan.set(a.plan, list);
        }

        const summary: Record<
          string,
          { accounts: number; eventsDeleted: number; cutoff: string }
        > = {};
        let totalDeleted = 0;

        for (const [planName, accountIds] of byPlan) {
          if (accountIds.length === 0) continue;
          const plan = PLANS[planName as keyof typeof PLANS] ?? PLANS.free;
          const cutoff = new Date(
            Date.now() - plan.retentionDays * 86_400_000
          );

          const deleted = await db
            .delete(events)
            .where(
              and(
                inArray(events.accountId, accountIds),
                lt(events.timestamp, cutoff)
              )
            )
            .returning({ id: events.id });

          summary[planName] = {
            accounts: accountIds.length,
            eventsDeleted: deleted.length,
            cutoff: cutoff.toISOString(),
          };
          totalDeleted += deleted.length;
        }

        return new Response(
          JSON.stringify({
            ok: true,
            accountsProcessed: accounts.length,
            eventsDeleted: totalDeleted,
            byPlan: summary,
            ranAt: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
