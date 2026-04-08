import { describe, it, expect, beforeEach } from "bun:test";
import { createServer } from "../src/server";
import { tenants } from "../src/schema";

function newApp() {
  process.env.BLOCK_RATE_BOOTSTRAP_KEY = "br_test_key";
  process.env.BLOCK_RATE_BOOTSTRAP_NAME = "test";
  return createServer({ dbPath: ":memory:" });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    url: "/home",
    userAgent: "test",
    providers: [
      { name: "optimizely", status: "blocked", latency: 12 },
      { name: "posthog", status: "loaded", latency: 5 },
    ],
    ...overrides,
  };
}

describe("block-rate-server", () => {
  let app: ReturnType<typeof newApp>;

  beforeEach(() => {
    app = newApp();
  });

  it("rejects unauthenticated POST /ingest", async () => {
    const res = await app.fetch(
      new Request("http://x/ingest", {
        method: "POST",
        body: JSON.stringify(payload()),
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    const res = await app.fetch(
      new Request("http://x/ingest", {
        method: "POST",
        headers: { "x-block-rate-key": "br_test_key" },
        body: JSON.stringify({ bogus: true }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("ingests and aggregates stats", async () => {
    const ingest = async (body: any) =>
      app.fetch(
        new Request("http://x/ingest", {
          method: "POST",
          headers: { "x-block-rate-key": "br_test_key" },
          body: JSON.stringify(body),
        })
      );

    expect((await ingest(payload())).status).toBe(204);
    expect((await ingest(payload())).status).toBe(204);
    expect(
      (
        await ingest(
          payload({
            providers: [{ name: "optimizely", status: "loaded", latency: 8 }],
          })
        )
      ).status
    ).toBe(204);

    const res = await app.fetch(
      new Request("http://x/stats?since=7", {
        headers: { "x-block-rate-key": "br_test_key" },
      })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    const optimizely = data.stats.find((s: any) => s.provider === "optimizely");
    expect(optimizely.total).toBe(3);
    expect(optimizely.blocked).toBe(2);
    expect(optimizely.blockRate).toBeCloseTo(2 / 3);
    const posthog = data.stats.find((s: any) => s.provider === "posthog");
    expect(posthog.total).toBe(2);
    expect(posthog.blocked).toBe(0);
  });

  it("filters stats by service", async () => {
    const ingest = async (body: any) =>
      app.fetch(
        new Request("http://x/ingest", {
          method: "POST",
          headers: { "x-block-rate-key": "br_test_key" },
          body: JSON.stringify(body),
        })
      );
    await ingest(payload({ service: "web" }));
    await ingest(payload({ service: "mobile" }));

    const res = await app.fetch(
      new Request("http://x/stats?service=web", {
        headers: { "x-block-rate-key": "br_test_key" },
      })
    );
    const data: any = await res.json();
    const total = data.stats.reduce((a: number, s: any) => a + s.total, 0);
    expect(total).toBe(2); // two providers from a single web payload
  });

  it("serves the dashboard", async () => {
    const res = await app.fetch(new Request("http://x/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("block-rate");
  });

  it("responds to CORS preflight", async () => {
    const res = await app.fetch(
      new Request("http://x/ingest", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("bootstraps a default tenant", () => {
    const rows = app.db.select().from(tenants).all();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("test");
  });
});
