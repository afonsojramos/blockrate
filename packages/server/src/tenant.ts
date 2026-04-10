import { randomBytes } from "node:crypto";
import type { BlockRateStore, StoredTenant } from "./store";

export function generateApiKey(): string {
  return "br_" + randomBytes(24).toString("hex");
}

export async function createTenant(
  store: BlockRateStore,
  name: string,
  apiKey: string = generateApiKey(),
): Promise<StoredTenant> {
  const existing = await store.findTenantByName(name);
  if (existing) {
    throw new Error(`Tenant "${name}" already exists`);
  }
  return store.createTenant({ name, apiKey });
}

export async function listTenants(store: BlockRateStore): Promise<StoredTenant[]> {
  return store.listTenants();
}

export async function deleteTenant(store: BlockRateStore, name: string): Promise<boolean> {
  return store.deleteTenant(name);
}

export async function rotateTenantKey(store: BlockRateStore, name: string): Promise<string | null> {
  const existing = await store.findTenantByName(name);
  if (!existing) return null;
  const newKey = generateApiKey();
  await store.updateTenantApiKey(name, newKey);
  return newKey;
}
