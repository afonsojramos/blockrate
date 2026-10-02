/**
 * Browser security headers for every web app response, applied through the
 * Nitro route rules in `vite.config.ts` so static assets get them too.
 * None of them restrict cross-origin reads, so the CORS ingest API, the public
 * JSON feeds and the SVG badges stay usable from customers' sites.
 */
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;
