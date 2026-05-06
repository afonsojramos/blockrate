import { probe } from "../probe";
import type { Provider } from "../types";

export const intercom: Provider = {
  name: "intercom",
  detect: async () => {
    // The Intercom snippet creates `window.Intercom` as a callable
    // queueing stub — `typeof Intercom === "function"` is true the
    // moment it runs, regardless of whether the widget bundle ever
    // loaded. `Intercom.booted` is only set after the customer calls
    // `Intercom('boot', …)`, which not every page does and is not a
    // reliable post-load signal. The probe against
    // `widget.intercom.io` is the ground truth.
    return probe("https://widget.intercom.io/widget/");
  },
};
