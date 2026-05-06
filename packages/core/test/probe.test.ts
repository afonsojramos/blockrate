import { describe, it, expect, afterEach } from "bun:test";
import { probe, probeImage } from "../src/probe";

const originalFetch = globalThis.fetch;
const originalImage = (globalThis as any).Image;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalImage === undefined) {
    delete (globalThis as any).Image;
  } else {
    (globalThis as any).Image = originalImage;
  }
});

describe("probe", () => {
  it("returns loaded on successful fetch (no retry)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(null);
    }) as any;
    expect(await probe("https://example.com")).toBe("loaded");
    expect(calls).toBe(1);
  });

  it("returns blocked when both attempts fail", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("blocked");
    }) as any;
    expect(await probe("https://example.com")).toBe("blocked");
    expect(calls).toBe(2);
  });

  it("returns loaded when a transient first failure is followed by a success", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw new TypeError("transient");
      return new Response(null);
    }) as any;
    expect(await probe("https://example.com")).toBe("loaded");
    expect(calls).toBe(2);
  });
});

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => FakeImage.trigger(this));
  }
  static mode: "load" | "error" | "hang" = "load";
  static trigger(instance: FakeImage) {
    if (FakeImage.mode === "load") instance.onload?.();
    else if (FakeImage.mode === "error") instance.onerror?.();
    // "hang" intentionally does nothing — tests rely on timeout fallback
  }
}

describe("probeImage", () => {
  it("returns loaded when the image fires onload", async () => {
    FakeImage.mode = "load";
    (globalThis as any).Image = FakeImage;
    expect(await probeImage("https://example.com/pixel.gif")).toBe("loaded");
  });

  it("returns blocked when the image fires onerror", async () => {
    FakeImage.mode = "error";
    (globalThis as any).Image = FakeImage;
    expect(await probeImage("https://example.com/pixel.gif")).toBe("blocked");
  });

  it("returns blocked when neither event fires before timeout", async () => {
    FakeImage.mode = "hang";
    (globalThis as any).Image = FakeImage;
    expect(await probeImage("https://example.com/pixel.gif", 50)).toBe("blocked");
  });

  it("returns blocked when Image is undefined (SSR / node context)", async () => {
    delete (globalThis as any).Image;
    expect(await probeImage("https://example.com/pixel.gif")).toBe("blocked");
  });
});
