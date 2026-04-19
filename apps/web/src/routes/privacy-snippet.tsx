import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/privacy-snippet")({
  head: () =>
    seo({
      title: "privacy policy snippet — blockrate",
      description:
        "Copy-paste privacy policy snippet for your own site, explaining what blockrate collects and why it operates without a cookie banner. Adjust retention to match your plan.",
      path: "/privacy-snippet",
    }),
  component: PrivacySnippet,
});

const SNIPPET = `We use blockrate (blockrate.app) to measure whether the third-party
analytics tools our site depends on are reachable from your browser.
blockrate is designed to operate without requiring cookie consent: it
does not use cookies, does not store IP addresses, does not write to
your browser's local or session storage, and collects only technical
metadata: the page path, your browser family and major version (e.g.
"Chrome 131"), which analytics provider was checked, whether it was
reachable, and how long the check took. This data is aggregated into
per-provider block rate statistics and cannot identify individual
visitors. Data is retained for [7/30/90] days depending on our plan
and then permanently deleted. For more information, see
https://blockrate.app/privacy.`;

function PrivacySnippet() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          for customers
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Privacy policy snippet</h1>
        <p className="text-sm text-muted-foreground">
          Copy this into your own privacy policy to inform your visitors about blockrate.
        </p>
      </header>

      <div className="prose prose-sm mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Consent-free by design
          </h2>
          <p>
            blockrate is built to work without a cookie banner. It does not set cookies, does not
            write to localStorage or sessionStorage (by default), does not store IP addresses, and
            does not perform cross-site tracking. This puts it in the same category as privacy-first
            analytics tools like Plausible and Fathom that operate without consent under the CNIL's
            audience measurement exemption.
          </p>
          <p>
            You still need to inform your visitors that blockrate is in use. Add a section like the
            one below to your privacy policy. Adjust the retention period to match your plan (Free:
            7 days, Pro: 30 days, Team: 90 days).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">The snippet</h2>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {SNIPPET}
            </pre>
            <CopyButton text={SNIPPET} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            If your URLs contain personal data
          </h2>
          <p>
            blockrate only collects the URL pathname (no query strings or hashes). However, if your
            paths contain PII (e.g.{" "}
            <code className="font-mono text-xs">/users/john@example.com</code>), use the{" "}
            <code className="font-mono text-xs">sanitizeUrl</code> callback to strip it:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
            {`new BlockRate({
  sanitizeUrl: (path) => path.replace(/\\/users\\/[^/]+/, "/users/:id"),
  ...
})`}
          </pre>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Strict jurisdictions
          </h2>
          <p>
            If your legal counsel requires explicit consent for blockrate in your jurisdiction, the
            library supports a <code className="font-mono text-xs">consentGiven</code> option that
            gates all checks behind your consent management platform:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
            {`new BlockRate({
  consentGiven: () => window.CookieConsent?.accepted("analytics"),
  providers: ["posthog", "ga4"],
  reporter: serverReporter({ ... }),
})`}
          </pre>
          <p>
            When <code className="font-mono text-xs">consentGiven</code> returns{" "}
            <code className="font-mono text-xs">false</code>, blockrate does nothing — no network
            requests, no data collection.
          </p>
        </section>
      </div>
    </main>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text)}
      className="absolute top-2 right-2 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      Copy
    </button>
  );
}
