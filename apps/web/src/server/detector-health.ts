/**
 * Public detector-health report — no auth, no database.
 *
 * blockrate's detectors depend on third-party CDN endpoints and their CORS
 * policies. The daily GitHub Actions smoke suite (.github/workflows/smoke.yml)
 * probes the same URLs in CI; this module probes them on demand from the web
 * server so visitors (and customers debugging an integration) can see live
 * detector health without CI access.
 *
 * The TARGETS list and per-provider fetch strategies are copied from
 * packages/core/test/probe-smoke.test.ts — KEEP THE TWO IN SYNC. When a
 * provider is added or a probe URL changes, both change in the same PR.
 *
 * Probing 11 URLs per request would be slow and rude, so the report is
 * cached in-process for CACHE_TTL_MS (mirrors server/hero-stats.ts). A
 * failed probe is DATA (ok: false), never an error — the page must render
 * degraded states, not 500.
 */

import { createServerFn } from "@tanstack/react-start";

type Strategy = "head" | "get-range";
type Target = { name: string; url: string; strategy: Strategy };

// Copied from packages/core/test/probe-smoke.test.ts — keep in sync.
const TARGETS: Target[] = [
  { name: "amplitude", url: "https://cdn.amplitude.com/libs/amplitude-9.js", strategy: "head" },
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

export interface TargetHealth {
  name: string;
  /** Host of the probe URL — enough to identify the endpoint without a wall of URL. */
  host: string;
  ok: boolean;
  /** HTTP status when fetch resolved, null when it threw (network-level block/failure). */
  status: number | null;
  hasCors: boolean;
  latencyMs: number;
}

export interface HealthReport {
  /** ISO timestamp of the probe run (served from cache between runs). */
  checkedAt: string;
  allOk: boolean;
  targets: TargetHealth[];
}

const PROBE_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 15 * 60 * 1000;

type FetchImpl = typeof fetch;

async function probeTarget(target: Target, fetchImpl: FetchImpl): Promise<TargetHealth> {
  const host = new URL(target.url).host;
  const started = Date.now();
  try {
    const headers: Record<string, string> = {
      Origin: "https://example.com",
      "User-Agent": "Mozilla/5.0 blockrate-detector-health",
    };
    if (target.strategy === "get-range") {
      // Meta refuses CORS on HEAD but serves it on GET; a 1-byte Range keeps
      // the GET cheap. Same strategy as the runtime detector and smoke test.
      headers.Range = "bytes=0-0";
    }
    const response = await fetchImpl(target.url, {
      method: target.strategy === "head" ? "HEAD" : "GET",
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Same pass rule as the smoke test: any sub-500 status is fine (the
    // runtime probe treats any resolved response as reachable); the hard
    // failures are a missing CORS header or a thrown fetch.
    const hasCors = response.headers.get("access-control-allow-origin") !== null;
    const ok = response.status >= 100 && response.status < 500 && hasCors;
    return {
      name: target.name,
      host,
      ok,
      status: response.status,
      hasCors,
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      name: target.name,
      host,
      ok: false,
      status: null,
      hasCors: false,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Probe every target and build the report. Never throws — per-target
 * failures land in the report. `fetchImpl` is injectable for tests.
 */
export async function checkDetectorHealth(fetchImpl: FetchImpl = fetch): Promise<HealthReport> {
  const settled = await Promise.allSettled(TARGETS.map((t) => probeTarget(t, fetchImpl)));
  const targets = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // probeTarget itself never throws; this is belt-and-braces so a bug in
    // a single probe can never take down the page.
    const t = TARGETS[i]!;
    return {
      name: t.name,
      host: new URL(t.url).host,
      ok: false,
      status: null,
      hasCors: false,
      latencyMs: 0,
    };
  });
  return {
    checkedAt: new Date().toISOString(),
    allOk: targets.every((t) => t.ok),
    targets,
  };
}

let cache: { at: number; value: HealthReport } | null = null;

export const getDetectorHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<HealthReport> => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
    const value = await checkDetectorHealth();
    cache = { at: Date.now(), value };
    return value;
  },
);
