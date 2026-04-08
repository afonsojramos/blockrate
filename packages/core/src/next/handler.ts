import { createWebHandler } from "../handler";
import type { BlockRateHandlerOptions } from "../handler";

export type { BlockRateHandlerOptions } from "../handler";

export function createBlockRateHandler(options: BlockRateHandlerOptions = {}) {
  return createWebHandler(options);
}
