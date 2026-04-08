import { probe } from "../probe";
import type { Provider } from "../types";

export const optimizely: Provider = {
  name: "optimizely",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).optimizely) {
      return "loaded";
    }
    return probe("https://cdn.optimizely.com/public/optimizely-edge-agent.json");
  },
};
