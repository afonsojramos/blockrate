import type { Config } from "drizzle-kit";

/**
 * Default config: SQLite (self-host default).
 * Use `drizzle-kit generate --config drizzle.config.postgres.ts` for Postgres.
 */
export default {
  schema: "./src/schema.sqlite.ts",
  out: "./drizzle",
  dialect: "sqlite",
} satisfies Config;
