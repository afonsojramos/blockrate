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
  /** How to reduce this provider's block rate (first-party / server-side). */
  remediation: Remediation;
};

/**
 * How well a provider supports a first-party fix:
 *   official          — vendor-documented reverse proxy / custom host
 *   partial           — possible (e.g. self-host the snippet) but incomplete or not framed for this
 *   server-side-only  — no client fix; the durable answer is a server-side API
 *   none              — no first-party option; accept the gap or switch tools
 */
export type RemediationSupport = "official" | "partial" | "server-side-only" | "none";

export type Remediation = {
  /** One honest sentence on how to serve this provider first-party. */
  approach: string;
  /** Official vendor documentation URL for the approach. */
  docsUrl: string;
  supportLevel: RemediationSupport;
};

export const PROVIDER_META: readonly ProviderMeta[] = [
  {
    slug: "optimizely",
    label: "Optimizely",
    blurb:
      "Optimizely runs A/B tests and feature experiments. When its CDN is blocked, experiment assignment and conversion tracking silently stop.",
    remediation: {
      approach:
        "Self-host the Web Experimentation snippet through your own CDN so it loads from your domain. Note: experiment events still go to logx.optimizely.com unless you proxy that endpoint too.",
      docsUrl:
        "https://docs.developers.optimizely.com/web-experimentation/docs/content-delivery-networks",
      supportLevel: "partial",
    },
  },
  {
    slug: "posthog",
    label: "PostHog",
    blurb:
      "PostHog is a product-analytics and session-recording platform. Blocked users send no events, so funnels and retention undercount.",
    remediation: {
      approach:
        "PostHog offers a free managed reverse proxy: route events through a subdomain you own (set api_host and ui_host in the SDK) so requests come from your domain, not posthog.com.",
      docsUrl: "https://posthog.com/docs/advanced/proxy",
      supportLevel: "official",
    },
  },
  {
    slug: "ga4",
    label: "Google Analytics 4",
    blurb:
      "Google Analytics 4 is Google's web and app analytics. It is one of the most aggressively blocked endpoints on the web.",
    remediation: {
      approach:
        "Deploy a server-side GTM container on your own first-party domain so GA4 data flows through your domain instead of google-analytics.com.",
      docsUrl: "https://developers.google.com/tag-platform/tag-manager/server-side/intro",
      supportLevel: "official",
    },
  },
  {
    slug: "gtm",
    label: "Google Tag Manager",
    blurb:
      "Google Tag Manager loads your other tags. When GTM itself is blocked, every tag it manages goes dark at once.",
    remediation: {
      approach:
        "Run server-side GTM on a custom first-party domain. Use an opaque subdomain (not gtm.* or sgtm.*) — 2026 filter lists now target those tokens by name.",
      docsUrl: "https://developers.google.com/tag-platform/tag-manager/server-side/custom-domain",
      supportLevel: "official",
    },
  },
  {
    slug: "segment",
    label: "Segment",
    blurb:
      "Segment is a customer-data pipeline that fans events out to other tools. A block at the source starves everything downstream.",
    remediation: {
      approach:
        "Analytics.js supports cdnURL and apiHost options to load the library and send events through your own domain (Business-tier plan).",
      docsUrl: "https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/",
      supportLevel: "official",
    },
  },
  {
    slug: "hotjar",
    label: "Hotjar",
    blurb:
      "Hotjar records heatmaps and session replays. Blocked sessions never appear in your recordings.",
    remediation: {
      approach:
        "Hotjar has no first-party-proxy support, so there is no client-side fix. Accept the gap, or switch to a self-hostable replay tool such as PostHog or OpenReplay.",
      docsUrl: "https://help.hotjar.com/hc/en-us",
      supportLevel: "none",
    },
  },
  {
    slug: "amplitude",
    label: "Amplitude",
    blurb:
      "Amplitude is a product-analytics platform. Blocked clients drop out of every behavioral report.",
    remediation: {
      approach:
        "Set a custom serverUrl in the Browser SDK to route events through your own reverse proxy (the proxy must accept gzip-compressed bodies).",
      docsUrl: "https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2",
      supportLevel: "official",
    },
  },
  {
    slug: "mixpanel",
    label: "Mixpanel",
    blurb:
      "Mixpanel is an event-analytics platform. Blocked users are invisible to its funnels and cohorts.",
    remediation: {
      approach:
        "Set api_host and lib_base_path in mixpanel.init, backed by a reverse proxy on your domain (both are needed when Session Replay is enabled).",
      docsUrl: "https://mixpanel.com/docs/tracking-methods/sdks/javascript#tracking-via-proxy",
      supportLevel: "official",
    },
  },
  {
    slug: "meta-pixel",
    label: "Meta Pixel",
    blurb:
      "The Meta Pixel powers Facebook and Instagram ad attribution. When it is blocked, conversions go unreported and ad optimization degrades.",
    remediation: {
      approach:
        "The browser pixel can't be reliably proxied. The durable fix is the server-side Conversions API (CAPI), sending events backend-to-Meta.",
      docsUrl: "https://developers.facebook.com/docs/marketing-api/conversions-api/",
      supportLevel: "server-side-only",
    },
  },
  {
    slug: "intercom",
    label: "Intercom",
    blurb:
      "Intercom powers in-app chat and messaging. A blocked widget means those users can't reach support through it.",
    remediation: {
      approach:
        "Intercom has no first-party-proxy support for the Messenger widget. Accept the gap, or load it only after a user interaction to delay the block window.",
      docsUrl: "https://developers.intercom.com/docs/",
      supportLevel: "none",
    },
  },
];

export function getProviderMeta(slug: string): ProviderMeta | undefined {
  return PROVIDER_META.find((p) => p.slug === slug);
}

/**
 * Format an all-time block rate (0..1) as a one-decimal percentage string,
 * shared by the homepage live-rate panel and public provider surfaces.
 */
export function formatRatePercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * A rate delta (0..1) → signed percentage points, one decimal. Single source of
 * truth for the rate→points conversion so the sign/precision can't drift across
 * the surfaces that show "X pts" (benchmark delta, trend change).
 */
export function deltaToPoints(delta: number): number {
  return Math.round(delta * 1000) / 10;
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

/** Short human label for a remediation support level. */
export function remediationLabel(level: RemediationSupport): string {
  switch (level) {
    case "official":
      return "Official fix";
    case "partial":
      return "Partial fix";
    case "server-side-only":
      return "Server-side fix";
    case "none":
      return "No first-party fix";
  }
}

/** Tailwind text color for a remediation support level. */
export function remediationColor(level: RemediationSupport): string {
  switch (level) {
    case "official":
      return "text-rate-low";
    case "partial":
    case "server-side-only":
      return "text-rate-mid";
    case "none":
      return "text-rate-high";
  }
}

/** Literal hex (SVG can't use Tailwind classes) for a badge's value segment. */
export function badgeColor(rate: number | null): string {
  if (rate === null) return "#9f9f9f"; // gray — no data
  if (rate < 0.05) return "#3fb950"; // green
  if (rate < 0.15) return "#d29922"; // amber
  return "#f85149"; // red
}

/** SEO `<title>` for a provider page. Includes the live rate when available. */
export function providerPageTitle(meta: Pick<ProviderMeta, "label">, rate: number | null): string {
  return rate === null
    ? `Is ${meta.label} blocked by ad blockers? — blockrate`
    : `Is ${meta.label} blocked by ad blockers? Live block rate: ${formatRatePercent(rate)}`;
}

/** Meta description for a provider page. Leads with the rate, then the blurb. */
export function providerPageDescription(
  meta: Pick<ProviderMeta, "label" | "blurb">,
  rate: number | null,
): string {
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

export interface BlockRateReport {
  /** Every tracked provider, worst-first, thin providers (rate null) last. */
  providers: ProviderRow[];
  /** Providers with a publishable (above-floor) rate. */
  withData: number;
  /** The most-blocked provider that clears the floor, or null if none do. */
  worst: { label: string; rate: number } | null;
  /** Mean block rate across qualifying providers only, or null. */
  averageRate: number | null;
}

/**
 * Assemble the public report from the cached hero stats. Aggregates are
 * computed ONLY over providers above the min-sample floor (rate !== null) —
 * a thin provider is shown as "—" and never folded into worst/average, so the
 * headline can never be a number the per-provider pages would suppress.
 */
export function buildReport(
  stats: { name: string; rate: number; total: number }[],
): BlockRateReport {
  const providers = buildProviderRows(stats);
  const qualifying = providers.filter((p): p is ProviderRow & { rate: number } => p.rate !== null);
  const worst = qualifying[0] ? { label: qualifying[0].label, rate: qualifying[0].rate } : null;
  // Unweighted mean BY DESIGN: each qualifying provider is one data point in the
  // ranking, so high-traffic providers don't dominate the headline average. (This
  // differs deliberately from the volume-weighted all-time rate in hero-stats.)
  const averageRate = qualifying.length
    ? qualifying.reduce((sum, p) => sum + p.rate, 0) / qualifying.length
    : null;
  return { providers, withData: qualifying.length, worst, averageRate };
}
