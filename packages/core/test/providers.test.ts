import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { optimizely, posthog, ga4 } from "../src/providers";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
});
