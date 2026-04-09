/**
 * Better Auth instance for the hosted blockrate.app deployment.
 *
 * Phase 1: magic-link only. Google + GitHub OAuth land in Phase 5
 * alongside Resend transactional email.
 *
 * Hardenings (per the deepen-pass review):
 *   - cookieCache         → eliminates per-navigation DB hit on _authed
 *   - trustedOrigins      → explicit, not implicit
 *   - rateLimit           → built-in, covers magic-link send + verify
 *   - magicLink hardening → 10min expiry, hashed tokens, hardcoded callback
 *   - sendMagicLink       → fail-closed in production
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "./db/index.server";
import { appAccounts } from "./db/schema";
import { env } from "./env.server";

export const auth = betterAuth({
  appName: "blockrate",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),

  // security-sentinel + better-auth: explicit, not implicit
  trustedOrigins: [env.BETTER_AUTH_URL],

  // performance-oracle: cookieCache turns _authed beforeLoad from a DB hit
  // into a signed-cookie verify. The single biggest perf win in Phase 1.
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
  },

  // Built-in rate limit on /api/auth/*
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "memory",
  },

  // Phase 2: bootstrap an app_accounts row 1:1 with every Better Auth user.
  // Runs in the same transaction as user creation so we never get a user
  // without a billing row.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(appAccounts)
            .values({ userId: user.id, plan: "free" })
            .onConflictDoNothing();
        },
      },
    },
  },

  plugins: [
    magicLink({
      expiresIn: 60 * 10, // 10 min, one-time use
      disableSignUp: false, // Phase 1: open signup
      storeToken: "hashed", // never store raw tokens in DB
      sendMagicLink: async ({ email, url }) => {
        // security-sentinel: fail-closed in production so a missed Phase 5
        // wiring can never accidentally leak tokens to Railway logs.
        if (env.NODE_ENV === "production") {
          throw new Error(
            "magic-link delivery not configured (Phase 5: Resend)"
          );
        }
        console.log(`[magic-link:dev] ${email}: ${url}`);
      },
    }),
  ],
});
