// Astro endpoint. Set BLOCKRATE_API_KEY in your deploy's server env —
// import.meta.env keeps unprefixed vars server-only.
//
// If you build Astro with SSG output, this endpoint must render at request
// time: keep `export const prerender = false;` below.
//
// Scaffolded by blockrate-init. Source of truth:
// packages/core/src/astro/index.ts in the blockrate repo.
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createBlockRateHandler } from "blockrate/astro";

export const prerender = false;

export const POST = createBlockRateHandler({
  forward: { apiKey: import.meta.env.BLOCKRATE_API_KEY },
});
