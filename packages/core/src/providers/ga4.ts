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
    return probe("https://www.google-analytics.com/analytics.js");
  },
};
