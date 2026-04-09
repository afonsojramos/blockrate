import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock } from "@/components/code-block";

export const Route = createFileRoute("/docs")({ component: Docs });

const PROVIDERS = [
  ["optimizely", "window.optimizely + cdn.optimizely.com probe"],
  ["posthog", "window.posthog + us.i.posthog.com probe"],
  ["ga4", "window.gtag / dataLayer + analytics.js probe"],
  ["gtm", "window.google_tag_manager + gtag/js probe"],
  ["segment", "window.analytics + cdn.segment.com probe"],
  ["hotjar", "window.hj + static.hotjar.com probe"],
  ["amplitude", "window.amplitude + cdn.amplitude.com probe"],
  ["mixpanel", "window.mixpanel + cdn.mxpnl.com probe"],
  ["meta-pixel", "window.fbq + connect.facebook.net probe"],
  ["intercom", "window.Intercom + widget.intercom.io probe"],
];

function Docs() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          documentation
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          block-rate docs
        </h1>
        <p className="text-lg text-muted-foreground">
          A 1.6 KB client library that measures per-provider block rate. Drop
          it in, point it at any reporter, see exactly how much each
          third-party tool is being blocked.
        </p>
      </header>

      <nav className="mt-10 grid gap-3 sm:grid-cols-2">
        <a href="#install" className="rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent">
          <div className="font-medium">Quick start</div>
          <div className="mt-1 text-sm text-muted-foreground">Install + 5-line setup</div>
        </a>
        <a href="#providers" className="rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent">
          <div className="font-medium">Built-in providers</div>
          <div className="mt-1 text-sm text-muted-foreground">10 providers ship with the library</div>
        </a>
        <a href="#frameworks" className="rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent">
          <div className="font-medium">Framework integrations</div>
          <div className="mt-1 text-sm text-muted-foreground">React, Next, SvelteKit, TanStack Start</div>
        </a>
        <Link to="/docs/api" className="rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent">
          <div className="font-medium">Hosted API reference</div>
          <div className="mt-1 text-sm text-muted-foreground">POST /api/ingest, headers, payload shape</div>
        </Link>
      </nav>

      {/* ─── Quick start ────────────────────────────────────────────── */}
      <section id="install" className="mt-16 space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Quick start</h2>
        <p className="text-sm text-muted-foreground">
          The library is one tiny dependency. Pick the reporter that fits.
        </p>

        <CodeBlock>{`bun add block-rate`}</CodeBlock>

        <p className="text-sm text-muted-foreground">
          With the hosted blockrate.app — get an API key from{" "}
          <Link to="/app/keys" className="underline-offset-4 hover:underline">
            /app/keys
          </Link>{" "}
          after signing up:
        </p>

        <CodeBlock>{`import { BlockRate, serverReporter } from "block-rate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "web-app",
  reporter: serverReporter({
    endpoint: "https://blockrate.app",
    apiKey: process.env.NEXT_PUBLIC_BR_KEY!,
  }),
}).check();`}</CodeBlock>

        <p className="text-sm text-muted-foreground">
          Self-hosted with your own ingestion server (
          <a
            href="https://github.com/afonsojramos/block-rate/tree/main/packages/server"
            className="underline-offset-4 hover:underline"
          >
            block-rate-server
          </a>
          ) — same shape, different endpoint:
        </p>

        <CodeBlock>{`reporter: serverReporter({
  endpoint: "https://block-rate.your-domain.com",
  apiKey: process.env.NEXT_PUBLIC_BR_KEY!,
}),`}</CodeBlock>

        <p className="text-sm text-muted-foreground">
          Or with any custom reporter (e.g. PostHog server-side, BigQuery,
          Datadog, your own webhook):
        </p>

        <CodeBlock>{`new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: (result) => {
    navigator.sendBeacon("/my-endpoint", JSON.stringify(result));
  },
  sampleRate: 0.1,
}).check();`}</CodeBlock>
      </section>

      {/* ─── Providers ─────────────────────────────────────────────── */}
      <section id="providers" className="mt-16 space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Built-in providers
        </h2>
        <p className="text-sm text-muted-foreground">
          Each provider is checked first via a <code className="font-mono text-xs">window</code>{" "}
          global, then via a HEAD probe to its CDN. The probe uses{" "}
          <code className="font-mono text-xs">mode: "no-cors"</code> so a
          successful opaque response counts as "loaded" and a{" "}
          <code className="font-mono text-xs">TypeError</code> counts as "blocked."
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
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {detection}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground">
          Custom providers are a single function:
        </p>

        <CodeBlock>{`import { BlockRate, createProvider } from "block-rate";

const myProvider = createProvider({
  name: "my-analytics",
  detect: async () => (window.myAnalytics ? "loaded" : "blocked"),
});

new BlockRate({ providers: [myProvider], reporter: console.log }).check();`}</CodeBlock>
      </section>

      {/* ─── Frameworks ────────────────────────────────────────────── */}
      <section id="frameworks" className="mt-16 space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Framework integrations
        </h2>

        <h3 className="mt-4 text-base font-medium">React</h3>
        <CodeBlock>{`import { useBlockRate } from "block-rate/react";

useBlockRate({
  providers: ["optimizely", "posthog"],
  reporter: serverReporter({ endpoint: "...", apiKey: "..." }),
});`}</CodeBlock>

        <h3 className="mt-4 text-base font-medium">Next.js</h3>
        <CodeBlock>{`// app/layout.tsx
import { BlockRateScript } from "block-rate/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <BlockRateScript
          providers={["optimizely", "posthog", "ga4"]}
          endpoint="https://blockrate.app"
          apiKey={process.env.NEXT_PUBLIC_BR_KEY}
        />
      </body>
    </html>
  );
}`}</CodeBlock>

        <h3 className="mt-4 text-base font-medium">SvelteKit</h3>
        <CodeBlock>{`// src/routes/api/block-rate/+server.ts
import { createBlockRateHandler } from "block-rate/sveltekit";

export const POST = createBlockRateHandler({
  onResult: async (result) => console.log(result),
});`}</CodeBlock>

        <h3 className="mt-4 text-base font-medium">TanStack Start</h3>
        <CodeBlock>{`// src/routes/api/block-rate.ts
import { createFileRoute } from "@tanstack/react-router";
import { createBlockRateHandler } from "block-rate/tanstack-start";

const handler = createBlockRateHandler({
  onResult: async (result) => console.log(result),
});

export const Route = createFileRoute("/api/block-rate")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});`}</CodeBlock>
      </section>

      <hr className="my-16 border-border" />

      <p className="text-center text-sm text-muted-foreground">
        Need the hosted API reference?{" "}
        <Link to="/docs/api" className="underline-offset-4 hover:underline">
          See /docs/api
        </Link>{" "}
        · Self-hosting?{" "}
        <a
          href="https://github.com/afonsojramos/block-rate/tree/main/packages/server"
          className="underline-offset-4 hover:underline"
        >
          See packages/server
        </a>
      </p>
    </main>
  );
}

// Uses the shared CodeBlock from @/components/code-block
