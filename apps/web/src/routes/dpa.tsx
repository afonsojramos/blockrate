import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/dpa")({
  head: () =>
    seo({
      title: "data processing agreement — blockrate",
      description:
        "GDPR Article 28 Data Processing Agreement for blockrate.app customers. Covers subject matter, processor obligations, sub-processors, breach notification, and international transfers via SCCs.",
      path: "/dpa",
    }),
  component: Dpa,
});

function Dpa() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">legal</p>
        <h1 className="text-4xl font-bold tracking-tight">Data Processing Agreement</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 10, 2026</p>
      </header>

      <div className="prose prose-sm mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          This Data Processing Agreement ("DPA") forms part of the Terms of Service between
          blockrate.app ("Processor", "we") and the customer ("Controller", "you") and governs the
          processing of personal data by the Processor on behalf of the Controller under GDPR
          Article 28. By using the blockrate.app service, you accept this DPA.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            1. Subject matter and duration
          </h2>
          <p>
            The Processor processes personal data on behalf of the Controller for the purpose of
            measuring the reachability of third-party analytics providers from the Controller's
            website visitors' browsers. Processing begins when the Controller starts sending data to
            blockrate.app and continues until the Controller deletes their account or the service is
            terminated.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            2. Nature and purpose of processing
          </h2>
          <p>
            The Processor receives, stores, aggregates, and presents block rate check results from
            the Controller's website visitors. The purpose is to provide the Controller with
            per-provider analytics on which third-party tools are blocked by ad blockers and privacy
            extensions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            3. Types of personal data
          </h2>
          <p>The following data is processed for each check event:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Page path (URL pathname, no query strings or hashes)</li>
            <li>Browser family and major version (e.g. "Chrome 131")</li>
            <li>Timestamp of the check</li>
            <li>Provider name and reachability status ("loaded" or "blocked")</li>
            <li>Check latency in milliseconds</li>
            <li>Service label chosen by the Controller</li>
          </ul>
          <p>
            No IP addresses, cookies, user IDs, geolocation, or browser fingerprints are stored.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            4. Categories of data subjects
          </h2>
          <p>Visitors to the Controller's website(s) where the blockrate library is installed.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            5. Controller obligations
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Ensure a lawful basis exists for the processing (e.g. legitimate interest or consent)
            </li>
            <li>
              Ensure URL paths sent to blockrate do not contain personal data, or use the{" "}
              <code className="font-mono text-xs">sanitizeUrl</code> option to strip them
            </li>
            <li>
              Update your own privacy policy to inform visitors about blockrate's data collection
              (see our{" "}
              <Link to="/privacy-snippet" className="underline-offset-4 hover:underline">
                sample snippet
              </Link>
              )
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            6. Processor obligations
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Process data only on the Controller's documented instructions</li>
            <li>
              Ensure all persons authorised to process personal data have committed to
              confidentiality
            </li>
            <li>
              Implement appropriate technical and organisational security measures (GDPR Article
              32), including encryption in transit (TLS) and at rest, access controls, and regular
              security reviews
            </li>
            <li>
              Not engage sub-processors without prior written authorisation from the Controller (see
              section 8 for current sub-processors)
            </li>
            <li>
              Assist the Controller in responding to data subject requests to the extent technically
              feasible
            </li>
            <li>
              Delete all personal data upon termination of the service or account deletion,
              whichever comes first
            </li>
            <li>
              Make available all information necessary to demonstrate compliance and allow for
              audits
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            7. Data breach notification
          </h2>
          <p>
            The Processor will notify the Controller without undue delay, and in any event within 48
            hours, after becoming aware of a personal data breach affecting the Controller's data.
            The notification will include the nature of the breach, categories of data affected,
            approximate number of records, and measures taken or proposed to mitigate the breach.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            8. Sub-processors
          </h2>
          <p>The following sub-processors are currently engaged:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="text-foreground">Railway</span> — application hosting and managed
              PostgreSQL (United States)
            </li>
            <li>
              <span className="text-foreground">Resend</span> — transactional email delivery (United
              States)
            </li>
            <li>
              <span className="text-foreground">Cloudflare</span> — DNS, CDN, and TLS termination
              (global edge network)
            </li>
          </ul>
          <p>
            The Controller will be notified of any changes to this list at least 30 days in advance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            9. International data transfers
          </h2>
          <p>
            Personal data is transferred to and stored in the United States. These transfers are
            protected by the Standard Contractual Clauses (SCCs) adopted by the European Commission
            (Decision 2021/914, Module Two: transfer controller to processor), which are
            incorporated into this DPA by reference. The SCCs take precedence over any conflicting
            terms in this DPA in the event of inconsistency.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            10. Data retention and deletion
          </h2>
          <p>
            Event data is retained for the duration specified by the Controller's plan (7, 30, or 90
            days). A nightly retention job deletes events older than the retention window. When the
            Controller deletes their account, all associated data (events, API keys, usage counters)
            is deleted immediately via cascading deletion.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Contact</h2>
          <p>
            Questions about this DPA can be directed to{" "}
            <a href="mailto:privacy@blockrate.app" className="underline-offset-4 hover:underline">
              privacy@blockrate.app
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
