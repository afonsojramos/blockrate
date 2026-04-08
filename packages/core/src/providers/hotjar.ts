import { probe } from "../probe";
import type { Provider } from "../types";

export const hotjar: Provider = {
  name: "hotjar",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).hj) return "loaded";
    return probe("https://static.hotjar.com/c/hotjar.js");
  },
};
