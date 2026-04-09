import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions } from "../handler";

/**
 * TanStack Start API route handler.
 *
 * ```ts
 * // src/routes/api/blockrate.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { createBlockRateHandler } from "blockrate/tanstack-start";
 *
 * const handler = createBlockRateHandler({
 *   onResult: async (result) => console.log(result),
 * });
 *
 * export const Route = createFileRoute("/api/blockrate")({
 *   server: {
 *     handlers: {
 *       POST: ({ request }) => handler(request),
 *     },
 *   },
 * });
 * ```
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return createWebHandler(options);
}
