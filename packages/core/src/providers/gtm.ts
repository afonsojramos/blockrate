import { probe } from "../probe";
import type { Provider } from "../types";

export const gtm: Provider = {
  name: "gtm",
  detect: async () => {
    // Unlike most providers, the GTM container snippet only writes to
    // `dataLayer` and inserts the script tag — it does *not* set
    // `window.google_tag_manager` itself. That global is created
    // exclusively by gtm.js after it loads, so it is a reliable
    // post-load signal (don't "fix" this to a stub-aware check; it is
    // not a stub).
    if (typeof window !== "undefined" && (window as any).google_tag_manager) {
      return "loaded";
    }
    return probe("https://www.googletagmanager.com/gtag/js");
  },
};
