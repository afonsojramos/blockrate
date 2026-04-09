import { serverReporter } from "block-rate";
import { useBlockRate } from "block-rate/react";

/**
 * Dogfood: blockrate.app uses the block-rate library on itself, reporting
 * to its own /api/ingest. The whole point of the product is "your analytics
 * are blocked more than you think" — running the OSS library on the
 * marketing/landing surface puts our money where our mouth is.
 *
 * No-op when VITE_BLOCKRATE_PUBLIC_KEY is unset (dev mode). The underlying
 * useBlockRate hook is SSR-safe and runs once on mount.
 *
 * Why fetch + keepalive (via serverReporter), not sendBeacon: the Beacon
 * API can't set custom headers, so we can't pass `x-block-rate-key`. The
 * `serverReporter` helper that ships with block-rate handles exactly this
 * case via `fetch({ keepalive: true })`.
 *
 * The key bootstrap (see apps/web/README.md → "Dogfooding") happens
 * post-deploy via the dashboard or seed script — we can't bake a key
 * into source.
 */
export function Dogfood() {
  const apiKey = import.meta.env.VITE_BLOCKRATE_PUBLIC_KEY;

  useBlockRate(
    apiKey
      ? {
          providers: ["optimizely", "posthog", "ga4", "gtm", "segment"],
          service: "blockrate-app",
          sampleRate: 0.25,
          delay: 3000,
          // Empty endpoint → relative "/ingest" URL → browser resolves it
          // against the current origin. Avoids touching window during SSR.
          reporter: serverReporter({
            endpoint: "/api",
            apiKey,
          }),
        }
      : // No-op when key is missing — sampleRate 0 means the check itself
        // never runs. dev mode is unaffected.
        {
          providers: [],
          reporter: () => {},
          sampleRate: 0,
          delay: 0,
        }
  );

  return null;
}
