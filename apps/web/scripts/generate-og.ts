/**
 * Generate the Open Graph / Twitter share image → public/og.png (1200×630).
 *
 * Programmatic + repeatable: edit this file and run `bun run og`. The PNG is
 * committed so the production Docker build needs no rasterizer. Mirrors the
 * resvg + wawoff2 approach from afonsojramos.me — resvg-js can't read woff2, so
 * the bundled Geist weights are decompressed to TTF first.
 *
 * On-brand per docs/design.md: dark-first surface, lowercase wordmark, and the
 * green→amber→red block-rate gradient as the only loud colour (the brand).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
// @ts-expect-error - wawoff2 has no types
import wawoff from "wawoff2";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, "..");
const OUT = join(WEB_ROOT, "public", "og.png");
const OUT_REPORT = join(WEB_ROOT, "public", "og-report.png");

const W = 1200;
const H = 630;

// sRGB approximations of the design-charter oklch tokens (resvg has no oklch).
const C = {
  bgTop: "#0c0e13",
  bgBottom: "#090a0e",
  text: "#f4f5f6",
  muted: "#9aa1ab",
  track: "#1c2029",
  low: "#34c77b", // rate < 5%  (green)
  mid: "#ecb23e", // 5–15%      (amber)
  high: "#f2553f", // > 15%     (red)
};

const FONT_WEIGHTS = [400, 500, 600, 700];
const FONT_SOURCE = (w: number) =>
  join(WEB_ROOT, `node_modules/@fontsource/geist/files/geist-latin-${w}-normal.woff2`);

async function prepareFonts(): Promise<string[]> {
  const cacheDir = join(tmpdir(), "blockrate-og-fonts");
  await mkdir(cacheDir, { recursive: true });
  return Promise.all(
    FONT_WEIGHTS.map(async (w) => {
      const ttfPath = join(cacheDir, `geist-${w}.ttf`);
      const ttf = await wawoff.decompress(await readFile(FONT_SOURCE(w)));
      await writeFile(ttfPath, ttf);
      return ttfPath;
    }),
  );
}

// Illustrative per-provider rates spanning all three gradient bands.
const ROWS = [
  { name: "Optimizely", rate: 0.41, color: C.high },
  { name: "Mixpanel", rate: 0.12, color: C.mid },
  { name: "Segment", rate: 0.04, color: C.low },
];

const PAD = 80;
const TRACK_X = 380;
const TRACK_W = 560;
const PCT_X = W - PAD; // right-aligned

function chartRow(r: (typeof ROWS)[number], y: number): string {
  const fillW = Math.max(10, Math.round(TRACK_W * r.rate));
  const pct = `${Math.round(r.rate * 100)}%`;
  return `
    <text x="${PAD}" y="${y + 9}" font-family="Geist" font-weight="500" font-size="30" fill="${C.text}">${r.name}</text>
    <rect x="${TRACK_X}" y="${y - 13}" width="${TRACK_W}" height="22" rx="11" fill="${C.track}"/>
    <rect x="${TRACK_X}" y="${y - 13}" width="${fillW}" height="22" rx="11" fill="${r.color}"/>
    <text x="${PCT_X}" y="${y + 9}" text-anchor="end" font-family="Geist" font-weight="600" font-size="30" fill="${r.color}">${pct}</text>`;
}

const rowsSvg = ROWS.map((r, i) => chartRow(r, 405 + i * 70)).join("");

/** Build the card SVG with a two-line headline (rest of the layout is shared). */
function buildSvg(line1: string, line2: string): string {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bgTop}"/>
      <stop offset="1" stop-color="${C.bgBottom}"/>
    </linearGradient>
    <linearGradient id="rate" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.low}"/>
      <stop offset="0.5" stop-color="${C.mid}"/>
      <stop offset="1" stop-color="${C.high}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- brand chip -->
  <text x="${PAD}" y="108" font-family="Geist" font-weight="600" font-size="30" fill="${C.muted}">blockrate.app</text>

  <!-- headline -->
  <text x="${PAD}" y="210" font-family="Geist" font-weight="700" font-size="62" fill="${C.text}">${line1}</text>
  <text x="${PAD}" y="282" font-family="Geist" font-weight="700" font-size="62" fill="${C.text}">${line2}</text>

  <!-- per-provider block rate (the green→amber→red brand gradient) -->
  ${rowsSvg}

  <!-- gradient signature strip -->
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="url(#rate)"/>
</svg>`;
}

const fontFiles = await prepareFonts();

async function renderCard(line1: string, line2: string, outPath: string): Promise<void> {
  const resvg = new Resvg(buildSvg(line1, line2), {
    font: { fontFiles, defaultFontFamily: "Geist", loadSystemFonts: false },
    fitTo: { mode: "original" },
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, resvg.render().asPng());
  console.log(`Wrote ${outPath} (${W}×${H})`);
}

// Default site card (unchanged content) + the /report launch-asset card.
await renderCard("Know what your ad blockers", "are hiding from your analytics.", OUT);
await renderCard("Which analytics tools are", "actually blocked, by provider.", OUT_REPORT);
