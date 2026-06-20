/**
 * Public-facing presentation metadata for the per-provider block-rate pages.
 *
 * `Provider` in packages/core intentionally carries only `name` + `detect`
 * (detection is the library's job). Display labels and SEO blurbs are a
 * web-presentation concern, so they live here. Each `slug` must match a
 * `builtInProviders` key exactly — the parity test in
 * test/providers-meta.test.ts asserts this against core so a new provider
 * cannot silently ship without a page (or with a typo'd slug).
 *
 * This list is also the source of truth for which `/block-rate/$provider`
 * pages exist and which per-provider entries the sitemap emits.
 */

export type ProviderMeta = {
  /** URL slug; identical to the builtInProviders key (e.g. "meta-pixel"). */
  slug: string;
  /** Human display name (e.g. "Google Analytics 4"). */
  label: string;
  /** One-sentence description used in page body + meta description. */
  blurb: string;
};

export const PROVIDER_META: readonly ProviderMeta[] = [
  {
    slug: "optimizely",
    label: "Optimizely",
    blurb:
      "Optimizely runs A/B tests and feature experiments. When its CDN is blocked, experiment assignment and conversion tracking silently stop.",
  },
  {
    slug: "posthog",
    label: "PostHog",
    blurb:
      "PostHog is a product-analytics and session-recording platform. Blocked users send no events, so funnels and retention undercount.",
  },
  {
    slug: "ga4",
    label: "Google Analytics 4",
    blurb:
      "Google Analytics 4 is Google's web and app analytics. It is one of the most aggressively blocked endpoints on the web.",
  },
  {
    slug: "gtm",
    label: "Google Tag Manager",
    blurb:
      "Google Tag Manager loads your other tags. When GTM itself is blocked, every tag it manages goes dark at once.",
  },
  {
    slug: "segment",
    label: "Segment",
    blurb:
      "Segment is a customer-data pipeline that fans events out to other tools. A block at the source starves everything downstream.",
  },
  {
    slug: "hotjar",
    label: "Hotjar",
    blurb:
      "Hotjar records heatmaps and session replays. Blocked sessions never appear in your recordings.",
  },
  {
    slug: "amplitude",
    label: "Amplitude",
    blurb:
      "Amplitude is a product-analytics platform. Blocked clients drop out of every behavioral report.",
  },
  {
    slug: "mixpanel",
    label: "Mixpanel",
    blurb:
      "Mixpanel is an event-analytics platform. Blocked users are invisible to its funnels and cohorts.",
  },
  {
    slug: "meta-pixel",
    label: "Meta Pixel",
    blurb:
      "The Meta Pixel powers Facebook and Instagram ad attribution. When it is blocked, conversions go unreported and ad optimization degrades.",
  },
  {
    slug: "intercom",
    label: "Intercom",
    blurb:
      "Intercom powers in-app chat and messaging. A blocked widget means those users can't reach support through it.",
  },
];

export function getProviderMeta(slug: string): ProviderMeta | undefined {
  return PROVIDER_META.find((p) => p.slug === slug);
}

/**
 * Format an all-time block rate (0..1) as a one-decimal percentage string,
 * matching the hero chart's rounding (`Math.round(rate * 1000) / 10`).
 */
export function formatRatePercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * Tailwind text color for a block rate, matching the dashboard thresholds
 * (green < 5%, amber 5-15%, red ≥ 15%). Single source of truth so the
 * threshold semantics can't drift between the pages that render rates.
 */
export function rateColor(rate: number): string {
  if (rate < 0.05) return "text-rate-low";
  if (rate < 0.15) return "text-rate-mid";
  return "text-rate-high";
}

/** SEO `<title>` for a provider page. Includes the live rate when available. */
export function providerPageTitle(meta: ProviderMeta, rate: number | null): string {
  return rate === null
    ? `Is ${meta.label} blocked by ad blockers? — blockrate`
    : `Is ${meta.label} blocked by ad blockers? Live block rate: ${formatRatePercent(rate)}`;
}

/** Meta description for a provider page. Leads with the rate, then the blurb. */
export function providerPageDescription(meta: ProviderMeta, rate: number | null): string {
  const lead =
    rate === null
      ? `${meta.label} block rate, measured directly across engaged visitors.`
      : `Currently ${formatRatePercent(rate)} of measured visitors have ${meta.label} blocked.`;
  return `${lead} ${meta.blurb}`;
}

export type ProviderRow = ProviderMeta & {
  /** All-time block rate (0..1), or null when there is no data yet. */
  rate: number | null;
};

/**
 * Join the provider metadata with the per-provider rates from getHeroStats,
 * sorted worst-first. Providers with no measured data sort last and carry a
 * null rate so the UI can show an honest "not enough data yet" state instead
 * of a fabricated 0%.
 */
export function buildProviderRows(stats: { name: string; rate: number }[]): ProviderRow[] {
  const rateBySlug = new Map(stats.map((s) => [s.name, s.rate]));
  return PROVIDER_META.map((m) => ({ ...m, rate: rateBySlug.get(m.slug) ?? null })).sort(
    (a, b) => (b.rate ?? -1) - (a.rate ?? -1),
  );
}
