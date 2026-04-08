import type { Provider } from "../types";
import { optimizely } from "./optimizely";
import { posthog } from "./posthog";
import { ga4 } from "./ga4";

export const builtInProviders: Record<string, Provider> = {
  optimizely,
  posthog,
  ga4,
};

export { optimizely, posthog, ga4 };
