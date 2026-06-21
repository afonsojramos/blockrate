import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ExternalLink, Wrench } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRatePercent, rateColor, remediationLabel } from "@/lib/providers";

import { getRemediationPlaybook } from "@/server/remediation";

export const Route = createFileRoute("/_authed/app/remediate")({
  loader: () => getRemediationPlaybook(),
  component: RemediatePage,
});

const SUPPORT_BADGE: Record<string, string> = {
  official: "bg-rate-low/15 text-rate-low",
  partial: "bg-rate-mid/15 text-rate-mid",
  "server-side-only": "bg-muted text-muted-foreground",
  none: "bg-rate-high/15 text-rate-high",
};

function RemediatePage() {
  const data = Route.useLoaderData();

  if (!data.entitled) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <PageHeader />
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Wrench className="size-8 text-muted-foreground" />
            <h2 className="text-lg font-medium">Remediation is a Pro feature</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Measuring the gap is step one. Upgrade to get a prioritised playbook: which providers
              are costing you the most blocked events, and the vetted first-party fix for each — so
              you can recover the data, not just count what's missing.
            </p>
            <Link to="/pricing" className={buttonVariants({ className: "mt-2" })}>
              Upgrade to Pro
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <PageHeader />

      {data.items.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing above the measurement floor is materially blocked yet. Once a provider
              accumulates enough blocked checks, its fix will appear here ranked by impact.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-8 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-4 p-6">
              <ShieldCheck className="size-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  ~{data.totalBlockedChecks.toLocaleString()} blocked checks
                </p>
                <p className="text-sm text-muted-foreground">
                  across the providers below over the last {data.windowDays} days. Each is an
                  engaged session where the tool didn't load — real analytics fire several events
                  per session, so true loss is higher. Serving these first-party recovers them.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 space-y-4">
            {data.items.map((item) => (
              <Card key={item.provider}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{item.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className={rateColor(item.blockRate)}>
                        {formatRatePercent(item.blockRate)} blocked
                      </span>{" "}
                      · ~{item.blocked.toLocaleString()} blocked checks of{" "}
                      {item.total.toLocaleString()} (last {data.windowDays}d)
                    </p>
                  </div>
                  {item.remediation && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        SUPPORT_BADGE[item.remediation.supportLevel] ?? "bg-muted"
                      }`}
                    >
                      {remediationLabel(item.remediation.supportLevel)}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  {item.remediation ? (
                    <>
                      <p className="text-sm">{item.remediation.approach}</p>
                      <a
                        href={item.remediation.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        Official docs <ExternalLink className="size-3.5" />
                      </a>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No vetted per-provider fix on file for "{item.provider}". The general remedy
                      is to serve it first-party — see the proxy pattern below.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6 border-dashed">
            <CardHeader>
              <CardTitle className="text-base">The general fix: serve it first-party</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Most blocking is domain-based — filter lists match a vendor's hostname, not your own.
              Routing a provider's script and collection endpoints through a path on your own domain
              (a reverse proxy or edge worker) sidesteps that. blockrate ships a first-party
              reporter for exactly this shape.{" "}
              <Link to="/docs" className="text-primary underline-offset-4 hover:underline">
                See the setup docs
              </Link>
              .
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

function PageHeader() {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight">Remediate</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your blocked providers, ranked by impact, with the vetted fix for each.{" "}
        <Link to="/app" search={{ since: 7 }} className="underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </p>
    </header>
  );
}
