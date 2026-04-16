import { createServerFn } from "@tanstack/react-start";

/** Returns Stripe price IDs from env — avoids leaking env var names to the client. */
export const getStripePriceIds = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("@/lib/env.server");
  return {
    proMonthly: env.STRIPE_PRO_MONTHLY_PRICE_ID ?? null,
    proAnnual: env.STRIPE_PRO_ANNUAL_PRICE_ID ?? null,
    teamMonthly: env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? null,
    teamAnnual: env.STRIPE_TEAM_ANNUAL_PRICE_ID ?? null,
  };
});
