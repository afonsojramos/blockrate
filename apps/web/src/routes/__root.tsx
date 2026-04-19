import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import { Dogfood } from "../components/dogfood";
import { Nav } from "../components/nav";
import { seo, siteUrl } from "../lib/seo";
import { getNavSession } from "../server/session";
import appCss from "../styles/app.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=s==="dark"||(s!=="light"&&m);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

// JSON-LD identity always uses the brand URL, even on preview deploys.
// Preview deploys are noindex anyway, and pinning Organization / WebSite
// to the canonical blockrate.app URL keeps the knowledge-graph identity
// stable across environments.
const BRAND_URL = "https://blockrate.app";

const SITE_TITLE = "blockrate.app — know what your ad blockers are hiding";
const SITE_DESCRIPTION =
  "Measure the actual block rate of third-party services caused by ad blockers and privacy tools. OSS library + hosted dashboard.";

export const Route = createRootRoute({
  head: () => {
    const jsonLdUrl = siteUrl() ?? BRAND_URL;
    const siteSeo = seo({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      path: "/",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "blockrate",
          url: jsonLdUrl,
          logo: `${jsonLdUrl}/favicon.svg`,
        },
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "blockrate",
          url: jsonLdUrl,
          description: SITE_DESCRIPTION,
        },
      ],
    });
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "color-scheme", content: "light dark" },
        ...siteSeo.meta,
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        ...siteSeo.links,
      ],
      scripts: siteSeo.scripts,
    };
  },
  loader: () => getNavSession(),
  shellComponent: RootShell,
  component: RootLayout,
});

/** HTML shell — renders during SSR before any loader data is available. */
function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}

/** Root layout — has access to loader data (session). */
function RootLayout() {
  const session = Route.useLoaderData();

  return (
    <>
      <Nav session={session} />
      <Dogfood />
      <Outlet />
      <footer className="mt-24 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© 2026 blockrate</p>
          <div className="flex gap-4">
            <a href="https://github.com/afonsojramos/blockrate" className="hover:text-foreground">
              OSS
            </a>
            <a
              href="https://github.com/afonsojramos/blockrate/tree/main/packages/server"
              className="hover:text-foreground"
            >
              Self-host
            </a>
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
            <a href="/dpa" className="hover:text-foreground">
              DPA
            </a>
            <a href="/terms" className="hover:text-foreground">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
