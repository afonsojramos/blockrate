import { probe } from "../probe";
import type { Provider } from "../types";

export const segment: Provider = {
  name: "segment",
  detect: async () => {
    // Segment's loader snippet creates `window.analytics` as an array
    // with factory-built `track` / `identify` stubs *before* the real
    // analytics.min.js loads — `Array.isArray(analytics)` and
    // `typeof analytics.track === "function"` are both true on the stub
    // alone, so they cannot distinguish a real load from a blocked one.
    // The real bundle sets `analytics.initialized = true` after
    // `analytics.load()` resolves; that's the only reliable post-load
    // signal.
    if (typeof window !== "undefined") {
      const a = (window as any).analytics;
      if (a && a.initialized === true) return "loaded";
    }
    return probe("https://cdn.segment.com/analytics.js/v1/");
  },
};
