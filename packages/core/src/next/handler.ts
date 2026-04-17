import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

/**
 * Next.js App Router POST handler.
 *
 * ```ts
 * // app/api/block-rate/route.ts
 * import { createBlockRateHandler } from "blockrate/next";
 *
 * export const POST = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 * ```
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return createWebHandler(options);
}
