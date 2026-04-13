import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">legal</p>
        <h1 className="text-4xl font-bold tracking-tight">Terms of service</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 12, 2026</p>
      </header>

      <div className="prose prose-sm mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-3">
          <p>
            These terms govern your use of blockrate.app (the "Service"), operated by Afonso Jorge
            Ramos (the "Operator", "we", "us"). By creating an account or sending data to the
            Service, you agree to these terms. If you don't agree, don't use the Service — the{" "}
            <a
              href="https://github.com/afonsojramos/blockrate/tree/main/packages/server"
              className="underline-offset-4 hover:underline"
            >
              self-hosted option
            </a>{" "}
            is always available.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What the Service does
          </h2>
          <p>
            blockrate.app receives JSON payloads from the open-source{" "}
            <code className="font-mono text-xs">blockrate</code> library running on your website and
            reports per-provider block rates back to you via a dashboard. It is an analytics tool
            for measuring ad-blocker interference with other analytics tools. That's the whole
            product.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Accounts and API keys
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              You must provide a valid email address and keep your sign-in credentials secure.
            </li>
            <li>
              You are responsible for all activity under your API keys. Plaintext keys are shown
              exactly once at creation — we store only a SHA-256 hash and cannot recover them.
            </li>
            <li>
              If a key is leaked, revoke it from{" "}
              <Link to="/app/keys" className="underline-offset-4 hover:underline">
                /app/keys
              </Link>{" "}
              and issue a new one.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Send data that contains personal information beyond what the library normally collects
              (see the{" "}
              <Link to="/privacy" className="underline-offset-4 hover:underline">
                privacy policy
              </Link>{" "}
              for the field list)
            </li>
            <li>Use the Service to track individual visitors across sites or build profiles</li>
            <li>Submit events on behalf of websites you do not operate or control</li>
            <li>Attempt to circumvent rate limits, quotas, or authentication</li>
            <li>
              Reverse-engineer, probe, or attack the Service's infrastructure (other than
              responsible security research — see below)
            </li>
            <li>
              Use the Service to send spam, malware, or anything illegal in your jurisdiction or
              ours
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Rate limits and quotas
          </h2>
          <p>
            Each plan has a monthly event quota and a per-key rate limit. Requests exceeding the
            rate limit return HTTP 429. Requests exceeding the monthly quota return HTTP 429 with a
            quota-exceeded error. Quotas reset at the start of each calendar month (UTC). We may
            adjust quotas for stability or abuse prevention; changes affecting paying customers will
            be announced in advance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Pricing</h2>
          <p>
            The Free plan is available immediately at no cost. Paid plans (Pro, Team) are described
            on the{" "}
            <Link to="/pricing" className="underline-offset-4 hover:underline">
              pricing page
            </Link>{" "}
            and will be billed via a third-party payment processor when launched. Free-plan terms
            may change with 30 days notice. You can delete your account at any time from{" "}
            <Link to="/app/settings" className="underline-offset-4 hover:underline">
              /app/settings
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Your data and our data
          </h2>
          <p>
            You retain ownership of all event data you submit. We process it on your behalf as a
            data processor (see the{" "}
            <Link to="/dpa" className="underline-offset-4 hover:underline">
              Data Processing Agreement
            </Link>
            ). We do not sell, share, or use your data for any purpose other than providing the
            Service to you.
          </p>
          <p>
            The <code className="font-mono text-xs">blockrate</code> client library and the{" "}
            <code className="font-mono text-xs">blockrate-server</code> self-hosted server are MIT
            licensed. The blockrate.app service, brand, and site content are owned by the Operator.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Termination</h2>
          <p>
            You can delete your account and all associated data at any time from{" "}
            <Link to="/app/settings" className="underline-offset-4 hover:underline">
              /app/settings → Danger zone
            </Link>
            . Deletion is immediate and cascading.
          </p>
          <p>
            We may suspend or terminate accounts that violate these terms, especially the
            acceptable-use section. In most cases we will contact you first. For abuse, fraud, or
            legal threats, we may suspend immediately.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Service availability
          </h2>
          <p>
            The Service is provided on a best-effort basis. We do not offer an SLA or uptime
            guarantee on the Free plan. Paid plans may include an SLA when they launch.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Warranty disclaimer
          </h2>
          <p>
            The Service is provided "as is" and "as available", without warranties of any kind,
            either express or implied, including but not limited to warranties of merchantability,
            fitness for a particular purpose, or non-infringement. We do not warrant that the
            Service will be uninterrupted, timely, secure, or error-free, or that detection results
            will be accurate for your specific users, networks, or ad-blocker configurations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Limitation of liability
          </h2>
          <p>
            To the maximum extent permitted by applicable law, in no event shall the Operator be
            liable for any indirect, incidental, special, consequential, or punitive damages, or any
            loss of profits or revenues, whether incurred directly or indirectly, arising out of or
            in connection with your use of the Service. The Operator's total liability for any claim
            arising out of or relating to the Service is limited to the greater of (a) the amount
            you paid for the Service in the twelve months preceding the claim, or (b) EUR 50.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Security research
          </h2>
          <p>
            If you find a vulnerability, please report it to{" "}
            <a href="mailto:security@blockrate.app" className="underline-offset-4 hover:underline">
              security@blockrate.app
            </a>{" "}
            before disclosing publicly. Good-faith security research that respects user privacy,
            avoids degrading the Service, and gives us reasonable time to respond is welcome and
            will not be subject to the acceptable-use clause above.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Changes to these terms
          </h2>
          <p>
            We may update these terms from time to time. Material changes will be announced via
            email to account holders and noted in the "Last updated" date at the top of this page.
            Continued use of the Service after changes take effect constitutes acceptance of the
            updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Governing law</h2>
          <p>
            These terms are governed by the laws of Portugal. Any disputes will be resolved in the
            Portuguese courts, except where mandatory consumer-protection laws in your country of
            residence grant you additional rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Contact</h2>
          <p>
            Questions about these terms go to{" "}
            <a href="mailto:legal@blockrate.app" className="underline-offset-4 hover:underline">
              legal@blockrate.app
            </a>
            . Privacy questions to{" "}
            <a href="mailto:privacy@blockrate.app" className="underline-offset-4 hover:underline">
              privacy@blockrate.app
            </a>
            . Security reports to{" "}
            <a href="mailto:security@blockrate.app" className="underline-offset-4 hover:underline">
              security@blockrate.app
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
