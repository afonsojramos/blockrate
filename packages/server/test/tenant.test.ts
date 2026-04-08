import { describe, it, expect, beforeEach } from "bun:test";
import { createStore } from "../src/stores";
import {
  createTenant,
  listTenants,
  deleteTenant,
  rotateTenantKey,
  generateApiKey,
} from "../src/tenant";
import type { BlockRateStore } from "../src/store";

describe("tenant management (sqlite)", () => {
  let store: BlockRateStore;

  beforeEach(async () => {
    store = await createStore({ dialect: "sqlite", url: ":memory:" });
  });

  it("creates a tenant with a generated key", async () => {
    const t = await createTenant(store, "acme");
    expect(t.name).toBe("acme");
    expect(t.apiKey).toMatch(/^br_[a-f0-9]{48}$/);
  });

  it("creates a tenant with a provided key", async () => {
    const t = await createTenant(store, "acme", "br_custom_key");
    expect(t.apiKey).toBe("br_custom_key");
  });

  it("rejects duplicate tenant names", async () => {
    await createTenant(store, "acme");
    await expect(createTenant(store, "acme")).rejects.toThrow(/already exists/);
  });

  it("lists tenants", async () => {
    await createTenant(store, "a");
    await createTenant(store, "b");
    const rows = await listTenants(store);
    expect(rows.map((t) => t.name).sort()).toEqual(["a", "b"]);
  });

  it("deletes a tenant", async () => {
    await createTenant(store, "acme");
    expect(await deleteTenant(store, "acme")).toBe(true);
    expect(await listTenants(store)).toHaveLength(0);
  });

  it("returns false when deleting unknown tenant", async () => {
    expect(await deleteTenant(store, "ghost")).toBe(false);
  });

  it("rotates an api key", async () => {
    const t = await createTenant(store, "acme");
    const newKey = await rotateTenantKey(store, "acme");
    expect(newKey).not.toBeNull();
    expect(newKey).not.toBe(t.apiKey);
    expect(newKey).toMatch(/^br_/);
  });

  it("generateApiKey produces unique keys", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});
