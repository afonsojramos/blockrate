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
              Add a client component that calls{" "}
              <code className="font-mono text-xs">useBlockRate</code> and drop it in your root
              layout. The <code className="font-mono text-xs">"use client"</code> directive is
              required because the library uses browser APIs.
            </p>
            <CodeBlock filename="components/blockrate.tsx">{`"use client";

import { useBlockRate } from "blockrate/react";
import { serverReporter } from "blockrate";

export function BlockRate() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: serverReporter({
      endpoint: "https://blockrate.app/api",
      apiKey: process.env.NEXT_PUBLIC_BR_KEY!,
    }),
    sampleRate: 0.1,
  });
  return null;
}`}</CodeBlock>
            <CodeBlock filename="app/layout.tsx">{`import { BlockRate } from "@/components/blockrate";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <BlockRate />
      </body>
    </html>
  );
}`}</CodeBlock>
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
