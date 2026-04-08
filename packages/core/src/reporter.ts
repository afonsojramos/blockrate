import type { BlockRateResult, Reporter } from "./types";

export function beaconReporter(endpoint: string): Reporter {
  return (result: BlockRateResult) => {
    const body = JSON.stringify(result);
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(
          endpoint,
          new Blob([body], { type: "application/json" })
        );
        if (ok) return;
      }
    } catch {
      // fall through to fetch
    }
    try {
      fetch(endpoint, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Silently fail
    }
  };
}
