import { describe, it, expect } from "bun:test";
import { truncateUserAgent } from "../src/ua";

describe("truncateUserAgent", () => {
  const cases: [string, string, string][] = [
    [
      "Chrome desktop",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Chrome 131",
    ],
    [
      "Firefox desktop",
      "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
      "Firefox 124",
    ],
    [
      "Safari desktop",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
      "Safari 17",
    ],
    [
      "Edge",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
      "Edge 131",
    ],
    [
      "Opera",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0",
      "Opera 115",
    ],
    [
      "Samsung Internet",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
      "Samsung Internet 24",
    ],
    [
      "Chrome iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
      "Chrome 131",
    ],
    [
      "Firefox iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15",
      "Firefox 124",
    ],
    [
      "Safari iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
      "Safari 17",
    ],
  ];

  for (const [name, ua, expected] of cases) {
    it(`parses ${name}`, () => {
      expect(truncateUserAgent(ua)).toBe(expected);
    });
  }

  it("returns 'unknown' for empty or nullish input", () => {
    expect(truncateUserAgent("")).toBe("unknown");
    expect(truncateUserAgent(null)).toBe("unknown");
    expect(truncateUserAgent(undefined)).toBe("unknown");
  });

  it("returns 'other' for unrecognized UAs", () => {
    expect(truncateUserAgent("curl/8.0")).toBe("other");
    expect(truncateUserAgent("MyBot/1.0")).toBe("other");
  });

  it("caps output at 64 chars", () => {
    const result = truncateUserAgent(
      "Mozilla/5.0 Chrome/999999999999999999999999999999999999999"
    );
    expect(result.length).toBeLessThanOrEqual(64);
  });
});
