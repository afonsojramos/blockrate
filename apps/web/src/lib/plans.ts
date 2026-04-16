/**
 * Plan tier configuration. Single source of truth for quota limits.
 *
 * Differentiation is on volume + keys + features, not on deleting data.
 * Free gets 30 days — generous enough that hobbyists never feel squeezed.
 */

export type PlanName = "free" | "pro" | "team";

export interface Plan {
  name: PlanName;
  label: string;
  /** Hard cap on events ingested per calendar month. */
  eventsPerMonth: number;
  /** Maximum concurrent (non-revoked) API keys. */
  maxKeys: number;
  /** Days of event history retained (Phase 4 cron enforces this). */
  retentionDays: number;
  /** Days of event history visible in the dashboard. */
  dashboardHistoryDays: number;
}

export const PLANS: Record<PlanName, Plan> = {
  free: {
    name: "free",
    label: "Free",
    eventsPerMonth: 100_000,
    maxKeys: 3,
    retentionDays: 30,
    dashboardHistoryDays: 30,
  },
  pro: {
    name: "pro",
    label: "Pro",
    eventsPerMonth: 1_000_000,
    maxKeys: 50,
    retentionDays: 90,
    dashboardHistoryDays: 90,
  },
  team: {
    name: "team",
    label: "Team",
    eventsPerMonth: 10_000_000,
    maxKeys: 500,
    retentionDays: 365,
    dashboardHistoryDays: 365,
  },
};

function isPlanName(name: string): name is PlanName {
  return name in PLANS;
}

export function getPlan(name: string): Plan {
  return isPlanName(name) ? PLANS[name] : PLANS.free;
}

/**
 * Resolve a Stripe Price ID → PlanName. Used by the webhook handler to
 * map subscription changes back to our plan tiers. Returns null for
 * unrecognised IDs so the caller can decide how to handle it (log + retry
 * rather than silently downgrading to free).
 *
 * Note: imports env lazily to keep this file importable from client code
 * (PLANS/getPlan are used everywhere, but Stripe fns are server-only).
 */
export function planFromPriceId(priceId: string): PlanName | null {
  const e = process.env;
  if (priceId === e.STRIPE_PRO_MONTHLY_PRICE_ID || priceId === e.STRIPE_PRO_ANNUAL_PRICE_ID)
    return "pro";
  if (priceId === e.STRIPE_TEAM_MONTHLY_PRICE_ID || priceId === e.STRIPE_TEAM_ANNUAL_PRICE_ID)
    return "team";
  return null;
}

/**
 * Resolve (planName, annual) → Stripe Price ID. Used by the checkout
 * endpoint so the client sends plan name + interval instead of raw price IDs.
 * Returns null for invalid input.
 */
export function resolvePriceId(plan: string | undefined, annual?: boolean): string | null {
  const e = process.env;
  if (plan === "pro")
    return annual
      ? (e.STRIPE_PRO_ANNUAL_PRICE_ID ?? null)
      : (e.STRIPE_PRO_MONTHLY_PRICE_ID ?? null);
  if (plan === "team")
    return annual
      ? (e.STRIPE_TEAM_ANNUAL_PRICE_ID ?? null)
      : (e.STRIPE_TEAM_MONTHLY_PRICE_ID ?? null);
  return null;
}
