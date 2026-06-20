import { createFileRoute, Link } from "@tanstack/react-router";

import { buildProviderRows, formatRatePercent, PROVIDER_META, rateColor } from "@/lib/providers";
import { seo, siteUrl } from "@/lib/seo";
import { getHeroStats } from "@/server/hero-stats";

const TITLE = "Ad blocker block rates, by provider — blockrate";
const DESCRIPTION =
  "Live per-provider block rates for the analytics tools developers actually use: PostHog, GA4, Segment, Optimizely, Hotjar, Amplitude, Mixpanel, Meta Pixel, Intercom and Google Tag Manager. Measured directly, vendor-neutral.";

function itemListJsonLd() {
  const origin = siteUrl()?.replace(/\/$/, "");
  if (!origin) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Per-provider ad blocker block rates",
    itemListElement: PROVIDER_META.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.label,
      url: `${origin}/block-rate/${p.slug}`,
    })),
  };
}

export const Route = createFileRoute("/block-rate/")({
  head: () => {
    const jsonLd = itemListJsonLd();
    return seo({
      title: TITLE,
      description: DESCRIPTION,
      path: "/block-rate",
      ...(jsonLd ? { jsonLd } : {}),
    });
  },
  loader: () => getHeroStats(),
  component: BlockRateIndex,
});

function BlockRateIndex() {
  const stats = Route.useLoaderData();
  const rows = buildProviderRows(stats?.providers ?? []);
  const hasData = rows.some((r) => r.rate !== null);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Which analytics tools are actually blocked?
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          The live block rate of each third-party provider, measured directly across engaged
          visitors. Vendor-neutral: we measure what's blocked, we don't sell you a replacement.
        </p>
      </header>

      {!hasData && (
        <p className="mt-8 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Measurement is just getting started, so there isn't enough data to publish rates yet.
          Check back soon, or{" "}
          <Link to="/demo" className="font-medium text-foreground underline underline-offset-4">
            run the live demo
          </Link>{" "}
          to see detection in your own browser.
        </p>
      )}

      <ul className="mt-10 divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
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

      <p className="mt-10 text-sm text-muted-foreground">
        Rates reflect engaged visitors measured by{" "}
        <Link to="/" className="font-medium text-foreground underline underline-offset-4">
          blockrate
        </Link>
        , the open-source per-provider block-rate library.{" "}
        <Link to="/demo" className="font-medium text-foreground underline underline-offset-4">
          Try the live demo
        </Link>
        . Prefer raw data?{" "}
        <a
          href="/block-rate.json"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Get it as JSON
        </a>
        .
      </p>
    </main>
  );
}
