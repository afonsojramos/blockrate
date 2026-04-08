import type { ProviderStatus } from "./types";

export async function probe(
  url: string,
  timeoutMs = 3000
): Promise<ProviderStatus> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller?.signal,
    });
    return "loaded";
  } catch {
    return "blocked";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
