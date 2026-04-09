import type { HeroStats } from "@/server/hero-stats";

/**
 * Pure SVG sparkline chart for the landing page hero. Shows per-provider
 * block rate trends over the last 7 days. Zero dependencies — just SVG
 * polylines with the rate-gradient color system.
 */

const CHART_W = 600;
const CHART_H = 160;
const PAD_X = 40; // left padding for y-axis labels
const PAD_Y = 20; // top/bottom padding
const INNER_W = CHART_W - PAD_X - 16;
const INNER_H = CHART_H - PAD_Y * 2;

// Rate-based color — matches docs/design.md
function rateColor(rate: number): string {
  if (rate > 0.15) return "var(--rate-high)";
  if (rate > 0.05) return "var(--rate-mid)";
  return "var(--rate-low)";
}

function avgRate(rates: (number | null)[]): number {
  const valid = rates.filter((r): r is number => r !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

export function HeroChart({ data }: { data: HeroStats }) {
  const maxRate = Math.max(
    0.1,
    ...data.providers.flatMap((p) =>
      p.rates.filter((r): r is number => r !== null)
    )
  );
  // Round up to nice number for y-axis
  const yMax = Math.ceil(maxRate * 10) / 10;

  const xStep = data.days.length > 1 ? INNER_W / (data.days.length - 1) : 0;

  function toPoint(dayIdx: number, rate: number): string {
    const x = PAD_X + dayIdx * xStep;
    const y = PAD_Y + INNER_H - (rate / yMax) * INNER_H;
    return `${x},${y}`;
  }

  // Y-axis grid lines (0%, halfway, max)
  const yTicks = [0, yMax / 2, yMax];

  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      {data.worstProvider && (
        <p className="mb-4 text-sm text-muted-foreground">
          Last {data.days.length} days:{" "}
          <span
            className="font-semibold tabular-nums"
            style={{ color: rateColor(data.worstRate) }}
          >
            {(data.worstRate * 100).toFixed(1)}%
          </span>{" "}
          of {data.worstProvider} checks blocked
        </p>
      )}

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ maxHeight: 200 }}
        role="img"
        aria-label={`Block rate trend chart for the last ${data.days.length} days`}
      >
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = PAD_Y + INNER_H - (tick / yMax) * INNER_H;
          return (
            <g key={tick}>
              <line
                x1={PAD_X}
                y1={y}
                x2={CHART_W - 16}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : "4 4"}
              />
              <text
                x={PAD_X - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
                fontFamily="var(--font-sans)"
              >
                {(tick * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* X-axis day labels */}
        {data.days.map((label, i) => (
          <text
            key={label}
            x={PAD_X + i * xStep}
            y={CHART_H - 2}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
            fontFamily="var(--font-sans)"
          >
            {label}
          </text>
        ))}

        {/* Provider lines */}
        {data.providers.map((provider) => {
          const avg = avgRate(provider.rates);
          const color = rateColor(avg);
          const isWorst = provider.name === data.worstProvider;

          // Build polyline points, skipping nulls
          const points = provider.rates
            .map((r, i) => (r !== null ? toPoint(i, r) : null))
            .filter((p): p is string => p !== null)
            .join(" ");

          if (!points) return null;

          return (
            <g key={provider.name}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={isWorst ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isWorst ? 1 : 0.5}
              />
              {/* Dot on the last data point */}
              {provider.rates[provider.rates.length - 1] !== null && (
                <circle
                  cx={
                    PAD_X +
                    (provider.rates.length - 1) * xStep
                  }
                  cy={
                    PAD_Y +
                    INNER_H -
                    (provider.rates[provider.rates.length - 1]! / yMax) *
                      INNER_H
                  }
                  r={isWorst ? 4 : 3}
                  fill={color}
                />
              )}
              {/* Label on the last point for the worst provider */}
              {isWorst &&
                provider.rates[provider.rates.length - 1] !== null && (
                  <text
                    x={
                      PAD_X +
                      (provider.rates.length - 1) * xStep + 8
                    }
                    y={
                      PAD_Y +
                      INNER_H -
                      (provider.rates[provider.rates.length - 1]! / yMax) *
                        INNER_H +
                      4
                    }
                    fill={color}
                    fontSize={12}
                    fontWeight={600}
                    fontFamily="var(--font-sans)"
                  >
                    {provider.name}
                  </text>
                )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
