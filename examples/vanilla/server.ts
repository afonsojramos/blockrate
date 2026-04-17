// Minimal Bun server that pairs with the vanilla HTML example. In a real
// integration the browser POSTs blockrate results to /api/block-rate on
// this origin, and this handler forwards them upstream with the API key
// (from the server env — never shipped to the browser).
//
// This same shape covers any "SPA + your own backend" deployment —
// Vite + React/Vue/Solid with Hono / Express / Fastify / Bun / Workers.
// `createWebHandler` returns a Web-standard `(Request) => Promise<Response>`
// function; whichever backend you use just needs to route POST
// /api/block-rate to it.
//
// Run with: BLOCKRATE_API_KEY=br_... bun run server.ts
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

Bun.serve({
  port: 3000,
  fetch: (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/api/block-rate" && req.method === "POST") {
      return handle(req);
    }
    return new Response("not found", { status: 404 });
  },
});

console.log("listening on http://localhost:3000");
