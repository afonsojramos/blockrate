import { probe } from "../probe";
import type { Provider } from "../types";

export const optimizely: Provider = {
  name: "optimizely",
  detect: async () => {
    // The Optimizely loader snippet creates `window.optimizely` as an
    // array (`window.optimizely = window.optimizely || []`) for command
    // queueing — truthy from the moment the snippet runs, blocked CDN
    // or not. The loaded library replaces it with an object whose
    // command interface goes through `optimizely.get` (or `push` with
    // a richer shape). Distinguish on shape: a non-array with a `get`
    // function is the real client; a plain array is the stub.
    if (typeof window !== "undefined") {
      const o = (window as any).optimizely;
      if (o && !Array.isArray(o) && typeof o.get === "function") return "loaded";
    }
    return probe("https://cdn.optimizely.com/public/optimizely-edge-agent.json");
  },
};
