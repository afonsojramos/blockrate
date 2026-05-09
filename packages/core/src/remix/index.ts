import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "../handler";
export { isValidBlockRateResult } from "../validate";

/**
 * Remix / React Router v7 resource-route action. Both frameworks pass
 * Web-standard `{ request: Request }` to action functions and accept a
 * `Response` back, so the core handler works directly.
 *
 * Remix v2:
 *
 * ```ts
 * // app/routes/api.block-rate.ts
 * import { createBlockRateHandler } from "blockrate/remix";
 *
 * export const action = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 * ```
 *
 * React Router v7 (framework mode):
 *
 * ```ts
 * // app/routes/api.block-rate.ts
 * import { createBlockRateHandler } from "blockrate/remix";
 *
 * export const action = createBlockRateHandler({
 *   forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
 * });
 * ```
 *
 * The export name is the same in both frameworks because v7 inherited
 * Remix's resource-route conventions wholesale. The function signature
 * `({ request }) => Response` has been stable since Remix v1.
 */
export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  const handle = createWebHandler(options);
  return async function action(args: { request: Request }): Promise<Response> {
    return handle(args.request);
  };
}
