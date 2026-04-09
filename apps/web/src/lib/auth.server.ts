/**
 * Better Auth instance for the hosted blockrate.app deployment.
 *
 * Phase 5 — magic link via Resend (with dev console.log fallback) +
 * Google + GitHub OAuth (conditionally enabled when env credentials
 * are present). Providers absent from env are simply not registered,
 * so dev mode keeps working with zero secrets.
 *
 * Hardenings:
 *   - cookieCache         → eliminates per-navigation DB hit on _authed
 *   - trustedOrigins      → explicit, not implicit
 *   - rateLimit           → built-in, covers magic-link send + verify
 *   - magicLink hardening → 10min expiry, hashed tokens
 *   - sendMagicLink       → fail-closed via mailer in production
 *   - GitHub OAuth        → user:email scope explicit (avoids email_not_found)
 */

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "./db/index.server";
import { appAccounts } from "./db/schema";
import { capabilities, env } from "./env.server";
import { magicLinkBody, sendEmail } from "./mailer.server";

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
if (capabilities.google) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}
if (capabilities.github) {
  socialProviders.github = {
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
    // framework-docs research: GitHub MUST request user:email or signup
    // fails with email_not_found for users with private emails.
    scope: ["user:email"],
  };
}

export const auth = betterAuth({
  appName: "blockrate",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),

  trustedOrigins: [env.BETTER_AUTH_URL],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "memory",
  },

  socialProviders,

  // Bootstrap an app_accounts row 1:1 with every Better Auth user.
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
      expiresIn: 60 * 10,
      disableSignUp: false,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        // mailer.server.ts handles the dev/prod fork:
        //   prod + RESEND_API_KEY  → real send
        //   dev  + RESEND_API_KEY  → real send (handy for QA)
        //   dev  + no key          → console.log
        //   prod + no key          → throws (fail-closed)
        await sendEmail({
          to: email,
          subject: "Your blockrate sign-in link",
          text: magicLinkBody(url),
        });
      },
    }),
  ],
});
