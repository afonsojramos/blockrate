/**
 * Provider-shape fixtures: realistic snapshots of `window.X` at three
 * lifecycle points — pre-snippet, snippet-only-stub (CDN blocked), and
 * fully-loaded — exercised against every built-in detector.
 *
 * This test exists because the stub-vs-loaded conflation bug
 * (PR #5) was the kind of mistake that mocked-shape unit tests miss
 * but realistic-shape tests catch. Each fixture below is paraphrased
 * from the provider's actual loader snippet (see provider docs);
 * production shapes carry more cruft, but the discriminating fields
 * are accurate.
 *
 * Lifecycle states modelled:
 *
 *   - empty: provider not installed at all → detect() must run the probe
 *   - stub:  inline loader ran, but the real bundle never loaded
 *            (e.g. ad blocker dropped the request to the CDN). The
 *            stub is truthy and exposes "API methods", but those are
 *            no-op queues. detect() MUST fall through to the probe —
 *            relying on stub presence here is the bug we're guarding
 *            against.
 *   - real:  bundle loaded and initialised. detect() should
 *            short-circuit to "loaded" without firing the probe.
 *
 * Two providers (gtm, posthog/mixpanel/optimizely/segment/ga4) have
 * a meaningful post-load global, so all three states matter for them.
 * Five providers (amplitude, intercom, hotjar, meta-pixel) intentionally
 * have no global check — for those the detector is probe-only and we
 * only assert the probe always fires regardless of `window` state.
 */

import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import {
  optimizely,
  posthog,
  ga4,
  gtm,
  segment,
  hotjar,
  amplitude,
  mixpanel,
  metaPixel,
  intercom,
} from "../src/providers";
import type { Provider } from "../src/types";

const originalFetch = globalThis.fetch;
const originalImage = (globalThis as any).Image;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalImage === undefined) {
    delete (globalThis as any).Image;
  } else {
    (globalThis as any).Image = originalImage;
  }
  delete (globalThis as any).window;
});

beforeEach(() => {
  (globalThis as any).window = {};
});

// Set up fetch mock that records whether the probe was invoked.
function trackingFetch(): { fetchedUrls: string[]; restore: () => void } {
  const fetchedUrls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    fetchedUrls.push(url.toString());
    return new Response(null);
  }) as any;
  return { fetchedUrls, restore: () => (globalThis.fetch = originalFetch) };
}

// Image-loading mock for meta-pixel.
function trackingImage(outcome: "load" | "error" = "load"): { fetchedUrls: string[] } {
  const fetchedUrls: string[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      fetchedUrls.push(url);
      queueMicrotask(() => (outcome === "load" ? this.onload?.() : this.onerror?.()));
    }
  }
  (globalThis as any).Image = FakeImage;
  return { fetchedUrls };
}

// ─── Providers WITH a meaningful post-load global ──────────────────────

interface GatedFixture {
  name: string;
  provider: Provider;
  windowKey: string;
  snippet: () => unknown;
  loaded: () => unknown;
  expectedProbeUrl: string | string[];
}

const GATED: GatedFixture[] = [
  {
    name: "posthog",
    provider: posthog,
    windowKey: "posthog",
    // Inline snippet creates `posthog._i = []`, sets `__SV` (snippet version),
    // and stubs `init`/`capture`/`identify` as no-ops. The real bundle adds
    // `__loaded = true` after `posthog.init()` completes.
    snippet: () => ({
      _i: [],
      __SV: 1,
      init: () => {},
      capture: () => {},
      identify: () => {},
    }),
    loaded: () => ({
      __SV: 1,
      __loaded: true,
      capture: () => {},
      identify: () => {},
    }),
    expectedProbeUrl: ["us.i.posthog.com", "eu.i.posthog.com"],
  },
  {
    name: "mixpanel",
    provider: mixpanel,
    windowKey: "mixpanel",
    snippet: () => ({
      _i: [],
      __SV: 1.2,
      init: () => {},
      track: () => {},
    }),
    loaded: () => ({
      __SV: 1.2,
      __loaded: true,
      track: () => {},
      identify: () => {},
    }),
    expectedProbeUrl: "cdn.mxpnl.com",
  },
  {
    name: "segment",
    provider: segment,
    windowKey: "analytics",
    // The Segment snippet shape: an array with factory-built methods
    // attached, plus `invoked = true` and `SNIPPET_VERSION`. The loaded
    // bundle replaces window.analytics with an Analytics instance whose
    // `initialized === true` is the only reliable post-load signal.
    snippet: () => {
      const a: any = [];
      a.invoked = true;
      a.SNIPPET_VERSION = "4.13.1";
      a.track = () => {};
      a.identify = () => {};
      a.load = () => {};
      return a;
    },
    loaded: () => ({
      initialized: true,
      track: () => {},
      identify: () => {},
      load: () => {},
    }),
    expectedProbeUrl: "cdn.segment.com",
  },
  {
    name: "optimizely",
    provider: optimizely,
    windowKey: "optimizely",
    // Snippet creates an array for command queueing: `optimizely = []`.
    // The loaded client is an object exposing `optimizely.get(...)`.
    snippet: () => {
      const o: any = [];
      o.push({ type: "activate" });
      return o;
    },
    loaded: () => ({
      get: () => ({ getActiveExperiments: () => [] }),
      push: () => {},
    }),
    expectedProbeUrl: "cdn.optimizely.com",
  },
  {
    name: "ga4",
    provider: ga4,
    // GA4's post-load signal is `window.google_tag_data` (set by gtag.js
    // after it executes). The inline snippet defines `window.gtag` and
    // pushes to `dataLayer`, but neither is set by the real bundle — they
    // both exist whether or not gtag.js loaded.
    windowKey: "google_tag_data",
    snippet: () => undefined as unknown, // not the windowKey we care about
    loaded: () => ({ glAmpClientIdSource: 0 }),
    expectedProbeUrl: "google-analytics.com",
  },
  {
    name: "gtm",
    provider: gtm,
    // GTM is the unusual case: the inline snippet does NOT set
    // `window.google_tag_manager` — only gtm.js does, after it loads.
    // So the global IS a reliable post-load signal here.
    windowKey: "google_tag_manager",
    snippet: () => undefined as unknown,
    loaded: () => ({ "GTM-XXXX": { dataLayer: { gtmDom: true } } }),
    expectedProbeUrl: "googletagmanager.com",
  },
];

describe("provider-shapes: gated detectors", () => {
  for (const f of GATED) {
    describe(f.name, () => {
      it("with no global → falls through to probe", async () => {
        const { fetchedUrls } = trackingFetch();
        const status = await f.provider.detect();
        expect(status).toBe("loaded");
        expect(fetchedUrls.length).toBeGreaterThan(0);
        const urls = Array.isArray(f.expectedProbeUrl) ? f.expectedProbeUrl : [f.expectedProbeUrl];
        for (const expected of urls) {
          expect(fetchedUrls.some((u) => u.includes(expected))).toBe(true);
        }
      });

      it("with snippet-only stub → falls through to probe (does not auto-pass)", async () => {
        // Skip ga4/gtm — these key on a global the snippet never sets,
        // so "stub state" is the same as "no global" for them.
        if (f.snippet() === undefined) return;
        (globalThis as any).window[f.windowKey] = f.snippet();
        const { fetchedUrls } = trackingFetch();
        await f.provider.detect();
        expect(fetchedUrls.length).toBeGreaterThan(0);
      });

      it("with real loaded shape → returns loaded WITHOUT probing", async () => {
        (globalThis as any).window[f.windowKey] = f.loaded();
        const { fetchedUrls } = trackingFetch();
        const status = await f.provider.detect();
        expect(status).toBe("loaded");
        expect(fetchedUrls.length).toBe(0);
      });
    });
  }
});

// ─── Providers with NO global check (probe-only by design) ──────────────

interface ProbeOnlyFixture {
  name: string;
  provider: Provider;
  windowKey: string;
  snippet: () => unknown;
  loaded: () => unknown;
  // For amplitude/intercom/hotjar: HEAD probe.
  // For meta-pixel: image probe.
  probeKind: "fetch" | "image";
  expectedProbeUrl: string;
}

const PROBE_ONLY: ProbeOnlyFixture[] = [
  {
    name: "amplitude",
    provider: amplitude,
    windowKey: "amplitude",
    snippet: () => ({
      getInstance: () => ({ _isInitialized: false, options: undefined }),
      _isInitialized: false,
    }),
    loaded: () => ({
      getInstance: () => ({ _isInitialized: true, options: { apiKey: "x" } }),
      _isInitialized: true,
    }),
    probeKind: "fetch",
    expectedProbeUrl: "cdn.amplitude.com",
  },
  {
    name: "intercom",
    provider: intercom,
    windowKey: "Intercom",
    snippet: () => Object.assign(() => {}, { q: [] }),
    loaded: () => Object.assign(() => {}, { booted: true }),
    probeKind: "fetch",
    expectedProbeUrl: "widget.intercom.io",
  },
  {
    name: "hotjar",
    provider: hotjar,
    windowKey: "hj",
    snippet: () => Object.assign(() => {}, { q: [] }),
    loaded: () => () => {},
    probeKind: "fetch",
    expectedProbeUrl: "script.hotjar.com",
  },
  {
    name: "meta-pixel",
    provider: metaPixel,
    windowKey: "fbq",
    // The Meta Pixel base code sets `loaded = !0` on its OWN stub, so
    // this fixture is the canonical false-positive case the old global
    // check would have failed on.
    snippet: () => Object.assign(() => {}, { loaded: true, queue: [], version: "2.0" }),
    loaded: () => Object.assign(() => {}, { loaded: true, version: "2.0", callMethod: () => {} }),
    probeKind: "image",
    expectedProbeUrl: "facebook.com/tr",
  },
];

describe("provider-shapes: probe-only detectors (no global gate)", () => {
  for (const f of PROBE_ONLY) {
    describe(f.name, () => {
      it("with no global → fires probe", async () => {
        if (f.probeKind === "fetch") {
          const { fetchedUrls } = trackingFetch();
          await f.provider.detect();
          expect(fetchedUrls.some((u) => u.includes(f.expectedProbeUrl))).toBe(true);
        } else {
          const { fetchedUrls } = trackingImage("load");
          await f.provider.detect();
          expect(fetchedUrls.some((u) => u.includes(f.expectedProbeUrl))).toBe(true);
        }
      });

      it("with snippet stub → STILL fires probe (does not short-circuit)", async () => {
        (globalThis as any).window[f.windowKey] = f.snippet();
        if (f.probeKind === "fetch") {
          const { fetchedUrls } = trackingFetch();
          await f.provider.detect();
          expect(fetchedUrls.length).toBeGreaterThan(0);
        } else {
          const { fetchedUrls } = trackingImage("load");
          await f.provider.detect();
          expect(fetchedUrls.length).toBeGreaterThan(0);
        }
      });

      it("with real loaded shape → STILL fires probe (probe is ground truth)", async () => {
        // For probe-only providers, the global is intentionally ignored
        // even when it looks "real" — there's no reliable cross-version
        // discriminator. The probe is the source of truth.
        (globalThis as any).window[f.windowKey] = f.loaded();
        if (f.probeKind === "fetch") {
          const { fetchedUrls } = trackingFetch();
          await f.provider.detect();
          expect(fetchedUrls.length).toBeGreaterThan(0);
        } else {
          const { fetchedUrls } = trackingImage("load");
          await f.provider.detect();
          expect(fetchedUrls.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

// ─── Cross-cutting regression: blocked probe must report blocked ────────

describe("provider-shapes: blocked probe → blocked status", () => {
  it("every gated detector returns 'blocked' when probe fails and only stub is present", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("simulated block");
    }) as any;

    for (const f of GATED) {
      if (f.snippet() === undefined) continue;
      (globalThis as any).window = { [f.windowKey]: f.snippet() };
      const status = await f.provider.detect();
      expect({ provider: f.name, status }).toEqual({ provider: f.name, status: "blocked" });
    }
  });
});
