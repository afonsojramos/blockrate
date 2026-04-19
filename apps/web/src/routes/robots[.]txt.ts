import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "@/lib/seo";

/**
 * Dynamic robots.txt. Branches on VITE_SITE_URL:
 *
 *   - Set (production): normal rules + absolute sitemap reference.
 *   - Unset (local dev, preview deploys): Disallow: / — safer default
 *     that keeps preview environments out of search indexes even if a
 *     crawler stumbles across them.
 *
 * The disallow list is hardcoded since it's much shorter than the
 * allowlist. Keep it in sync with the _authed layout's noindex meta
 * and the PUBLIC_ROUTES allowlist in @/lib/seo.
 */

const PRODUCTION_BODY = (origin: string) => `User-agent: *
Allow: /
Disallow: /app/
Disallow: /api/
Disallow: /signup
Disallow: /login

Sitemap: ${origin}/sitemap.xml
`;

const PREVIEW_BODY = `User-agent: *
Disallow: /
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteUrl();
        const body = origin ? PRODUCTION_BODY(origin.replace(/\/$/, "")) : PREVIEW_BODY;
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
