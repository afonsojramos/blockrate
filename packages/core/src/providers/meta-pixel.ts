import { probeImage } from "../probe";
import type { Provider } from "../types";

export const metaPixel: Provider = {
  name: "meta-pixel",
  detect: async () => {
    // The Meta Pixel base code itself sets `n.loaded = !0` on the stub
    // it installs at `window.fbq` — checking either `window.fbq` or
    // `fbq.loaded` therefore cannot distinguish a stub from a real
    // load. The pixel endpoint is the ground truth: uBlock Origin et
    // al. block the network request, so onerror fires reliably whether
    // the snippet ran or not.
    //
    // Why probe-as-image, not fetch? Meta deliberately serves no CORS
    // headers on `connect.facebook.net` or `facebook.com/tr` via HEAD
    // — the pixel is meant to load as an image, not via fetch. Probe
    // the actual pixel endpoint the same way the real pixel hits it.
    return probeImage("https://www.facebook.com/tr?id=0&ev=PageView");
  },
};
