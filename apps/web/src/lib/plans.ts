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

export function getPlan(name: string): Plan {
  return (PLANS as Record<string, Plan>)[name] ?? PLANS.free;
}
