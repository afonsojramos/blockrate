import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "../handler";
export { isValidBlockRateResult } from "../validate";

/**
 * Nuxt 3 / Nitro server route. Nitro's `defineEventHandler` exposes a
 * Web-standard `Request` via `toWebRequest(event)` from h3 ≥ 1.8, which
 * is what every modern Nuxt project ships. We don't import h3 here to
 * avoid a runtime dependency — the customer wires it in their handler:
 *
 * ```ts
 * // server/api/block-rate.post.ts
 * import { toWebRequest } from "h3";
 * import { createBlockRateHandler } from "blockrate/nuxt";
 *
 * const handler = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 *
 * export default defineEventHandler((event) => handler(toWebRequest(event)));
 * ```
 *
 * The exported function takes a Web-standard `Request` and returns a
 * `Response`. If you've already adapted h3's event to a Request
 * elsewhere in your codebase, you can call `handler(request)` directly.
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return createWebHandler(options);
}
