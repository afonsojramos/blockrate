/**
 * attachBenchmark — merges the public per-provider benchmark onto an account's
 * own stat rows. Pure (no DB). Verifies the public benchmark is floored, the
 * delta math is own − benchmark, and the account's OWN rate is never floored.
 */

import { describe, expect, it } from "bun:test";
import { attachBenchmark } from "@/server/stats";
import { deltaToPoints, MIN_SAMPLE_CHECKS } from "@/lib/providers";

const row = (provider: string, blockRate: number, total = 1000) => ({
  provider,
  total,
  blocked: Math.round(total * blockRate),
  blockRate,
  avgLatency: 100,
});

describe("attachBenchmark", () => {
  it("attaches the floored benchmark and a positive delta when worse than the benchmark", () => {
    const [r] = attachBenchmark([row("ga4", 0.45)], [{ name: "ga4", rate: 0.38, total: 1000 }]);
    expect(r!.benchmarkRate).toBeCloseTo(0.38, 5);
    expect(r!.benchmarkDelta).toBeCloseTo(0.07, 5);
  });

  it("gives a negative delta when the account is better than the benchmark", () => {
    const [r] = attachBenchmark([row("ga4", 0.3)], [{ name: "ga4", rate: 0.38, total: 1000 }]);
    expect(r!.benchmarkDelta).toBeCloseTo(-0.08, 5);
  });

  it("floors the public benchmark to null below MIN_SAMPLE_CHECKS", () => {
    const [r] = attachBenchmark(
      [row("ga4", 0.45)],
      [{ name: "ga4", rate: 0.9, total: MIN_SAMPLE_CHECKS - 1 }],
    );
    expect(r!.benchmarkRate).toBeNull();
    expect(r!.benchmarkDelta).toBeNull();
  });

  it("returns a null benchmark when the provider has no public entry", () => {
    const [r] = attachBenchmark([row("ga4", 0.45)], []);
    expect(r!.benchmarkRate).toBeNull();
    expect(r!.benchmarkDelta).toBeNull();
  });

  it("never floors the account's own rate — only the benchmark", () => {
    const [r] = attachBenchmark([row("ga4", 0.5, 3)], []); // tiny own sample
    expect(r!.blockRate).toBe(0.5); // own rate intact
    expect(r!.benchmarkRate).toBeNull();
  });
});

describe("deltaToPoints", () => {
  it("converts a rate delta to signed percentage points, one decimal", () => {
    expect(deltaToPoints(0.07)).toBe(7);
    expect(deltaToPoints(-0.08)).toBe(-8);
    expect(deltaToPoints(0.0734)).toBe(7.3);
    expect(deltaToPoints(0)).toBe(0);
  });
});
