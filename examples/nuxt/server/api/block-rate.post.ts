// Nuxt (Nitro) forward route. The Nuxt server runtime exposes a standard
// H3Event; `toWebRequest` converts it to a Web-standard Request that the
// blockrate core handler understands. BLOCKRATE_API_KEY must be set
// server-side — Nuxt exposes it through the environment directly, not a
// NUXT_PUBLIC_ prefix.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export default defineEventHandler((event) => handle(toWebRequest(event)));
