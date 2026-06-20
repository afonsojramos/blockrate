import { probe } from "../probe";
import type { Provider } from "../types";

export const metaPixel: Provider = {
  name: "meta-pixel",
  detect: async () => {
    // The Meta Pixel base code itself sets `n.loaded = !0` on the stub
    // it installs at `window.fbq` — checking either `window.fbq` or
    // `fbq.loaded` therefore cannot distinguish a stub from a real
    // load. The pixel endpoint is the ground truth: uBlock Origin et
    // al. block the request to `facebook.com/tr`, so a CORS failure is
    // the reliable signal whether the snippet ran or not.
    //
    // GET, not HEAD: `facebook.com/tr` reflects the Origin in
    // Access-Control-Allow-Origin on GET but serves no CORS headers on
    // HEAD, so a HEAD probe would TypeError even when unblocked. We do NOT
    // use an image probe: Meta switched `/tr` from a 1x1 gif to an empty
    // `text/plain` 200, which made `<img>` onerror fire for every visitor
    // (reporting 100% blocked). A CORS GET resolves when reachable and
    // throws when the request is blocked or redirected to a non-CORS stub.
    return probe("https://www.facebook.com/tr?id=0&ev=PageView", 3000, "GET");
  },
};
