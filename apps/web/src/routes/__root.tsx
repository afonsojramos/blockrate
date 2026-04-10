import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { Dogfood } from '../components/dogfood'
import { Nav } from '../components/nav'
import { getNavSession } from '../server/session'
import appCss from '../styles/app.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=s==="dark"||(s!=="light"&&m);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      { title: 'blockrate.app — know what your ad blockers are hiding' },
      {
        name: 'description',
        content:
          'Measure the actual block rate of third-party services caused by ad blockers and privacy tools. OSS library + hosted dashboard.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  loader: () => getNavSession(),
  shellComponent: RootShell,
  component: RootLayout,
})

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
            config={{ position: 'bottom-right' }}
            plugins={[
              { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

/** Root layout — has access to loader data (session). */
function RootLayout() {
  const session = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <Nav session={session} />
      <Dogfood />
      <div key={pathname} className="animate-page-enter">
        <Outlet />
      </div>
      <footer className="mt-24 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© 2026 blockrate</p>
          <div className="flex gap-4">
            <a href="https://github.com/afonsojramos/blockrate" className="hover:text-foreground">OSS</a>
            <a href="https://github.com/afonsojramos/blockrate/tree/main/packages/server" className="hover:text-foreground">Self-host</a>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
          </div>
        </div>
      </footer>
    </>
  )
}
