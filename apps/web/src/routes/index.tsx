import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock } from "@/components/code-block";
import { HeroChart } from "@/components/hero-chart";
import { applyFloor } from "@/lib/providers";
import { seo } from "@/lib/seo";
import { getHeroStats } from "@/server/hero-stats";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "blockrate — know what your ad blockers are hiding",
      description:
        "A tiny client library that measures per-provider block rate of the third-party tools your app depends on. Drop it in, see exactly how much PostHog, Optimizely, GA4 and friends are costing you.",
      path: "/",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "blockrate",
        description:
          "Per-provider block rate measurement for third-party analytics tools. OSS library and hosted dashboard.",
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

function Landing() {
  const heroStats = Route.useLoaderData();

  // Mobile summary: a true volume-weighted population rate (Σblocked / Σchecks)
  // over only the providers that clear the min-sample floor, so it never
  // disagrees with the floored radar or the /block-rate pages.
  const flooredProviders = heroStats
    ? heroStats.providers.filter((p) => applyFloor(p.rate, p.total) !== null)
    : [];
  const totalChecks = flooredProviders.reduce((sum, p) => sum + p.total, 0);
  const weightedBlockedPct =
    totalChecks > 0
      ? (flooredProviders.reduce((sum, p) => sum + p.blocked, 0) / totalChecks) * 100
      : 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <section className="flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="space-y-6 lg:flex-1">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            early access
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Know what your ad blockers are hiding from your analytics.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            A tiny client library that measures the per-provider block rate of the third-party tools
            your app depends on. Drop it in, see exactly how much PostHog, Optimizely, GA4 and
            friends are costing you.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/demo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
            >
              Try the live demo
            </Link>
            <Link
              to="/signup"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
            >
              Get a hosted account
            </Link>
            <a
              href="https://github.com/afonsojramos/blockrate"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
            >
              View on GitHub
            </a>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span>No cookies</span>
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <span>No consent banner</span>
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <span>No IP addresses</span>
          </p>
        </div>

        {/* Real data: radar chart on large screens, summary sentence on small */}
        {heroStats && heroStats.providers.length > 0 && (
          <>
            <div className="hidden lg:block lg:w-[400px] lg:flex-shrink-0">
              <HeroChart data={heroStats} />
            </div>
            {flooredProviders.length > 0 ? (
              <p className="text-sm text-muted-foreground lg:hidden">
                Across all time,{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {weightedBlockedPct.toFixed(1)}%
                </span>{" "}
                of measured checks are blocked across {flooredProviders.length} providers.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground lg:hidden">
                Measurement is just getting started.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-16">
        <CodeBlock>{`// Client — drop in. Posts to YOUR route; no API key in the browser.
import { BlockRate, beaconReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "web-app",
  reporter: beaconReporter("/api/block-rate"),
}).check();

// Server (app/api/block-rate/route.ts) — forward with your key, server-side.
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});`}</CodeBlock>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Per-provider, not "is there a blocker"',
            body: "Block rate is checked per service. Optimizely might be blocked while PostHog gets through. Other libraries only tell you whether ANY blocker exists.",
          },
          {
            title: "First-party, not third-party",
            body: "Bundles into your own code. Under 2 KB gzipped. The detection script itself can\u2019t be blocked because it isn\u2019t served from a third-party CDN.",
          },
          {
            title: "Honest about the gap",
            body: "See the exact percentage of users who can\u2019t reach each tool, sliced by browser family. No cookies, no consent banner, no fingerprinting, no personal data.",
          },
        ].map((card) => (
          <article
            key={card.title}
            className="rounded-lg border border-border bg-card p-6 transition-[border-color,box-shadow] duration-150 ease-out hover:border-muted-foreground/30 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
