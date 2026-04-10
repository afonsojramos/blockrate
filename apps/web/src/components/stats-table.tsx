/**
 * Per-provider stats table — the heart of the dashboard.
 *
 * Renders one row per provider with: name, total checks, blocked count,
 * block rate %, gradient bar (rate-low → rate-mid → rate-high based on
 * the % value), and average latency. Sorted by block rate desc upstream
 * (in the server fn) so the worst providers are at the top.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface StatsRow {
  provider: string;
  total: number;
  blocked: number;
  blockRate: number;
  avgLatency: number;
}

export function StatsTable({ stats }: { stats: StatsRow[] }) {
  if (stats.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-10 text-center">
        <h3 className="text-base font-medium">No data yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Drop the blockrate library into your app and POST events to{" "}
          <code className="font-mono text-xs">/api/ingest</code>. Once data arrives, this table will
          show per-provider block rates.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead className="text-right tabular-nums">Checks</TableHead>
          <TableHead className="text-right tabular-nums">Blocked</TableHead>
          <TableHead>Block rate</TableHead>
          <TableHead className="text-right tabular-nums">Avg latency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.map((s) => {
          const pct = (s.blockRate * 100).toFixed(1);
          const widthCss = `${Math.max(2, s.blockRate * 100)}%`;
          // Pick a single colour stop based on the %, AND show the gradient
          // bar — the gradient gives quick visual ranking, the colour stop
          // gives a categorical signal at a glance.
          const tone =
            s.blockRate < 0.05
              ? "var(--rate-low)"
              : s.blockRate < 0.15
                ? "var(--rate-mid)"
                : "var(--rate-high)";
          return (
            <TableRow key={s.provider}>
              <TableCell className="font-medium">{s.provider}</TableCell>
              <TableCell className="text-right tabular-nums">{s.total.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {s.blocked.toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span
                    className="w-12 text-right text-sm font-medium tabular-nums"
                    style={{ color: tone }}
                  >
                    {pct}%
                  </span>
                  <div
                    className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={Number(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: widthCss,
                        background: `linear-gradient(90deg, var(--rate-low), var(--rate-mid) 50%, var(--rate-high))`,
                      }}
                    />
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {s.avgLatency}ms
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
