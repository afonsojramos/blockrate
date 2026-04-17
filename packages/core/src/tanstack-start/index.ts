import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "../handler";
export { isValidBlockRateResult } from "../validate";

/**
 * TanStack Start API route handler.
 *
 * ```ts
 * // src/routes/api/block-rate.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { createBlockRateHandler } from "blockrate/tanstack-start";
 *
 * const handler = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 *
 * export const Route = createFileRoute("/api/block-rate")({
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
