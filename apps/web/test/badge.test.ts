/**
 * Badge SVG renderer — output shape, escaping, and color wiring.
 *
 * The badge is served as image/svg+xml and embedded across third-party READMEs,
 * so the output must be a well-formed, injection-safe SVG that shows the label
 * and value exactly.
 */

import { describe, it, expect } from "vitest";
import { blockRateBadge } from "@/lib/badge";
import { badgeColor, formatRatePercent } from "@/lib/providers";

describe("blockRateBadge", () => {
  it("renders a well-formed SVG containing the label and value", () => {
    const svg = blockRateBadge({ label: "PostHog blocked", value: "4.9%", color: "#3fb950" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("PostHog blocked");
    expect(svg).toContain("4.9%");
    expect(svg).toContain("#3fb950");
    expect(svg).toContain('role="img"');
  });

  it("escapes XML metacharacters in label and value (no injection)", () => {
    const svg = blockRateBadge({ label: 'A&B <x>"', value: "1<2", color: "#555" });
    expect(svg).toContain("A&amp;B &lt;x&gt;&quot;");
    expect(svg).toContain("1&lt;2");
    // The raw, unescaped sequence must not survive into the text nodes.
    expect(svg).not.toContain("<x>");
  });

  it("composes with badgeColor + formatRatePercent for the real render path", () => {
    const rate = 0.382;
    const svg = blockRateBadge({
      label: "Meta Pixel blocked",
      value: formatRatePercent(rate),
      color: badgeColor(rate),
    });
    expect(svg).toContain("38.2%");
    expect(svg).toContain("#f85149"); // 38.2% is in the red band
  });

  it("renders a gray no-data badge when rate is null", () => {
    const svg = blockRateBadge({
      label: "Hotjar blocked",
      value: "no data",
      color: badgeColor(null),
    });
    expect(svg).toContain("no data");
    expect(svg).toContain("#9f9f9f");
  });
});
