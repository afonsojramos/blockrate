import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import type { HeroStats } from "@/server/hero-stats";
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
  const chartData = data.providers.map((p) => {
    const valid = p.rates.filter((r): r is number => r !== null);
    const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    return {
      provider: p.name,
      blockRate: Math.round(avg * 1000) / 10,
    };
  });

  return (
    <div className="p-4">
      {data.worstProvider && (
        <p className="mb-2 text-center text-sm text-muted-foreground">
          Avg block rate across {data.providers.length} providers over {data.days.length} day
          {data.days.length !== 1 && "s"}
        </p>
      )}
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
