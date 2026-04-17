// SolidStart forward route. Set BLOCKRATE_API_KEY in your deploy's
// server env.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export const POST = (event: { request: Request }) => handle(event.request);
