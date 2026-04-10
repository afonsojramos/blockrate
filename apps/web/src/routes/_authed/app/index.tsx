import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatsTable } from "@/components/stats-table";
import { getOverviewData } from "@/server/stats";

const search = z.object({
  service: z.string().optional(),
  since: z.coerce.number().int().min(1).max(90).default(7),
});

export const Route = createFileRoute("/_authed/app/")({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search }) => ({
    since: search.since,
    service: search.service,
  }),
  loader: ({ deps }) =>
    getOverviewData({
      data: { sinceDays: deps.since, service: deps.service },
    }),
  component: Overview,
});

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
];

function Overview() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  function setRange(days: number) {
    navigate({ search: { ...search, since: days } });
  }

  function setService(service: string | undefined) {
    navigate({ search: { ...search, service } });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            overview
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Block rate by provider</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last {data.sinceDays} {data.sinceDays === 1 ? "day" : "days"}
            {data.service ? ` · service: ${data.service}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Service filter */}
          {data.services.length > 0 && (
            <Select
              value={data.service ?? "all"}
              onValueChange={(v: string | null) =>
                setService(v === "all" || v === null ? undefined : v)
              }
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="All services" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {data.services.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Date range buttons */}
          <div className="flex items-center rounded-md border border-border p-0.5">
            {RANGES.filter((r) => r.days <= data.planDashboardHistoryDays).map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRange(r.days)}
                className={
                  "h-8 rounded px-3 text-xs font-medium transition-[background-color,color] duration-150 ease-out " +
                  (search.since === r.days
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">
            {data.stats.length} {data.stats.length === 1 ? "provider" : "providers"}
          </CardTitle>
          <CardDescription>
            Sorted by block rate, worst first. Bars use the brand gradient (green &lt; 5%, amber
            5–15%, red &gt; 15%).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatsTable stats={data.stats} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Need more history?{" "}
        <Link to="/pricing" className="underline-offset-4 hover:underline">
          Upgrade plans coming soon
        </Link>
        .
      </p>
    </main>
  );
}
