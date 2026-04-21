import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/server/admin";

export const Route = createFileRoute("/_authed/app/admin/")({
  loader: () => getAdminOverview(),
  pendingComponent: AdminOverviewPending,
  component: AdminOverview,
});

const fmt = (n: number) => n.toLocaleString("en-US");

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

function AdminOverview() {
  const data = Route.useLoaderData();

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
