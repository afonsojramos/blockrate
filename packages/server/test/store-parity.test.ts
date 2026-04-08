import { describe, it, expect, beforeEach } from "bun:test";
import { SqliteStore } from "../src/stores/sqlite";
import { PostgresStore } from "../src/stores/postgres";
import type { BlockRateStore } from "../src/store";

/**
 * The same suite runs against every store backend. Any divergence here means
 * the dialects have drifted and one of them needs fixing — not the test.
 */
const backends: [string, () => Promise<BlockRateStore>][] = [
  ["SqliteStore", async () => new SqliteStore(":memory:")],
  ["PostgresStore (pglite)", async () => PostgresStore.fromPglite()],
];

for (const [name, factory] of backends) {
  describe(`store parity: ${name}`, () => {
    let store: BlockRateStore;

    beforeEach(async () => {
      store = await factory();
    });

    it("creates and finds a tenant", async () => {
      const t = await store.createTenant({
        name: "acme",
        apiKey: "br_test_key",
      });
      expect(t.name).toBe("acme");
      expect(t.apiKey).toBe("br_test_key");
      expect(await store.findTenantByApiKey("br_test_key")).toMatchObject({
        name: "acme",
      });
      expect(await store.findTenantByName("acme")).toMatchObject({
        apiKey: "br_test_key",
      });
      expect(await store.findTenantByApiKey("nope")).toBeNull();
    });

    it("inserts events and aggregates stats", async () => {
      const t = await store.createTenant({
        name: "acme",
        apiKey: "br_test_key",
      });
      const ts = new Date();
      await store.insertEvents([
        {
          tenantId: t.id,
          service: "web",
          timestamp: ts,
          url: "/",
          userAgent: "Chrome 131",
          provider: "optimizely",
          status: "blocked",
          latency: 12,
        },
        {
          tenantId: t.id,
          service: "web",
          timestamp: ts,
          url: "/",
          userAgent: "Chrome 131",
          provider: "optimizely",
          status: "blocked",
          latency: 8,
        },
        {
          tenantId: t.id,
          service: "web",
          timestamp: ts,
          url: "/",
          userAgent: "Chrome 131",
          provider: "optimizely",
          status: "loaded",
          latency: 6,
        },
        {
          tenantId: t.id,
          service: "web",
          timestamp: ts,
          url: "/",
          userAgent: "Chrome 131",
          provider: "posthog",
          status: "loaded",
          latency: 5,
        },
      ]);

      const stats = await store.getStats({
        tenantId: t.id,
        since: new Date(Date.now() - 86_400_000),
      });
      const optimizely = stats.find((s) => s.provider === "optimizely")!;
      expect(optimizely.total).toBe(3);
      expect(optimizely.blocked).toBe(2);
      expect(optimizely.blockRate).toBeCloseTo(2 / 3);
      const posthog = stats.find((s) => s.provider === "posthog")!;
      expect(posthog.total).toBe(1);
      expect(posthog.blocked).toBe(0);
    });

    it("filters stats by service", async () => {
      const t = await store.createTenant({
        name: "acme",
        apiKey: "br_test_key",
      });
      const ts = new Date();
      const baseEvent = {
        tenantId: t.id,
        timestamp: ts,
        url: "/",
        userAgent: "Chrome 131",
        provider: "optimizely",
        status: "blocked" as const,
        latency: 10,
      };
      await store.insertEvents([
        { ...baseEvent, service: "web" },
        { ...baseEvent, service: "mobile" },
      ]);

      const webStats = await store.getStats({
        tenantId: t.id,
        service: "web",
        since: new Date(Date.now() - 86_400_000),
      });
      expect(webStats).toHaveLength(1);
      expect(webStats[0].total).toBe(1);
    });

    it("excludes events older than the since cutoff", async () => {
      const t = await store.createTenant({
        name: "acme",
        apiKey: "br_test_key",
      });
      const old = new Date(Date.now() - 30 * 86_400_000);
      const recent = new Date();
      await store.insertEvents([
        {
          tenantId: t.id,
          service: "web",
          timestamp: old,
          url: "/",
          userAgent: "Chrome 131",
          provider: "ga4",
          status: "blocked",
          latency: 1,
        },
        {
          tenantId: t.id,
          service: "web",
          timestamp: recent,
          url: "/",
          userAgent: "Chrome 131",
          provider: "ga4",
          status: "blocked",
          latency: 1,
        },
      ]);
      const stats = await store.getStats({
        tenantId: t.id,
        since: new Date(Date.now() - 7 * 86_400_000),
      });
      expect(stats[0].total).toBe(1);
    });

    it("deletes a tenant and cascades events", async () => {
      const t = await store.createTenant({
        name: "acme",
        apiKey: "br_test_key",
      });
      await store.insertEvents([
        {
          tenantId: t.id,
          service: "web",
          timestamp: new Date(),
          url: "/",
          userAgent: "Chrome 131",
          provider: "ga4",
          status: "blocked",
          latency: 1,
        },
      ]);
      expect(await store.deleteTenant("acme")).toBe(true);
      expect(await store.findTenantByName("acme")).toBeNull();
    });

    it("rotates an api key", async () => {
      await store.createTenant({ name: "acme", apiKey: "br_old" });
      expect(await store.updateTenantApiKey("acme", "br_new")).toBe(true);
      expect(await store.findTenantByApiKey("br_old")).toBeNull();
      expect(await store.findTenantByApiKey("br_new")).toMatchObject({
        name: "acme",
      });
    });
  });
}
