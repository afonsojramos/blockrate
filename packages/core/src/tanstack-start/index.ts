import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions } from "../handler";

/**
 * TanStack Start API route handler.
 *
 * ```ts
 * // src/routes/api/block-rate.ts
 * import { createAPIFileRoute } from "@tanstack/start/api";
 * import { createBlockRateHandler } from "block-rate/tanstack-start";
 *
 * const handler = createBlockRateHandler({
 *   onResult: async (result) => console.log(result),
 * });
 *
 * export const Route = createAPIFileRoute("/api/block-rate")({
 *   POST: ({ request }) => handler(request),
 * });
 * ```
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return createWebHandler(options);
}
