import type { BlockRateResult } from "./types";

export interface BlockRateHandlerOptions {
  onResult?: (result: BlockRateResult) => void | Promise<void>;
}

/**
 * Framework-agnostic web handler. Takes a standard Request, returns a
 * standard Response. Used by every server-side adapter.
 */
export function createWebHandler(options: BlockRateHandlerOptions = {}) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const result = (await request.json()) as BlockRateResult;
      if (options.onResult) {
        await options.onResult(result);
      }
      return new Response(null, { status: 204 });
    } catch {
      return new Response("invalid payload", { status: 400 });
    }
  };
}
