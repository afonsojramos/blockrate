/**
 * buildReport — the public report assembler. Pure (no DB). Verifies worst-first
 * ranking, that thin/no-data providers sort last with a null rate, and that the
 * headline aggregates (withData / worst / averageRate) are computed ONLY over
 * providers above the min-sample floor — never fabricated from thin data.
 */

import { describe, expect, it } from "bun:test";
import { buildReport, MIN_SAMPLE_CHECKS, PROVIDER_META } from "@/lib/providers";

const TOTAL_PROVIDERS = PROVIDER_META.length;

describe("buildReport", () => {
  it("ranks worst-first and aggregates over qualifying providers only", () => {
    const report = buildReport([
      { name: "ga4", rate: 0.4, total: 1000 }, // 40%
      { name: "posthog", rate: 0.1, total: 1000 }, // 10%
      { name: "hotjar", rate: 0.9, total: 50 }, // thin (50 < floor) → null
    ]);

    expect(report.providers.length).toBe(TOTAL_PROVIDERS);
    expect(report.providers[0]!.slug).toBe("ga4"); // worst qualifying first
    expect(report.withData).toBe(2); // ga4 + posthog; hotjar is thin
    expect(report.worst).toEqual({ label: "Google Analytics 4", rate: 0.4 });
    expect(report.averageRate).toBeCloseTo(0.25, 5); // mean(0.4, 0.1)

    const hotjar = report.providers.find((p) => p.slug === "hotjar")!;
    expect(hotjar.rate).toBeNull(); // thin → suppressed, not 90%
  });

  it("excludes a below-floor provider from withData / worst / averageRate", () => {
    const report = buildReport([{ name: "ga4", rate: 0.5, total: MIN_SAMPLE_CHECKS - 1 }]);
    expect(report.withData).toBe(0);
    expect(report.worst).toBeNull();
    expect(report.averageRate).toBeNull();
    expect(report.providers.find((p) => p.slug === "ga4")!.rate).toBeNull();
  });

  it("makes worst and averageRate agree when only one provider qualifies", () => {
    const report = buildReport([{ name: "ga4", rate: 0.38, total: 1000 }]);
    expect(report.withData).toBe(1);
    expect(report.worst).toEqual({ label: "Google Analytics 4", rate: 0.38 });
    expect(report.averageRate).toBe(report.worst!.rate); // page suppresses the redundant clause
  });

  it("includes a 0%-blocked provider that clears the floor (not suppressed as null)", () => {
    const report = buildReport([
      { name: "ga4", rate: 0.2, total: 1000 },
      { name: "gtm", rate: 0, total: 1000 }, // genuinely 0%, enough samples → qualifies
    ]);
    expect(report.withData).toBe(2);
    const gtm = report.providers.find((p) => p.slug === "gtm")!;
    expect(gtm.rate).toBe(0); // 0, not null
    expect(report.worst).toEqual({ label: "Google Analytics 4", rate: 0.2 });
    expect(report.averageRate).toBeCloseTo(0.1, 5); // mean(0.2, 0)
  });

  it("returns null aggregates and all-null rates for empty stats", () => {
    const report = buildReport([]);
    expect(report.withData).toBe(0);
    expect(report.worst).toBeNull();
    expect(report.averageRate).toBeNull();
    expect(report.providers.length).toBe(TOTAL_PROVIDERS);
    expect(report.providers.every((p) => p.rate === null)).toBe(true);
  });
});
