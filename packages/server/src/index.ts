// Server
export { createServer } from "./server";
export type { ServerOptions } from "./server";

// Stores
export { createStore, SqliteStore, PostgresStore } from "./stores";
export type {
  BlockRateStore,
  StoredTenant,
  NewStoredEvent,
  StatsRow,
  StatsQuery,
  Dialect,
  CreateStoreOptions,
} from "./store";

// Schemas (both dialects exposed for users who want raw drizzle access)
export * as sqliteSchema from "./schema.sqlite";
export * as postgresSchema from "./schema.postgres";

// Validation
export { blockRatePayloadSchema } from "./validate";
export type { BlockRatePayload } from "./validate";

// User-agent truncation (used by both self-hosted and hosted)
export { truncateUserAgent } from "./ua";

// Tenant management
export {
  createTenant,
  listTenants,
  deleteTenant,
  rotateTenantKey,
  generateApiKey,
} from "./tenant";

// Rate limiter (reusable in other contexts like blockrate.app)
export { TokenBucketLimiter } from "./rate-limit";
