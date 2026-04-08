import { probe } from "../probe";
import type { Provider } from "../types";

export const segment: Provider = {
  name: "segment",
  detect: async () => {
    if (typeof window !== "undefined") {
      const a = (window as any).analytics;
      if (a && (typeof a.track === "function" || Array.isArray(a))) {
        return "loaded";
      }
    }
    return probe("https://cdn.segment.com/analytics.js/v1/");
  },
};
