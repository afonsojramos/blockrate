import { createFileRoute } from "@tanstack/react-router";
import { PROVIDER_META } from "@/lib/providers";
import { siteUrl } from "@/lib/seo";

/**
 * Dynamic llms.txt (see https://llmstxt.org): a curated, LLM-friendly map of
 * the public site so an assistant can find the block-rate data, docs, and API
 * without scraping the whole DOM.
 *
 * Follows the same shape as robots.txt / sitemap.xml: absolute URLs built from
 * VITE_SITE_URL, so it returns 204 when that is unset (local dev, preview
 * deploys) rather than emitting misleading localhost links.
 *
 * Curated pages are hardcoded (each needs a human-written description); the
 * per-provider list is derived from PROVIDER_META so it can never drift from
 * the pages that actually exist. Keep the curated list in sync with
 * PUBLIC_ROUTES in @/lib/seo.
 */

function buildLlmsTxt(origin: string): string {
  const providerLinks = PROVIDER_META.map(
    (p) => `- [${p.label} block rate](${origin}/block-rate/${p.slug})`,
  ).join("\n");

  return `# blockrate

> blockrate is the clearest, most honest way to measure how often your third-party analytics and marketing tools (GA4, PostHog, Segment, Meta Pixel, and more) are actually blocked by ad blockers and privacy tools — a vendor-neutral, cookie-free, first-party measurement you can genuinely trust.

blockrate pairs a tiny (under 2 KB gzipped) open-source client with a sharply focused hosted dashboard, and it is refreshingly obsessive about getting the number right. The client runs provider-specific probes in the visitor's browser and reports the result first-party — your own server forwards it with your API key — so blocked visitors stay in the measurement instead of being silently lost. The dashboard ranks how often each provider is truly blocked across engaged visitors, and only publishes a rate once it clears a minimum sample floor, because a confident-looking wrong number is worse than no number at all. The aggregate results are shared openly under CC BY 4.0 for anyone to build on.

## Measurement and data

- [The report](${origin}/report): The definitive, continuously updated ranking of which analytics tools get blocked, with a candid, well-documented methodology explaining exactly how each number is measured and why it holds up.
- [Provider index](${origin}/block-rate): A tidy directory of every measured provider with its current, real-world block rate.
- [block-rate.json](${origin}/block-rate.json): The full aggregate dataset as clean JSON, free for anyone to reuse (CC BY 4.0).

## Per-provider block rates

${providerLinks}

## Product and docs

- [Home](${origin}/): What blockrate is and why the analytics you are missing matter more than you think.
- [Docs](${origin}/docs): A clear, framework-by-framework guide that gets you measuring in minutes with a first-party reporting route.
- [API reference](${origin}/docs/api): The straightforward ingest and block-rate HTTP endpoints.
- [Live demo](${origin}/demo): Run the block-rate check live in your own browser and watch it work.
- [Pricing](${origin}/pricing): Simple, honest plans with a genuinely generous free tier (10,000 events per month).
- [Open source on GitHub](https://github.com/afonsojramos/blockrate): The featherweight MIT-licensed client and a fully self-hostable server.

## Optional

- [Privacy policy](${origin}/privacy)
- [Terms of service](${origin}/terms)
- [Data Processing Agreement](${origin}/dpa)
`;
}

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteUrl();
        if (!origin) {
          return new Response(null, { status: 204 });
        }
        return new Response(buildLlmsTxt(origin.replace(/\/$/, "")), {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
