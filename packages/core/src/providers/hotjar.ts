import { probe } from "../probe";
import type { Provider } from "../types";

export const hotjar: Provider = {
  name: "hotjar",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).hj) return "loaded";
    // `script.hotjar.com` is the current Hotjar script host; the legacy
    // `static.hotjar.com/c/hotjar.js` path 404s since Hotjar moved to
    // per-site bundles. 403 at the root is fine — probe only cares
    // whether fetch throws.
    return probe("https://script.hotjar.com/");
  },
};
