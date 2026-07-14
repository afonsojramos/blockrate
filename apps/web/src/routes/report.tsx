import { createFileRoute, Link } from "@tanstack/react-router";

import { buildReport, formatRatePercent, rateColor } from "@/lib/providers";
import { seo, siteUrl } from "@/lib/seo";
import { getHeroStats } from "@/server/hero-stats";

const TITLE = "Which analytics tools are actually blocked? The data — blockrate";
const DESCRIPTION =
  "We measured how often popular analytics providers (GA4, PostHog, Segment, Meta Pixel, and more) are blocked by ad and content blockers, per provider, directly across engaged visitors. The numbers, the ranking, and how we get them right.";

function datasetJsonLd() {
  const origin = siteUrl()?.replace(/\/$/, "");
  if (!origin) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Per-provider analytics block rates",
    description:
      "Measured block rates for popular third-party analytics providers, per provider, across engaged visitors. Vendor-neutral, cookie-free measurement.",
    url: `${origin}/report`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: { "@type": "Organization", name: "blockrate", url: origin },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${origin}/block-rate.json`,
      },
    ],
  };
}

export const Route = createFileRoute("/report")({
  head: () => {
    const jsonLd = datasetJsonLd();
    return seo({
      title: TITLE,
      description: DESCRIPTION,
      path: "/report",
      type: "article",
      image: "/og-report.png",
      ...(jsonLd ? { jsonLd } : {}),
    });
  },
  loader: () => getHeroStats(),
  component: ReportPage,
});

function ReportPage() {
  const stats = Route.useLoaderData();
  const report = buildReport(stats?.providers ?? []);
  const hasData = report.withData > 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          The block-rate report
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Which analytics tools are actually blocked?
        </h1>
        {hasData && report.worst ? (
          <p className="text-lg text-muted-foreground">
            Across {report.withData} {report.withData === 1 ? "provider" : "providers"} we have
            enough data to publish,{" "}
            <span className="font-semibold text-foreground">{report.worst.label}</span> is the most
            blocked at{" "}
            <span className={"font-semibold tabular-nums " + rateColor(report.worst.rate)}>
              {formatRatePercent(report.worst.rate)}
            </span>
            {report.averageRate !== null && report.withData > 1 && (
              <>
                . The average across measured providers is{" "}
                <span className="font-semibold tabular-nums">
                  {formatRatePercent(report.averageRate)}
                </span>
              </>
            )}
            . Every number is measured directly across engaged visitors — no panel, no modelling.
          </p>
        ) : (
          <p className="text-lg text-muted-foreground">
            Measurement is just getting started, so there isn't enough data to publish a ranking
            yet.{" "}
            <Link to="/demo" className="font-medium text-foreground underline underline-offset-4">
              Run the live demo
            </Link>{" "}
            to see detection in your own browser.
          </p>
        )}
      </header>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Block rate by provider
        </h2>
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {report.providers.map((row) => (
            <li key={row.slug}>
              <Link
                to="/block-rate/$provider"
                params={{ provider: row.slug }}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-150 hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="font-medium">{row.label}</p>
                  <p className="truncate text-sm text-muted-foreground">{row.blurb}</p>
                </div>
                <span
                  className={
                    "shrink-0 text-lg font-semibold tabular-nums " +
                    (row.rate === null ? "text-muted-foreground" : rateColor(row.rate))
                  }
                >
                  {row.rate === null ? "—" : formatRatePercent(row.rate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          "—" means we don't yet have enough measured samples to publish a trustworthy rate for that
          provider. Prefer raw data?{" "}
          <a
            href="/block-rate.json"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Get it as JSON
          </a>
          .
        </p>
      </section>

      <section id="how-we-get-the-number-right" className="mt-12 scroll-mt-24 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          How we get the number right
        </h2>
        <p className="text-muted-foreground">
          Detecting ad and content blockers is genuinely hard: a blocked request and a network error
          look alike, filter lists match domains rather than filenames, and loader snippets keep a
          global defined even when the CDN behind them is blocked. A naive "is the global truthy?"
          check reports <em>loaded</em> for blocked users and quietly undercounts the real block
          rate.
        </p>
        <p className="text-muted-foreground">
          blockrate is built to avoid that. It checks each provider's real post-load global (not the
          loader stub), uses per-provider ground-truth probes against the actual CDN, and reports
          through a first-party endpoint so the measurement itself isn't the thing getting blocked.
          The result is a number you can trust per provider — which is the whole point.{" "}
          <Link to="/docs" className="font-medium text-foreground underline underline-offset-4">
            Read how it works
          </Link>
          .
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Measure your own stack</h2>
        <p className="mt-2 text-muted-foreground">
          These are aggregate numbers. Your audience is more technical or more privacy-minded than
          average, so your real block rate is probably higher. blockrate is an open-source library
          that measures it, per provider, on your own site.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/demo"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          >
            Try the live demo
          </Link>
          <Link
            to="/block-rate"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors duration-150 hover:bg-accent"
          >
            Browse every provider
          </Link>
        </div>
      </section>
    </main>
  );
}
