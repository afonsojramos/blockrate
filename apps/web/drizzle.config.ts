import type { Config } from "drizzle-kit";

/**
 * drizzle-kit only generates SQL — runtime migration is handled by
 * src/lib/db/migrate.ts so we can support both PGlite and postgres-js.
 *
 * For `bun run db:generate` to work locally without DATABASE_URL set,
 * we use a placeholder URL. The real URL is read at runtime by migrate.ts.
 */
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/blockrate_dev",
  },
} satisfies Config;
