import { createFileRoute, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AppSubnav } from "@/components/app-subnav";

/**
 * Session check via createServerFn so the import of auth never leaks into
 * the client bundle. From the client, this becomes an HTTP call to the
 * server; from the server (SSR), it's an in-process call.
 */
const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  const { auth } = await import("@/lib/auth.server");
  return auth.api.getSession({ headers: getRequest().headers });
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
  beforeLoad: async () => {
    const session = await fetchSession();
    if (!session) throw redirect({ to: "/login" });
    return { user: session.user };
  },
  errorComponent: () => <Navigate to="/login" />,
  component: () => (
    <>
      <AppSubnav />
      <Outlet />
    </>
  ),
});
