// Remix / React Router v7 resource-route action. Set BLOCKRATE_API_KEY in
// your deploy's server env. The `action` export name and the
// `({ request }) => Response` signature are shared by Remix v2 and React
// Router v7 framework mode.
//
// Scaffolded by blockrate-init. Source of truth:
// packages/core/src/remix/index.ts in the blockrate repo.
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createBlockRateHandler } from "blockrate/remix";

export const action = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
