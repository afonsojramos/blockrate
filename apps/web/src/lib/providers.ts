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

/**
 * Minimum measured checks before a per-provider rate is trustworthy enough to
 * publish on a public, crawlable, embeddable surface. Below this we render
 * "no data" rather than a confident-looking but noisy percentage — the same
 * "the one number must never be wrong" discipline applied to small samples.
 * Tunable; a product call, deliberately a single constant.
 */
export const MIN_SAMPLE_CHECKS = 100;

/** Returns the rate, or null when the sample is too small to publish. */
export function applyFloor(rate: number, total: number): number | null {
  return total >= MIN_SAMPLE_CHECKS ? rate : null;
}

/** Literal hex (SVG can't use Tailwind classes) for a badge's value segment. */
export function badgeColor(rate: number | null): string {
  if (rate === null) return "#9f9f9f"; // gray — no data
  if (rate < 0.05) return "#3fb950"; // green
  if (rate < 0.15) return "#d29922"; // amber
  return "#f85149"; // red
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
export function buildProviderRows(
  stats: { name: string; rate: number; total: number }[],
): ProviderRow[] {
  const rateBySlug = new Map(stats.map((s) => [s.name, applyFloor(s.rate, s.total)]));
  return PROVIDER_META.map((m) => ({ ...m, rate: rateBySlug.get(m.slug) ?? null })).sort(
    (a, b) => (b.rate ?? -1) - (a.rate ?? -1),
  );
}

/** One provider's public stats-API entry. */
export type ProviderStat = {
  slug: string;
  label: string;
  /** Floored block rate (0..1), or null when below the sample floor / no data. */
  blockRate: number | null;
  // blocked/total are the raw, UN-floored counts even when blockRate is null,
  // so a consumer below the floor can compute its own confidence. Deliberate —
  // do not zero these out to match the null rate.
  blocked: number;
  total: number;
};

/**
 * Build the public `/block-rate.json` payload rows: every provider, floored,
 * worst-first, with sample sizes exposed so consumers can judge confidence.
 * Same floor + sort as the HTML index, so the API can never disagree with it.
 */
export function buildProviderStats(
  stats: { name: string; rate: number; blocked: number; total: number }[],
): ProviderStat[] {
  const bySlug = new Map(stats.map((s) => [s.name, s]));
  return PROVIDER_META.map((m) => {
    const entry = bySlug.get(m.slug);
    return {
      slug: m.slug,
      label: m.label,
      blockRate: entry ? applyFloor(entry.rate, entry.total) : null,
      blocked: entry?.blocked ?? 0,
      total: entry?.total ?? 0,
    };
  }).sort((a, b) => (b.blockRate ?? -1) - (a.blockRate ?? -1));
}
