import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Gauge, ShieldCheck, Wrench } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { HeroRates } from "@/components/hero-rates";
import { seo } from "@/lib/seo";
import { getHeroStats } from "@/server/hero-stats";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "blockrate — measure, monitor, and fix blocked analytics",
      description:
        "See which analytics tools your users never reach. Measure block rates per provider, get alerted when they spike, and find the vetted fix with a tiny open-source client.",
      path: "/",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "blockrate",
        description:
          "Per-provider block-rate measurement, monitoring, and remediation guidance for third-party analytics tools.",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
        },
      },
    }),
  loader: () => getHeroStats(),
  component: Landing,
});

const outcomeCards = [
  {
    icon: Gauge,
    step: "01",
    title: "Measure the gap",
    body: "See the actual block rate for GA4, PostHog, Segment, Optimizely, and every provider in your stack.",
    link: { label: "See the live data", to: "/report" as const },
  },
  {
    icon: Bell,
    step: "02",
    title: "Catch the spike",
    body: "Turn a one-time check into continuous monitoring. Pro alerts reach email, Slack, or your webhook.",
    link: { label: "Compare plans", to: "/pricing" as const },
  },
  {
    icon: Wrench,
    step: "03",
    title: "Fix what matters",
    body: "Rank blocked providers by impact and follow a vetted first-party or server-side remediation path.",
    link: { label: "See how it works", to: "/docs" as const },
  },
];

const accuracyPoints = [
  "Provider-specific probes test the real CDN, not a generic ad-block bait file.",
  "Post-load checks distinguish a loader stub from a bundle that actually executed.",
  "First-party reporting keeps blocked visitors in the measurement instead of silently losing them.",
];

function Landing() {
  const heroStats = Route.useLoaderData();

  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
        <div>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            See which analytics tools your users never reach.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Measure block rates per provider, get alerted when they spike, and see the vetted fix
            for each one. Open-source client, first-party reporting, no personal data.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary pl-5 pr-[18px] text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/85 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start measuring free
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link
              to="/demo"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Run the live check
            </Link>
          </div>

          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Free for 10,000 events/month</span>
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <span>Under 2 KB gzipped</span>
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <a
              href="https://github.com/afonsojramos/blockrate"
              className="inline-flex min-h-10 items-center underline decoration-border underline-offset-4 transition-[text-decoration-color,color] duration-150 hover:text-foreground hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open source on GitHub
            </a>
          </p>
        </div>

        <HeroRates data={heroStats} />
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              From missing data to the fix
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              The measurement is only the beginning.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Know what is missing, learn when it changes, and decide what is worth recovering.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {outcomeCards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.step}
                  className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                      <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {card.step}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                  <Link
                    to={card.link.to}
                    className="mt-5 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-[gap,text-decoration-color] duration-150 ease-out hover:gap-2 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {card.link.label}
                    <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16 lg:py-24">
        <div className="lg:sticky lg:top-24">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            First-party by design
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Two small pieces. One honest rate.
          </h2>
          <p className="mt-4 text-muted-foreground">
            The client checks your providers. Your server forwards the result with the API key, so
            the browser never posts to a third-party measurement domain that blockers can hide.
          </p>

          <ol className="mt-8 space-y-5">
            {[
              ["1", "Install the client", "Choose only the providers your app actually uses."],
              [
                "2",
                "Add your own route",
                "Keep the API key server-side and the reporter first-party.",
              ],
              ["3", "Read the rate", "The dashboard starts ranking providers once samples arrive."],
            ].map(([number, title, body]) => (
              <li key={number} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-medium tabular-nums">
                  {number}
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <Link
            to="/docs"
            className="mt-8 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-[gap,text-decoration-color] duration-150 ease-out hover:gap-2 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pick your framework
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>

        <CodeBlock filename="client.ts + app/api/block-rate/route.ts">{`// Client — posts to your own route.
import { BlockRate, beaconReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: beaconReporter("/api/block-rate"),
}).check();

// Server — attaches your key and forwards the result.
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});`}</CodeBlock>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:pb-24">
        <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-border bg-muted/30 p-8 lg:border-b-0 lg:border-r lg:p-10">
            <ShieldCheck className="size-8 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-6 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Trust the number
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Detection is hard. We maintain it for you.
            </h2>
            <p className="mt-4 text-muted-foreground">
              A confident-looking wrong rate is worse than no rate. blockrate publishes only after a
              minimum sample floor and tests every provider shape as the underlying tools change.
            </p>
          </div>

          <div className="p-8 lg:p-10">
            <ul className="space-y-5">
              {accuracyPoints.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                >
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/report"
              hash="how-we-get-the-number-right"
              className="mt-7 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-[gap,text-decoration-color] duration-150 ease-out hover:gap-2 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Read the methodology
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 py-14 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Find the gap before it grows.</h2>
            <p className="mt-2 text-muted-foreground">
              Start free with 10,000 measured events each month. No credit card required.
            </p>
          </div>
          <Link
            to="/signup"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary pl-5 pr-[18px] text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/85 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Start measuring free
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
