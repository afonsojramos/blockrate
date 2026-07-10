/**
 * Self-hosted dashboard HTML must escape ingest-controlled fields. The
 * dashboard is a static HTML string with an inline script; we assert the
 * shipped template defines esc() and uses it for provider/tenant sinks.
 */

import { describe, expect, it } from "bun:test";
import { dashboardHtml } from "../src/dashboard";

describe("dashboardHtml XSS hardening", () => {
  it("defines an HTML escape helper used before interpolating provider/tenant", () => {
    expect(dashboardHtml).toContain("function esc(s)");
    expect(dashboardHtml).toContain('.replace(/&/g, "&amp;")');
    expect(dashboardHtml).toContain("${esc(s.provider)}");
    expect(dashboardHtml).toContain("${esc(data.tenant)}");
    expect(dashboardHtml).toContain("esc(err.message)");
  });

  it("does not interpolate raw provider or tenant into innerHTML", () => {
    // Unescaped sinks that previously existed — must not reappear.
    expect(dashboardHtml).not.toContain("${s.provider}");
    expect(dashboardHtml).not.toContain("${data.tenant}");
    expect(dashboardHtml).not.toContain("+ err.message +");
    // Escaped forms must be present (positive control).
    expect(dashboardHtml).toContain("${esc(s.provider)}");
    expect(dashboardHtml).toContain("${esc(data.tenant)}");
  });

  it("escapes a malicious provider string the same way the dashboard helper does", () => {
    // Mirror the shipped esc() so we prove the algorithm, not just the source text.
    // Extract the same replace chain from dashboardHtml so drift fails the test.
    const escMatch = dashboardHtml.match(/function esc\(s\) \{\s*return String\(s\)([\s\S]*?)\n\}/);
    expect(escMatch).not.toBeNull();
    // eslint-disable-next-line no-new-func -- evaluate the shipped replace chain only
    const esc = new Function("s", `return String(s)${escMatch![1]}`) as (s: string) => string;
    const evil = `<img src=x onerror="alert(document.cookie)">`;
    const rendered = `<td>${esc(evil)}</td>`;
    // Tag delimiters must be entities so the browser treats this as text, not a node.
    expect(rendered).not.toContain("<img");
    expect(rendered).toContain("&lt;img");
    expect(rendered).toContain("&gt;");
    expect(rendered).toContain("&quot;");
  });
});
