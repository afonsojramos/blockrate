/**
 * createBlockRateProxy — URL mapping, header hygiene, method gating, and
 * pinned-upstream guarantees. fetch is injected; nothing touches the
 * network. The live network path (asset GET + capture POST against real
 * PostHog) was validated end-to-end by examples/proxy-spike.
 */

import { describe, expect, it } from "bun:test";

import { createBlockRateProxy } from "../src/proxy";

interface Captured {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  redirect: string | undefined;
  duplex: string | undefined;
}

function capturingFetch(response?: Response) {
  const calls: Captured[] = [];
  const impl = (async (url: unknown, init: RequestInit & { duplex?: string } = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
      redirect: init.redirect,
      duplex: init.duplex,
    });
    return response ?? new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("createBlockRateProxy — config validation", () => {
  it("throws on a prefix that is missing the leading slash or is the root", () => {
    expect(() => createBlockRateProxy({ provider: "posthog", prefix: "m" })).toThrow(/prefix/);
    expect(() => createBlockRateProxy({ provider: "posthog", prefix: "/" })).toThrow(/prefix/);
  });

  it("normalizes a trailing slash on the prefix", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m/", fetch: impl });
    const res = await proxy(new Request("https://example.com/m/decide"));
    expect(res.status).toBe(200);
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/decide");
  });
});

describe("createBlockRateProxy — URL mapping", () => {
  it("strips the prefix and preserves path + query against the pinned US host", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(new Request("https://example.com/m/static/array.js?v=1.2"));
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/static/array.js?v=1.2");
  });

  it("maps the bare prefix to the upstream root", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(new Request("https://example.com/m"));
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/");
  });

  it("uses the EU ingest host when region is eu", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({
      provider: "posthog",
      prefix: "/m",
      region: "eu",
      fetch: impl,
    });
    await proxy(new Request("https://example.com/m/e/"));
    expect(calls[0]?.url).toBe("https://eu.i.posthog.com/e/");
  });

  it("404s paths outside the prefix without calling fetch (including prefix-sharing paths)", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    expect((await proxy(new Request("https://example.com/other"))).status).toBe(404);
    // "/metrics" starts with "/m" as a string but is not under the mount.
    expect((await proxy(new Request("https://example.com/metrics"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("the request's own host never influences the upstream", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(
      new Request("https://evil.example.net/m/decide", {
        headers: { host: "attacker.example.net" },
      }),
    );
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/decide");
    expect(calls[0]?.headers.get("host")).toBeNull();
  });
});

describe("createBlockRateProxy — methods and bodies", () => {
  it("rejects non-allowlisted methods without calling fetch", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    const res = await proxy(new Request("https://example.com/m/e/", { method: "DELETE" }));
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it("forwards POST with a streamed body and half duplex", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(
      new Request("https://example.com/m/e/", {
        method: "POST",
        body: JSON.stringify({ event: "x" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).not.toBeNull();
    expect(calls[0]?.duplex).toBe("half");
    expect(calls[0]?.redirect).toBe("follow");
  });

  it("sends no body for GET", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(new Request("https://example.com/m/static/array.js"));
    expect(calls[0]?.body).toBeNull();
    expect(calls[0]?.duplex).toBeUndefined();
  });
});

describe("createBlockRateProxy — header hygiene", () => {
  it("strips first-party credentials and hop-by-hop headers, keeps the rest", async () => {
    const { calls, impl } = capturingFetch();
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    await proxy(
      new Request("https://example.com/m/decide", {
        headers: {
          cookie: "session=secret",
          authorization: "Bearer secret",
          connection: "keep-alive",
          "transfer-encoding": "chunked",
          "cf-connecting-ip": "1.2.3.4",
          "user-agent": "Mozilla/5.0 test",
          "x-forwarded-for": "1.2.3.4",
          "content-type": "application/json",
        },
      }),
    );
    const sent = calls[0]!.headers;
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("connection")).toBeNull();
    expect(sent.get("transfer-encoding")).toBeNull();
    expect(sent.get("cf-connecting-ip")).toBeNull();
    expect(sent.get("user-agent")).toBe("Mozilla/5.0 test");
    expect(sent.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(sent.get("content-type")).toBe("application/json");
  });

  it("passes upstream status and headers through, minus hop-by-hop", async () => {
    const upstream = new Response("body", {
      status: 207,
      headers: {
        "content-type": "text/javascript",
        "cache-control": "public, max-age=60",
        connection: "close",
      },
    });
    const { impl } = capturingFetch(upstream);
    const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m", fetch: impl });
    const res = await proxy(new Request("https://example.com/m/static/array.js"));
    expect(res.status).toBe(207);
    expect(res.headers.get("content-type")).toBe("text/javascript");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("connection")).toBeNull();
    expect(await res.text()).toBe("body");
  });
});
