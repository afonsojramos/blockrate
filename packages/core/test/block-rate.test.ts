import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from "vitest";
import { BlockRate, createProvider, ga4, isValidBlockRateResult, probe } from "../src/index";
import type { ProviderStatus } from "../src/types";

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
    vi.stubGlobal("navigator", { userAgent: "test-ua" });
  });

  afterAll(() => {
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).window;
    delete (globalThis as any).location;
    vi.unstubAllGlobals();
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

  it("contains a synchronous detector throw without losing healthy providers", async () => {
    const error = new Error("sync detector failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = vi.fn();
    try {
      const br = new BlockRate({
        providers: [
          createProvider({
            name: "broken",
            detect: () => {
              throw error;
            },
          }),
          createProvider({ name: "healthy", detect: async () => "loaded" }),
        ],
        reporter,
        delay: 0,
      });

      const result = await br.check();
      expect(result?.providers).toEqual([
        { name: "broken", status: "blocked", latency: expect.any(Number) },
        { name: "healthy", status: "loaded", latency: expect.any(Number) },
      ]);
      expect(reporter).toHaveBeenCalledExactlyOnceWith(result);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        '[blockrate] provider "broken" detect() threw:',
        error,
      );
    } finally {
      warn.mockRestore();
    }
  });

  describe("custom detector deadlines", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("bounds a never-settling custom detector at 3000 ms and reports healthy peers", async () => {
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [
          { name: "hanging", detect: () => new Promise(() => {}) },
          { name: "healthy", detect: async () => "loaded" },
        ],
        reporter,
        delay: 0,
      });
      const checking = br.check();
      await vi.advanceTimersByTimeAsync(2999);
      expect(reporter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reporter).toHaveBeenCalledOnce();
      const result = await checking;
      expect(result?.providers).toEqual([
        { name: "hanging", status: "blocked", latency: 3000 },
        { name: "healthy", status: "loaded", latency: 0 },
      ]);
      expect(reporter).toHaveBeenCalledWith(result);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        '[blockrate] provider "hanging" detect() threw:',
        expect.objectContaining({ message: "detect() timed out after 3000 ms" }),
      );
    });

    it.each([
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      60_001,
      2147483647,
      2147483648,
      "50",
      null,
      true,
    ])("rejects invalid provider timeoutMs %s at construction", (timeoutMs) => {
      expect(
        () =>
          new BlockRate({
            providers: [
              {
                name: "invalid",
                timeoutMs: timeoutMs as number,
                detect: async () => "loaded",
              },
            ],
            reporter: () => {},
            delay: 0,
          }),
      ).toThrow(RangeError);
    });

    it.each([undefined, 1, 3000, 5000, 60_000])(
      "accepts supported provider timeoutMs %s",
      (timeoutMs) => {
        expect(
          () =>
            new BlockRate({
              providers: [{ name: "valid", timeoutMs, detect: async () => "loaded" }],
              reporter: () => {},
            }),
        ).not.toThrow();
      },
    );

    it("keeps a late successful detector result within ingestion latency bounds", async () => {
      vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(60_001);
      const reporter = vi.fn();
      const result = await new BlockRate({
        providers: [{ name: "healthy", detect: async () => "loaded" }],
        reporter,
        delay: 0,
      }).check();

      expect(result?.providers).toEqual([{ name: "healthy", status: "loaded", latency: 60_000 }]);
      expect(isValidBlockRateResult(result)).toBe(true);
      expect(reporter).toHaveBeenCalledExactlyOnceWith(result);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps healthy detection before the deadline and clears the timer", async () => {
      let detectionSignal: AbortSignal | undefined;
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [
          {
            name: "healthy",
            timeoutMs: 50,
            detect: (signal) => {
              detectionSignal = signal;
              return new Promise((resolve) => setTimeout(() => resolve("loaded"), 25));
            },
          },
        ],
        reporter,
        delay: 0,
      });
      const checking = br.check();
      await vi.advanceTimersByTimeAsync(25);
      expect((await checking)?.providers).toEqual([
        { name: "healthy", status: "loaded", latency: 25 },
      ]);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(50);
      expect(detectionSignal?.aborted).toBe(false);
      expect(console.warn).not.toHaveBeenCalled();
      expect(reporter).toHaveBeenCalledOnce();
    });

    it.each(["sync", "async"])("clears timers after a %s detector failure", async (mode) => {
      const error = new Error("detector failed");
      const br = new BlockRate({
        providers: [
          {
            name: "broken",
            timeoutMs: 50,
            detect: () => {
              if (mode === "sync") throw error;
              return Promise.reject(error);
            },
          },
        ],
        reporter: () => {},
        delay: 0,
      });
      await expect(br.check()).resolves.toMatchObject({
        providers: [{ name: "broken", status: "blocked" }],
      });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(50);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        '[blockrate] provider "broken" detect() threw:',
        error,
      );
    });

    it("observes a late detector rejection without changing or reporting the result again", async () => {
      let rejectDetection!: (error: Error) => void;
      const detection = new Promise<ProviderStatus>((_, reject) => {
        rejectDetection = reject;
      });
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [{ name: "late", timeoutMs: 50, detect: () => detection }],
        reporter,
        delay: 0,
      });
      const checking = br.check();
      await vi.advanceTimersByTimeAsync(50);
      const result = await checking;
      expect(result?.providers).toEqual([{ name: "late", status: "blocked", latency: 50 }]);
      expect(vi.getTimerCount()).toBe(0);

      vi.useRealTimers();
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        rejectDetection(new Error("late detector failure"));
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(unhandled).not.toHaveBeenCalled();
        expect(reporter).toHaveBeenCalledExactlyOnceWith(result);
        expect(result?.providers[0].status).toBe("blocked");
        expect(console.warn).toHaveBeenCalledTimes(1);
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });

    it("marks an opted-in session synchronously before detection can settle", async () => {
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [{ name: "hanging", timeoutMs: 50, detect: () => new Promise(() => {}) }],
        reporter,
        delay: 0,
        sessionDedup: true,
      });
      const checking = br.check();
      expect(storage["__block_rate"]).toBe("1");
      await expect(br.check()).resolves.toBeNull();
      await vi.advanceTimersByTimeAsync(50);
      await expect(checking).resolves.toMatchObject({
        providers: [{ name: "hanging", status: "blocked" }],
      });
      expect(reporter).toHaveBeenCalledOnce();
    });

    it("repeats timed-out checks without storage writes when dedup is omitted", async () => {
      const detect = vi.fn(() => new Promise<ProviderStatus>(() => {}));
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [{ name: "hanging", timeoutMs: 50, detect }],
        reporter,
        delay: 0,
      });
      for (let i = 0; i < 2; i++) {
        const checking = br.check();
        await vi.advanceTimersByTimeAsync(50);
        await expect(checking).resolves.toMatchObject({
          providers: [{ name: "hanging", status: "blocked" }],
        });
      }
      expect(detect).toHaveBeenCalledTimes(2);
      expect(reporter).toHaveBeenCalledTimes(2);
      expect(storage).toEqual({});
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(["ga4", ga4])(
      "leaves built-in %s probe deadlines and blocked results unchanged",
      async (provider) => {
        const detect = vi.spyOn(ga4, "detect");
        let signal: AbortSignal | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(
          (_url, init) =>
            new Promise((_, reject) => {
              signal = init?.signal ?? undefined;
              signal?.addEventListener("abort", () => reject(new Error("probe aborted")), {
                once: true,
              });
            }),
        );
        const br = new BlockRate({ providers: [provider], reporter: () => {}, delay: 0 });
        const checking = br.check();
        expect(detect).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(vi.getTimerCount()).toBe(1);
        await vi.advanceTimersByTimeAsync(3000);
        expect((await checking)?.providers).toEqual([
          { name: "ga4", status: "blocked", latency: 3000 },
        ]);
        expect(signal?.aborted).toBe(true);
        expect(console.warn).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it("honors an explicit deadline on a built-in provider instance", async () => {
      const detect = vi.spyOn(ga4, "detect");
      let probeSignal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url, init) =>
          new Promise((_, reject) => {
            probeSignal = init?.signal ?? undefined;
            probeSignal?.addEventListener("abort", () => reject(new Error("probe aborted")), {
              once: true,
            });
          }),
      );
      const previousTimeout = ga4.timeoutMs;
      ga4.timeoutMs = 50;
      try {
        const reporter = vi.fn();
        const br = new BlockRate({ providers: [ga4], reporter, delay: 0 });
        const checking = br.check();
        const detectionSignal = detect.mock.calls[0][0];
        expect(detectionSignal).toBeInstanceOf(AbortSignal);
        expect(vi.getTimerCount()).toBe(2);
        await vi.advanceTimersByTimeAsync(50);
        const result = await checking;
        expect(result?.providers).toEqual([{ name: "ga4", status: "blocked", latency: 50 }]);
        expect(reporter).toHaveBeenCalledExactlyOnceWith(result);
        expect(detectionSignal?.aborted).toBe(true);
        expect(probeSignal?.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(1);
        await vi.advanceTimersByTimeAsync(2950);
        expect(probeSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        expect(reporter).toHaveBeenCalledOnce();
      } finally {
        if (previousTimeout === undefined) delete ga4.timeoutMs;
        else ga4.timeoutMs = previousTimeout;
      }
    });

    it("allows a longer custom deadline without changing an explicit probe timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response(null)), 4000)),
      );
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [
          {
            name: "long-probe",
            timeoutMs: 6000,
            detect: () => probe("https://example.test/probe", 5000),
          },
        ],
        reporter,
        delay: 0,
      });
      const checking = br.check();
      await vi.advanceTimersByTimeAsync(3000);
      expect(reporter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect((await checking)?.providers).toEqual([
        { name: "long-probe", status: "loaded", latency: 4000 },
      ]);
      expect(console.warn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("honors a custom provider's timeoutMs override", async () => {
      const reporter = vi.fn();
      const br = new BlockRate({
        providers: [
          createProvider({
            name: "hanging",
            timeoutMs: 50,
            detect: () => new Promise(() => {}),
          }),
        ],
        reporter,
        delay: 0,
      });
      const checking = br.check();
      await vi.advanceTimersByTimeAsync(49);
      expect(reporter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reporter).toHaveBeenCalledOnce();
      expect((await checking)?.providers).toEqual([
        { name: "hanging", status: "blocked", latency: 50 },
      ]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("aborts cooperative detection on expiry without accepting an abort-time loaded result", async () => {
      let detectionSignal: AbortSignal | undefined;
      const br = new BlockRate({
        providers: [
          {
            name: "cooperative",
            timeoutMs: 50,
            detect: (signal?: AbortSignal) => {
              detectionSignal = signal;
              return new Promise((resolve) => {
                signal?.addEventListener("abort", () => resolve("loaded"), { once: true });
              });
            },
          },
        ],
        reporter: () => {},
        delay: 0,
      });

      const checking = br.check();
      expect(detectionSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(50);
      expect(detectionSignal?.aborted).toBe(true);
      await expect(checking).resolves.toMatchObject({
        providers: [{ name: "cooperative", status: "blocked", latency: 50 }],
      });
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        '[blockrate] provider "cooperative" detect() threw:',
        expect.objectContaining({ message: "detect() timed out after 50 ms" }),
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("starts the deadline after the configured delay even without AbortController", async () => {
      const abortController = globalThis.AbortController;
      vi.stubGlobal("AbortController", undefined);
      try {
        const detect = vi.fn(() => new Promise<ProviderStatus>(() => {}));
        const reporter = vi.fn();
        const br = new BlockRate({
          providers: [{ name: "hanging", timeoutMs: 50, detect }],
          reporter,
          delay: 100,
        });
        const checking = br.check();
        await vi.advanceTimersByTimeAsync(99);
        expect(detect).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(50);
        expect(detect).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(reporter).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await expect(checking).resolves.toMatchObject({
          providers: [{ name: "hanging", status: "blocked", latency: 50 }],
        });
        expect(reporter).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.stubGlobal("AbortController", abortController);
      }
    });
  });

  it("handles detect() errors as blocked", async () => {
    let received: any = null;
    const origWarn = console.warn;
    console.warn = () => {};
    try {
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
    } finally {
      console.warn = origWarn;
    }
    expect(received.providers[0].status).toBe("blocked");
  });

  it("logs (does not silently swallow) when detect() throws", async () => {
    const warnings: unknown[][] = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
    };
    try {
      const br = new BlockRate({
        providers: [
          {
            name: "boom",
            detect: async () => {
              throw new Error("kaboom");
            },
          },
        ],
        reporter: () => {},
        delay: 0,
      });
      await br.check();
    } finally {
      console.warn = origWarn;
    }
    expect(warnings.length).toBe(1);
    expect(String(warnings[0][0])).toContain("[blockrate]");
    expect(String(warnings[0][0])).toContain("boom");
  });

  it("contains and warns on a synchronous reporter throw", async () => {
    const error = new Error("reporter exploded");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const br = new BlockRate({
        providers: [{ name: "a", detect: async () => "loaded" }],
        reporter: () => {
          throw error;
        },
        delay: 0,
      });
      await expect(br.check()).resolves.toMatchObject({
        providers: [{ name: "a", status: "loaded" }],
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith("[blockrate] reporter threw:", error);
    } finally {
      warn.mockRestore();
    }
  });

  it("observes an async reporter rejection without an unhandled rejection", async () => {
    const error = new Error("async reporter failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const br = new BlockRate({
        providers: [{ name: "a", detect: async () => "loaded" }],
        reporter: async () => {
          throw error;
        },
        delay: 0,
      });
      await expect(br.check()).resolves.toMatchObject({
        providers: [{ name: "a", status: "loaded" }],
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith("[blockrate] reporter threw:", error);
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
    }
  });

  it("observes a reporter rejection that arrives after check has resolved", async () => {
    const error = new Error("late reporter failure");
    let rejectReporting!: (error: Error) => void;
    const reporting = new Promise<void>((_, reject) => {
      rejectReporting = reject;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const br = new BlockRate({
        providers: [{ name: "a", detect: async () => "loaded" }],
        reporter: () => reporting,
        delay: 0,
      });
      await expect(br.check()).resolves.toMatchObject({
        providers: [{ name: "a", status: "loaded" }],
      });
      rejectReporting(error);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith("[blockrate] reporter threw:", error);
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
    }
  });

  it("contains detector and reporter errors even when console.warn throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("console failed");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const br = new BlockRate({
        providers: [
          {
            name: "broken",
            detect: () => {
              throw new Error("detector failed");
            },
          },
        ],
        reporter: async () => {
          throw new Error("reporter failed");
        },
        delay: 0,
      });
      await expect(br.check()).resolves.toMatchObject({
        providers: [{ name: "broken", status: "blocked" }],
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
    }
  });

  it("returns the result without waiting for a hanging reporter", async () => {
    const br = new BlockRate({
      providers: [{ name: "a", detect: async () => "loaded" }],
      reporter: () => new Promise<void>(() => {}),
      delay: 0,
    });
    await expect(br.check()).resolves.toMatchObject({
      providers: [{ name: "a", status: "loaded" }],
    });
  }, 1000);
});
