import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Lightweight session check for the pricing page. Returns the user's
 * current plan (or null if not logged in). Unlike the _authed layout,
 * this does NOT redirect — unauthenticated visitors see the pricing
 * page normally with "Sign up" CTAs.
 */
const getPricingSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("@/lib/auth.server");
  const { db } = await import("@/lib/db/index.server");
  const { appAccounts } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) return { loggedIn: false as const, plan: null };

  const rows = await db
    .select({ plan: appAccounts.plan })
    .from(appAccounts)
    .where(eq(appAccounts.userId, session.user.id))
    .limit(1);

  return { loggedIn: true as const, plan: (rows[0]?.plan ?? "free") as string };
});

export const Route = createFileRoute("/pricing")({
  loader: () => getPricingSession(),
  component: Pricing,
});

interface Tier {
  name: string;
  planKey: string;
  monthly: number;
  annual: number;
  monthlyPriceEnv: string | null;
  annualPriceEnv: string | null;
  features: string[];
}

const tiers: Tier[] = [
  {
    name: "Free",
    planKey: "free",
    monthly: 0,
    annual: 0,
    monthlyPriceEnv: null,
    annualPriceEnv: null,
    features: [
      "100,000 events / month",
      "3 API keys",
      "30-day history",
      "Per-provider blockrate dashboard",
    ],
  },
  {
    name: "Pro",
    planKey: "pro",
    monthly: 4,
    annual: 40,
    monthlyPriceEnv: "STRIPE_PRO_MONTHLY_PRICE_ID",
    annualPriceEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    features: [
      "1M events / month",
      "Unlimited API keys",
      "90-day history",
      "Browser-family slicing",
    ],
  },
  {
    name: "Team",
    planKey: "team",
    monthly: 8,
    annual: 80,
    monthlyPriceEnv: "STRIPE_TEAM_MONTHLY_PRICE_ID",
    annualPriceEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    features: ["10M events / month", "Multi-seat accounts", "1-year history", "Priority support"],
  },
];

/** Server fn that returns the actual price IDs from env so we don't leak env var names to the client */
const getStripePriceIds = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("@/lib/env.server");
  return {
    proMonthly: env.STRIPE_PRO_MONTHLY_PRICE_ID ?? null,
    proAnnual: env.STRIPE_PRO_ANNUAL_PRICE_ID ?? null,
    teamMonthly: env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? null,
    teamAnnual: env.STRIPE_TEAM_ANNUAL_PRICE_ID ?? null,
  };
});

function Pricing() {
  const { loggedIn, plan } = Route.useLoaderData();
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleUpgrade(tier: Tier) {
    if (loading) return;
    if (!loggedIn) {
      navigate({ to: "/signup" });
      return;
    }

    setLoading(tier.planKey);
    try {
      const priceIds = await getStripePriceIds();
      const priceId =
        tier.planKey === "pro"
          ? annual
            ? priceIds.proAnnual
            : priceIds.proMonthly
          : annual
            ? priceIds.teamAnnual
            : priceIds.teamMonthly;

      if (!priceId) {
        alert("Billing not configured. Please try again later.");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to create checkout session");
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Honest pricing</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Free for hobbyists. Paid tiers when there's real demand. No hidden fees, no per-seat
          upcharges, no "contact sales" walls.
        </p>

        {/* Billing toggle */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <span
            className={
              "text-sm font-medium " + (!annual ? "text-foreground" : "text-muted-foreground")
            }
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual(!annual)}
            className={
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 " +
              (annual ? "bg-primary" : "bg-muted")
            }
          >
            <span
              className={
                "pointer-events-none inline-block size-5 rounded-full bg-background shadow-sm transition-transform duration-200 " +
                (annual ? "translate-x-5" : "translate-x-0")
              }
            />
          </button>
          <span
            className={
              "text-sm font-medium " + (annual ? "text-foreground" : "text-muted-foreground")
            }
          >
            Annual
            <span className="ml-1.5 rounded-full bg-rate-low/15 px-2 py-0.5 text-xs text-rate-low">
              2 months free
            </span>
          </span>
        </div>
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {tiers.map((tier) => {
          const price = annual ? tier.annual : tier.monthly;
          const period = price === 0 ? "" : annual ? "/yr" : "/mo";
          const isCurrent = loggedIn && plan === tier.planKey;
          const isPaid = tier.planKey !== "free";

          return (
            <Card key={tier.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {isCurrent && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Current plan
                    </span>
                  )}
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  €{price}
                  {period && (
                    <span className="text-sm font-normal text-muted-foreground">{period}</span>
                  )}
                </p>
                {annual && tier.monthly > 0 && (
                  <p className="text-xs text-muted-foreground">
                    €{(tier.annual / 12).toFixed(2)}/mo billed annually
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {tier.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                {isCurrent ? null : isPaid ? (
                  <button
                    type="button"
                    onClick={() => handleUpgrade(tier)}
                    disabled={loading !== null}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] disabled:opacity-50"
                  >
                    {loading === tier.planKey
                      ? "Redirecting..."
                      : loggedIn
                        ? `Upgrade to ${tier.name}`
                        : `Get started with ${tier.name}`}
                  </button>
                ) : (
                  <Link
                    to="/signup"
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
                  >
                    Sign up
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
