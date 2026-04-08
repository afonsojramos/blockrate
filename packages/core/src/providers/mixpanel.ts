import { probe } from "../probe";
import type { Provider } from "../types";

export const mixpanel: Provider = {
  name: "mixpanel",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).mixpanel) {
      return "loaded";
    }
    return probe("https://cdn.mxpnl.com/libs/mixpanel.js");
  },
};
