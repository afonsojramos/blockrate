import type { ProviderStatus } from "./types";

export async function probe(url: string): Promise<ProviderStatus> {
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
    });
    return "loaded";
  } catch {
    return "blocked";
  }
}
