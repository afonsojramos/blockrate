/**
 * Migration runner. Runs at app start (via the `start` script in package.json)
 * and from `nub run db:migrate` for local dev.
 *
 * - postgres:// URL → uses drizzle-orm/postgres-js/migrator
 * - pglite:// URL   → uses drizzle-orm/pglite/migrator
 *
 * Drizzle's per-driver migrators handle the __drizzle_migrations bookkeeping
 * and are no-ops on already-applied migrations, so this is safe to call on
 * every start.
 */

import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { postgresOptions } from "./postgres-options";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.server";

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, "../../..", "drizzle");

async function main() {
  const url = env.DATABASE_URL;
  console.log(`[migrate] backend=${url.startsWith("pglite://") ? "pglite" : "postgres"}`);
  console.log(`[migrate] migrationsFolder=${MIGRATIONS_FOLDER}`);

  if (url.startsWith("pglite://")) {
    const dataDir = url.replace(/^pglite:\/\//, "") || undefined;
    if (dataDir) {
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    const db = drizzlePglite(client);
    try {
      await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await client.close();
    }
    console.log("[migrate] pglite migrations applied");
    return;
  }

  const client = postgres(url, postgresOptions(env.NODE_ENV, 1));
  const db = drizzlePostgres(client);
  try {
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 2 });
  }
  console.log("[migrate] postgres migrations applied");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
