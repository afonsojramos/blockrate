import { createFileRoute } from "@tanstack/react-router";

/**
 * Dogfood endpoint: the same-origin route that the Dogfood component on
 * blockrate.app posts to. Forwards to our own /api/ingest over loopback so
 * the OSS `createBlockRateHandler({ forward })` pattern is what we ship
 * to customers AND what we use ourselves.
 *
 * Disabled unless BLOCKRATE_API_KEY is set server-side — keeps dev a
 * no-op and lets production boot without the key until it's provisioned
 * via the dashboard bootstrap flow (see apps/web/README.md → Dogfooding).
 *
 * Uses BLOCKRATE_SELF_URL (falling back to BETTER_AUTH_URL) so the self-
 * loopback target can move independently of the auth host. If construction
 * fails (malformed key), we log loudly once and serve a 204 rather than
 * crash module init.
 */

type Handler = (request: Request) => Promise<Response>;

const NOOP_HANDLER: Handler = async () => new Response(null, { status: 204 });

async function buildHandler(): Promise<Handler> {
  const apiKey = process.env.BLOCKRATE_API_KEY;
  if (!apiKey) return NOOP_HANDLER;
  const selfBase =
    process.env.BLOCKRATE_SELF_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const { createWebHandler } = await import("blockrate");
  try {
    return createWebHandler({
      forward: {
        apiKey,
        endpoint: `${selfBase}/api`,
        onError: (err) => {
          console.error("[blockrate dogfood] forward failed", err);
        },
      },
    });
  } catch (constructionErr) {
    console.error(
      "[blockrate dogfood] createWebHandler threw at construction — check BLOCKRATE_API_KEY format. Falling back to no-op.",
      constructionErr,
    );
    return NOOP_HANDLER;
  }
}

const handlerPromise: Promise<Handler> = buildHandler().catch((err) => {
  console.error("[blockrate dogfood] handler module init failed, using no-op", err);
  return NOOP_HANDLER;
});

export const Route = createFileRoute("/api/block-rate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const handle = await handlerPromise;
        return handle(request);
      },
    },
  },
});
