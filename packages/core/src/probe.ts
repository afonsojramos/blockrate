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
 *
 * Single attempt by design — earlier versions retried once on transient
 * failure, but that pinned every blocked-event latency to the backoff
 * constant, destroying the dashboard's ability to distinguish hostname-
 * blocked (~5ms TypeError) from timeout-blocked (~3000ms abort). Honest
 * latency is more valuable than a marginal-impact retry; in practice ad
 * blocker rejections are deterministic, not transient.
 *
 * `method` defaults to HEAD (cheapest). Pass "GET" for endpoints that serve
 * CORS only on GET, not HEAD — Meta's `facebook.com/tr` is the canonical
 * case (it reflects the Origin on GET but returns no CORS headers on HEAD).
 */
export async function probe(
  url: string,
  timeoutMs = 3000,
  method: "HEAD" | "GET" = "HEAD",
): Promise<ProviderStatus> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    await fetch(url, {
      method,
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
 * Image-based probe for endpoints that genuinely serve a decodable image
 * and refuse CORS entirely. `onload` means the network request reached a
 * real image; `onerror` means it was blocked OR the response was not an
 * image. That second case is a footgun: Meta's `facebook.com/tr` used to
 * return a 1x1 gif but now returns an empty `text/plain` 200, so this probe
 * reported every visitor as blocked. meta-pixel therefore uses the CORS GET
 * `probe()` instead (Meta serves CORS on GET). Keep that in mind before
 * pointing this at any endpoint whose body is not a guaranteed image.
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
