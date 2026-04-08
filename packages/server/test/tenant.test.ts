import { describe, it, expect, beforeEach } from "bun:test";
import { createDb, type DB } from "../src/db";
import {
  createTenant,
  listTenants,
  deleteTenant,
  rotateTenantKey,
  generateApiKey,
} from "../src/tenant";
import { events } from "../src/schema";

describe("tenant management", () => {
  let db: DB;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("creates a tenant with a generated key", () => {
    const t = createTenant(db, "acme");
    expect(t.name).toBe("acme");
    expect(t.apiKey).toMatch(/^br_[a-f0-9]{48}$/);
  });

  it("creates a tenant with a provided key", () => {
    const t = createTenant(db, "acme", "br_custom_key");
    expect(t.apiKey).toBe("br_custom_key");
  });

  it("rejects duplicate tenant names", () => {
    createTenant(db, "acme");
    expect(() => createTenant(db, "acme")).toThrow(/already exists/);
  });

  it("lists tenants", () => {
    createTenant(db, "a");
    createTenant(db, "b");
    expect(listTenants(db).map((t) => t.name).sort()).toEqual(["a", "b"]);
  });

  it("deletes a tenant and its events", () => {
    const t = createTenant(db, "acme");
    db.insert(events)
      .values({
        tenantId: t.id,
        service: "web",
        timestamp: new Date(),
        url: "/",
        userAgent: "x",
        provider: "posthog",
        status: "blocked",
        latency: 10,
      })
      .run();
    expect(deleteTenant(db, "acme")).toBe(true);
    expect(listTenants(db)).toHaveLength(0);
    expect(db.select().from(events).all()).toHaveLength(0);
  });

  it("returns false when deleting unknown tenant", () => {
    expect(deleteTenant(db, "ghost")).toBe(false);
  });

  it("rotates an api key", () => {
    const t = createTenant(db, "acme");
    const newKey = rotateTenantKey(db, "acme");
    expect(newKey).not.toBeNull();
    expect(newKey).not.toBe(t.apiKey);
    expect(newKey).toMatch(/^br_/);
  });

  it("generateApiKey produces unique keys", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});
