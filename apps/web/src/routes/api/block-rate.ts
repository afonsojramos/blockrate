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
 */

async function buildHandler(): Promise<(request: Request) => Promise<Response>> {
  const apiKey = process.env.BLOCKRATE_API_KEY;
  if (!apiKey) {
    return async () => new Response(null, { status: 204 });
  }
  const { createWebHandler } = await import("blockrate");
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return createWebHandler({
    forward: {
      apiKey,
      endpoint: `${base}/api`,
      onError: (err) => {
        console.error("[blockrate dogfood] forward failed", err);
      },
    },
  });
}

const handlerPromise = buildHandler();

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
