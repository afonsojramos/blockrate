// SvelteKit forward route. Set BLOCKRATE_API_KEY in your deploy's server
// env — $env/dynamic/private keeps it off the client bundle.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { env } from "$env/dynamic/private";
import { createBlockRateHandler } from "blockrate/sveltekit";

export const POST = createBlockRateHandler({
  forward: { apiKey: env.BLOCKRATE_API_KEY },
});
