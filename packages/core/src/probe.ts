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

/**
 * Image-based probe for providers whose CDN does not serve CORS headers
 * (Meta Pixel is the canonical case — `connect.facebook.net` and
 * `facebook.com/tr` deliberately refuse CORS on HEAD). Image tags don't
 * require CORS: any cross-origin image can `<img src>` load as long as
 * the network request succeeds. Ad blockers block the network request
 * itself (by hostname/path), so `onerror` is the correct signal.
 *
 * Guards against server-side import: `Image` is browser-only. If this
 * runs in Node/Bun/SSR (no DOM), we return "blocked" rather than throw.
 */
export function probeImage(url: string, timeoutMs = 3000): Promise<ProviderStatus> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve("blocked");
      return;
    }
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve("blocked");
    }, timeoutMs);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve("loaded");
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve("blocked");
    };
    img.src = url;
  });
}
