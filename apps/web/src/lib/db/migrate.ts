/**
 * Migration runner. Runs at app start (via the `start` script in package.json)
 * and from `bun run db:migrate` for local dev.
 *
 * - postgres:// URL → uses drizzle-orm/bun-sql/migrator
 * - pglite:// URL   → uses drizzle-orm/pglite/migrator
 *
 * Drizzle's per-driver migrators handle the __drizzle_migrations bookkeeping
 * and are no-ops on already-applied migrations, so this is safe to call on
 * every start.
 */

import { migrate as migrateBunSql } from "drizzle-orm/bun-sql/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzleBunSql } from "drizzle-orm/bun-sql";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { SQL } from "bun";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.server";

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, "../../..", "drizzle");

async function main() {
  const url = env.DATABASE_URL;
  console.log(`[migrate] DATABASE_URL=${url.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[migrate] migrationsFolder=${MIGRATIONS_FOLDER}`);

  if (url.startsWith("pglite://")) {
    const dataDir = url.replace(/^pglite:\/\//, "") || undefined;
    if (dataDir) {
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    const db = drizzlePglite(client);
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await client.close();
    console.log("[migrate] pglite migrations applied");
    return;
  }

  const client = new SQL({
    url,
    tls: env.NODE_ENV === "production",
    prepare: false,
    max: 1,
  });
  const db = drizzleBunSql(client);
  await migrateBunSql(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await client.close();
  console.log("[migrate] postgres migrations applied");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
