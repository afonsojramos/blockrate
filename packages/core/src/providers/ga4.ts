import { probe } from "../probe";
import type { Provider } from "../types";

export const ga4: Provider = {
  name: "ga4",
  detect: async () => {
    // `window.gtag` is defined inline by every GA4 snippet
    // (`window.gtag = function(){ dataLayer.push(arguments) }`) and
    // `window.dataLayer` is populated by the inline `gtag('config', …)`
    // call in the same snippet — both exist regardless of whether the
    // real gtag.js was ever fetched, so they cannot distinguish stub
    // from real load. The real gtag.js sets `window.google_tag_data`
    // after it executes; that's the post-load signal.
    if (typeof window !== "undefined" && (window as any).google_tag_data) {
      return "loaded";
    }
    // /g/collect is the GA4 data-collection endpoint. Returns 204 + CORS.
    // Distinct from googletagmanager.com (gtm probe) — EasyList often
    // blocks google-analytics.com without blocking googletagmanager.com,
    // so probing here gives the accurate "can GA4 send data?" signal.
    return probe("https://www.google-analytics.com/g/collect");
  },
};
