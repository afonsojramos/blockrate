/**
 * Truncate a full User-Agent string to just "browser family + major version".
 *
 * We never want to persist full UA strings because they're PII-adjacent
 * (high fingerprinting entropy). Keeping only browser + major version
 * preserves the one slice analytics actually cares about — "does block
 * rate differ by browser?" — while dropping everything else.
 *
 * Examples:
 *   "Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36" → "Chrome 131"
 *   "Mozilla/5.0 ... Firefox/124.0"                  → "Firefox 124"
 *   "Mozilla/5.0 ... Version/17.3 Safari/605.1.15"   → "Safari 17"
 *   ""                                               → "unknown"
 */
export function truncateUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";

  // Order matters — Edge and Opera include "Chrome" and "Safari" substrings,
  // Samsung Internet includes "Chrome", so match the specific ones first.
  const patterns: [RegExp, string][] = [
    [/Edg(?:e|iOS|A)?\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/, "Safari"],
  ];

  for (const [re, name] of patterns) {
    const match = re.exec(ua);
    if (match) {
      const result = `${name} ${match[1]}`;
      return result.length > 64 ? result.slice(0, 64) : result;
    }
  }

  return "other";
}
