import { createFileRoute } from "@tanstack/react-router";

import type { AlertRule } from "@/lib/db/schema";
import { DAY_MS } from "@/lib/time";
import { isBlockedWebhookHost } from "@/lib/webhook";

/** Outbound webhook timeout — a hung endpoint must not stall the sweep. */
const WEBHOOK_TIMEOUT_MS = 5_000;

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

/**
 * Deliver a fired alert via the rule's channel. Throws on any failure
 * (no owner email, missing URL, non-2xx) so the caller's per-rule try/catch
 * leaves `lastFiredAt` unset and the rule retries next sweep.
 *   email   → the account owner, via Resend.
 *   slack   → POST { text } (Slack incoming-webhook shape).
 *   webhook → POST a structured JSON payload for programmatic consumers.
 */
async function deliverAlert(rule: AlertRule, ownerEmail: string | null, ratePct: number) {
  const mailer = await import("@/lib/mailer.server");
  const text = mailer.alertEmailBody({
    ruleName: rule.name,
    provider: rule.provider,
    service: rule.service,
    ratePct,
    comparator: rule.comparator,
    threshold: rule.threshold,
    windowHours: rule.windowHours,
  });

  if (rule.channel === "email") {
    if (!ownerEmail) throw new Error("email channel but no owner email");
    await mailer.sendEmail({
      to: ownerEmail,
      subject: `blockrate alert: ${rule.provider ?? "block rate"} at ${ratePct.toFixed(0)}%`,
      text,
    });
    return;
  }

  if (!rule.webhookUrl) throw new Error(`${rule.channel} channel but no webhookUrl`);
  // Defense in depth: re-check the host even though create-time validation
  // already blocked internal targets (in case a rule predates the guard).
  if (isBlockedWebhookHost(new URL(rule.webhookUrl).hostname)) {
    throw new Error("webhookUrl host is not allowed");
  }
  const payload =
    rule.channel === "slack"
      ? { text }
      : {
          rule: rule.name,
          provider: rule.provider,
          service: rule.service,
          ratePct,
          blockRate: ratePct / 100,
          threshold: rule.threshold,
          comparator: rule.comparator,
          windowHours: rule.windowHours,
        };
  // redirect:"manual" → a 3xx surfaces as a non-ok opaque response, so an https
  // URL can't bounce to an internal http target (the https-only check would
  // otherwise be defeated by a redirect). Timeout bounds a hung endpoint.
  const res = await fetch(rule.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${rule.channel} POST failed: ${res.status}`);
}

export const Route = createFileRoute("/api/internal/alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, schema, { getPlan }, drizzle] = await Promise.all([
          import("@/lib/env.server"),
          import("@/lib/db/index.server"),
          import("@/lib/db/schema"),
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
          // lastMatched tracks a *successful* edge only. Cooldown suppress and
          // delivery failure must leave it false so the next sweep can still
          // attempt the unmet → met crossing while the condition holds.
          // Recovery (matches false) always re-arms by clearing lastMatched.
          let nextLastMatched = rule.lastMatched;

          if (!matches) {
            nextLastMatched = false;
          } else if (!rule.lastMatched) {
            // Edge: condition just became met (or a prior attempt did not commit).
            const cooldownOk =
              !rule.lastFiredAt || now - rule.lastFiredAt.getTime() >= rule.cooldownHours * HOUR_MS;
            if (!cooldownOk) {
              skippedCooldown++;
              nextLastMatched = false;
            } else {
              try {
                await deliverAlert(rule, email, ratePct);
                didFire = true;
                nextLastMatched = true;
              } catch (err) {
                // Don't stamp lastFiredAt or lastMatched — retry next sweep.
                console.error("[alerts] delivery failed for rule", rule.id, err);
                nextLastMatched = false;
              }
            }
          }
          // else: still matching after a prior successful fire → leave lastMatched true

          await db
            .update(alertRules)
            .set(
              didFire
                ? { lastMatched: nextLastMatched, lastFiredAt: new Date(now) }
                : { lastMatched: nextLastMatched },
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
