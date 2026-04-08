import { probe } from "../probe";
import type { Provider } from "../types";

export const intercom: Provider = {
  name: "intercom",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).Intercom) {
      return "loaded";
    }
    return probe("https://widget.intercom.io/widget/");
  },
};
