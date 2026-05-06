import { probe } from "../probe";
import type { Provider } from "../types";

export const hotjar: Provider = {
  name: "hotjar",
  detect: async () => {
    // The Hotjar snippet creates `window.hj` as a queueing function
    // (`(hj.q = hj.q || []).push(arguments)`) before `script.hotjar.com`
    // ever responds — `typeof window.hj === "function"` is true on the
    // stub alone. Hotjar's loaded module replaces `hj` but the shape
    // delta varies across versions, so there's no stable post-load
    // discriminator. The probe is the ground truth.
    //
    // Why this URL? `script.hotjar.com` is the current Hotjar script
    // host; the legacy `static.hotjar.com/c/hotjar.js` path 404s since
    // Hotjar moved to per-site bundles. 403 at the root is fine —
    // probe only cares whether fetch throws.
    return probe("https://script.hotjar.com/");
  },
};
