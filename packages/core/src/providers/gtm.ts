import { probe } from "../probe";
import type { Provider } from "../types";

export const gtm: Provider = {
  name: "gtm",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).google_tag_manager) {
      return "loaded";
    }
    return probe("https://www.googletagmanager.com/gtag/js");
  },
};
