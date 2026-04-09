import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/pricing")({ component: Pricing });

const tiers = [
  {
    name: "Free",
    price: "€0",
    period: "",
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
    price: "€5",
    period: "/mo",
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
    price: "€19",
    period: "/mo",
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
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {tiers.map((tier) => (
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
                {tier.price}
                {tier.period && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {tier.period}
                  </span>
                )}
              </p>
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
        ))}
      </div>
    </main>
  );
}
