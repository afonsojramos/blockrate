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
  it("formats a rate to one decimal percent, matching the hero chart", () => {
    expect(formatRatePercent(0.382)).toBe("38.2%");
    expect(formatRatePercent(0)).toBe("0%");
    expect(formatRatePercent(1)).toBe("100%");
    expect(formatRatePercent(0.05)).toBe("5%");
  });
});

describe("buildProviderRows", () => {
  it("includes every provider, sorted worst-first, no-data last", () => {
    const rows = buildProviderRows([
      { name: "posthog", rate: 0.1 },
      { name: "ga4", rate: 0.4 },
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

  it("returns all rows as no-data when stats are empty (never fabricates 0%)", () => {
    const rows = buildProviderRows([]);
    expect(rows).toHaveLength(PROVIDER_META.length);
    expect(rows.every((r) => r.rate === null)).toBe(true);
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
