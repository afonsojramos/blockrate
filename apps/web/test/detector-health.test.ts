/**
 * checkDetectorHealth — per-strategy fetch behavior and failure-as-data.
 * fetch is injected; nothing here touches the network.
 */

import { describe, expect, it } from "bun:test";

import { checkDetectorHealth } from "@/server/detector-health";

function corsResponse(init: { status?: number; cors?: boolean } = {}): Response {
  const headers = new Headers();
  if (init.cors !== false) headers.set("access-control-allow-origin", "*");
  return new Response(null, { status: init.status ?? 200, headers });
}

describe("checkDetectorHealth", () => {
  it("probes meta-pixel with a ranged GET and everything else with HEAD", async () => {
    const calls: { url: string; method: string; range: string | null }[] = [];
    const mockFetch = async (url: any, init: any) => {
      calls.push({
        url: String(url),
        method: init.method,
        range: new Headers(init.headers).get("range"),
      });
      return corsResponse();
    };
    await checkDetectorHealth(mockFetch as typeof fetch);

    const meta = calls.find((c) => c.url.includes("facebook.com"));
    expect(meta?.method).toBe("GET");
    expect(meta?.range).toBe("bytes=0-0");
    for (const c of calls.filter((c) => !c.url.includes("facebook.com"))) {
      expect(c.method).toBe("HEAD");
    }
    expect(calls).toHaveLength(11);
  });

  it("reports a target without CORS headers as not ok, without throwing", async () => {
    const mockFetch = async (url: any) =>
      String(url).includes("hotjar") ? corsResponse({ cors: false }) : corsResponse();
    const report = await checkDetectorHealth(mockFetch as typeof fetch);
    const hotjar = report.targets.find((t) => t.name === "hotjar");
    expect(hotjar?.ok).toBe(false);
    expect(hotjar?.hasCors).toBe(false);
    expect(hotjar?.status).toBe(200);
    expect(report.allOk).toBe(false);
  });

  it("reports a rejected fetch as not ok with null status, without throwing", async () => {
    const mockFetch = async (url: any) => {
      if (String(url).includes("mxpnl")) throw new TypeError("fetch failed");
      return corsResponse();
    };
    const report = await checkDetectorHealth(mockFetch as typeof fetch);
    const mixpanel = report.targets.find((t) => t.name === "mixpanel");
    expect(mixpanel?.ok).toBe(false);
    expect(mixpanel?.status).toBeNull();
    expect(report.allOk).toBe(false);
    // Every other target still reported.
    expect(report.targets).toHaveLength(11);
  });

  it("treats 5xx as not ok but 4xx with CORS as reachable (smoke-test pass rule)", async () => {
    const mockFetch = async (url: any) =>
      String(url).includes("segment")
        ? corsResponse({ status: 503 })
        : String(url).includes("google-analytics")
          ? corsResponse({ status: 404 })
          : corsResponse();
    const report = await checkDetectorHealth(mockFetch as typeof fetch);
    expect(report.targets.find((t) => t.name === "segment")?.ok).toBe(false);
    expect(report.targets.find((t) => t.name === "ga4")?.ok).toBe(true);
  });

  it("allOk is the AND of all targets", async () => {
    const healthy = await checkDetectorHealth((async () =>
      corsResponse()) as unknown as typeof fetch);
    expect(healthy.allOk).toBe(true);
    expect(healthy.checkedAt).toBeString();
  });
});
