import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_ROUTES, siteUrl } from "@/lib/seo";

/**
 * Dynamic sitemap.xml backed by the PUBLIC_ROUTES allowlist in @/lib/seo.
 * Private routes (/app/*, /api/*, /signup, /login) are deliberately absent
 * — add new public routes to PUBLIC_ROUTES to see them appear here.
 *
 * Served with `application/xml`. Short 1-hour cache is enough — the
 * route list changes rarely and CDN can cache longer via reverse proxy.
 *
 * Returns 204 when VITE_SITE_URL is unset, since absolute <loc> URLs
 * are required by the sitemap protocol and a localhost sitemap would
 * mislead any crawler that saw it.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemap(origin: string): string {
  const lastmod = new Date().toISOString().split("T")[0];
  const entries = PUBLIC_ROUTES.map((route) => {
    const loc = escapeXml(`${origin}${route.path}`);
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteUrl();
        if (!origin) {
          return new Response(null, { status: 204 });
        }
        return new Response(buildSitemap(origin.replace(/\/$/, "")), {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
