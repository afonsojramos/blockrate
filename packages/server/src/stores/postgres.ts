import { and, eq, gte, sql } from "drizzle-orm";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tenants, events } from "../schema.postgres";
import type { BlockRateStore, NewStoredEvent, StatsQuery, StatsRow, StoredTenant } from "../store";

/**
 * Supports both production postgres-js connections and in-process PGlite
 * (used by tests). Both speak the same SQL — we just inject the drizzle
 * db and a raw-exec function for migrations.
 */
export class PostgresStore implements BlockRateStore {
  constructor(
    private db: any,
    private execRaw: (sql: string) => Promise<void>,
    private closeFn: () => void | Promise<void>,
  ) {}

  static async fromUrl(url: string): Promise<PostgresStore> {
    const client = postgres(url);
    const db = drizzlePostgres(client, { schema: { tenants, events } });
    const exec = async (s: string) => {
      await client.unsafe(s);
    };
    const close = async () => {
      await client.end({ timeout: 2 });
    };
    const store = new PostgresStore(db, exec, close);
    await store.runMigrations();
    return store;
  }

  static async fromPglite(dataDir?: string): Promise<PostgresStore> {
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    await client.waitReady;
    const db = drizzlePglite(client, { schema: { tenants, events } });
    const exec = async (s: string) => {
      await client.exec(s);
    };
    const close = () => {
      void client.close();
    };
    const store = new PostgresStore(db, exec, close);
    await store.runMigrations();
    return store;
  }

  private async runMigrations() {
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(here, "..", "..", "drizzle-postgres");
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      return;
    }

    await this.execRaw(
      `CREATE TABLE IF NOT EXISTS __migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );`,
    );
    const appliedRows = await this.db.execute(sql`SELECT name FROM __migrations`);
    const applied = new Set(
      (appliedRows as any).rows
        ? (appliedRows as any).rows.map((r: any) => r.name as string)
        : (appliedRows as any).map((r: any) => r.name as string),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const migrationSql = readFileSync(join(migrationsDir, file), "utf8");
      for (const stmt of migrationSql.split("--> statement-breakpoint")) {
        const trimmed = stmt.trim();
        if (trimmed) await this.execRaw(trimmed);
      }
      await this.db.execute(sql`INSERT INTO __migrations (name) VALUES (${file})`);
    }
  }

  async findTenantByApiKey(apiKey: string): Promise<StoredTenant | null> {
    const rows = await this.db.select().from(tenants).where(eq(tenants.apiKey, apiKey)).limit(1);
    return rows[0] ?? null;
  }

  async findTenantByName(name: string): Promise<StoredTenant | null> {
    const rows = await this.db.select().from(tenants).where(eq(tenants.name, name)).limit(1);
    return rows[0] ?? null;
  }

  async createTenant(input: { name: string; apiKey: string }): Promise<StoredTenant> {
    const rows = await this.db.insert(tenants).values(input).returning();
    return rows[0];
  }

  async listTenants(): Promise<StoredTenant[]> {
    return await this.db.select().from(tenants);
  }

  async deleteTenant(name: string): Promise<boolean> {
    const row = await this.findTenantByName(name);
    if (!row) return false;
    await this.db.delete(events).where(eq(events.tenantId, row.id));
    await this.db.delete(tenants).where(eq(tenants.id, row.id));
    return true;
  }

  async updateTenantApiKey(name: string, apiKey: string): Promise<boolean> {
    const row = await this.findTenantByName(name);
    if (!row) return false;
    await this.db.update(tenants).set({ apiKey }).where(eq(tenants.id, row.id));
    return true;
  }

  async insertEvents(rows: NewStoredEvent[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(events).values(rows);
  }

  async getStats(query: StatsQuery): Promise<StatsRow[]> {
    const where = query.service
      ? and(
          eq(events.tenantId, query.tenantId),
          eq(events.service, query.service),
          gte(events.timestamp, query.since),
        )
      : and(eq(events.tenantId, query.tenantId), gte(events.timestamp, query.since));

    const rows = await this.db
      .select({
        provider: events.provider,
        total: sql<number>`COUNT(*)`.as("total"),
        blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.as(
          "blocked",
        ),
        avgLatency: sql<number>`AVG(${events.latency})`.as("avg_latency"),
      })
      .from(events)
      .where(where)
      .groupBy(events.provider);

    return rows.map((r: any) => ({
      provider: r.provider,
      total: Number(r.total),
      blocked: Number(r.blocked),
      blockRate: Number(r.total) > 0 ? Number(r.blocked) / Number(r.total) : 0,
      avgLatency: Math.round(Number(r.avgLatency) || 0),
    }));
  }

  close(): void {
    void this.closeFn();
  }
}
