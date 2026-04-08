import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness check for Railway. Static 200 — does NOT touch the DB.
 * Touching the DB risks leaking connection-string fragments via
 * stringified errors (security-sentinel review).
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    },
  },
});
