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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as any).window;
});

describe("providers", () => {
  beforeEach(() => {
    (globalThis as any).window = {};
  });

  // ─── optimizely ─────────────────────────────────────────────────────
  describe("optimizely", () => {
    it("loaded when window.optimizely is the real client (not the array stub)", async () => {
      (globalThis as any).window.optimizely = { get: () => ({}) };
      expect(await optimizely.detect()).toBe("loaded");
    });

    it("falls through to probe when window.optimizely is the array stub", async () => {
      (globalThis as any).window.optimizely = []; // loader-snippet stub
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await optimizely.detect()).toBe("loaded");
      expect(captured).toBe("https://cdn.optimizely.com/public/optimizely-edge-agent.json");
    });

    it("blocked when probe fails and only the array stub is present", async () => {
      (globalThis as any).window.optimizely = [];
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await optimizely.detect()).toBe("blocked");
    });
  });

  // ─── posthog ────────────────────────────────────────────────────────
  describe("posthog", () => {
    it("loaded only when window.posthog.__loaded === true", async () => {
      (globalThis as any).window.posthog = { __loaded: true };
      expect(await posthog.detect()).toBe("loaded");
    });

    it("falls through to probe when window.posthog is the queueing stub", async () => {
      (globalThis as any).window.posthog = { __SV: 1, init: () => {} };
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await posthog.detect()).toBe("loaded");
      expect(captured).toContain("posthog.com/static/array.js");
    });
  });

  // ─── ga4 ────────────────────────────────────────────────────────────
  describe("ga4", () => {
    it("loaded only when window.google_tag_data is present (post-load signal)", async () => {
      (globalThis as any).window.google_tag_data = {};
      expect(await ga4.detect()).toBe("loaded");
    });

    it("falls through to probe when only the snippet's gtag stub exists", async () => {
      (globalThis as any).window.gtag = () => {};
      (globalThis as any).window.dataLayer = [{ event: "config" }];
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await ga4.detect()).toBe("loaded");
      expect(captured).toBe("https://www.google-analytics.com/g/collect");
    });

    it("blocked when probe fails and no post-load global is set", async () => {
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await ga4.detect()).toBe("blocked");
    });
  });

  // ─── gtm ────────────────────────────────────────────────────────────
  describe("gtm", () => {
    it("loaded when window.google_tag_manager is set (post-load by gtm.js)", async () => {
      (globalThis as any).window.google_tag_manager = {};
      expect(await gtm.detect()).toBe("loaded");
    });

    it("probes googletagmanager.com when no post-load global is set", async () => {
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      await gtm.detect();
      expect(captured).toBe("https://www.googletagmanager.com/gtag/js");
    });
  });

  // ─── segment ────────────────────────────────────────────────────────
  describe("segment", () => {
    it("loaded only when analytics.initialized === true", async () => {
      (globalThis as any).window.analytics = { initialized: true, track: () => {} };
      expect(await segment.detect()).toBe("loaded");
    });

    it("falls through to probe when analytics is the array stub from the snippet", async () => {
      // Mirrors the real Segment snippet shape: array with factory-built
      // methods and SNIPPET_VERSION attached, but no `initialized` flag.
      const stub: any = [];
      stub.invoked = true;
      stub.track = () => {};
      stub.SNIPPET_VERSION = "4.13.1";
      (globalThis as any).window.analytics = stub;
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await segment.detect()).toBe("loaded");
      expect(captured).toBe("https://cdn.segment.com/analytics.js/v1/");
    });
  });

  // ─── hotjar ─────────────────────────────────────────────────────────
  describe("hotjar", () => {
    it("ignores window.hj entirely (snippet stub is indistinguishable from real)", async () => {
      (globalThis as any).window.hj = () => {};
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await hotjar.detect()).toBe("loaded");
      expect(captured).toBe("https://script.hotjar.com/");
    });

    it("blocked when probe fails", async () => {
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await hotjar.detect()).toBe("blocked");
    });
  });

  // ─── amplitude ──────────────────────────────────────────────────────
  describe("amplitude", () => {
    it("ignores window.amplitude entirely (cross-version stub conflation)", async () => {
      (globalThis as any).window.amplitude = { getInstance: () => ({}) };
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await amplitude.detect()).toBe("loaded");
      expect(captured).toBe("https://cdn.amplitude.com/libs/amplitude-9.js");
    });

    it("blocked when probe fails", async () => {
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await amplitude.detect()).toBe("blocked");
    });
  });

  // ─── mixpanel ───────────────────────────────────────────────────────
  describe("mixpanel", () => {
    it("loaded only when mixpanel.__loaded === true", async () => {
      (globalThis as any).window.mixpanel = { __loaded: true };
      expect(await mixpanel.detect()).toBe("loaded");
    });

    it("falls through to probe when mixpanel is the queueing stub", async () => {
      (globalThis as any).window.mixpanel = { __SV: 1.2, init: () => {} };
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await mixpanel.detect()).toBe("loaded");
      expect(captured).toBe("https://cdn.mxpnl.com/libs/mixpanel.js");
    });
  });

  // ─── meta-pixel ─────────────────────────────────────────────────────
  describe("meta-pixel", () => {
    it("loaded when the CORS GET probe resolves (ignores window.fbq stub)", async () => {
      // Mirrors the real Meta Pixel base code, which sets fbq.loaded=true
      // on its own stub; this would have been a false positive in the old
      // global check.
      (globalThis as any).window.fbq = Object.assign(() => {}, { loaded: true, queue: [] });
      globalThis.fetch = (async () => new Response(null)) as any;
      expect(await metaPixel.detect()).toBe("loaded");
    });

    it("blocked when the probe throws, even with window.fbq stub present", async () => {
      (globalThis as any).window.fbq = Object.assign(() => {}, { loaded: true, queue: [] });
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await metaPixel.detect()).toBe("blocked");
    });

    it("probes facebook.com/tr with a CORS GET (HEAD has no CORS; /tr is not an image)", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedMethod = (init?.method as string) ?? "";
        return new Response(null);
      }) as any;
      await metaPixel.detect();
      expect(capturedUrl).toBe("https://www.facebook.com/tr?id=0&ev=PageView");
      expect(capturedMethod).toBe("GET");
    });
  });

  // ─── intercom ───────────────────────────────────────────────────────
  describe("intercom", () => {
    it("ignores window.Intercom entirely (snippet stub is callable)", async () => {
      (globalThis as any).window.Intercom = () => {};
      let captured = "";
      globalThis.fetch = (async (url: string | URL) => {
        captured = url.toString();
        return new Response(null);
      }) as any;
      expect(await intercom.detect()).toBe("loaded");
      expect(captured).toBe("https://widget.intercom.io/widget/");
    });

    it("blocked when probe fails", async () => {
      globalThis.fetch = (async () => {
        throw new TypeError();
      }) as any;
      expect(await intercom.detect()).toBe("blocked");
    });
  });
});
