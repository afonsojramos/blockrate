import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import type { HeroStats } from "@/server/hero-stats";
import { applyFloor } from "@/lib/providers";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  blockRate: {
    label: "Block rate",
    color: "var(--rate-mid)",
  },
} satisfies ChartConfig;

export function HeroChart({ data }: { data: HeroStats }) {
  // Only chart providers with a publishable (above the min-sample floor) rate,
  // so the homepage never shows a number the /block-rate pages would suppress.
  const chartData = data.providers
    .map((p) => ({ provider: p.name, rate: applyFloor(p.rate, p.total) }))
    .filter((p): p is { provider: string; rate: number } => p.rate !== null)
    .map((p) => ({ provider: p.provider, blockRate: Math.round(p.rate * 1000) / 10 }));

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Measurement is just getting started.
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="mb-2 text-center text-sm text-muted-foreground">
        Avg block rate across {chartData.length} providers of all time
      </p>
      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[280px]">
        <RadarChart data={chartData} outerRadius="55%">
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent formatter={(value) => `${value}%`} />}
          />
          <PolarAngleAxis dataKey="provider" tick={{ fontSize: 12, fill: "var(--foreground)" }} />
          <PolarGrid stroke="var(--border)" />
          <Radar
            dataKey="blockRate"
            fill="var(--color-blockRate)"
            fillOpacity={0.45}
            stroke="var(--color-blockRate)"
            strokeWidth={2}
          />
        </RadarChart>
      </ChartContainer>
    </div>
  );
}
