import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteStore } from "../src/stores/sqlite";

it("reopens an existing SQLite file without replaying its migration ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blockrate-sqlite-"));
  const path = join(dir, "blockrate.db");
  let store: SqliteStore | undefined;
  try {
    // The legacy runner records filenames in __migrations, not Drizzle's journal.
    const legacy = new Database(path);
    const migrations = resolve(import.meta.dirname, "../drizzle");
    legacy.exec("CREATE TABLE __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    for (const name of readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      legacy.exec(readFileSync(join(migrations, name), "utf8"));
      legacy.prepare("INSERT INTO __migrations VALUES (?, ?)").run(name, 123);
    }
    const ledger = legacy.prepare("SELECT * FROM __migrations").all();
    legacy.close();

    store = new SqliteStore(path);
    const tenant = await store.createTenant({ name: "persist", apiKey: "br_dummy_persist" });
    const timestamp = new Date("2026-01-01T00:00:00Z");
    await store.insertEvents(
      ["blocked", "blocked", "loaded"].map((status) => ({
        tenantId: tenant.id,
        service: "web",
        timestamp,
        url: "/",
        userAgent: "Chrome 131",
        provider: "ga4",
        status: status as "blocked" | "loaded",
        latency: status === "loaded" ? 6 : 3000,
      })),
    );
    store.close();
    store = new SqliteStore(path);
    expect(await store.findTenantByApiKey("br_dummy_persist")).toEqual(tenant);
    expect(await store.getStats({ tenantId: tenant.id, since: new Date("2025-01-01") })).toEqual([
      { provider: "ga4", total: 3, blocked: 2, blockRate: 2 / 3, avgLatency: 6 },
    ]);
    const raw = new Database(path, { readonly: true });
    try {
      expect(raw.prepare("SELECT * FROM __migrations").all()).toEqual(ledger);
      expect(raw.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(raw.prepare("SELECT timestamp FROM events LIMIT 1").get()).toEqual({
        timestamp: Math.floor(timestamp.getTime() / 1000),
      });
    } finally {
      raw.close();
    }
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("SQLite connection integrity", () => {
  it("rejects an event referencing a missing tenant", async () => {
    const store = new SqliteStore(":memory:");
    try {
      await expect(
        store.insertEvents([
          {
            tenantId: 999,
            service: "web",
            timestamp: new Date(),
            url: "/",
            userAgent: "Chrome",
            provider: "ga4",
            status: "loaded",
            latency: 1,
          },
        ]),
      ).rejects.toThrow();
    } finally {
      store.close();
    }
  });
});
