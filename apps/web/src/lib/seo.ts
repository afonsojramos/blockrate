/**
 * Per-route head metadata helper.
 *
 * Returns `{ meta, links, scripts }` in the exact shape TanStack Router's
 * `head()` option expects. Meta entries are keyed by `name` / `property`
 * so child routes override parent entries (root supplies defaults like
 * `og:site_name` / `twitter:card`; each route overrides `title`,
 * `description`, `og:title`, etc.).
 *
 * Must stay pure — runs on both server and client. Any `Date.now()` /
 * `window` / non-deterministic branch would cause hydration mismatches.
 *
 * Canonical + absolute `og:url` come from `VITE_SITE_URL`. When unset
 * (local dev, preview without env), those two tags are omitted rather
 * than emitted as `http://localhost` — a missing canonical is better
 * than a wrong one.
 */

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };
type LinkEntry = { rel: string; href: string; type?: string; sizes?: string };
type ScriptEntry = { type: string; children: string };

export type SeoHead = { meta: MetaEntry[]; links: LinkEntry[]; scripts: ScriptEntry[] };

export type SeoInput = {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const SITE_NAME = "blockrate";
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "";

function absoluteUrl(path: string): string | null {
  if (!SITE_URL) return null;
  return `${SITE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Deterministic JSON stringify — sorts object keys recursively so SSR
 * and client renders produce byte-identical JSON-LD scripts.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

export function seo(input: SeoInput): SeoHead {
  const { title, description, path, noindex, type = "website", jsonLd } = input;
  const canonical = absoluteUrl(path);

  const meta: MetaEntry[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (canonical) {
    meta.push({ property: "og:url", content: canonical });
  }

  if (noindex) {
    meta.push({ name: "robots", content: "noindex,nofollow" });
  }

  const links: LinkEntry[] = [];
  if (canonical) {
    links.push({ rel: "canonical", href: canonical });
  }

  const scripts: ScriptEntry[] = [];
  if (jsonLd) {
    const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    for (const schema of schemas) {
      scripts.push({ type: "application/ld+json", children: stableStringify(schema) });
    }
  }

  return { meta, links, scripts };
}

/**
 * Single source of truth for every public route. Read by the sitemap
 * handler to emit `<url>` entries and by the robots handler implicitly
 * (disallow list is hardcoded since it's much shorter than the allow
 * list). Private routes (`/app/*`, `/api/*`, `/signup`, `/login`) are
 * deliberately absent — they must not appear in search results.
 *
 * Add new public routes here when they ship; sitemap + robots update
 * automatically.
 */
export type PublicRoute = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/demo", changefreq: "weekly", priority: 0.7 },
  { path: "/pricing", changefreq: "monthly", priority: 0.8 },
  { path: "/docs", changefreq: "weekly", priority: 0.8 },
  { path: "/docs/api", changefreq: "weekly", priority: 0.7 },
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/privacy-snippet", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },
  { path: "/dpa", changefreq: "yearly", priority: 0.4 },
];

export function siteUrl(): string | null {
  return SITE_URL || null;
}
