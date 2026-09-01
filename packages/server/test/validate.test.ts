import { describe, expect, it } from "bun:test";
import {
  isTimestampWithinSkew,
  MAX_TIMESTAMP_SKEW_MS,
  blockRatePayloadSchema,
} from "../src/validate";
import { createServer } from "../src/server";

describe("isTimestampWithinSkew", () => {
  const now = Date.parse("2026-06-21T12:00:00.000Z");

  it("accepts a timestamp at now", () => {
    expect(isTimestampWithinSkew(new Date(now).toISOString(), now)).toBe(true);
  });

  it("accepts a timestamp at the edge of the skew window", () => {
    expect(isTimestampWithinSkew(new Date(now - MAX_TIMESTAMP_SKEW_MS).toISOString(), now)).toBe(
      true,
    );
    expect(isTimestampWithinSkew(new Date(now + MAX_TIMESTAMP_SKEW_MS).toISOString(), now)).toBe(
      true,
    );
  });

  it("rejects a far-past timestamp that could rewrite sealed rollup days", () => {
    const farPast = new Date(now - MAX_TIMESTAMP_SKEW_MS - 1).toISOString();
    expect(isTimestampWithinSkew(farPast, now)).toBe(false);
  });

  it("rejects a far-future timestamp", () => {
    const farFuture = new Date(now + MAX_TIMESTAMP_SKEW_MS + 1).toISOString();
    expect(isTimestampWithinSkew(farFuture, now)).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(isTimestampWithinSkew("not-a-date", now)).toBe(false);
  });
});

describe("ingest timestamp skew (self-hosted handler)", () => {
  async function newApp() {
    process.env.BLOCK_RATE_BOOTSTRAP_KEY = "br_test_key";
    process.env.BLOCK_RATE_BOOTSTRAP_NAME = "test";
    return createServer({ dbPath: ":memory:" });
  }

  function payload(timestamp: string) {
    return {
      timestamp,
      url: "/home",
      userAgent: "test",
      providers: [{ name: "posthog", status: "blocked", latency: 12 }],
    };
  }

  it("rejects a far-past timestamp with 400", async () => {
    const app = await newApp();
    const farPast = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    // Schema still accepts ISO; handler enforces skew.
    expect(blockRatePayloadSchema.safeParse(payload(farPast)).success).toBe(true);
    const res = await app.fetch(
      new Request("http://x/ingest", {
        method: "POST",
        headers: { "x-blockrate-key": "br_test_key" },
        body: JSON.stringify(payload(farPast)),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("timestamp");
  });

  it("returns the owned issue shape ({ path, code, message }) for an invalid payload", async () => {
    const app = await newApp();
    const bad = { ...payload(new Date().toISOString()), providers: [] };
    const res = await app.fetch(
      new Request("http://x/ingest", {
        method: "POST",
        headers: { "x-blockrate-key": "br_test_key" },
        body: JSON.stringify(bad),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: string[]; code: string; message: string }[];
    };
    expect(body.error).toBe("invalid payload");
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      // Contract: exactly these keys, stable across zod majors.
      expect(Object.keys(issue).sort()).toEqual(["code", "message", "path"]);
      expect(issue.path.every((p) => typeof p === "string")).toBe(true);
      expect(typeof issue.code).toBe("string");
      expect(typeof issue.message).toBe("string");
    }
    expect(body.issues[0]?.path).toEqual(["providers"]);
  });

  it("accepts a fresh timestamp", async () => {
    const app = await newApp();
    const res = await app.fetch(
      new Request("http://x/ingest", {
        method: "POST",
        headers: { "x-blockrate-key": "br_test_key" },
        body: JSON.stringify(payload(new Date().toISOString())),
      }),
    );
    expect(res.status).toBe(204);
  });
});
