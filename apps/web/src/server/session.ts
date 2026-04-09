import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Lightweight session check for the root layout. Returns the user's
 * email + name if logged in, null otherwise. Used by the Nav to show
 * "Sign in" vs "Dashboard" + avatar initial.
 */
export const getNavSession = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { auth } = await import("@/lib/auth.server");
      const session = await auth.api.getSession({
        headers: getRequest().headers,
      });
      if (!session) return null;
      return {
        email: session.user.email,
        name: session.user.name,
      };
    } catch {
      return null;
    }
  }
);

export type NavSession = Awaited<ReturnType<typeof getNavSession>>;
