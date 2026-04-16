/**
 * Shared utilities for API route handlers (server-only).
 *
 * - jsonError: consistent JSON error response
 * - requireAccountForApi: auth gate that returns Response on failure
 */

import type { AppAccount } from "./db/schema";

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireAccountForApi(): Promise<
  { ok: true; account: AppAccount; session: { user: { id: string; email: string } } } | Response
> {
  const { auth } = await import("@/lib/auth.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const { db } = await import("@/lib/db/index.server");
  const { appAccounts } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) return jsonError("unauthorized", 401);

  const rows = await db
    .select()
    .from(appAccounts)
    .where(eq(appAccounts.userId, session.user.id))
    .limit(1);
  const account = rows[0];
  if (!account) return jsonError("no account", 404);

  return {
    ok: true,
    account,
    session: { user: { id: session.user.id, email: session.user.email } },
  };
}
