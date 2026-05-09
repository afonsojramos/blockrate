import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "../handler";
export { isValidBlockRateResult } from "../validate";

/**
 * Astro endpoint POST handler. Astro hands the endpoint a Web-standard
 * `{ request: Request }` and expects a `Response` back, so the core
 * Web-standard handler works with a single line of glue.
 *
 * ```ts
 * // src/pages/api/block-rate.ts
 * import { createBlockRateHandler } from "blockrate/astro";
 *
 * export const POST = createBlockRateHandler({
 *   forward: { apiKey: import.meta.env.BLOCKRATE_API_KEY },
 * });
 * ```
 *
 * If you're building Astro for an SSG-only output, configure the page
 * for SSR by setting `export const prerender = false;` so the endpoint
 * is hit at request time (it has to be — analytics-blocking is per-user,
 * not per-build).
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  const handle = createWebHandler(options);
  return async function POST(context: { request: Request }): Promise<Response> {
    return handle(context.request);
  };
}
