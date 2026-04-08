import { z } from "zod";

/**
 * Server-only environment validation. Marked with `import "server-only"`-style
 * convention via the .server.ts suffix — TanStack Start's bundler will refuse
 * to ship this file to the client.
 *
 * Phase 1: only validates what the magic-link auth flow actually consumes.
 * OAuth providers (Google, GitHub) and Resend land in Phase 5 alongside the
 * production deploy.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  /**
   * Either a real Postgres URL (postgres://...) for production, or a
   * pglite:// URL for local dev. pglite://./.local/blockrate.db points at a
   * persistent file; pglite:// alone is in-memory.
   */
  DATABASE_URL: z.string().default("pglite://./.local/blockrate.db"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "≥32 chars; generate via `openssl rand -base64 32`"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[env] invalid environment:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("env validation failed — see errors above");
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
