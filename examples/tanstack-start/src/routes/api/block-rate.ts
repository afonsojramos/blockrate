// TanStack Start forward route. Mirrors the Next.js example — same API,
// different framework idiom. Set BLOCKRATE_API_KEY in the server env.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createFileRoute } from "@tanstack/react-router";
import { createBlockRateHandler } from "blockrate/tanstack-start";

const handler = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export const Route = createFileRoute("/api/block-rate")({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
});
