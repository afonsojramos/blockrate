/**
 * Provider presentation metadata — parity + helper correctness.
 *
 * The load-bearing invariant: every built-in detector in packages/core must
 * have exactly one PROVIDER_META entry (and vice versa), so a new provider
 * cannot ship without a /block-rate page or with a typo'd slug. The sitemap
 * derives per-provider URLs from this list, so drift here silently drops pages
 * from the index.
 */

import { describe, it, expect } from "vitest";
import { builtInProviders } from "blockrate";

import {
  PROVIDER_META,
  getProviderMeta,
  formatRatePercent,
  buildProviderRows,
  providerPageTitle,
  providerPageDescription,
  applyFloor,
  badgeColor,
  MIN_SAMPLE_CHECKS,
  buildProviderStats,
} from "@/lib/providers";

describe("PROVIDER_META parity with core", () => {
  const coreSlugs = Object.keys(builtInProviders).sort();
  const metaSlugs = PROVIDER_META.map((p) => p.slug).sort();

  it("has exactly one entry per built-in provider (no missing, no extra)", () => {
    expect(metaSlugs).toEqual(coreSlugs);
  });

  it("has unique slugs", () => {
    expect(new Set(metaSlugs).size).toBe(metaSlugs.length);
  });

  it("every entry has a non-empty label and blurb", () => {
    for (const p of PROVIDER_META) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });

  it("every entry has remediation: non-empty approach, https docs URL, valid support level", () => {
    const levels = new Set(["official", "partial", "server-side-only", "none"]);
    for (const p of PROVIDER_META) {
      expect(p.remediation.approach.length).toBeGreaterThan(0);
      expect(p.remediation.docsUrl).toMatch(/^https:\/\//);
      expect(levels.has(p.remediation.supportLevel)).toBe(true);
    }
  });
});

describe("getProviderMeta", () => {
  it("returns the entry for a known slug", () => {
    expect(getProviderMeta("posthog")?.label).toBe("PostHog");
    expect(getProviderMeta("meta-pixel")?.label).toBe("Meta Pixel");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProviderMeta("not-a-provider")).toBeUndefined();
  });
});

describe("formatRatePercent", () => {
  it("formats a rate to one decimal percent across public rate surfaces", () => {
    expect(formatRatePercent(0.382)).toBe("38.2%");
    expect(formatRatePercent(0)).toBe("0%");
    expect(formatRatePercent(1)).toBe("100%");
    expect(formatRatePercent(0.05)).toBe("5%");
  });
});

describe("applyFloor", () => {
  it("returns the rate when the sample meets the floor", () => {
    expect(applyFloor(0.38, MIN_SAMPLE_CHECKS)).toBe(0.38);
    expect(applyFloor(0.38, MIN_SAMPLE_CHECKS + 1000)).toBe(0.38);
  });

  it("returns null when the sample is below the floor (never publishes a noisy rate)", () => {
    expect(applyFloor(0.38, MIN_SAMPLE_CHECKS - 1)).toBeNull();
    expect(applyFloor(1, 3)).toBeNull();
  });
});

describe("badgeColor", () => {
  it("maps rate bands to hex, gray for no data", () => {
    expect(badgeColor(null)).toBe("#9f9f9f");
    expect(badgeColor(0.02)).toBe("#3fb950"); // green
    expect(badgeColor(0.1)).toBe("#d29922"); // amber
    expect(badgeColor(0.4)).toBe("#f85149"); // red
  });
});

describe("buildProviderRows", () => {
  it("includes every provider, sorted worst-first, no-data last", () => {
    const rows = buildProviderRows([
      { name: "posthog", rate: 0.1, total: 1000 },
      { name: "ga4", rate: 0.4, total: 1000 },
    ]);
    expect(rows).toHaveLength(PROVIDER_META.length);
    // ga4 (0.4) before posthog (0.1); providers with no data carry null and sort last.
    const ga4Index = rows.findIndex((r) => r.slug === "ga4");
    const posthogIndex = rows.findIndex((r) => r.slug === "posthog");
    const noDataIndex = rows.findIndex((r) => r.rate === null);
    expect(ga4Index).toBeLessThan(posthogIndex);
    expect(posthogIndex).toBeLessThan(noDataIndex);
    expect(rows.find((r) => r.slug === "ga4")?.rate).toBe(0.4);
  });

  it("floors low-sample providers to no-data (never fabricates a noisy rate)", () => {
    const rows = buildProviderRows([
      { name: "posthog", rate: 0.33, total: 3 }, // below floor → null
      { name: "ga4", rate: 0.4, total: 5000 }, // above floor → kept
    ]);
    expect(rows.find((r) => r.slug === "posthog")?.rate).toBeNull();
    expect(rows.find((r) => r.slug === "ga4")?.rate).toBe(0.4);
  });

  it("returns all rows as no-data when stats are empty (never fabricates 0%)", () => {
    const rows = buildProviderRows([]);
    expect(rows).toHaveLength(PROVIDER_META.length);
    expect(rows.every((r) => r.rate === null)).toBe(true);
  });
});

describe("buildProviderStats (public /block-rate.json payload)", () => {
  it("includes every provider with slug/label/blockRate/blocked/total, worst-first", () => {
    const rows = buildProviderStats([
      { name: "posthog", rate: 0.1, blocked: 100, total: 1000 },
      { name: "ga4", rate: 0.4, blocked: 2000, total: 5000 },
    ]);
    expect(rows).toHaveLength(PROVIDER_META.length);
    expect(rows[0]).toMatchObject({ slug: "ga4", label: "Google Analytics 4", blockRate: 0.4 });
    const ga4 = rows.find((r) => r.slug === "ga4")!;
    expect(ga4).toMatchObject({ blocked: 2000, total: 5000 });
  });

  it("floors low-sample providers to null blockRate but preserves the sample size", () => {
    const rows = buildProviderStats([
      { name: "posthog", rate: 0.33, blocked: 1, total: 3 }, // below floor
    ]);
    const posthog = rows.find((r) => r.slug === "posthog")!;
    expect(posthog.blockRate).toBeNull();
    expect(posthog.total).toBe(3);
  });

  it("reports absent providers as null blockRate with zero counts", () => {
    const rows = buildProviderStats([]);
    expect(rows).toHaveLength(PROVIDER_META.length);
    expect(rows.every((r) => r.blockRate === null && r.total === 0 && r.blocked === 0)).toBe(true);
  });
});

describe("provider page SEO helpers", () => {
  const meta = { slug: "posthog", label: "PostHog", blurb: "PostHog is analytics." };

  it("title contains the label and the formatted percentage when rate is present", () => {
    const title = providerPageTitle(meta, 0.382);
    expect(title).toContain("PostHog");
    expect(title).toContain("38.2%");
  });

  it("title omits a fabricated percentage when there is no data", () => {
    const title = providerPageTitle(meta, null);
    expect(title).toContain("PostHog");
    expect(title).not.toMatch(/\d%/);
  });

  it("description leads with the rate then the blurb", () => {
    const desc = providerPageDescription(meta, 0.382);
    expect(desc).toContain("38.2%");
    expect(desc).toContain("PostHog is analytics.");
  });
});
