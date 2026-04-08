import { describe, it, expect, beforeEach } from "bun:test";
import { BlockRate, createProvider } from "../src/index";

const storage: Record<string, string> = {};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = v;
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
};
(globalThis as any).window = {};
(globalThis as any).location = { pathname: "/test" };
(globalThis as any).navigator = { userAgent: "test-ua" };

describe("BlockRate", () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it("runs checks and reports results", async () => {
    const loaded = createProvider({
      name: "a",
      detect: async () => "loaded",
    });
    const blocked = createProvider({
      name: "b",
      detect: async () => "blocked",
    });

    let received: any = null;
    const br = new BlockRate({
      providers: [loaded, blocked],
      reporter: (r) => {
        received = r;
      },
      delay: 0,
    });

    const result = await br.check();
    expect(result).not.toBeNull();
    expect(received.providers).toHaveLength(2);
    expect(received.providers[0]).toMatchObject({ name: "a", status: "loaded" });
    expect(received.providers[1]).toMatchObject({ name: "b", status: "blocked" });
    expect(received.url).toBe("/test");
    expect(received.userAgent).toBe("test-ua");
  });

  it("dedupes per session", async () => {
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
    });
    await br.check();
    await br.check();
    expect(calls).toBe(1);
  });

  it("skips when sampleRate is 0", async () => {
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
      sampleRate: 0,
    });
    const result = await br.check();
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("handles detect() errors as blocked", async () => {
    let received: any = null;
    const br = new BlockRate({
      providers: [
        {
          name: "boom",
          detect: async () => {
            throw new Error("nope");
          },
        },
      ],
      reporter: (r) => {
        received = r;
      },
      delay: 0,
    });
    await br.check();
    expect(received.providers[0].status).toBe("blocked");
  });
});
