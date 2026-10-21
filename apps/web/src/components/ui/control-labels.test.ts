import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { StatsTable, type StatsRow } from "../stats-table";
import { Progress } from "./progress";
import { SelectTrigger } from "./select";

describe("control accessible names", () => {
  it("requires a programmatic name on select triggers", () => {
    type Props = ComponentProps<typeof SelectTrigger>;
    expectTypeOf<{ className: string }>().not.toExtend<Props>();
    expectTypeOf<{ "aria-label": string }>().toExtend<Props>();
    expectTypeOf<{ "aria-labelledby": string }>().toExtend<Props>();
  });

  it("requires a programmatic name on progress bars", () => {
    type Props = ComponentProps<typeof Progress>;
    expectTypeOf<{ value: number }>().not.toExtend<Props>();
    expectTypeOf<{ value: number; "aria-label": string }>().toExtend<Props>();
    expectTypeOf<{ value: number; "aria-labelledby": string }>().toExtend<Props>();
  });

  it("names each provider's bar and keeps its matching numeric rate", () => {
    const stats: StatsRow[] = [
      {
        provider: "posthog",
        total: 100,
        blocked: 25,
        blockRate: 0.25,
        avgLatency: 10,
        benchmarkRate: null,
        benchmarkDelta: null,
      },
      {
        provider: "ga4",
        total: 100,
        blocked: 0,
        blockRate: 0,
        avgLatency: 10,
        benchmarkRate: null,
        benchmarkDelta: null,
      },
    ];
    const markup = renderToStaticMarkup(createElement(StatsTable, { stats }));
    const bars = [...markup.matchAll(/<div[^>]*role="progressbar"[^>]*>/g)].map(([bar]) => bar);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toContain('aria-label="posthog block rate"');
    expect(bars[0]).toContain('aria-valuenow="25"');
    expect(bars[1]).toContain('aria-label="ga4 block rate"');
    expect(bars[1]).toContain('aria-valuenow="0"');
  });
});
