import { probe } from "../probe";
import type { Provider } from "../types";

export const amplitude: Provider = {
  name: "amplitude",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).amplitude) {
      return "loaded";
    }
    return probe("https://cdn.amplitude.com/libs/amplitude-8.js");
  },
};
