import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock } from "@/components/code-block";
import { DocsToc } from "@/components/docs-toc";

export const Route = createFileRoute("/docs")({ component: Docs });

const PROVIDERS = [
  ["optimizely", "window.optimizely + cdn.optimizely.com probe"],
  ["posthog", "window.posthog + us.i.posthog.com / eu.i.posthog.com probe"],
  ["ga4", "window.gtag / dataLayer + google-analytics.com probe"],
  ["gtm", "window.google_tag_manager + googletagmanager.com probe"],
  ["segment", "window.analytics + cdn.segment.com probe"],
  ["hotjar", "window.hj + static.hotjar.com probe"],
  ["amplitude", "window.amplitude + cdn.amplitude.com probe"],
  ["mixpanel", "window.mixpanel + cdn.mxpnl.com probe"],
  ["meta-pixel", "window.fbq + connect.facebook.net probe"],
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
            A 1.6 KB client library that measures per-provider block rate. Drop it in, point it at
            blockrate.app or your own server, see exactly how much each third-party tool is being
            blocked.
          </p>
        </header>

        {/* ─── Quick start ────────────────────────────────────────────── */}
        <section id="install" className="mt-16 space-y-4 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Quick start</h2>

          <CodeBlock filename="terminal">{`bun add blockrate`}</CodeBlock>

          <p className="text-sm text-muted-foreground">
            The library runs in the browser, checks each provider, and calls your reporter with the
            results. There are two ways to collect data:
          </p>

          <h3 id="hosted" className="mt-6 text-base font-medium scroll-mt-20">
            Option A: Hosted dashboard (blockrate.app)
          </h3>
          <p className="text-sm text-muted-foreground">
            Sign up, get an API key from{" "}
            <Link to="/app/keys" className="underline-offset-4 hover:underline">
              /app/keys
            </Link>
            , and use <code className="font-mono text-xs">serverReporter</code>. No server code
            needed — blockrate.app stores and visualizes the data.
          </p>
          <CodeBlock>{`import { BlockRate, serverReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "my-app",
  reporter: serverReporter({
    endpoint: "https://blockrate.app/api",
    apiKey: "br_your_key_here",
  }),
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
            on your own infrastructure. Same library, different endpoint.
          </p>
          <CodeBlock>{`import { BlockRate, serverReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: serverReporter({
    endpoint: "https://br.your-domain.com",
    apiKey: "br_your_self_hosted_key",
  }),
}).check();`}</CodeBlock>

          <h3 id="custom-pipeline" className="mt-6 text-base font-medium scroll-mt-20">
            Option C: Custom pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Write your own reporter to forward results anywhere — BigQuery, Datadog, a webhook, your
            own API. The reporter receives a{" "}
            <Link to="/docs/api" className="underline-offset-4 hover:underline">
              BlockRateResult
            </Link>{" "}
            object.
          </p>
          <CodeBlock filename="custom-reporter.ts">{`import { BlockRate } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: (result) => {
    // result.providers = [{ name, status, latency }, ...]
    fetch("/your-api/analytics", {
      method: "POST",
      body: JSON.stringify(result),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  },
}).check();`}</CodeBlock>
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
                    after detection finishes. Use <code className="font-mono">serverReporter</code>,{" "}
                    <code className="font-mono">beaconReporter</code>, or your own.
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
  reporter: serverReporter({ endpoint: "...", apiKey: "..." }),
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
  reporter: serverReporter({ endpoint: "...", apiKey: "..." }),
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
            blocked.
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

          <CodeBlock filename="custom-provider.ts">{`import { BlockRate, createProvider, serverReporter } from "blockrate";

const myProvider = createProvider({
  name: "my-analytics",
  detect: async () => (window.myAnalytics ? "loaded" : "blocked"),
});

new BlockRate({
  providers: ["posthog", myProvider], // mix built-in + custom
  reporter: serverReporter({ endpoint: "https://blockrate.app/api", apiKey: "..." }),
}).check();`}</CodeBlock>
        </section>

        {/* ─── Framework guides ──────────────────────────────────────── */}
        <section id="frameworks" className="mt-16 space-y-6 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">Framework guides</h2>
          <p className="text-sm text-muted-foreground">
            The library is framework-agnostic — it's just a class that calls{" "}
            <code className="font-mono text-xs">.check()</code>. These guides show the idiomatic way
            to wire it into each framework so it runs once per session, handles SSR safely, and
            doesn't block rendering.
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
              Available for Next.js, TanStack Start, SvelteKit, Vue, Solid.js, and plain HTML.
            </p>
          </div>

          {/* React */}
          <div className="space-y-3">
            <h3 id="fw-react" className="text-base font-medium scroll-mt-20">
              React
            </h3>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs">useBlockRate</code> hook runs once on mount,
              skips on the server, and handles cleanup.
            </p>
            <CodeBlock filename="App.tsx">{`import { useBlockRate } from "blockrate/react";
import { serverReporter } from "blockrate";

function App() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: serverReporter({
      endpoint: "https://blockrate.app/api",
      apiKey: process.env.NEXT_PUBLIC_BR_KEY!,
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
              It's a pre-built client component that wires up the check once on mount and sends the
              result to the endpoint you configure — no wrapper file, no{" "}
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
              Pair it with <code className="font-mono text-xs">createBlockRateHandler</code> for a
              ready-made route handler that forwards results to your logger, database, or wherever
              you want the data to land:
            </p>
            <CodeBlock filename="app/api/block-rate/route.ts">{`import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  onResult: async (result) => {
    console.log(JSON.stringify({ event: "block_rate_check", ...result }));
  },
});`}</CodeBlock>
          </div>

          {/* SvelteKit */}
          <div className="space-y-3">
            <h3 id="fw-sveltekit" className="text-base font-medium scroll-mt-20">
              SvelteKit
            </h3>
            <p className="text-sm text-muted-foreground">
              Call <code className="font-mono text-xs">BlockRate</code> in{" "}
              <code className="font-mono text-xs">onMount</code> in your root layout.
            </p>
            <CodeBlock filename="+layout.svelte">{`<script lang="ts">
  import { onMount } from "svelte";
  import { BlockRate, serverReporter } from "blockrate";

  onMount(() => {
    new BlockRate({
      providers: ["optimizely", "posthog", "ga4"],
      reporter: serverReporter({
        endpoint: "https://blockrate.app/api",
        apiKey: import.meta.env.VITE_BR_KEY,
      }),
      sampleRate: 0.1,
    }).check();
  });
</script>

<slot />`}</CodeBlock>
          </div>

          {/* TanStack Start */}
          <div className="space-y-3">
            <h3 id="fw-tanstack" className="text-base font-medium scroll-mt-20">
              TanStack Start
            </h3>
            <p className="text-sm text-muted-foreground">
              Same <code className="font-mono text-xs">useBlockRate</code> hook as React, dropped
              into the root layout component.
            </p>
            <CodeBlock filename="routes/__root.tsx">{`import { useBlockRate } from "blockrate/react";
import { serverReporter } from "blockrate";

function RootLayout() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: serverReporter({
      endpoint: "https://blockrate.app/api",
      apiKey: import.meta.env.VITE_BR_KEY,
    }),
    sampleRate: 0.1,
  });

  return <Outlet />;
}`}</CodeBlock>
          </div>

          {/* Vue */}
          <div className="space-y-3">
            <h3 id="fw-vue" className="text-base font-medium scroll-mt-20">
              Vue
            </h3>
            <p className="text-sm text-muted-foreground">
              Call <code className="font-mono text-xs">BlockRate</code> inside{" "}
              <code className="font-mono text-xs">onMounted</code> in your root component. Works
              with Vite, Nuxt (add <code className="font-mono text-xs">"use client"</code> if using
              Nuxt 3 Islands), or any other Vue setup.
            </p>
            <CodeBlock filename="App.vue">{`<script setup lang="ts">
import { onMounted } from "vue";
import { BlockRate, serverReporter } from "blockrate";

onMounted(() => {
  new BlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: serverReporter({
      endpoint: "https://blockrate.app/api",
      apiKey: import.meta.env.VITE_BR_KEY,
    }),
    sampleRate: 0.1,
  }).check();
});
</script>

<template>
  <router-view />
</template>`}</CodeBlock>
          </div>

          {/* Solid.js */}
          <div className="space-y-3">
            <h3 id="fw-solid" className="text-base font-medium scroll-mt-20">
              Solid.js
            </h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs">onMount</code> in your root component. Solid
              runs effects on the client only, so this is SSR-safe by default.
            </p>
            <CodeBlock filename="App.tsx">{`import { onMount } from "solid-js";
import { BlockRate, serverReporter } from "blockrate";

export default function App() {
  onMount(() => {
    new BlockRate({
      providers: ["optimizely", "posthog", "ga4"],
      reporter: serverReporter({
        endpoint: "https://blockrate.app/api",
        apiKey: import.meta.env.VITE_BR_KEY,
      }),
      sampleRate: 0.1,
    }).check();
  });

  return <div>...</div>;
}`}</CodeBlock>
          </div>

          {/* Vanilla */}
          <div className="space-y-3">
            <h3 id="fw-vanilla" className="text-base font-medium scroll-mt-20">
              Vanilla JS / script tag
            </h3>
            <p className="text-sm text-muted-foreground">
              Import the library directly in a script tag. Works in any site.
            </p>
            <CodeBlock filename="index.html">{`<script type="module">
  import { BlockRate, serverReporter } from "https://esm.sh/blockrate";

  new BlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: serverReporter({
      endpoint: "https://blockrate.app/api",
      apiKey: "br_your_key_here",
    }),
    sampleRate: 0.1,
  }).check();
</script>`}</CodeBlock>
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
