/**
 * Pure SVG renderer for the embeddable per-provider block-rate badge.
 *
 * Shields.io-style two-segment badge: a gray label segment ("PostHog blocked")
 * and a color-coded value segment ("4.9%" / "no data"). Kept dependency-free
 * and pure so it can be unit-tested without a server and rendered inside a
 * server route handler. Served as image/svg+xml and embedded via <img>, so the
 * `id`s are document-scoped and safe.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Approximate rendered width of a string at 11px Verdana. Exact glyph metrics
 * aren't worth shipping a font table for; 6.5px/char plus padding tracks the
 * real width closely enough that the segments never clip.
 */
function textWidth(text: string): number {
  return Math.round(text.length * 6.5);
}

const HEIGHT = 20;
const PAD = 10;

export function blockRateBadge(opts: { label: string; value: string; color: string }): string {
  const { label, value, color } = opts;
  const labelW = textWidth(label) + PAD * 2;
  const valueW = textWidth(value) + PAD * 2;
  const totalW = labelW + valueW;
  const labelX = labelW / 2;
  const valueX = labelW + valueW / 2;

  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);
  // color is always a controlled hex from badgeColor(), but escape it too so a
  // future caller can't break out of the attribute or inject markup.
  const safeColor = escapeXml(color);
  const ariaLabel = escapeXml(`${label}: ${value}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${HEIGHT}" role="img" aria-label="${ariaLabel}">
  <title>${ariaLabel}</title>
  <linearGradient id="g" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${HEIGHT}" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="${HEIGHT}" fill="${safeColor}"/>
    <rect width="${totalW}" height="${HEIGHT}" fill="url(#g)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelX}" y="14">${safeLabel}</text>
    <text x="${valueX}" y="15" fill="#010101" fill-opacity=".3">${safeValue}</text>
    <text x="${valueX}" y="14">${safeValue}</text>
  </g>
</svg>`;
}
