/**
 * Framework-agnostic data layer for block-rate-server. Both SQLite (self-hosted
 * default) and Postgres (for users with an existing Postgres) implement this
 * interface. Handlers talk to `BlockRateStore` — never to Drizzle directly.
 */

export interface StoredTenant {
  id: number;
  name: string;
  apiKey: string;
  createdAt: Date;
}

export interface NewStoredEvent {
  tenantId: number;
  service: string;
  timestamp: Date;
  url: string;
  /** Truncated to browser family + major version — never the raw UA. */
  userAgent: string;
  provider: string;
  status: "loaded" | "blocked";
  latency: number;
}

export interface StatsRow {
  provider: string;
  total: number;
  blocked: number;
  blockRate: number;
  avgLatency: number;
}

export interface StatsQuery {
  tenantId: number;
  service?: string;
  since: Date;
}

export interface BlockRateStore {
  // tenant management
  findTenantByApiKey(apiKey: string): Promise<StoredTenant | null>;
  findTenantByName(name: string): Promise<StoredTenant | null>;
  createTenant(input: {
    name: string;
    apiKey: string;
  }): Promise<StoredTenant>;
  listTenants(): Promise<StoredTenant[]>;
  deleteTenant(name: string): Promise<boolean>;
  updateTenantApiKey(name: string, apiKey: string): Promise<boolean>;

  // events
  insertEvents(rows: NewStoredEvent[]): Promise<void>;
  getStats(query: StatsQuery): Promise<StatsRow[]>;

  /** Close the underlying connection. */
  close(): void;
}

export type Dialect = "sqlite" | "postgres";

export interface CreateStoreOptions {
  dialect?: Dialect;
  /** SQLite path or Postgres connection string. */
  url?: string;
}
