import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock } from "@/components/code-block";
import { DocsToc } from "@/components/docs-toc";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/docs")({
  head: () =>
    seo({
      title: "docs — blockrate",
      description:
        "A 1.6 KB client library that measures per-provider block rate. Quick start, options, built-in providers, and framework guides for Next.js, SvelteKit, Nuxt, SolidStart, TanStack Start, and vanilla JS.",
      path: "/docs",
    }),
  component: Docs,
});

const PROVIDERS = [
  ["optimizely", "window.optimizely + cdn.optimizely.com probe"],
  ["posthog", "window.posthog + us.i.posthog.com / eu.i.posthog.com probe"],
  ["ga4", "window.gtag / dataLayer + google-analytics.com/g/collect probe"],
  ["gtm", "window.google_tag_manager + googletagmanager.com probe"],
  ["segment", "window.analytics + cdn.segment.com probe"],
  ["hotjar", "window.hj + script.hotjar.com probe"],
  ["amplitude", "window.amplitude + cdn.amplitude.com probe"],
  ["mixpanel", "window.mixpanel + cdn.mxpnl.com probe"],
  ["meta-pixel", "window.fbq + facebook.com/tr image probe"],
  ["intercom", "window.Intercom + widget.intercom.io probe"],
];

function Docs() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
      <main>
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            documentation
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">blockrate docs</h1>
          <p className="text-lg text-muted-foreground">
            A 1.6 KB client library that measures per-provider block rate. Drop it in, post to your
            own <code className="font-mono text-sm">/api/block-rate</code> route, and let
            blockrate.app handle storage and visualization.
          </p>
        </header>

        {/* ─── First-party rule ───────────────────────────────────────── */}
        <section id="first-party" className="mt-12 scroll-mt-20">
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <p className="text-sm font-medium text-foreground">
              The reporter endpoint must be first-party.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your client always posts to a route on your own origin (
              <code className="font-mono text-xs">/api/block-rate</code>), never directly to
              blockrate.app. A one-line server handler forwards the payload with your API key
              attached server-side. This keeps the key off the browser and prevents blocklists from
              silently wiping out your "blocked" counts.{" "}
              <a
                href="https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party"
                className="underline-offset-4 hover:underline"
              >
                Why this matters →
              </a>
            </p>
          </div>
        </section>

        {/* ─── Quick start ────────────────────────────────────────────── */}
        <section id="install" className="mt-16 space-y-4 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Quick start</h2>

          <CodeBlock filename="terminal">{`bun add blockrate`}</CodeBlock>

          <p className="text-sm text-muted-foreground">
            Every integration is two pieces: a client that runs detection and posts to{" "}
            <code className="font-mono text-xs">/api/block-rate</code> on your own origin, and a
            server route that forwards to the ingest endpoint with your API key.
          </p>

          <h3 id="hosted" className="mt-6 text-base font-medium scroll-mt-20">
            Option A: Hosted dashboard (blockrate.app)
          </h3>
          <p className="text-sm text-muted-foreground">
            Sign up, create an API key at{" "}
            <Link to="/app/keys" className="underline-offset-4 hover:underline">
              /app/keys
            </Link>
            , and set it as <code className="font-mono text-xs">BLOCKRATE_API_KEY</code> in your
            server's environment. The key never touches the browser.
          </p>
          <CodeBlock filename="app/api/block-rate/route.ts">{`import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            Client-side, point any <code className="font-mono text-xs">BlockRate</code> reporter at
            that same-origin path:
          </p>
          <CodeBlock filename="client.ts">{`import { BlockRate } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "my-app",
  reporter: (result) => {
    navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
  },
  sampleRate: 0.1, // check 10% of sessions
}).check();`}</CodeBlock>

          <h3 id="self-hosted" className="mt-6 text-base font-medium scroll-mt-20">
            Option B: Self-hosted (blockrate-server)
          </h3>
          <p className="text-sm text-muted-foreground">
            Run{" "}
            <a
              href="https://github.com/afonsojramos/blockrate/tree/main/packages/server"
              className="underline-offset-4 hover:underline"
            >
              blockrate-server
            </a>{" "}
            on your own infrastructure and point the forward helper at it. Same client code, same
            first-party route, different <code className="font-mono text-xs">endpoint</code>.
          </p>
          <CodeBlock filename="app/api/block-rate/route.ts">{`import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: {
    apiKey: process.env.BLOCK_RATE_API_KEY!,
    endpoint: "https://br.your-domain.com", // your self-hosted blockrate-server
  },
});`}</CodeBlock>

          <h3 id="custom-pipeline" className="mt-6 text-base font-medium scroll-mt-20">
            Option C: Custom pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Skip <code className="font-mono text-xs">forward</code> and use{" "}
            <code className="font-mono text-xs">onResult</code> to write results anywhere you want —
            BigQuery, Datadog, a webhook, your own API. The handler still parses and validates the
            payload, so you only see well-formed{" "}
            <Link to="/docs/api" className="underline-offset-4 hover:underline">
              BlockRateResult
            </Link>{" "}
            objects.
          </p>
          <CodeBlock filename="app/api/block-rate/route.ts">{`import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  onResult: async (result) => {
    await myLogger.info({ event: "block_rate_check", ...result });
  },
});`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            You can combine <code className="font-mono text-xs">forward</code> and{" "}
            <code className="font-mono text-xs">onResult</code> — both fire in parallel on a valid
            payload, failures are isolated, and the browser always gets a 204.
          </p>
        </section>

        {/* ─── Options ─────────────────────────────────────────────── */}
        <section id="options" className="mt-16 space-y-4 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Options</h2>
          <p className="text-sm text-muted-foreground">
            Every field of <code className="font-mono text-xs">BlockRateOptions</code>. Only{" "}
            <code className="font-mono text-xs">providers</code> and{" "}
            <code className="font-mono text-xs">reporter</code> are required.
          </p>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Option</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Default</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">providers</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    (string | Provider)[]
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    List of providers to check. Built-in names (
                    <code className="font-mono">"posthog"</code>,{" "}
                    <code className="font-mono">"ga4"</code>, etc.) or custom{" "}
                    <code className="font-mono">Provider</code> objects from{" "}
                    <code className="font-mono">createProvider()</code>.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">reporter</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">(result) =&gt; void</td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Called once with the full <code className="font-mono">BlockRateResult</code>{" "}
                    after detection finishes. For the hosted or self-hosted pattern, post to your
                    same-origin route with{" "}
                    <code className="font-mono">navigator.sendBeacon("/api/block-rate", …)</code> or{" "}
                    <code className="font-mono">fetch</code>.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">service</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">string</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <code className="font-mono">undefined</code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Optional label forwarded with each event. Useful for slicing the dashboard by
                    app, environment, or surface (e.g.{" "}
                    <code className="font-mono">"marketing-site"</code>,{" "}
                    <code className="font-mono">"checkout"</code>).
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">sampleRate</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">number</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">1</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Fraction of sessions to run the check on, between{" "}
                    <code className="font-mono">0</code> and <code className="font-mono">1</code>.
                    Lower it to reduce quota usage on high-traffic sites.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">delay</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">number (ms)</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">3000</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Milliseconds to wait before firing any detection. Keeps the check off the
                    critical rendering path. Set to <code className="font-mono">0</code> to run
                    immediately.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">consentGiven</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    boolean | () =&gt; boolean
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">true</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Optional consent gate for strict jurisdictions. When false,{" "}
                    <code className="font-mono">check()</code> is a complete no-op — no network
                    requests, no data collection. Only needed if your legal counsel requires
                    explicit consent for blockrate; the library is otherwise consent-free by design.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">sanitizeUrl</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">(url) =&gt; string</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">undefined</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Optional callback to sanitise{" "}
                    <code className="font-mono">location.pathname</code> before it hits the
                    reporter. Use this to strip PII from path segments (e.g.{" "}
                    <code className="font-mono">/users/:email</code>).
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">sessionDedup</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">boolean</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">false</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    When true, stores a flag in <code className="font-mono">sessionStorage</code> to
                    prevent duplicate checks within the same browser session. Opt-in because writing
                    to <code className="font-mono">sessionStorage</code> may require consent under
                    ePrivacy Article 5(3) in some jurisdictions.
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">sessionKey</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">string</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">"__block_rate"</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Key used for <code className="font-mono">sessionStorage</code> when{" "}
                    <code className="font-mono">sessionDedup</code> is enabled. Change it if you run
                    multiple <code className="font-mono">BlockRate</code> instances on the same
                    page.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 id="opt-consent" className="mt-8 text-base font-medium scroll-mt-20">
            Wiring a consent management platform
          </h3>
          <p className="text-sm text-muted-foreground">
            blockrate is designed to work without a cookie banner — no cookies, no persistent
            storage (by default), no IP addresses, no cross-site tracking. If your legal counsel
            still requires explicit consent in your jurisdiction, pass a predicate that reads from
            your CMP:
          </p>
          <CodeBlock>{`new BlockRate({
  providers: ["posthog", "ga4"],
  consentGiven: () => window.CookieConsent?.accepted("analytics"),
  reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
}).check();`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            When the predicate returns <code className="font-mono text-xs">false</code>,{" "}
            <code className="font-mono text-xs">check()</code> is a complete no-op — nothing is
            loaded, nothing is measured, nothing is sent.
          </p>

          <h3 id="opt-sanitize" className="mt-8 text-base font-medium scroll-mt-20">
            Stripping PII from URL paths
          </h3>
          <p className="text-sm text-muted-foreground">
            blockrate already strips query strings and hashes — only{" "}
            <code className="font-mono text-xs">location.pathname</code> is reported. If your paths
            themselves contain personal data (email addresses, user IDs, order numbers), use{" "}
            <code className="font-mono text-xs">sanitizeUrl</code> to generalise them before they
            leave the browser:
          </p>
          <CodeBlock>{`new BlockRate({
  providers: ["posthog", "ga4"],
  sanitizeUrl: (path) =>
    path
      .replace(/\\/users\\/[^/]+/, "/users/:id")
      .replace(/\\/orders\\/\\d+/, "/orders/:id"),
  reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
}).check();`}</CodeBlock>
        </section>

        {/* ─── Providers ─────────────────────────────────────────────── */}
        <section id="providers" className="mt-16 space-y-4 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Built-in providers</h2>
          <p className="text-sm text-muted-foreground">
            Each provider is checked first via a <code className="font-mono text-xs">window</code>{" "}
            global (fast — the script already loaded), then via a{" "}
            <code className="font-mono text-xs">fetch</code> HEAD probe to its CDN with{" "}
            <code className="font-mono text-xs">mode: "cors"</code>. If the ad blocker redirects to
            a local response (which lacks CORS headers), the fetch throws — correctly detected as
            blocked. One exception: <code className="font-mono text-xs">meta-pixel</code> uses an{" "}
            <code className="font-mono text-xs">&lt;img&gt;</code> probe instead, since Meta
            deliberately serves no CORS headers on their pixel endpoint — the pixel is an image
            regardless, and ad blockers block the hostname, so{" "}
            <code className="font-mono text-xs">onerror</code> is the accurate blocked signal.
          </p>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Detection</th>
                </tr>
              </thead>
              <tbody>
                {PROVIDERS.map(([name, detection]) => (
                  <tr key={name} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{detection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted-foreground">
            Need a provider we don't ship? Add your own:
          </p>

          <CodeBlock filename="custom-provider.ts">{`import { BlockRate, createProvider } from "blockrate";

const myProvider = createProvider({
  name: "my-analytics",
  detect: async () => (window.myAnalytics ? "loaded" : "blocked"),
});

new BlockRate({
  providers: ["posthog", myProvider], // mix built-in + custom
  reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
}).check();`}</CodeBlock>
        </section>

        {/* ─── Framework guides ──────────────────────────────────────── */}
        <section id="frameworks" className="mt-16 space-y-6 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Framework guides</h2>
          <p className="text-sm text-muted-foreground">
            Every integration is two files: a client that posts to{" "}
            <code className="font-mono text-xs">/api/block-rate</code>, and a same-origin server
            route that forwards upstream. The server route holds the API key; the browser never sees
            it.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">Working examples:</span> every snippet on this page has
              a matching runnable project in the{" "}
              <a
                href="https://github.com/afonsojramos/blockrate/tree/main/examples"
                className="underline-offset-4 hover:underline"
              >
                examples/
              </a>{" "}
              directory — clone, <code className="font-mono text-xs">bun install</code>, and run.
              Available for Next.js, TanStack Start, SvelteKit, Nuxt, SolidStart, and plain HTML.
            </p>
          </div>

          {/* React (generic) */}
          <div className="space-y-3">
            <h3 id="fw-react" className="text-base font-medium scroll-mt-20">
              React (generic)
            </h3>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs">useBlockRate</code> hook runs once on mount,
              skips on the server, and handles cleanup. Use it from any React setup; see the
              Next.js, TanStack Start, or SolidStart sections below for framework-specific server
              routes.
            </p>
            <CodeBlock filename="App.tsx">{`import { useBlockRate } from "blockrate/react";

export function App() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (r) =>
      fetch("/api/block-rate", {
        method: "POST",
        body: JSON.stringify(r),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }),
    sampleRate: 0.1,
  });

  return <div>...</div>;
}`}</CodeBlock>
          </div>

          {/* Next.js */}
          <div className="space-y-3">
            <h3 id="fw-nextjs" className="text-base font-medium scroll-mt-20">
              Next.js (App Router)
            </h3>
            <p className="text-sm text-muted-foreground">
              Drop the <code className="font-mono text-xs">&lt;BlockRateScript&gt;</code> component
              from <code className="font-mono text-xs">blockrate/next</code> into your root layout.
              It's a pre-built client component that wires up the check once on mount and posts the
              result to your same-origin route — no wrapper file, no{" "}
              <code className="font-mono text-xs">"use client"</code> directive needed at the import
              site.
            </p>
            <CodeBlock filename="app/layout.tsx">{`import { BlockRateScript } from "blockrate/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BlockRateScript
          providers={["optimizely", "posthog", "ga4"]}
          endpoint="/api/block-rate"
          sampleRate={0.1}
        />
      </body>
    </html>
  );
}`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Pair it with <code className="font-mono text-xs">createBlockRateHandler</code> —{" "}
              <code className="font-mono text-xs">forward</code> does the server-side hop to the
              ingest endpoint, with your API key read from the server's environment.
            </p>
            <CodeBlock filename="app/api/block-rate/route.ts">{`import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});`}</CodeBlock>
          </div>

          {/* SvelteKit */}
          <div className="space-y-3">
            <h3 id="fw-sveltekit" className="text-base font-medium scroll-mt-20">
              SvelteKit
            </h3>
            <p className="text-sm text-muted-foreground">
              Call <code className="font-mono text-xs">BlockRate</code> in{" "}
              <code className="font-mono text-xs">onMount</code> in your root layout, and add a{" "}
              <code className="font-mono text-xs">+server.ts</code> route that forwards.
            </p>
            <CodeBlock filename="+layout.svelte">{`<script lang="ts">
  import { onMount } from "svelte";
  import { BlockRate } from "blockrate";

  onMount(() => {
    new BlockRate({
      providers: ["optimizely", "posthog", "ga4"],
      reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
      sampleRate: 0.1,
    }).check();
  });
</script>

<slot />`}</CodeBlock>
            <CodeBlock filename="src/routes/api/block-rate/+server.ts">{`import { createBlockRateHandler } from "blockrate/sveltekit";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});`}</CodeBlock>
          </div>

          {/* TanStack Start */}
          <div className="space-y-3">
            <h3 id="fw-tanstack" className="text-base font-medium scroll-mt-20">
              TanStack Start
            </h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs">useBlockRate</code> in the root route
              component, and add an API file route that forwards.
            </p>
            <CodeBlock filename="src/routes/__root.tsx">{`import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useBlockRate } from "blockrate/react";

function RootComponent() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (r) =>
      fetch("/api/block-rate", {
        method: "POST",
        body: JSON.stringify(r),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }),
    sampleRate: 0.1,
  });

  return <Outlet />;
}

export const Route = createRootRoute({ component: RootComponent });`}</CodeBlock>
            <CodeBlock filename="src/routes/api/block-rate.ts">{`import { createFileRoute } from "@tanstack/react-router";
import { createBlockRateHandler } from "blockrate/tanstack-start";

const handler = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export const Route = createFileRoute("/api/block-rate")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});`}</CodeBlock>
          </div>

          {/* Nuxt */}
          <div className="space-y-3">
            <h3 id="fw-nuxt" className="text-base font-medium scroll-mt-20">
              Nuxt
            </h3>
            <p className="text-sm text-muted-foreground">
              Run <code className="font-mono text-xs">BlockRate</code> inside{" "}
              <code className="font-mono text-xs">onMounted</code> in your root Vue component, and
              add a Nitro server route (
              <code className="font-mono text-xs">server/api/block-rate.post.ts</code>) that
              forwards.
            </p>
            <CodeBlock filename="app.vue">{`<script setup lang="ts">
import { onMounted } from "vue";
import { BlockRate } from "blockrate";

onMounted(() => {
  new BlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
    sampleRate: 0.1,
  }).check();
});
</script>

<template>
  <NuxtPage />
</template>`}</CodeBlock>
            <CodeBlock filename="server/api/block-rate.post.ts">{`import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export default defineEventHandler((event) => handle(toWebRequest(event)));`}</CodeBlock>
          </div>

          {/* SolidStart */}
          <div className="space-y-3">
            <h3 id="fw-solidstart" className="text-base font-medium scroll-mt-20">
              SolidStart
            </h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs">onMount</code> in your root component, and add
              an API route under <code className="font-mono text-xs">src/routes/api/</code> that
              forwards.
            </p>
            <CodeBlock filename="src/app.tsx">{`import { onMount } from "solid-js";
import { BlockRate } from "blockrate";

export default function App() {
  onMount(() => {
    new BlockRate({
      providers: ["optimizely", "posthog", "ga4"],
      reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
      sampleRate: 0.1,
    }).check();
  });

  return <div>...</div>;
}`}</CodeBlock>
            <CodeBlock filename="src/routes/api/block-rate.ts">{`import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export const POST = (event: { request: Request }) => handle(event.request);`}</CodeBlock>
          </div>

          {/* Vanilla */}
          <div className="space-y-3">
            <h3 id="fw-vanilla" className="text-base font-medium scroll-mt-20">
              Vanilla JS / script tag
            </h3>
            <p className="text-sm text-muted-foreground">
              Import the library directly in a script tag and post to your same-origin route. Any
              HTTP server can host the matching forward route — below is a minimal Bun server. The
              same shape works for any Vite SPA paired with its own backend (Hono, Express, Fastify,
              Bun, Workers): <code className="font-mono text-xs">createWebHandler</code> returns a
              Web-standard{" "}
              <code className="font-mono text-xs">(Request) =&gt; Promise&lt;Response&gt;</code>, so
              you just need to route POST <code className="font-mono text-xs">/api/block-rate</code>{" "}
              to it.
            </p>
            <CodeBlock filename="index.html">{`<script type="module">
  import { BlockRate } from "https://esm.sh/blockrate";

  new BlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (r) => navigator.sendBeacon("/api/block-rate", JSON.stringify(r)),
    sampleRate: 0.1,
  }).check();
</script>`}</CodeBlock>
            <CodeBlock filename="server.ts">{`import { createWebHandler } from "blockrate";

const handle = createWebHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

Bun.serve({
  port: 3000,
  fetch: (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/api/block-rate" && req.method === "POST") return handle(req);
    return new Response("not found", { status: 404 });
  },
});`}</CodeBlock>
          </div>
        </section>

        <hr className="my-16 border-border" />

        <p className="text-center text-sm text-muted-foreground">
          Need the hosted API reference?{" "}
          <Link to="/docs/api" className="underline-offset-4 hover:underline">
            See /docs/api
          </Link>{" "}
          · Self-hosting?{" "}
          <a
            href="https://github.com/afonsojramos/blockrate/tree/main/packages/server"
            className="underline-offset-4 hover:underline"
          >
            See packages/server
          </a>
        </p>
      </main>
      <DocsToc />
    </div>
  );
}
