import { describe, it, expect, afterEach } from "bun:test";
import { probe } from "../src/probe";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("probe", () => {
  it("returns loaded on successful fetch", async () => {
    globalThis.fetch = (async () => new Response(null)) as any;
    expect(await probe("https://example.com")).toBe("loaded");
  });

  it("returns blocked on fetch error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("blocked");
    }) as any;
    expect(await probe("https://example.com")).toBe("blocked");
  });
});
