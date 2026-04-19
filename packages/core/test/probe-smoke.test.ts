/**
 * Live-URL smoke test for every built-in provider probe.
 *
 * Gated on BLOCKRATE_SMOKE=1 so CI doesn't red-build when a third-party
 * CDN blips. Run manually before publishing:
 *
 *   bun run test:smoke
 *
 * What it verifies: every built-in probe URL is still alive and serves
 * CORS headers compatible with the strategy that provider uses at
 * runtime. This closes the gap that let the 1.0.0 ga4/hotjar/meta-pixel
 * URLs decay silently — unit tests mock fetch, so they can't catch a
 * dead CDN or a revoked CORS policy.
 *
 * Strategy per provider matches packages/core/src/providers/*.ts:
 *   - Most providers: HEAD + Origin, expect 2xx/3xx/4xx + CORS header.
 *   - meta-pixel: Meta refuses CORS on HEAD but serves it on GET; and
 *     since meta-pixel uses probeImage() at runtime, the smoke test
 *     also verifies GET returns CORS (the closest Bun-runnable proxy
 *     for an <img> that loads in a real browser).
 */

import { describe, it, expect } from "bun:test";

const enabled = process.env.BLOCKRATE_SMOKE === "1";
const d = enabled ? describe : describe.skip;

type Strategy = "head" | "get-range";
type Target = { name: string; url: string; strategy: Strategy };

const TARGETS: Target[] = [
  { name: "amplitude", url: "https://cdn.amplitude.com/libs/amplitude-8.js", strategy: "head" },
  { name: "ga4", url: "https://www.google-analytics.com/g/collect", strategy: "head" },
  { name: "gtm", url: "https://www.googletagmanager.com/gtag/js", strategy: "head" },
  { name: "hotjar", url: "https://script.hotjar.com/", strategy: "head" },
  { name: "intercom", url: "https://widget.intercom.io/widget/", strategy: "head" },
  { name: "mixpanel", url: "https://cdn.mxpnl.com/libs/mixpanel.js", strategy: "head" },
  {
    name: "optimizely",
    url: "https://cdn.optimizely.com/public/optimizely-edge-agent.json",
    strategy: "head",
  },
  { name: "posthog-us", url: "https://us.i.posthog.com/static/array.js", strategy: "head" },
  { name: "posthog-eu", url: "https://eu.i.posthog.com/static/array.js", strategy: "head" },
  { name: "segment", url: "https://cdn.segment.com/analytics.js/v1/", strategy: "head" },
  {
    name: "meta-pixel",
    url: "https://www.facebook.com/tr?id=0&ev=PageView",
    strategy: "get-range",
  },
];

async function verify(target: Target): Promise<{ status: number; hasCors: boolean }> {
  const headers: Record<string, string> = {
    Origin: "https://example.com",
    "User-Agent": "Mozilla/5.0 blockrate-smoke",
  };
  if (target.strategy === "get-range") {
    headers.Range = "bytes=0-0";
  }
  const response = await fetch(target.url, {
    method: target.strategy === "head" ? "HEAD" : "GET",
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const hasCors = response.headers.get("access-control-allow-origin") !== null;
  return { status: response.status, hasCors };
}

d("probe-smoke (live CDNs, BLOCKRATE_SMOKE=1)", () => {
  for (const target of TARGETS) {
    it(`${target.name} probes ${target.url} with CORS`, async () => {
      const { status, hasCors } = await verify(target);
      // Probe treats any fetch that resolves as "loaded"; it only fails
      // when fetch throws. A 4xx response with CORS headers is fine —
      // the only hard failure is no CORS or a network error.
      expect(status).toBeGreaterThanOrEqual(100);
      expect(status).toBeLessThan(500);
      expect(hasCors).toBe(true);
    }, 15_000);
  }
});
