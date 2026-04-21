import { createFileRoute, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AppSubnav } from "@/components/app-subnav";

/**
 * Session check via createServerFn so the import of auth never leaks into
 * the client bundle. From the client, this becomes an HTTP call to the
 * server; from the server (SSR), it's an in-process call.
 *
 * Returns a boolean, not the session object: Better Auth's session payload
 * contains Date instances (expiresAt/createdAt/updatedAt) that crash the
 * TanStack Start RPC deserializer on the client, which surfaces as a
 * spurious errorComponent → redirect-to-/login for logged-in users. Child
 * routes that need user fields should call their own server fn that
 * projects to primitives (see server/session.ts).
 */
const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  const { auth } = await import("@/lib/auth.server");
  const session = await auth.api.getSession({ headers: getRequest().headers });
  return Boolean(session);
});

/**
 * Auth-gated layout route. Every child of /_authed/* inherits this guard.
 *
 * Performance: with cookieCache enabled in lib/auth.server.ts, this does NOT
 * hit the DB on every navigation — it verifies a signed cookie locally.
 *
 * Security: explicit errorComponent fails CLOSED (redirect to /login) so a
 * DB outage cannot reveal a gated page.
 */
export const Route = createFileRoute("/_authed")({
  head: () => ({
    meta: [{ title: "app — blockrate" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  beforeLoad: async () => {
    const loggedIn = await fetchSession();
    if (!loggedIn) throw redirect({ to: "/login" });
  },
  errorComponent: () => <Navigate to="/login" />,
  component: () => (
    <>
      <AppSubnav />
      <Outlet />
    </>
  ),
});
