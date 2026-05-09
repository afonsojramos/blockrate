/**
 * Smoke tests for framework adapters. Each adapter is a thin wrapper
 * around `createWebHandler`, so the only thing we verify here is that
 * the wrapper produces a callable matching the framework's expected
 * signature, and that it correctly threads a Web-standard Request
 * through to the core handler.
 *
 * Validation logic, forward behaviour, and error handling are all
 * covered exhaustively in `handler.test.ts` — no need to re-test them
 * per adapter. We only test the shape contract here.
 */

import { describe, it, expect } from "bun:test";
import { createBlockRateHandler as nextHandler } from "../src/next/handler";
import { createBlockRateHandler as sveltekitHandler } from "../src/sveltekit";
import { createBlockRateHandler as tanstackHandler } from "../src/tanstack-start";
import { createBlockRateHandler as astroHandler } from "../src/astro";
import { createBlockRateHandler as remixHandler } from "../src/remix";
import { createBlockRateHandler as nuxtHandler } from "../src/nuxt";

const validPayload = JSON.stringify({
  timestamp: new Date().toISOString(),
  url: "/test",
  userAgent: "test-ua",
  providers: [{ name: "optimizely", status: "blocked", latency: 12 }],
});

function makeRequest() {
  return new Request("http://x/api/block-rate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: validPayload,
  });
}

describe("framework adapters", () => {
  it("next: takes Request, returns Response", async () => {
    const handle = nextHandler();
    const res = await handle(makeRequest());
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("sveltekit: takes { request }, returns Response", async () => {
    const POST = sveltekitHandler();
    const res = await POST({ request: makeRequest() });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("tanstack-start: takes Request, returns Response", async () => {
    const handle = tanstackHandler();
    const res = await handle(makeRequest());
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("astro: takes { request }, returns Response", async () => {
    const POST = astroHandler();
    const res = await POST({ request: makeRequest() });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("remix: takes { request }, returns Response (action signature)", async () => {
    const action = remixHandler();
    const res = await action({ request: makeRequest() });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("nuxt: takes Request, returns Response (post-toWebRequest)", async () => {
    const handle = nuxtHandler();
    const res = await handle(makeRequest());
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(204);
  });

  it("every adapter rejects malformed payloads with 400", async () => {
    const bad = () =>
      new Request("http://x/api/block-rate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });

    expect((await nextHandler()(bad())).status).toBe(400);
    expect((await sveltekitHandler()({ request: bad() })).status).toBe(400);
    expect((await tanstackHandler()(bad())).status).toBe(400);
    expect((await astroHandler()({ request: bad() })).status).toBe(400);
    expect((await remixHandler()({ request: bad() })).status).toBe(400);
    expect((await nuxtHandler()(bad())).status).toBe(400);
  });
});
