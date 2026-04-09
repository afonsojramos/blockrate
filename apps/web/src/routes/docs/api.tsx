import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock as Code } from "@/components/code-block";

export const Route = createFileRoute("/docs/api")({ component: ApiDocs });

function ApiDocs() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <Link
          to="/docs"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to docs
        </Link>
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          api reference
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Hosted API</h1>
        <p className="text-lg text-muted-foreground">
          The blockrate.app ingest endpoint accepts POSTs from any origin
          (CORS *) and authenticates via a per-account API key in the{" "}
          <code className="font-mono text-sm">x-blockrate-key</code> header.
        </p>
      </header>

      {/* ─── POST /api/ingest ───────────────────────────────────────── */}
      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          POST /api/ingest
        </h2>
        <p className="text-sm text-muted-foreground">
          Submit one or more provider checks. Always returns 204 on success
          with no body. Errors are JSON.
        </p>

        <h3 className="text-base font-medium">Headers</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">
                x-blockrate-key
              </td>
              <td className="py-2 text-xs text-muted-foreground">
                Required. Your API key from{" "}
                <Link to="/app/keys" className="underline-offset-4 hover:underline">
                  /app/keys
                </Link>
                . Format: <code className="font-mono">br_</code> + 48 hex
                chars.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">
                content-type
              </td>
              <td className="py-2 text-xs text-muted-foreground">
                <code className="font-mono">application/json</code>
              </td>
            </tr>
          </tbody>
        </table>

        <h3 className="text-base font-medium">Body</h3>
        <Code>{`{
  "timestamp": "2026-04-09T03:14:15.926Z",       // ISO 8601, required
  "url": "/checkout",                             // page path, required, ≤2048 chars
  "userAgent": "Mozilla/5.0 ...",                 // raw UA, truncated server-side
  "service": "web-app",                           // optional; defaults to the api key's service
  "providers": [                                  // 1..64 entries
    { "name": "posthog",    "status": "blocked", "latency": 12 },
    { "name": "optimizely", "status": "loaded",  "latency": 8 }
  ]
}`}</Code>

        <h3 className="text-base font-medium">Responses</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">204</td>
              <td className="py-2 text-xs text-muted-foreground">
                Accepted. Empty body.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">400</td>
              <td className="py-2 text-xs text-muted-foreground">
                Invalid JSON or payload schema.{" "}
                <code className="font-mono">{`{ "error": "...", "issues": [...] }`}</code>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">401</td>
              <td className="py-2 text-xs text-muted-foreground">
                Missing, malformed, or revoked API key.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-4 align-top font-mono text-xs">429</td>
              <td className="py-2 text-xs text-muted-foreground">
                Rate-limited (60 burst, 2/sec sustained per key) or monthly
                quota exceeded. Quota errors include{" "}
                <code className="font-mono">X-BlockRate-Quota-Limit</code>{" "}
                and <code className="font-mono">X-BlockRate-Quota-Used</code>{" "}
                headers.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ─── Example ────────────────────────────────────────────────── */}
      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Example</h2>
        <p className="text-sm text-muted-foreground">
          Most users won't write this manually — the{" "}
          <code className="font-mono text-xs">blockrate</code> library does
          it for you. But if you're integrating from a non-JavaScript runtime
          or testing the endpoint:
        </p>
        <Code>{`curl -X POST https://blockrate.app/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "x-blockrate-key: br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -d '{
    "timestamp": "2026-04-09T03:14:15.926Z",
    "url": "/",
    "userAgent": "Mozilla/5.0 ... Chrome/131.0.0.0 ...",
    "providers": [
      { "name": "posthog",    "status": "blocked", "latency": 12 },
      { "name": "optimizely", "status": "loaded",  "latency": 8  }
    ]
  }'`}</Code>
      </section>

      {/* ─── Privacy ────────────────────────────────────────────────── */}
      <section className="mt-12 space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Privacy guarantees
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">No raw user agents.</span> The{" "}
            <code className="font-mono text-xs">userAgent</code> field in your
            payload is parsed at ingest into{" "}
            <code className="font-mono text-xs">Browser Family + major version</code>{" "}
            (e.g. <code className="font-mono text-xs">"Chrome 131"</code>).
            The raw string is never persisted.
          </li>
          <li>
            <span className="text-foreground">No IPs.</span> We don't log
            or store request IPs alongside events.
          </li>
          <li>
            <span className="text-foreground">No cookies, no fingerprinting.</span>{" "}
            The library doesn't set cookies or use fingerprinting techniques
            — it only checks whether each provider's CDN is reachable.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          See the{" "}
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            full privacy policy
          </Link>{" "}
          for retention windows, export rights, and deletion.
        </p>
      </section>

      {/* ─── Rate limits + quotas ──────────────────────────────────── */}
      <section className="mt-12 space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Rate limits & quotas
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Per-key rate limit:</span>{" "}
            60-event burst, sustained 2/sec. Returns{" "}
            <code className="font-mono text-xs">429 rate limited</code>.
          </li>
          <li>
            <span className="text-foreground">Monthly quota (free tier):</span>{" "}
            100,000 events / month. Returns{" "}
            <code className="font-mono text-xs">429 monthly quota exceeded</code>{" "}
            with current usage in headers.
          </li>
          <li>
            <span className="text-foreground">Sample on the client.</span>{" "}
            Use the library's <code className="font-mono text-xs">sampleRate</code>{" "}
            option to stay under the cap on high-traffic sites.
          </li>
        </ul>
      </section>
    </main>
  );
}

// Uses the shared CodeBlock from @/components/code-block (imported as Code above)
