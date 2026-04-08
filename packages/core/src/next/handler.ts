import type { BlockRateResult } from "../types";

export interface BlockRateHandlerOptions {
  onResult?: (result: BlockRateResult) => void | Promise<void>;
}

export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
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
