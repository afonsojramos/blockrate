import { createBlockRateHandler } from "block-rate/next";

export const POST = createBlockRateHandler({
  onResult: async (result) => {
    console.log(JSON.stringify({ event: "block_rate_check", ...result }));
  },
});
