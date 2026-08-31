/**
 * The single tenancy boundary for the dashboard (server-only).
 *
 * Every authenticated surface resolves "who is calling, and which app_account
 * do they own" through this module. Two deliberate variants share one
 * session → account resolution:
 *
 * - `requireAccount()` — for createServerFn handlers. Throws on failure
 *   (`unauthorized` / missing-account), which TanStack Start surfaces to the
 *   caller as a server-function error.
 * - `requireAccountForApi()` — for raw API route handlers (Stripe checkout /
 *   portal). Returns a JSON `Response` with a real HTTP status (401 / 404)
 *   instead of throwing, because route handlers must produce the response
 *   themselves.
 *
 * The `…ForSession(db, session)` cores are exported so tests can exercise
 * both variants DB-real against PGlite without forging a Better Auth
 * session — the same parameterization pattern as src/server/alerts.ts.
 */

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import type { AppAccount } from "@/lib/db/schema";
import { jsonError } from "@/lib/api-utils.server";

type Db = BunSQLDatabase<typeof schema>;

/** Structural minimum of a Better Auth session that this boundary reads. */
export interface SessionWithUser {
  user: { id: string; email: string };
}

async function findAccount(db: Db, userId: string): Promise<AppAccount | undefined> {
  const { appAccounts } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId)).limit(1);
  return rows[0];
}

/** Server-function core: throws on failure. */
export async function requireAccountForSession<S extends SessionWithUser>(
  db: Db,
  session: S | null,
): Promise<{ session: S; account: AppAccount; db: Db }> {
  if (!session) throw new Error("unauthorized");
  const account = await findAccount(db, session.user.id);
  if (!account) throw new Error("no app_account for user — bootstrap hook missed");
  return { session, account, db };
}

/** API-route core: returns a Response on failure instead of throwing. */
export async function requireAccountForApiForSession(
  db: Db,
  session: SessionWithUser | null,
): Promise<
  { ok: true; account: AppAccount; session: { user: { id: string; email: string } } } | Response
> {
  if (!session) return jsonError("unauthorized", 401);
  const account = await findAccount(db, session.user.id);
  if (!account) return jsonError("no account", 404);
  return {
    ok: true,
    account,
    session: { user: { id: session.user.id, email: session.user.email } },
  };
}

async function currentSessionAndDb() {
  const { auth } = await import("@/lib/auth.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const { db } = await import("@/lib/db/index.server");
  const session = await auth.api.getSession({ headers: getRequest().headers });
  return { db, session };
}

/** Auth gate for server functions: session + app_account, or throw. */
export async function requireAccount() {
  const { db, session } = await currentSessionAndDb();
  return requireAccountForSession(db, session);
}

/** Auth gate for API route handlers: session + app_account, or a 401/404 Response. */
export async function requireAccountForApi() {
  const { db, session } = await currentSessionAndDb();
  return requireAccountForApiForSession(db, session);
}
