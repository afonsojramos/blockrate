// Next.js App Router forward route. The hosted blockrate.app ingest URL
// is built in; only the api key (from the server environment) is needed.
//
// Set BLOCKRATE_API_KEY in your deploy's server-side env. For a staging
// environment or self-hosted blockrate-server, pass forward.endpoint.
//
// Why this has to be server-side — not a fetch from the browser — is
// explained at
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
