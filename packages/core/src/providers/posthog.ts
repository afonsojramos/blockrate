import { probe } from "../probe";
import type { Provider } from "../types";

/**
 * PostHog has US and EU cloud instances. Customers use one or the other
 * based on their data residency choice. We probe both — if either is
 * reachable, PostHog is "loaded". Ad blockers that target PostHog block
 * both domains.
 */
export const posthog: Provider = {
  name: "posthog",
  detect: async () => {
    if (typeof window !== "undefined" && (window as any).posthog) {
      return "loaded";
    }
    // Race both regions — first "loaded" wins, both must fail for "blocked"
    const results = await Promise.all([
      probe("https://us.i.posthog.com/static/array.js"),
      probe("https://eu.i.posthog.com/static/array.js"),
    ]);
    return results.includes("loaded") ? "loaded" : "blocked";
  },
};
