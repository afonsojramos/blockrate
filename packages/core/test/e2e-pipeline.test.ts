/**
 * End-to-end pipeline test: client → core handler → server → store →
 * stats. The hop most often broken is the validator-parity one — core's
 * lightweight validator and the server's zod schema must agree byte-for-
 * byte, otherwise customers see 400s on payloads that pass core's
 * pre-flight check. The existing tests cover each leg in isolation; this
 * one fires a real request through every leg of the customer-facing
 * path against an in-process server bound to an ephemeral port.
 *
 * What this catches that unit tests don't:
 *   - Drift between core and server validators.
 *   - Drift between core's `forward.endpoint` URL composition and the
 *     server's route table.
 *   - Drift between the dashboard's avgLatency aggregation (loaded-only,
 *     fixed in PR #5) and what shows up via /stats end-to-end.
 *   - Customer `onError` actually firing on upstream non-2xx.
 *
 * Real Node HTTP, fetch and JSON; detector timing can be controlled.
 * Slower than the unit tests but still well under a second.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BlockRate, createProvider, isValidBlockRateResult } from "../src/index";
import { createWebHandler } from "../src/handler";
import type { ForwardError } from "../src/handler";
import type { BlockRateResult } from "../src/types";
import { serve, type ServerType } from "@hono/node-server";
import { once } from "node:events";
import { createServer } from "blockrate-server";

const TEST_API_KEY = "br_e2e_test_key_xxxxxxxxxxxx";

interface Harness {
  app: Awaited<ReturnType<typeof createServer>>;
  server: ServerType;
  endpoint: string;
  stop: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  process.env.BLOCK_RATE_BOOTSTRAP_KEY = TEST_API_KEY;
  process.env.BLOCK_RATE_BOOTSTRAP_NAME = "e2e";
  const app = await createServer({ dbPath: ":memory:" });
  const server = serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing HTTP address");
  return {
    app,
    server,
    endpoint: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await app.store.close();
    },
  };
}

function samplePayload(overrides: Partial<BlockRateResult> = {}): BlockRateResult {
  return {
    timestamp: new Date().toISOString(),
    url: "/checkout",
    userAgent: "Mozilla/5.0 e2e",
    providers: [
      { name: "optimizely", status: "blocked", latency: 8 },
      { name: "optimizely", status: "blocked", latency: 12 },
      { name: "optimizely", status: "loaded", latency: 6 },
      { name: "posthog", status: "loaded", latency: 5 },
    ],
    ...overrides,
  };
}

describe("e2e pipeline (client → core handler → server → stats)", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it("delivers healthy, throwing and timed-out detector results through the real pipeline", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { pathname: "/checkout" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const handler = createWebHandler({
        forward: { apiKey: TEST_API_KEY, endpoint: harness.endpoint },
      });
      let delivery: Promise<Response> | undefined;
      const br = new BlockRate({
        providers: [
          createProvider({ name: "healthy", detect: async () => "loaded" }),
          createProvider({
            name: "throwing",
            detect: () => {
              throw new Error("detector failed");
            },
          }),
          createProvider({
            name: "hanging",
            timeoutMs: 10,
            detect: () => new Promise(() => {}),
          }),
        ],
        reporter: (result) => {
          delivery = handler(
            new Request("http://customer.test/api/block-rate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(result),
            }),
          );
          return delivery;
        },
        delay: 0,
      });

      const result = await br.check();
      expect(result?.providers.map(({ name, status }) => ({ name, status }))).toEqual([
        { name: "healthy", status: "loaded" },
        { name: "throwing", status: "blocked" },
        { name: "hanging", status: "blocked" },
      ]);
      expect((await delivery)?.status).toBe(204);
      const tenant = await harness.app.store.findTenantByApiKey(TEST_API_KEY);
      const stats = await harness.app.store.getStats({ tenantId: tenant!.id, since: new Date(0) });
      expect(stats.map(({ provider, total, blocked }) => ({ provider, total, blocked }))).toEqual(
        expect.arrayContaining([
          { provider: "healthy", total: 1, blocked: 0 },
          { provider: "throwing", total: 1, blocked: 1 },
          { provider: "hanging", total: 1, blocked: 1 },
        ]),
      );
      expect(stats).toHaveLength(3);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each([60_000, 60_001])(
    "ingests a maximum-deadline expiry measured at %i ms with its healthy peer",
    async (elapsedMs) => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("location", { pathname: "/checkout" });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const reporter = vi.fn();
      let elapsed = 0;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const now = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
      try {
        const checking = new BlockRate({
          providers: [
            { name: "healthy", detect: async () => "loaded" },
            { name: "hanging", timeoutMs: 60_000, detect: () => new Promise(() => {}) },
          ],
          reporter,
          delay: 0,
        }).check();
        await vi.advanceTimersByTimeAsync(0);
        elapsed = elapsedMs;
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await checking;
        vi.useRealTimers();
        now.mockRestore();

        expect(reporter).toHaveBeenCalledExactlyOnceWith(result);
        expect(isValidBlockRateResult(result)).toBe(true);
        expect(result?.providers).toEqual([
          { name: "healthy", status: "loaded", latency: 0 },
          { name: "hanging", status: "blocked", latency: 60_000 },
        ]);
        const handler = createWebHandler({
          forward: { apiKey: TEST_API_KEY, endpoint: harness.endpoint },
        });
        const response = await handler(
          new Request("http://customer.test/api/block-rate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(result),
          }),
        );
        expect(response.status).toBe(204);
        const tenant = await harness.app.store.findTenantByApiKey(TEST_API_KEY);
        const stats = await harness.app.store.getStats({
          tenantId: tenant!.id,
          since: new Date(0),
        });
        expect(stats.map(({ provider, total, blocked }) => ({ provider, total, blocked }))).toEqual(
          expect.arrayContaining([
            { provider: "healthy", total: 1, blocked: 0 },
            { provider: "hanging", total: 1, blocked: 1 },
          ]),
        );
        expect(stats).toHaveLength(2);
      } finally {
        vi.useRealTimers();
        now.mockRestore();
        warn.mockRestore();
        vi.unstubAllGlobals();
      }
    },
  );

  it("forwards a valid payload through every leg and surfaces it via /stats", async () => {
    const handler = createWebHandler({
      forward: { apiKey: TEST_API_KEY, endpoint: harness.endpoint },
    });

    const response = await handler(
      new Request("http://customer.test/api/block-rate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(samplePayload()),
      }),
    );

    expect(response.status).toBe(204);

    const tenant = await harness.app.store.findTenantByApiKey(TEST_API_KEY);
    expect(tenant).not.toBeNull();
    const stats = await harness.app.store.getStats({
      tenantId: tenant!.id,
      since: new Date(Date.now() - 86_400_000),
    });
    const optimizely = stats.find((s) => s.provider === "optimizely")!;
    expect(optimizely.total).toBe(3);
    expect(optimizely.blocked).toBe(2);
    expect(optimizely.blockRate).toBeCloseTo(2 / 3);
    // Validates the avgLatency fix from PR #5: blocked latencies (8, 12)
    // are excluded; only the loaded latency (6) counts.
    expect(optimizely.avgLatency).toBe(6);
    const posthog = stats.find((s) => s.provider === "posthog")!;
    expect(posthog.total).toBe(1);
    expect(posthog.avgLatency).toBe(5);
  });

  it("validator parity — anything core's isValidBlockRateResult accepts, server's zod schema also accepts", async () => {
    // Send a payload at the *edges* of what core accepts: every optional
    // field set, max-length URL, max-length UA, fractional millisecond
    // latencies rounded to integer (the boundary the validators agreed
    // on in core/validate.ts and server/validate.ts).
    const handler = createWebHandler({
      forward: { apiKey: TEST_API_KEY, endpoint: harness.endpoint },
    });
    const payload: BlockRateResult = {
      timestamp: new Date().toISOString(),
      url: "/" + "a".repeat(2047), // max URL length per validate.ts:32
      userAgent: "x".repeat(1024), // max UA length per validate.ts:34
      service: "checkout-svc",
      providers: [
        { name: "optimizely", status: "blocked", latency: 0 },
        { name: "posthog", status: "loaded", latency: 60_000 }, // max latency per validate.ts:55
      ],
    };

    const response = await handler(
      new Request("http://customer.test/api/block-rate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(204);
  });

  it("invokes the customer's onError when the upstream rejects the API key", async () => {
    const errors: ForwardError[] = [];
    const handler = createWebHandler({
      forward: {
        apiKey: "br_definitely_wrong_key_xxxxx",
        endpoint: harness.endpoint,
        onError: (err) => errors.push(err),
      },
    });

    const response = await handler(
      new Request("http://customer.test/api/block-rate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(samplePayload()),
      }),
    );

    // Customer always gets 204 (browser doesn't need to know upstream
    // failed; that's not actionable client-side). But onError must fire.
    expect(response.status).toBe(204);
    expect(errors.length).toBe(1);
    expect(errors[0].kind).toBe("upstream");
    if (errors[0].kind === "upstream") {
      expect(errors[0].status).toBe(401);
      // The API key must NEVER appear in the error body — leaking it
      // into customer logs would be a credential exposure.
      expect(errors[0].body).not.toContain(TEST_API_KEY);
    }
  });

  it("rejects malformed payloads at the customer route without forwarding", async () => {
    let forwardFired = false;
    const handler = createWebHandler({
      forward: {
        apiKey: TEST_API_KEY,
        endpoint: harness.endpoint,
        onError: () => {
          forwardFired = true;
        },
      },
    });

    const response = await handler(
      new Request("http://customer.test/api/block-rate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not even json",
      }),
    );

    expect(response.status).toBe(400);
    expect(forwardFired).toBe(false);
  });
});
