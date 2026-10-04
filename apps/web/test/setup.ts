/**
 * Vitest setup (wired via vitest.config.ts). Runs before any test file, so
 * env.server's frozen `env` singleton and the call-time process.env reads in
 * plans.ts both see one consistent set of values regardless of file load order.
 *
 * Integration tests (stripe-webhook, retention) share the real index.server db
 * singleton; DATABASE_URL is forced to in-memory PGlite here. Tests that build
 * their own PGlite (admin-overview, gdpr-settings, stats-aggregation) are
 * unaffected.
 */
import { vi } from "vitest";

const hooks = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock("nitro/app", () => ({ useNitroHooks: () => hooks }));

process.env.NODE_ENV = "test";
for (const name of [
  "RESEND_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BLOCKRATE_API_KEY",
  "ADMIN_EMAILS",
])
  delete process.env[name];
process.env.DATABASE_URL = "pglite://";
process.env.BETTER_AUTH_SECRET = "ci-placeholder-secret-at-least-32-characters";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";
process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_pro_monthly";
process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_pro_annual";
process.env.STRIPE_TEAM_MONTHLY_PRICE_ID = "price_team_monthly";
process.env.STRIPE_TEAM_ANNUAL_PRICE_ID = "price_team_annual";
process.env.CRON_SECRET = "test-cron-secret-at-least-32-characters-long";
