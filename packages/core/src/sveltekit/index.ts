import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "../handler";
export { isValidBlockRateResult } from "../validate";

/**
 * SvelteKit `+server.ts` POST handler.
 *
 * ```ts
 * // src/routes/api/block-rate/+server.ts
 * import { createBlockRateHandler } from "blockrate/sveltekit";
 *
 * export const POST = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 * ```
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  const handle = createWebHandler(options);
  return async function POST(event: { request: Request }): Promise<Response> {
    return handle(event.request);
  };
}
