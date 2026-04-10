import type { BlockRateResult, Reporter } from "./types";

export interface ServerReporterOptions {
  /** Base URL of your blockrate-server (e.g. https://br.example.com). */
  endpoint: string;
  /** Tenant API key. */
  apiKey: string;
}

/**
 * Reporter targeting a `blockrate-server` instance. Uses fetch with keepalive
 * because sendBeacon does not support custom headers (needed for the API key).
 */
export function serverReporter({ endpoint, apiKey }: ServerReporterOptions): Reporter {
  const url = endpoint.replace(/\/$/, "") + "/ingest";
  return (result: BlockRateResult) => {
    try {
      fetch(url, {
        method: "POST",
        body: JSON.stringify(result),
        headers: {
          "Content-Type": "application/json",
          "x-blockrate-key": apiKey,
        },
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Silently fail
    }
  };
}

export function beaconReporter(endpoint: string): Reporter {
  return (result: BlockRateResult) => {
    const body = JSON.stringify(result);
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
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
