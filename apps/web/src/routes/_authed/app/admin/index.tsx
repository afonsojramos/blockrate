import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assertAdmin, getAdminFunnel, getAdminOverview } from "@/server/admin";

export const Route = createFileRoute("/_authed/app/admin/")({
  // Authorize before loading: non-operators are redirected to /app here, so the
  // loader below only ever runs for admins. Genuine query failures then surface
  // through errorComponent as real errors rather than a misleading redirect.
  beforeLoad: () => assertAdmin(),
  loader: async () => ({ overview: await getAdminOverview(), funnel: await getAdminFunnel() }),
  pendingComponent: AdminOverviewPending,
  errorComponent: AdminOverviewError,
  component: AdminOverview,
});

const fmt = (n: number) => n.toLocaleString("en-US");

/** Hours under 48, days (1 decimal) at/above; null means "no converters yet". */
const fmtDuration = (hours: number | null): string => {
  if (hours === null) return "–";
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <div className="flex flex-col gap-1 px-4">
        <dl>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-1 font-heading text-3xl font-semibold tabular-nums slashed-zero tracking-tight">
            {value}
          </dd>
        </dl>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

function FunnelStage({ count, label }: { count: number; label: string }) {
  return (
    <li className="inline-flex items-baseline gap-2 rounded-md bg-accent px-3 py-1.5 text-sm">
      <span className="font-medium tabular-nums">{fmt(count)}</span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  );
}

/** Conversion between two stages as "→ 68%", or "→" alone when the
 *  previous stage is empty (no meaningful percentage). */
function FunnelArrow({ from, to }: { from: number; to: number }) {
  return (
    <li aria-hidden="true" className="text-sm text-muted-foreground tabular-nums">
      →{from > 0 ? ` ${Math.round((to / from) * 100)}%` : ""}
    </li>
  );
}

function AdminHeader() {
  return (
    <header>
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">operator</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Admin overview</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Platform-wide state. Visible only to operators in ADMIN_EMAILS.
      </p>
    </header>
  );
}

function AdminOverviewPending() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <AdminHeader />
      <section aria-hidden="true" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} size="sm" className="h-[88px] animate-pulse" />
        ))}
      </section>
      <Card className="mt-6 h-[120px] animate-pulse" aria-hidden="true" />
      <Card className="mt-6 h-[240px] animate-pulse" aria-hidden="true" />
    </main>
  );
}

function AdminOverviewError({ reset }: { reset: () => void }) {
  // Fails closed: no platform data is rendered. Surfaces the failure honestly
  // instead of letting it bubble up as a misleading redirect to /login.
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <AdminHeader />
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Couldn’t load the admin overview</CardTitle>
          <CardDescription>
            The platform stats failed to load. This is a server-side error, not a sign-out — your
            session is still valid. Retry, and if it persists check the database and server logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => reset()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminOverview() {
  const { overview: data, funnel } = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <AdminHeader />

      <section aria-label="Platform stats" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Events · 24h" value={fmt(data.events.last24h)} />
        <Stat label="Events · 7d" value={fmt(data.events.last7d)} />
        <Stat label="Events · 30d" value={fmt(data.events.last30d)} />
        <Stat label="Users · total" value={fmt(data.users.total)} />
        <Stat label="Signups · 7d" value={fmt(data.users.signups7d)} />
        <Stat
          label="Active accounts · 7d"
          value={fmt(data.activeAccounts7d)}
          hint="≥1 event in the last 7 days"
        />
      </section>

      <section aria-labelledby="funnel-heading" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle id="funnel-heading" className="text-base">
              Signup → first value
            </CardTitle>
            <CardDescription>
              Accounts through the onboarding stages. Stage 3 counts accounts with events in
              retained history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-baseline gap-x-3 gap-y-2 tabular-nums">
              <FunnelStage count={funnel.accounts} label="signed up" />
              <FunnelArrow from={funnel.accounts} to={funnel.withKey} />
              <FunnelStage count={funnel.withKey} label="created a key" />
              <FunnelArrow from={funnel.withKey} to={funnel.withEvents} />
              <FunnelStage count={funnel.withEvents} label="sent events" />
            </ol>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Median to first key
                </dt>
                <dd className="mt-0.5 tabular-nums">{fmtDuration(funnel.medianHoursToKey)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Median to first event
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {fmtDuration(funnel.medianHoursToFirstEvent)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="plan-distribution-heading" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle id="plan-distribution-heading" className="text-base">
              Plan distribution
            </CardTitle>
            <CardDescription>All app_accounts, by plan tier.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.planDistribution.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No accounts yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2 tabular-nums">
                {data.planDistribution.map((p) => (
                  <li
                    key={p.plan ?? "__unassigned"}
                    className="inline-flex items-baseline gap-2 rounded-md bg-accent px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium">{p.plan}</span>
                    <span className="text-muted-foreground">{fmt(p.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="top-accounts-heading" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle id="top-accounts-heading" className="text-base">
              Top accounts · 7d
            </CardTitle>
            <CardDescription>By event count over the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topAccounts7d.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No events in the last 7 days.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Account</TableHead>
                    <TableHead scope="col">Plan</TableHead>
                    <TableHead scope="col" className="text-right">
                      Events
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topAccounts7d.map((a) => (
                    <TableRow key={a.accountId}>
                      <TableCell className="font-mono text-xs">#{a.accountId}</TableCell>
                      <TableCell>{a.plan}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
