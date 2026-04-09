import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/pricing")({ component: Pricing });

const tiers = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    badge: null,
    href: "/signup",
    cta: "Sign up",
    features: [
      "100,000 events / month",
      "3 API keys",
      "7-day data retention",
      "Per-provider block-rate dashboard",
    ],
  },
  {
    name: "Pro",
    monthly: 4,
    annual: 40, // ~€3.33/mo — 2 months free
    badge: "Coming soon",
    href: null,
    cta: null,
    features: [
      "1M events / month",
      "Unlimited API keys",
      "30-day data retention",
      "Browser-family slicing",
    ],
  },
  {
    name: "Team",
    monthly: 8,
    annual: 80, // ~€6.67/mo — 2 months free
    badge: "Coming soon",
    href: null,
    cta: null,
    features: [
      "10M events / month",
      "Multi-seat accounts",
      "90-day data retention",
      "Priority support",
    ],
  },
];

function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Honest pricing
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Free for hobbyists. Paid tiers when there's real demand. No hidden
          fees, no per-seat upcharges, no "contact sales" walls.
        </p>

        {/* Billing toggle */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <span
            className={
              "text-sm font-medium " +
              (!annual ? "text-foreground" : "text-muted-foreground")
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
              "text-sm font-medium " +
              (annual ? "text-foreground" : "text-muted-foreground")
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

          return (
            <Card key={tier.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {tier.badge && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {tier.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  €{price}
                  {period && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {period}
                    </span>
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
                {tier.href && tier.cta && (
                  <Link
                    to={tier.href}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
                  >
                    {tier.cta}
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
