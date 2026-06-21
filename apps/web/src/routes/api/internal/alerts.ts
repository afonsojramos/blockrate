import { createFileRoute } from "@tanstack/react-router";

import { DAY_MS } from "@/lib/time";

/**
 * Alert evaluation sweep. For every enabled alert rule, computes the block
 * rate over the rule's trailing window and emails the account owner when the
 * rate CROSSES the rule's threshold. Triggered by Railway Cron (~hourly):
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://blockrate.app/api/internal/alerts
 *
 * Auth and fail-closed behaviour are identical to /api/internal/retention:
 *   - 503 if CRON_SECRET is unset
 *   - 401 if the bearer token is missing or wrong
 *
 * Firing is EDGE-TRIGGERED: a rule fires only when its condition transitions
 * from unmet to met (`lastMatched` false → true), so a persistently-bad (or
 * persistently-healthy `lte`) scope produces ONE email per crossing, not one
 * per sweep. `cooldownHours` additionally damps flapping around the threshold.
 *
 * Gating is re-checked here, not just at create time: a downgraded account
 * whose plan no longer permits alerting (maxAlertRules 0) is skipped, so the
 * paid capability cannot leak past a downgrade.
 */

const HOUR_MS = DAY_MS / 24;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/internal/alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, schema, mailer, { getPlan }, drizzle] = await Promise.all([
          import("@/lib/env.server"),
          import("@/lib/db/index.server"),
          import("@/lib/db/schema"),
          import("@/lib/mailer.server"),
          import("@/lib/plans"),
          import("drizzle-orm"),
        ]);
        const { alertRules, events, appAccounts, user } = schema;
        const { and, count, eq, gte, sql } = drizzle;

        if (!env.CRON_SECRET) {
          return jsonError("CRON_SECRET not configured on this deployment", 503);
        }
        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!provided || provided !== env.CRON_SECRET) {
          return jsonError("unauthorized", 401);
        }

        const now = Date.now();

        // One joined read: the rule plus its account's plan and owner email.
        // Avoids a per-rule owner lookup and gives us the plan for re-gating.
        const rows = await db
          .select({ rule: alertRules, plan: appAccounts.plan, email: user.email })
          .from(alertRules)
          .innerJoin(appAccounts, eq(alertRules.accountId, appAccounts.id))
          .innerJoin(user, eq(appAccounts.userId, user.id))
          .where(eq(alertRules.enabled, true));

        let fired = 0;
        let skippedCooldown = 0;
        let skippedMinSample = 0;
        let skippedUnentitled = 0;

        for (const { rule, plan, email } of rows) {
          // Re-gate: a rule whose account downgraded below alerting is inert.
          if (getPlan(plan).maxAlertRules === 0) {
            skippedUnentitled++;
            continue;
          }

          const since = new Date(now - rule.windowHours * HOUR_MS);
          const filters = [eq(events.accountId, rule.accountId), gte(events.timestamp, since)];
          if (rule.provider) filters.push(eq(events.provider, rule.provider));
          if (rule.service) filters.push(eq(events.service, rule.service));

          // count()/mapWith(Number) coerce pg/pglite's stringified bigint at the
          // driver boundary — the block rate must never be computed on a string.
          const [agg] = await db
            .select({
              total: count(),
              blocked:
                sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(
                  Number,
                ),
            })
            .from(events)
            .where(and(...filters));

          const total = agg?.total ?? 0;
          // Too little data to trust the rate. Leave lastMatched untouched so a
          // thin window doesn't reset the edge state.
          if (total < rule.minSample) {
            skippedMinSample++;
            continue;
          }

          const ratePct = ((agg?.blocked ?? 0) / total) * 100;
          const matches =
            rule.comparator === "gte" ? ratePct >= rule.threshold : ratePct <= rule.threshold;

          let didFire = false;
          // Edge: fire only on the unmet → met transition.
          if (matches && !rule.lastMatched) {
            const cooldownOk =
              !rule.lastFiredAt || now - rule.lastFiredAt.getTime() >= rule.cooldownHours * HOUR_MS;
            if (!cooldownOk) {
              skippedCooldown++;
            } else if (email) {
              try {
                await mailer.sendEmail({
                  to: email,
                  subject: `blockrate alert: ${rule.provider ?? "block rate"} at ${ratePct.toFixed(0)}%`,
                  text: mailer.alertEmailBody({
                    ruleName: rule.name,
                    provider: rule.provider,
                    service: rule.service,
                    ratePct,
                    comparator: rule.comparator,
                    threshold: rule.threshold,
                    windowHours: rule.windowHours,
                  }),
                });
                didFire = true;
              } catch (err) {
                // Don't stamp lastFiredAt — leave the rule to retry next sweep.
                console.error("[alerts] send failed for rule", rule.id, err);
              }
            }
          }

          // Always persist the matched state so recovery re-arms the edge.
          await db
            .update(alertRules)
            .set(
              didFire
                ? { lastMatched: matches, lastFiredAt: new Date(now) }
                : { lastMatched: matches },
            )
            .where(eq(alertRules.id, rule.id));
          if (didFire) fired++;
        }

        return new Response(
          JSON.stringify({
            ok: true,
            rulesEvaluated: rows.length,
            fired,
            skippedCooldown,
            skippedMinSample,
            skippedUnentitled,
            ranAt: new Date(now).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
