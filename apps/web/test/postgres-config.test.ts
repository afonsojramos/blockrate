import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { postgresOptions } from "../src/lib/db/postgres-options";

const dummyUrl = "postgres://dummy:dummy@127.0.0.1:1/disposable";

describe("production postgres.js connection configuration", () => {
  it("keeps verified TLS, the pool cap, timeouts and pooler-safe unprepared statements", async () => {
    const client = postgres(dummyUrl, postgresOptions(dummyUrl, "production"));
    try {
      expect(client.options).toMatchObject({
        ssl: true,
        prepare: false,
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
      });
    } finally {
      await client.end();
    }
  });
  it("uses a single connection for migrations without disabling production TLS", () => {
    expect(postgresOptions(dummyUrl, "production", 1)).toMatchObject({
      ssl: true,
      prepare: false,
      max: 1,
    });
    expect(postgresOptions(dummyUrl, "development").ssl).toBe(false);
  });
  it.each([1, 5])("uses Railway private networking for a pool of %i connections", async (max) => {
    const url = "postgres://dummy:dummy@postgres.railway.internal:5432/railway";
    const client = postgres(url, postgresOptions(url, "production", max));
    try {
      expect(client.options).toMatchObject({ ssl: false, prepare: false, max });
    } finally {
      await client.end();
    }
  });
  it.each([
    "postgres://dummy:dummy@postgres.railway.internal.attacker.example/db",
    "postgres://dummy:dummy@notrailway.internal/db",
    "postgres://postgres.railway.internal:dummy@external.example/db",
    "postgres://dummy:dummy@external.example/db?sslmode=disable",
    "postgres://dummy:dummy@external.example,postgres.railway.internal/db",
    "postgres://dummy:dummy@primary.example:5432,secondary.example:5432/db",
  ])("keeps verified TLS for an external URL: %s", async (url) => {
    const client = postgres(url, postgresOptions(url, "production"));
    try {
      expect(client.options.ssl).toBe(true);
    } finally {
      await client.end();
    }
  });
  it("awaits the postgres pool teardown on Nitro's close hook", async () => {
    const client = postgres(dummyUrl, postgresOptions(dummyUrl, "production"));
    let release!: () => void;
    const pending = new Promise<void>((done) => {
      release = done;
    });
    const end = vi.spyOn(client, "end").mockImplementationOnce(() => pending);
    const hook = vi.fn();
    vi.doMock("nitro/app", () => ({ useNitroHooks: () => ({ hook }) }));
    vi.doMock("postgres", () => ({ default: () => client }));
    vi.doMock("../src/lib/env.server", () => ({
      env: { DATABASE_URL: dummyUrl, NODE_ENV: "production" },
    }));
    try {
      await import("../src/lib/db/index.server");
      const close = hook.mock.calls.find(([name]) => name === "close")?.[1];
      expect(close).toBeTypeOf("function");
      let finished = false;
      const teardown = close().then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(end).toHaveBeenCalledWith({ timeout: 2 });
      expect(finished).toBe(false);
      release();
      await teardown;
      expect(finished).toBe(true);
    } finally {
      release();
      end.mockRestore();
      await client.end();
      vi.doUnmock("nitro/app");
      vi.doUnmock("postgres");
      vi.doUnmock("../src/lib/env.server");
    }
  });
});
