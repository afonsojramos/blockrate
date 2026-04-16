import { z } from "zod";

/**
 * Server-only environment validation. Marked via the .server.ts suffix —
 * TanStack Start's bundler refuses to ship this file to the client.
 *
 * Required for boot:
 *   - BETTER_AUTH_SECRET   (≥32 chars)
 *
 * Optional for boot (validated lazily by their consumers):
 *   - DATABASE_URL         defaults to PGlite
 *   - BETTER_AUTH_URL      defaults to localhost:3000
 *   - CRON_SECRET          retention endpoint refuses requests if unset (503)
 *   - RESEND_API_KEY       sendMagicLink falls back to console.log if unset
 *                          (only allowed in NODE_ENV !== production)
 *   - GOOGLE_CLIENT_ID     OAuth provider hidden from /login if unset
 *   - GOOGLE_CLIENT_SECRET
 *   - GITHUB_CLIENT_ID     OAuth provider hidden from /login if unset
 *   - GITHUB_CLIENT_SECRET
 *   - EMAIL_FROM           defaults to "blockrate <magic@blockrate.app>"
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("pglite://./.local/blockrate.db"),
  BETTER_AUTH_SECRET: z.string().min(32, "≥32 chars; generate via `openssl rand -base64 32`"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  // Phase 4
  CRON_SECRET: z.string().min(32).optional(),

  // Phase 5 — all optional, providers/email enabled only when present
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("blockrate <noreply@blockrate.app>"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Stripe billing — all optional, billing features enabled only when present
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_ANNUAL_PRICE_ID: z.string().optional(),
  STRIPE_TEAM_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_TEAM_ANNUAL_PRICE_ID: z.string().optional(),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("env validation failed — see errors above");
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

/**
 * Capability flags for OAuth providers + transactional email. Used by the
 * auth instance and the /login loader to decide what to enable/render.
 */
export const capabilities = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  resend: Boolean(env.RESEND_API_KEY),
  stripe: Boolean(env.STRIPE_SECRET_KEY),
};
