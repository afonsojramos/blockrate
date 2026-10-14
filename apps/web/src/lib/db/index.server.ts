/**
 * Drizzle client. Switches between postgres.js (production) and PGlite
 * (local dev) based on the DATABASE_URL scheme:
 *
 *   pglite://./.local/blockrate.db   → PGlite, persistent file
 *   pglite://                        → PGlite, in-memory
 *   postgres://...                   → postgres.js with Railway-safe options
 *
 * Production deploys (Railway) MUST use a postgres:// URL. PGlite is dev-only.
 */

import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { postgresOptions } from "./postgres-options";
import { useNitroHooks } from "nitro/app";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../env.server";
import * as schema from "./schema";

function isPglite(url: string): boolean {
  return url.startsWith("pglite://");
}

function pgliteDataDir(url: string): string | undefined {
  // pglite://./.local/blockrate.db → ./.local/blockrate.db
  // pglite://                       → undefined (in-memory)
  const stripped = url.replace(/^pglite:\/\//, "");
  return stripped === "" ? undefined : stripped;
}

function createDb() {
  if (isPglite(env.DATABASE_URL)) {
    const dataDir = pgliteDataDir(env.DATABASE_URL);
    if (dataDir) {
      // Ensure parent directory exists for PGlite's persistent file
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    return drizzlePglite(client, { schema });
  }

  const client = postgres(env.DATABASE_URL, postgresOptions(env.NODE_ENV));
  return drizzlePostgres(client, { schema });
}

const database = createDb();
// SAFETY: Both adapters share this PostgreSQL schema and query API.
export const db = database as unknown as PostgresJsDatabase<typeof schema>;

useNitroHooks().hook("close", async () => {
  const client = database.$client;
  if (client instanceof PGlite) await client.close();
  else await client.end({ timeout: 2 });
});
