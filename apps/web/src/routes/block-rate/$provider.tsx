import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  formatRatePercent,
  getProviderMeta,
  providerPageDescription,
  providerPageTitle,
  rateColor,
} from "@/lib/providers";
import { seo } from "@/lib/seo";
import { getHeroStats } from "@/server/hero-stats";

export const Route = createFileRoute("/block-rate/$provider")({
  loader: async ({ params }) => {
    const meta = getProviderMeta(params.provider);
    if (!meta) throw notFound();
    const stats = await getHeroStats();
    const rate = stats?.providers.find((p) => p.name === meta.slug)?.rate ?? null;
    return { meta, rate };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Block rate by provider — blockrate",
        description: "Live per-provider ad blocker block rates.",
        path: "/block-rate",
      });
    }
    const { meta, rate } = loaderData;
    const answer =
      rate === null
        ? `There isn't enough measured data yet to publish a ${meta.label} block rate.`
        : `Currently ${formatRatePercent(rate)} of measured visitors have ${meta.label} blocked by ad or content blockers.`;
    return seo({
      title: providerPageTitle(meta, rate),
      description: providerPageDescription(meta, rate),
      path: `/block-rate/${meta.slug}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: `Is ${meta.label} blocked by ad blockers?`,
            acceptedAnswer: { "@type": "Answer", text: answer },
          },
        ],
      },
    });
  },
  notFoundComponent: ProviderNotFound,
  component: ProviderPage,
});

function ProviderPage() {
  const { meta, rate } = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        to="/block-rate"
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        ← All providers
      </Link>

      <header className="mt-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Is {meta.label} blocked by ad blockers?
        </h1>
        {rate === null ? (
          <p className="text-lg text-muted-foreground">
            Not enough data yet. Measurement for {meta.label} is just getting started.
          </p>
        ) : (
          <p className="text-lg text-muted-foreground">
            Currently{" "}
            <span className={"font-semibold tabular-nums " + rateColor(rate)}>
              {formatRatePercent(rate)}
            </span>{" "}
            of measured visitors have {meta.label} blocked.
          </p>
        )}
      </header>

      <p className="mt-6 text-muted-foreground">{meta.blurb}</p>

      <p className="mt-6 text-sm text-muted-foreground">
        Measured directly across engaged visitors by{" "}
        <Link to="/" className="font-medium text-foreground underline underline-offset-4">
          blockrate
        </Link>
        , the open-source per-provider block-rate library. No cookies, no consent banner, no
        personal data.{" "}
        <Link to="/demo" className="font-medium text-foreground underline underline-offset-4">
          See detection run in your own browser
        </Link>
        .
      </p>
    </main>
  );
}

function ProviderNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Provider not found</h1>
      <p className="mt-4 text-muted-foreground">
        We don't track that provider (yet).{" "}
        <Link to="/block-rate" className="font-medium text-foreground underline underline-offset-4">
          See all providers we measure
        </Link>
        .
      </p>
    </main>
  );
}
