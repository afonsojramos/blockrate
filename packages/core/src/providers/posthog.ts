import { probe } from "../probe";
import type { Provider } from "../types";

export const posthog: Provider = {
  name: "posthog",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).posthog) {
      return "loaded";
    }
    return probe("https://us.i.posthog.com/static/array.js");
  },
};
