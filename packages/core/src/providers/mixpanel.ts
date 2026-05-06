import { probe } from "../probe";
import type { Provider } from "../types";

export const mixpanel: Provider = {
  name: "mixpanel",
  detect: async () => {
    // The Mixpanel loader snippet creates `window.mixpanel` as a
    // queueing stub the moment it runs — `typeof window.mixpanel`
    // alone returns "object" regardless of whether the real bundle
    // ever loaded. Only the loaded library sets `__loaded = true`
    // after `mixpanel.init()` resolves.
    if (typeof window !== "undefined" && (window as any).mixpanel?.__loaded === true) {
      return "loaded";
    }
    return probe("https://cdn.mxpnl.com/libs/mixpanel.js");
  },
};
