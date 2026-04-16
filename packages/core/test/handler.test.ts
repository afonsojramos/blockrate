import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createWebHandler, type ForwardError } from "../src/handler";
import { isValidBlockRateResult } from "../src/validate";
import type { BlockRateResult } from "../src/types";

const validPayload: BlockRateResult = {
  timestamp: "2026-04-16T12:00:00.000Z",
  url: "/test",
  userAgent: "Chrome 131",
  providers: [
    { name: "optimizely", status: "loaded", latency: 123 },
    { name: "posthog", status: "blocked", latency: 42 },
  ],
};

type FetchCall = { url: string; init: RequestInit };
type FetchBehavior =
  | { kind: "ok" }
  | { kind: "error"; status: number; body?: string }
  | { kind: "reject"; cause: unknown }
  | { kind: "honor-abort" };

function installFetchMock(behavior: FetchBehavior): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url, init });
    if (behavior.kind === "reject") throw behavior.cause;
    if (behavior.kind === "honor-abort") {
      // Wait for abort; reject with a name='AbortError' error
      return await new Promise((_, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        if (!signal) {
          return reject(new Error("no signal on fetch"));
        }
        if (signal.aborted) {
          const err = new Error("aborted");
          err.name = "AbortError";
          return reject(err);
        }
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    if (behavior.kind === "ok") {
      return new Response(null, { status: 204 });
    }
    return new Response(behavior.body ?? "", { status: behavior.status });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/block-rate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("createWebHandler", () => {
  let consoleErrors: unknown[][];
  let originalError: typeof console.error;

  beforeEach(() => {
    consoleErrors = [];
    originalError = console.error;
    console.error = ((...args: unknown[]) => {
      consoleErrors.push(args);
    }) as typeof console.error;
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("returns 204 on a valid payload with no forward or onResult", async () => {
    const handle = createWebHandler();
    const res = await handle(makePost(validPayload));
    expect(res.status).toBe(204);
  });

  it("returns 400 on invalid JSON", async () => {
    const handle = createWebHandler();
    const res = await handle(makePost("not json {"));
    expect(res.status).toBe(400);
  });

  it("returns 400 on a valid-JSON-but-wrong-shape payload", async () => {
    const handle = createWebHandler();
    const res = await handle(makePost({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on a payload missing providers — no forward or onResult fires", async () => {
    const mock = installFetchMock({ kind: "ok" });
    let onResultCalls = 0;
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_test" },
        onResult: () => {
          onResultCalls++;
        },
      });
      const res = await handle(
        makePost({
          timestamp: "2026-04-16T12:00:00.000Z",
          url: "/x",
          userAgent: "ua",
          providers: [],
        }),
      );
      expect(res.status).toBe(400);
      expect(mock.calls).toHaveLength(0);
      expect(onResultCalls).toBe(0);
    } finally {
      mock.restore();
    }
  });

  it("forwards with correct URL, headers, and body", async () => {
    const mock = installFetchMock({ kind: "ok" });
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_test_key" },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(mock.calls).toHaveLength(1);
      const call = mock.calls[0];
      expect(call.url).toBe("https://blockrate.app/api/ingest");
      expect(call.init.method).toBe("POST");
      const headers = call.init.headers as Record<string, string>;
      expect(headers["x-blockrate-key"]).toBe("br_test_key");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(call.init.body as string)).toEqual(validPayload);
    } finally {
      mock.restore();
    }
  });

  it("honors a custom endpoint (no trailing slash)", async () => {
    const mock = installFetchMock({ kind: "ok" });
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x", endpoint: "https://staging.blockrate.app/api" },
      });
      await handle(makePost(validPayload));
      expect(mock.calls[0].url).toBe("https://staging.blockrate.app/api/ingest");
    } finally {
      mock.restore();
    }
  });

  it("honors a custom endpoint (trailing slash stripped)", async () => {
    const mock = installFetchMock({ kind: "ok" });
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x", endpoint: "https://staging.blockrate.app/api/" },
      });
      await handle(makePost(validPayload));
      expect(mock.calls[0].url).toBe("https://staging.blockrate.app/api/ingest");
    } finally {
      mock.restore();
    }
  });

  it("invokes onError on upstream 401 and still returns 204", async () => {
    const mock = installFetchMock({ kind: "error", status: 401, body: "unauthorized" });
    const errors: ForwardError[] = [];
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_rotated", onError: (e) => errors.push(e) },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(errors).toHaveLength(1);
      expect(errors[0].kind).toBe("upstream");
      if (errors[0].kind === "upstream") {
        expect(errors[0].status).toBe(401);
        expect(errors[0].body).toBe("unauthorized");
      }
    } finally {
      mock.restore();
    }
  });

  it("invokes onError on a rejected fetch with kind:network", async () => {
    const cause = new Error("ECONNRESET");
    const mock = installFetchMock({ kind: "reject", cause });
    const errors: ForwardError[] = [];
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x", onError: (e) => errors.push(e) },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(errors).toHaveLength(1);
      expect(errors[0].kind).toBe("network");
      if (errors[0].kind === "network") expect(errors[0].cause).toBe(cause);
    } finally {
      mock.restore();
    }
  });

  it("times out and fires onError when upstream hangs", async () => {
    const mock = installFetchMock({ kind: "honor-abort" });
    const errors: ForwardError[] = [];
    try {
      const handle = createWebHandler({
        forward: {
          apiKey: "br_x",
          timeoutMs: 10,
          onError: (e) => errors.push(e),
        },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(errors).toHaveLength(1);
      expect(errors[0].kind).toBe("network");
    } finally {
      mock.restore();
    }
  });

  it("never exposes the API key to onError", async () => {
    const mock = installFetchMock({ kind: "error", status: 500, body: "boom" });
    const errors: ForwardError[] = [];
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_secret_value", onError: (e) => errors.push(e) },
      });
      await handle(makePost(validPayload));
      const serialized = JSON.stringify(errors);
      expect(serialized).not.toContain("br_secret_value");
    } finally {
      mock.restore();
    }
  });

  it("runs forward and onResult in parallel on a valid payload", async () => {
    const mock = installFetchMock({ kind: "ok" });
    let received: BlockRateResult | null = null;
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x" },
        onResult: (r) => {
          received = r;
        },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(received).toEqual(validPayload);
      expect(mock.calls).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });

  it("isolates onResult errors — forward still completes and browser gets 204", async () => {
    const mock = installFetchMock({ kind: "ok" });
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x" },
        onResult: () => {
          throw new Error("onResult boom");
        },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(mock.calls).toHaveLength(1);
      // console.error was called once with the onResult error
      expect(consoleErrors.length).toBeGreaterThanOrEqual(1);
      const flat = JSON.stringify(consoleErrors);
      expect(flat).toContain("onResult");
    } finally {
      mock.restore();
    }
  });

  it("isolates forward failures — onResult still receives the payload", async () => {
    const mock = installFetchMock({ kind: "error", status: 500 });
    let received: BlockRateResult | null = null;
    try {
      const handle = createWebHandler({
        forward: { apiKey: "br_x", onError: () => {} },
        onResult: (r) => {
          received = r;
        },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
      expect(received).toEqual(validPayload);
    } finally {
      mock.restore();
    }
  });

  it("swallows errors thrown by the onError callback itself", async () => {
    const mock = installFetchMock({ kind: "error", status: 500 });
    try {
      const handle = createWebHandler({
        forward: {
          apiKey: "br_x",
          onError: () => {
            throw new Error("logger boom");
          },
        },
      });
      const res = await handle(makePost(validPayload));
      expect(res.status).toBe(204);
    } finally {
      mock.restore();
    }
  });

  describe("construction-time API key validation", () => {
    it("throws when apiKey is missing", () => {
      expect(() =>
        createWebHandler({ forward: { apiKey: undefined as unknown as string } }),
      ).toThrow(/apiKey is required/);
    });

    it("throws when apiKey is an empty string", () => {
      expect(() => createWebHandler({ forward: { apiKey: "" } })).toThrow(/apiKey is required/);
    });

    it("throws when apiKey does not start with br_", () => {
      expect(() => createWebHandler({ forward: { apiKey: "sk_live_abc" } })).toThrow(
        /expected format/,
      );
    });

    it("throws when apiKey contains disallowed characters", () => {
      expect(() => createWebHandler({ forward: { apiKey: "br_has space" } })).toThrow(
        /expected format/,
      );
    });

    it("accepts a well-formed br_ key", () => {
      expect(() => createWebHandler({ forward: { apiKey: "br_AbC-123_xyz" } })).not.toThrow();
    });

    it("does not require apiKey when forward is not set", () => {
      expect(() => createWebHandler({ onResult: () => {} })).not.toThrow();
    });
  });
});

describe("isValidBlockRateResult", () => {
  it("accepts the canonical valid payload", () => {
    expect(isValidBlockRateResult(validPayload)).toBe(true);
  });

  it("accepts a payload with optional service", () => {
    expect(isValidBlockRateResult({ ...validPayload, service: "billing" })).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidBlockRateResult(null)).toBe(false);
    expect(isValidBlockRateResult(undefined)).toBe(false);
    expect(isValidBlockRateResult("string")).toBe(false);
    expect(isValidBlockRateResult(42)).toBe(false);
    expect(isValidBlockRateResult([])).toBe(false);
  });

  it("rejects an unparsable timestamp", () => {
    expect(isValidBlockRateResult({ ...validPayload, timestamp: "not-a-date" })).toBe(false);
  });

  it("rejects an empty providers array", () => {
    expect(isValidBlockRateResult({ ...validPayload, providers: [] })).toBe(false);
  });

  it("rejects a providers array longer than 64", () => {
    const providers = Array.from({ length: 65 }, (_, i) => ({
      name: `p${i}`,
      status: "loaded" as const,
      latency: 1,
    }));
    expect(isValidBlockRateResult({ ...validPayload, providers })).toBe(false);
  });

  it("rejects unknown provider status", () => {
    expect(
      isValidBlockRateResult({
        ...validPayload,
        providers: [{ name: "x", status: "maybe", latency: 1 }],
      }),
    ).toBe(false);
  });

  it("rejects non-integer latency", () => {
    expect(
      isValidBlockRateResult({
        ...validPayload,
        providers: [{ name: "x", status: "loaded", latency: 1.5 }],
      }),
    ).toBe(false);
  });

  it("rejects latency over 60_000", () => {
    expect(
      isValidBlockRateResult({
        ...validPayload,
        providers: [{ name: "x", status: "loaded", latency: 60_001 }],
      }),
    ).toBe(false);
  });

  it("rejects url over 2048 chars", () => {
    expect(isValidBlockRateResult({ ...validPayload, url: "a".repeat(2049) })).toBe(false);
  });

  it("rejects userAgent over 1024 chars", () => {
    expect(isValidBlockRateResult({ ...validPayload, userAgent: "a".repeat(1025) })).toBe(false);
  });

  it("rejects empty service string", () => {
    expect(isValidBlockRateResult({ ...validPayload, service: "" })).toBe(false);
  });

  it("rejects service over 64 chars", () => {
    expect(isValidBlockRateResult({ ...validPayload, service: "s".repeat(65) })).toBe(false);
  });
});

describe("contract with upstream blockRatePayloadSchema", () => {
  // Ensures anything the core validator accepts, the upstream zod schema
  // also accepts. This guards against silent divergence between the two.
  it("upstream schema accepts what core accepts", async () => {
    const { blockRatePayloadSchema } = await import("blockrate-server/validate");
    const cases: BlockRateResult[] = [
      validPayload,
      { ...validPayload, service: "billing" },
      {
        ...validPayload,
        providers: [{ name: "p", status: "loaded", latency: 0 }],
      },
      {
        ...validPayload,
        providers: [{ name: "p", status: "blocked", latency: 60_000 }],
      },
    ];
    for (const c of cases) {
      expect(isValidBlockRateResult(c)).toBe(true);
      const parsed = blockRatePayloadSchema.safeParse(c);
      expect(parsed.success).toBe(true);
    }
  });

  it("both validators reject the same obvious failures", async () => {
    const { blockRatePayloadSchema } = await import("blockrate-server/validate");
    const bad: unknown[] = [
      null,
      {},
      { ...validPayload, providers: [] },
      { ...validPayload, providers: [{ name: "x", status: "nope", latency: 1 }] },
      { ...validPayload, providers: [{ name: "x", status: "loaded", latency: -1 }] },
      { ...validPayload, timestamp: "not-a-date" },
      { ...validPayload, userAgent: "a".repeat(1025) },
    ];
    for (const c of bad) {
      expect(isValidBlockRateResult(c)).toBe(false);
      const parsed = blockRatePayloadSchema.safeParse(c);
      expect(parsed.success).toBe(false);
    }
  });
});
