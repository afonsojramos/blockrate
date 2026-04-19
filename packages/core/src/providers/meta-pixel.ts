import { probeImage } from "../probe";
import type { Provider } from "../types";

export const metaPixel: Provider = {
  name: "meta-pixel",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).fbq) return "loaded";
    // Meta deliberately serves no CORS headers on `connect.facebook.net`
    // or `facebook.com/tr` via HEAD — the pixel is meant to load as an
    // image, not via fetch. Probe the actual pixel endpoint the same
    // way the real pixel hits it: as an <img>. Ad blockers block the
    // hostname either way, so onerror is the accurate "blocked" signal.
    return probeImage("https://www.facebook.com/tr?id=0&ev=PageView");
  },
};
