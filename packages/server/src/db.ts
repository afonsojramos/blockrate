import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>;

export function createDb(path = "./block-rate.db") {
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  runMigrations(sqlite);
  return db;
}

function runMigrations(sqlite: Database) {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "drizzle");
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);"
  );
  const applied = new Set(
    sqlite
      .query("SELECT name FROM __migrations")
      .all()
      .map((r: any) => r.name as string)
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    sqlite.transaction(() => {
      for (const stmt of sql.split("--> statement-breakpoint")) {
        const trimmed = stmt.trim();
        if (trimmed) sqlite.exec(trimmed);
      }
      sqlite
        .query("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)")
        .run(file, Math.floor(Date.now() / 1000));
    })();
  }
}
