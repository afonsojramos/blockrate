import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "./db";
import { tenants, events } from "./schema";

export function generateApiKey(): string {
  return "br_" + randomBytes(24).toString("hex");
}

export function createTenant(
  db: DB,
  name: string,
  apiKey: string = generateApiKey()
) {
  const existing = db
    .select()
    .from(tenants)
    .where(eq(tenants.name, name))
    .get();
  if (existing) {
    throw new Error(`Tenant "${name}" already exists`);
  }
  db.insert(tenants).values({ name, apiKey }).run();
  return db.select().from(tenants).where(eq(tenants.apiKey, apiKey)).get()!;
}

export function listTenants(db: DB) {
  return db.select().from(tenants).all();
}

export function deleteTenant(db: DB, name: string): boolean {
  const row = db
    .select()
    .from(tenants)
    .where(eq(tenants.name, name))
    .get();
  if (!row) return false;
  db.delete(events).where(eq(events.tenantId, row.id)).run();
  db.delete(tenants).where(eq(tenants.id, row.id)).run();
  return true;
}

export function rotateTenantKey(db: DB, name: string): string | null {
  const row = db
    .select()
    .from(tenants)
    .where(eq(tenants.name, name))
    .get();
  if (!row) return null;
  const newKey = generateApiKey();
  db.update(tenants).set({ apiKey: newKey }).where(eq(tenants.id, row.id)).run();
  return newKey;
}
