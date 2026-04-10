import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          privacy
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 9, 2026</p>
      </header>

      <div className="prose prose-sm mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What blockrate.app actually does
          </h2>
          <p>
            blockrate.app receives small JSON payloads from the{" "}
            <code className="font-mono text-xs">blockrate</code> library running on your customers'
            websites. Each payload reports whether specific third-party tools (Optimizely, PostHog,
            Google Analytics, etc.) were reachable from the visitor's browser. We aggregate that
            into per-provider blockrate statistics for your dashboard.
          </p>
          <p>
            We are an analytics tool's analytics tool. We try very hard to collect the minimum data
            needed to do that one job and nothing else.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What we collect from your visitors
          </h2>
          <p>For every event the library reports, we store:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="text-foreground">Timestamp</span> — when the check ran
            </li>
            <li>
              <span className="text-foreground">URL path</span> — the page path the check ran on (no
              query strings, no hashes; truncated to 2048 chars)
            </li>
            <li>
              <span className="text-foreground">Browser family + major version</span> — e.g.{" "}
              <code className="font-mono text-xs">"Chrome 131"</code>. The raw User-Agent header
              your visitor sent us is parsed at ingest, the family + major are stored, and the
              original string is discarded immediately. We do not log it anywhere.
            </li>
            <li>
              <span className="text-foreground">Provider name + status</span> — which third-party
              tool was checked and whether it was reachable
            </li>
            <li>
              <span className="text-foreground">Latency</span> — how long the check took, in
              milliseconds
            </li>
            <li>
              <span className="text-foreground">Service label</span> — your own label (e.g.
              "marketing-site") that you chose when you created the API key
            </li>
          </ul>
          <p>
            That's the entire list. We do not store IP addresses, cookies, session IDs, geolocation,
            screen resolution, browser fingerprints, referrers, or anything else.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What we collect from you (the customer)
          </h2>
          <p>When you create a blockrate.app account, we store:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Your email address (used only for sign-in via magic link)</li>
            <li>
              If you use Google or GitHub OAuth: your name and avatar URL (returned by the provider)
            </li>
            <li>Session cookies (HTTP-only, SameSite=Lax)</li>
            <li>
              Your API keys, hashed (SHA-256). We never store the plaintext of your keys after
              creation — they're shown to you exactly once.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            How long we keep it
          </h2>
          <p>Event data is kept for the duration of your plan's retention window:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="text-foreground">Free</span> — 7 days
            </li>
            <li>
              <span className="text-foreground">Pro</span> — 30 days (when available)
            </li>
            <li>
              <span className="text-foreground">Team</span> — 90 days (when available)
            </li>
          </ul>
          <p>
            Older events are deleted automatically by a nightly job. Account data (your email, API
            keys) is kept until you delete your account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Your rights</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="text-foreground">Export</span> — download your full event history as
              CSV from{" "}
              <Link to="/app/settings" className="underline-offset-4 hover:underline">
                /app/settings
              </Link>
            </li>
            <li>
              <span className="text-foreground">Delete</span> — delete your account, API keys, and
              all associated events from{" "}
              <Link to="/app/settings" className="underline-offset-4 hover:underline">
                /app/settings → Danger zone
              </Link>
              . The deletion is immediate and cascading.
            </li>
            <li>
              <span className="text-foreground">Access</span> — everything we know about you is
              visible in the dashboard. There is no secret second profile.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Subprocessors</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="text-foreground">Railway</span> — hosting and managed Postgres
            </li>
            <li>
              <span className="text-foreground">Resend</span> — magic-link email delivery
            </li>
            <li>
              <span className="text-foreground">Cloudflare</span> — DNS, CDN, TLS termination
            </li>
          </ul>
          <p>
            We do not use any analytics or product-tracking subprocessors — including, deliberately,
            our own. We dogfood the OSS library on this site to measure its own block rate, and the
            data is stored in the same database with the same retention policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Self-hosting</h2>
          <p>
            If you'd rather not send any data to us at all, the{" "}
            <a
              href="https://github.com/afonsojramos/blockrate/tree/main/packages/server"
              className="underline-offset-4 hover:underline"
            >
              self-hosted server
            </a>{" "}
            does everything blockrate.app does on your own infrastructure. Your data, your
            retention, your call.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Contact</h2>
          <p>
            Privacy questions go to{" "}
            <a href="mailto:privacy@blockrate.app" className="underline-offset-4 hover:underline">
              privacy@blockrate.app
            </a>
            . We aim to respond within two business days.
          </p>
        </section>
      </div>
    </main>
  );
}
