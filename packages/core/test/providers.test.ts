import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { optimizely, posthog, ga4, hotjar, metaPixel } from "../src/providers";

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

describe("providers", () => {
  beforeEach(() => {
    (globalThis as any).window = {};
  });

  it("optimizely: loaded when window.optimizely present", async () => {
    (globalThis as any).window.optimizely = {};
    expect(await optimizely.detect()).toBe("loaded");
  });

  it("optimizely: blocked when probe fails", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError();
    }) as any;
    expect(await optimizely.detect()).toBe("blocked");
  });

  it("posthog: loaded when window.posthog present", async () => {
    (globalThis as any).window.posthog = {};
    expect(await posthog.detect()).toBe("loaded");
  });

  it("ga4: loaded when window.gtag present", async () => {
    (globalThis as any).window.gtag = () => {};
    expect(await ga4.detect()).toBe("loaded");
  });

  it("ga4: loaded when dataLayer has entries", async () => {
    (globalThis as any).window.dataLayer = [{ event: "x" }];
    expect(await ga4.detect()).toBe("loaded");
  });

  it("ga4: blocked when probe fails and no globals", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError();
    }) as any;
    expect(await ga4.detect()).toBe("blocked");
  });

  it("ga4: probes the google-analytics collect endpoint when no globals", async () => {
    let captured = "";
    globalThis.fetch = (async (url: string | URL) => {
      captured = url.toString();
      return new Response(null);
    }) as any;
    await ga4.detect();
    expect(captured).toBe("https://www.google-analytics.com/g/collect");
  });

  it("hotjar: loaded when window.hj present", async () => {
    (globalThis as any).window.hj = () => {};
    expect(await hotjar.detect()).toBe("loaded");
  });

  it("hotjar: blocked when probe fails and no globals", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError();
    }) as any;
    expect(await hotjar.detect()).toBe("blocked");
  });

  it("hotjar: probes script.hotjar.com when no globals", async () => {
    let captured = "";
    globalThis.fetch = (async (url: string | URL) => {
      captured = url.toString();
      return new Response(null);
    }) as any;
    await hotjar.detect();
    expect(captured).toBe("https://script.hotjar.com/");
  });

  it("meta-pixel: loaded when window.fbq present", async () => {
    (globalThis as any).window.fbq = () => {};
    expect(await metaPixel.detect()).toBe("loaded");
  });

  it("meta-pixel: loaded when image probe fires onload", async () => {
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as any).Image = Img;
    expect(await metaPixel.detect()).toBe("loaded");
  });

  it("meta-pixel: blocked when image probe fires onerror", async () => {
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    (globalThis as any).Image = Img;
    expect(await metaPixel.detect()).toBe("blocked");
  });

  it("meta-pixel: probes the facebook.com/tr pixel endpoint when no globals", async () => {
    let captured = "";
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        captured = url;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as any).Image = Img;
    await metaPixel.detect();
    expect(captured).toBe("https://www.facebook.com/tr?id=0&ev=PageView");
  });
});
