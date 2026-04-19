import { probe } from "../probe";
import type { Provider } from "../types";

export const ga4: Provider = {
  name: "ga4",
  detect: async () => {
    if (typeof window !== "undefined") {
      const w = window as any;
      if (w.gtag || (Array.isArray(w.dataLayer) && w.dataLayer.length > 0)) {
        return "loaded";
      }
    }
    // /g/collect is the GA4 data-collection endpoint. Returns 204 + CORS.
    // Distinct from googletagmanager.com (gtm probe) — EasyList often
    // blocks google-analytics.com without blocking googletagmanager.com,
    // so probing here gives the accurate "can GA4 send data?" signal.
    return probe("https://www.google-analytics.com/g/collect");
  },
};
