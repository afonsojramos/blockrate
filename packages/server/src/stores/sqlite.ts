import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq, gte, sql } from "drizzle-orm";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tenants, events } from "../schema.sqlite";
import type { BlockRateStore, NewStoredEvent, StatsQuery, StatsRow, StoredTenant } from "../store";

export class SqliteStore implements BlockRateStore {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<{ tenants: typeof tenants; events: typeof events }>>;

  constructor(path = "./blockrate.db") {
    this.sqlite = new Database(path);
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.db = drizzle(this.sqlite, { schema: { tenants, events } });
    this.runMigrations();
  }

  private runMigrations() {
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(here, "..", "..", "drizzle");
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      return;
    }
    this.sqlite.exec(
      "CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
    );
    const applied = new Set(
      this.sqlite
        .query("SELECT name FROM __migrations")
        .all()
        .map((r: any) => r.name as string),
    );
    for (const file of files) {
      if (applied.has(file)) continue;
      const migrationSql = readFileSync(join(migrationsDir, file), "utf8");
      this.sqlite.transaction(() => {
        for (const stmt of migrationSql.split("--> statement-breakpoint")) {
          const trimmed = stmt.trim();
          if (trimmed) this.sqlite.exec(trimmed);
        }
        this.sqlite
          .query("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)")
          .run(file, Math.floor(Date.now() / 1000));
      })();
    }
  }

  async findTenantByApiKey(apiKey: string): Promise<StoredTenant | null> {
    const row = this.db.select().from(tenants).where(eq(tenants.apiKey, apiKey)).get();
    return row ?? null;
  }

  async findTenantByName(name: string): Promise<StoredTenant | null> {
    const row = this.db.select().from(tenants).where(eq(tenants.name, name)).get();
    return row ?? null;
  }

  async createTenant(input: { name: string; apiKey: string }): Promise<StoredTenant> {
    this.db.insert(tenants).values(input).run();
    return (await this.findTenantByApiKey(input.apiKey))!;
  }

  async listTenants(): Promise<StoredTenant[]> {
    return this.db.select().from(tenants).all();
  }

  async deleteTenant(name: string): Promise<boolean> {
    const row = await this.findTenantByName(name);
    if (!row) return false;
    this.db.delete(events).where(eq(events.tenantId, row.id)).run();
    this.db.delete(tenants).where(eq(tenants.id, row.id)).run();
    return true;
  }

  async updateTenantApiKey(name: string, apiKey: string): Promise<boolean> {
    const row = await this.findTenantByName(name);
    if (!row) return false;
    this.db.update(tenants).set({ apiKey }).where(eq(tenants.id, row.id)).run();
    return true;
  }

  async insertEvents(rows: NewStoredEvent[]): Promise<void> {
    if (rows.length === 0) return;
    this.db.insert(events).values(rows).run();
  }

  async getStats(query: StatsQuery): Promise<StatsRow[]> {
    const where = query.service
      ? and(
          eq(events.tenantId, query.tenantId),
          eq(events.service, query.service),
          gte(events.timestamp, query.since),
        )
      : and(eq(events.tenantId, query.tenantId), gte(events.timestamp, query.since));

    const rows = this.db
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
      .groupBy(events.provider)
      .all();

    return rows.map((r) => ({
      provider: r.provider,
      total: Number(r.total),
      blocked: Number(r.blocked),
      blockRate: Number(r.total) > 0 ? Number(r.blocked) / Number(r.total) : 0,
      avgLatency: Math.round(Number(r.avgLatency) || 0),
    }));
  }

  close(): void {
    this.sqlite.close();
  }
}
