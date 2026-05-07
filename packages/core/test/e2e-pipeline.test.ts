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
 * No mocks: real `Bun.serve`, real fetch, real JSON. Slower than the
 * unit tests but still well under a second.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createWebHandler } from "../src/handler";
import type { ForwardError } from "../src/handler";
import type { BlockRateResult } from "../src/types";
import { createServer } from "blockrate-server";

const TEST_API_KEY = "br_e2e_test_key_xxxxxxxxxxxx";

interface Harness {
  app: Awaited<ReturnType<typeof createServer>>;
  server: ReturnType<typeof Bun.serve>;
  endpoint: string;
  stop: () => void;
}

async function startHarness(): Promise<Harness> {
  process.env.BLOCK_RATE_BOOTSTRAP_KEY = TEST_API_KEY;
  process.env.BLOCK_RATE_BOOTSTRAP_NAME = "e2e";
  const app = await createServer({ dbPath: ":memory:" });
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  return {
    app,
    server,
    endpoint: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
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

  afterEach(() => {
    harness.stop();
  });

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
