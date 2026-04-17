import { useBlockRate } from "blockrate/react";

/**
 * Dogfood: blockrate.app uses the blockrate library on itself. The whole
 * point of the product is "your analytics are blocked more than you
 * think" — running the OSS library on the marketing/landing surface puts
 * our money where our mouth is.
 *
 * Follows the same-origin pattern we recommend to every customer. The
 * browser posts to /api/block-rate on this origin; that route forwards
 * to /api/ingest server-side with a key pulled from BLOCKRATE_API_KEY.
 * The key never reaches the browser — see apps/web/src/routes/api/block-rate.ts.
 *
 * When BLOCKRATE_API_KEY is unset the server route is a 204 no-op, so it
 * is safe to keep this component mounted on every page regardless of
 * environment.
 */
export function Dogfood() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4", "gtm", "segment"],
    service: "blockrate-app",
    sampleRate: 0.25,
    delay: 3000,
    reporter: (result) => {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
        return;
      }
      fetch("/api/block-rate", {
        method: "POST",
        body: JSON.stringify(result),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    },
  });

  return null;
}
