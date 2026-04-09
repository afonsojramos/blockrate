import { createFileRoute, Link } from '@tanstack/react-router'
import { CodeBlock } from '@/components/code-block'
import { HeroChart } from '@/components/hero-chart'
import { getHeroStats } from '@/server/hero-stats'

export const Route = createFileRoute('/')({
  loader: () => getHeroStats(),
  component: Landing,
})

function Landing() {
  const heroStats = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <section className="space-y-6">
        {/* Real data hero chart — hidden when no data exists */}
        {heroStats && heroStats.providers.length > 0 && (
          <HeroChart data={heroStats} />
        )}

        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          early access
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Know what your ad blockers are hiding from your analytics.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          A tiny client library that measures the per-provider block rate of
          the third-party tools your app depends on. Drop it in, see exactly
          how much PostHog, Optimizely, GA4 and friends are costing you.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/demo"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          >
            Try the live demo
          </Link>
          <Link
            to="/signup"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
          >
            Get a hosted account
          </Link>
          <a
            href="https://github.com/afonsojramos/blockrate"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <section className="mt-16">
        <CodeBlock>{`import { BlockRate, serverReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "web-app",
  reporter: serverReporter({
    endpoint: "https://blockrate.app",
    apiKey: process.env.NEXT_PUBLIC_BR_KEY!,
  }),
}).check();`}</CodeBlock>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Per-provider, not "is there a blocker"',
            body:
              'Block rate is checked per service. Optimizely might be blocked while PostHog gets through. Other libraries only tell you whether ANY blocker exists.',
          },
          {
            title: 'First-party, not third-party',
            body:
              'Bundles into your own code. Under 2 KB gzipped. The detection script itself can\u2019t be blocked because it isn\u2019t served from a third-party CDN.',
          },
          {
            title: 'Honest about the gap',
            body:
              'See the exact percentage of users who can\u2019t reach each tool, sliced by browser family. No fingerprinting, no personal data.',
          },
        ].map((card) => (
          <article
            key={card.title}
            className="rounded-lg border border-border bg-card p-6"
          >
            <h2 className="text-base font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
