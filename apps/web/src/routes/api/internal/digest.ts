import { createFileRoute } from "@tanstack/react-router";

import { DAY_MS } from "@/lib/time";

/**
 * Weekly digest sweep. Emails each opted-in account a summary of its
 * per-provider block rate over the last 7 days. Triggered by Railway Cron
 * (weekly, e.g. Monday 13:00 UTC):
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://blockrate.app/api/internal/digest
 *
 * Same fail-closed bearer auth as the retention/alerts crons (503 if
 * CRON_SECRET unset, 401 on a missing/wrong bearer). Only accounts with
 * `weeklyDigest = true` AND events in the window are emailed; per-account
 * try/catch isolates a failed send. Inert until the cron is wired.
 */

const WINDOW_DAYS = 7;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/internal/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, schema, mailer, providers, drizzle] = await Promise.all([
          import("@/lib/env.server"),
          import("@/lib/db/index.server"),
          import("@/lib/db/schema"),
          import("@/lib/mailer.server"),
          import("@/lib/providers"),
          import("drizzle-orm"),
        ]);
        const { events, appAccounts, user } = schema;
        const { count, eq, gte, inArray, sql } = drizzle;

        if (!env.CRON_SECRET) {
          return jsonError("CRON_SECRET not configured on this deployment", 503);
        }
        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!provided || provided !== env.CRON_SECRET) {
          return jsonError("unauthorized", 401);
        }

        const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

        // One grouped read: per-(account, provider) block rate over the window.
        // count()/mapWith(Number) coerce the driver's stringified aggregates.
        const rows = await db
          .select({
            accountId: events.accountId,
            provider: events.provider,
            total: count(),
            blocked:
              sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(
                Number,
              ),
          })
          .from(events)
          .where(gte(events.timestamp, since))
          .groupBy(events.accountId, events.provider);

        const byAccount = new Map<number, { provider: string; total: number; blocked: number }[]>();
        for (const r of rows) {
          const list = byAccount.get(r.accountId) ?? [];
          list.push({ provider: r.provider, total: r.total, blocked: r.blocked });
          byAccount.set(r.accountId, list);
        }

        // Resolve opt-out + owner email for just the accounts that have data.
        const accountIds = [...byAccount.keys()];
        const accounts = accountIds.length
          ? await db
              .select({
                id: appAccounts.id,
                weeklyDigest: appAccounts.weeklyDigest,
                email: user.email,
              })
              .from(appAccounts)
              .innerJoin(user, eq(appAccounts.userId, user.id))
              .where(inArray(appAccounts.id, accountIds))
          : [];
        const acctById = new Map(accounts.map((a) => [a.id, a]));

        let accountsConsidered = 0;
        let sent = 0;
        let skippedOptedOut = 0;
        let skippedNoData = 0;
        let skippedNoEmail = 0;

        for (const [accountId, providerRows] of byAccount) {
          accountsConsidered++;
          const acct = acctById.get(accountId);
          if (!acct?.email) {
            skippedNoEmail++;
            continue;
          }
          if (!acct.weeklyDigest) {
            skippedOptedOut++;
            continue;
          }

          const digestProviders = providerRows
            .filter((p) => p.total > 0)
            .map((p) => ({
              label: providers.getProviderMeta(p.provider)?.label ?? p.provider,
              rate: p.blocked / p.total,
              total: p.total,
            }))
            .sort((a, b) => b.rate - a.rate);
          if (digestProviders.length === 0) {
            skippedNoData++;
            continue;
          }

          try {
            await mailer.sendEmail({
              to: acct.email,
              subject: "Your blockrate weekly digest",
              text: mailer.digestEmailBody({ providers: digestProviders, windowDays: WINDOW_DAYS }),
            });
            sent++;
          } catch (err) {
            console.error("[digest] send failed for account", accountId, err);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            accountsConsidered,
            sent,
            skippedOptedOut,
            skippedNoData,
            skippedNoEmail,
            ranAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
