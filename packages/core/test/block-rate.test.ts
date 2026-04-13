import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { BlockRate, createProvider } from "../src/index";

const storage: Record<string, string> = {};

describe("BlockRate", () => {
  beforeAll(() => {
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
  });

  afterAll(() => {
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).window;
    delete (globalThis as any).location;
    delete (globalThis as any).navigator;
  });

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

  it("dedupes per session when sessionDedup is enabled", async () => {
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
      sessionDedup: true,
    });
    await br.check();
    await br.check();
    expect(calls).toBe(1);
  });

  it("does NOT dedupe when sessionDedup is false (the default)", async () => {
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
    expect(calls).toBe(2);
  });

  it("never writes to sessionStorage when sessionDedup is false", async () => {
    let writeCount = 0;
    const origSetItem = (globalThis as any).sessionStorage.setItem;
    (globalThis as any).sessionStorage.setItem = (k: string, v: string) => {
      writeCount++;
      origSetItem(k, v);
    };

    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {},
      delay: 0,
    });
    await br.check();

    (globalThis as any).sessionStorage.setItem = origSetItem;
    expect(writeCount).toBe(0);
  });

  it("is a no-op when consentGiven is false", async () => {
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
      consentGiven: false,
    });
    const result = await br.check();
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("is a no-op when consentGiven returns false", async () => {
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
      consentGiven: () => false,
    });
    const result = await br.check();
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("re-evaluates consentGiven on each check() call", async () => {
    let allowed = false;
    let calls = 0;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => {
        calls++;
      },
      delay: 0,
      consentGiven: () => allowed,
    });
    await br.check();
    expect(calls).toBe(0);
    allowed = true;
    await br.check();
    expect(calls).toBe(1);
  });

  it("applies sanitizeUrl to location.pathname before reporting", async () => {
    let received: any = null;
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: (r) => {
        received = r;
      },
      delay: 0,
      sanitizeUrl: (path) => path.replace(/\/test/, "/:sanitized"),
    });
    await br.check();
    expect(received.url).toBe("/:sanitized");
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
