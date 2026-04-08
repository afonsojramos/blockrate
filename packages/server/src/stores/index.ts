import type { BlockRateStore, CreateStoreOptions } from "../store";
import { SqliteStore } from "./sqlite";
import { PostgresStore } from "./postgres";

/**
 * Build a store from a dialect + URL. SQLite is the default for self-hosters;
 * Postgres is available for users with existing PG infrastructure.
 *
 *   createStore({ dialect: "sqlite", url: "./block-rate.db" })
 *   createStore({ dialect: "postgres", url: "postgres://..." })
 */
export async function createStore(
  options: CreateStoreOptions = {}
): Promise<BlockRateStore> {
  const dialect = options.dialect ?? "sqlite";
  if (dialect === "sqlite") {
    return new SqliteStore(options.url ?? "./block-rate.db");
  }
  if (dialect === "postgres") {
    if (!options.url) {
      throw new Error("postgres dialect requires a connection URL");
    }
    return PostgresStore.fromUrl(options.url);
  }
  throw new Error(`unknown dialect: ${dialect}`);
}

export { SqliteStore } from "./sqlite";
export { PostgresStore } from "./postgres";
