import { Link } from "@tanstack/react-router";

import { applyFloor, formatRatePercent, getProviderMeta, rateColor } from "@/lib/providers";
import type { HeroStats } from "@/server/hero-stats";

export function HeroRates({ data }: { data: HeroStats | null }) {
  const rows = (data?.providers ?? [])
    .map((provider) => ({
      ...provider,
      label: getProviderMeta(provider.name)?.label ?? provider.name,
      publishedRate: applyFloor(provider.rate, provider.total),
    }))
    .filter(
      (provider): provider is typeof provider & { publishedRate: number } =>
        provider.publishedRate !== null,
    )
    .slice(0, 5);

  return (
    <aside className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-rate-low" aria-hidden="true" />
          <p className="text-sm font-medium">Live aggregate</p>
        </div>
        <p className="text-xs text-muted-foreground">All time</p>
      </div>

      {rows.length > 0 ? (
        <div className="p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Most-blocked providers
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Measured across engaged visitors</p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">Block rate</p>
          </div>

          <ol className="space-y-4">
            {rows.map((provider) => (
              <li key={provider.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{provider.label}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {provider.total.toLocaleString("en-US")} checks
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-base font-semibold tabular-nums ${rateColor(provider.publishedRate)}`}
                  >
                    {formatRatePercent(provider.publishedRate)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${provider.publishedRate * 100}%`,
                      background:
                        "linear-gradient(90deg, var(--rate-low), var(--rate-mid), var(--rate-high))",
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>

          <Link
            to="/report"
            className="mt-5 inline-flex min-h-10 items-center text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-[text-decoration-color] duration-150 ease-out hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Explore the live block-rate report
          </Link>
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">Measurement is just getting started</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We publish a rate only after it clears the minimum sample floor.
          </p>
          <Link
            to="/demo"
            className="mt-4 inline-flex min-h-10 items-center text-sm font-medium underline decoration-border underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Run the browser check
          </Link>
        </div>
      )}
    </aside>
  );
}
