import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { seo } from "@/lib/seo";
import { getDetectorHealth } from "@/server/detector-health";

const TITLE = "Detector health — blockrate";
const DESCRIPTION =
  "Live health of every CDN endpoint blockrate's detectors probe. We check each provider's URL and CORS policy on demand — the same checks the daily CI smoke suite runs — and publish the result.";

export const Route = createFileRoute("/block-rate/status")({
  head: () => seo({ title: TITLE, description: DESCRIPTION, path: "/block-rate/status" }),
  loader: () => getDetectorHealth(),
  component: DetectorHealthPage,
});

function formatCheckedAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function DetectorHealthPage() {
  const report = Route.useLoaderData();
  const degraded = report.targets.filter((t) => !t.ok);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          detector health
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Every probe endpoint, checked live
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          blockrate's detectors fetch these CDN endpoints from visitors' browsers and depend on
          their CORS policies. This page probes each one the same way the{" "}
          <a
            href="https://github.com/afonsojramos/blockrate/blob/main/.github/workflows/smoke.yml"
            className="underline-offset-4 hover:underline"
          >
            daily CI smoke suite
          </a>{" "}
          does, and publishes the result — because a measurement tool earns trust by showing its own
          failure modes. See the{" "}
          <Link to="/report" className="underline-offset-4 hover:underline">
            report
          </Link>{" "}
          for the numbers these detectors produce.
        </p>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">
            {report.allOk
              ? "All detectors healthy"
              : `${degraded.length} ${degraded.length === 1 ? "endpoint" : "endpoints"} degraded`}
          </CardTitle>
          <CardDescription>
            Last checked {formatCheckedAgo(report.checkedAt)}.
            {report.allOk
              ? " Every endpoint answered with the CORS headers detection relies on."
              : " Block rates for degraded providers may under-report “loaded” until they recover."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Provider</TableHead>
                <TableHead scope="col">Endpoint</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Latency
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.targets.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.host}
                  </TableCell>
                  <TableCell>
                    {t.ok ? (
                      <span className="text-rate-low">ok</span>
                    ) : (
                      <span className="text-rate-high">
                        degraded{t.status !== null ? ` (${t.status})` : " (unreachable)"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.latencyMs} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Refreshed at most every 15 minutes. Historical uptime is not (yet) recorded — this is the
        live view.
      </p>
    </main>
  );
}
