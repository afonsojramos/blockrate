import { probe } from "../probe";
import type { Provider } from "../types";

export const amplitude: Provider = {
  name: "amplitude",
  detect: async () => {
    // The Amplitude loader snippet (and the Browser SDK 2.x bundles)
    // populate `window.amplitude` with a queueing stub indistinguishable
    // from the loaded SDK without inspecting internals that vary across
    // SDK majors (`getInstance()._isInitialized` for v7/v8, completely
    // different shape for v9+). The probe against `cdn.amplitude.com`
    // is the ground truth — blocklists target the hostname either way.
    return probe("https://cdn.amplitude.com/libs/amplitude-9.js");
  },
};
