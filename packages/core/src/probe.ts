import type { ProviderStatus } from "./types";

/**
 * Probe a CDN URL to determine if it's reachable from this browser.
 *
 * Strategy: fetch with `mode: "cors"`. Public JS/analytics CDNs all serve
 * `Access-Control-Allow-Origin: *`, so a real CDN response returns a usable
 * response → "loaded". When an ad blocker intercepts the request — whether
 * by blocking outright (TypeError) OR redirecting to a local nooptext
 * response (which lacks CORS headers → TypeError) — we correctly detect
 * "blocked".
 *
 * Why not `no-cors`? Ad blockers like uBlock Origin redirect HEAD requests
 * to local `nooptext:-1` responses instead of blocking. With `no-cors`,
 * fetch sees an opaque "success" and we'd falsely report "loaded" even
 * though the real CDN was never reached. `cors` mode catches this because
 * the redirect target has no CORS headers → TypeError.
 */
export async function probe(url: string, timeoutMs = 3000): Promise<ProviderStatus> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "cors",
      cache: "no-store",
      signal: controller?.signal,
    });
    // Any successful response (even 404) means the CDN is reachable
    return "loaded";
  } catch {
    return "blocked";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
