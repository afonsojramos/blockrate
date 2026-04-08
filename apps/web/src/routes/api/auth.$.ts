import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth.server";

/**
 * Catch-all for all Better Auth endpoints (sign-in, sign-up, magic link
 * verify, sign-out, session, callbacks). Better Auth's `auth.handler`
 * implements the entire surface — we just forward Request → Response.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
