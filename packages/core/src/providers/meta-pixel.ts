import { probe } from "../probe";
import type { Provider } from "../types";

export const metaPixel: Provider = {
  name: "meta-pixel",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).fbq) return "loaded";
    return probe("https://connect.facebook.net/en_US/fbevents.js");
  },
};
