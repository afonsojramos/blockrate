import type { Provider } from "../types";
import { optimizely } from "./optimizely";
import { posthog } from "./posthog";
import { ga4 } from "./ga4";
import { gtm } from "./gtm";
import { segment } from "./segment";
import { hotjar } from "./hotjar";
import { amplitude } from "./amplitude";
import { mixpanel } from "./mixpanel";
import { metaPixel } from "./meta-pixel";
import { intercom } from "./intercom";

export const builtInProviders: Record<string, Provider> = {
  optimizely,
  posthog,
  ga4,
  gtm,
  segment,
  hotjar,
  amplitude,
  mixpanel,
  "meta-pixel": metaPixel,
  intercom,
};

export { optimizely, posthog, ga4, gtm, segment, hotjar, amplitude, mixpanel, metaPixel, intercom };
