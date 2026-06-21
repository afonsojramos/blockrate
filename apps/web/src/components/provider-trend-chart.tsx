import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/server/hero-stats";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  rate: { label: "Block rate", color: "var(--rate-mid)" },
} satisfies ChartConfig;

/**
 * Daily block-rate trend for one provider. Only days above the publish floor
 * (rate !== null) are plotted; with fewer than two such days there's nothing
 * honest to chart, so we say so rather than draw a misleading line.
 */
export function ProviderTrendChart({ points }: { points: TrendPoint[] }) {
  const data = points
    .filter((p): p is TrendPoint & { rate: number } => p.rate !== null)
    .map((p) => ({ date: p.date, rate: Math.round(p.rate * 1000) / 10 }));

  if (data.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough history yet to chart a trend.</p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-[16/6] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(d) => String(d).slice(5)}
        />
        <YAxis
          width={34}
          tickLine={false}
          axisLine={false}
          unit="%"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(value) => `${value}%`} />}
        />
        <Area
          dataKey="rate"
          type="monotone"
          fill="var(--color-rate)"
          fillOpacity={0.3}
          stroke="var(--color-rate)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
