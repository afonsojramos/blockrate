/**
 * Monthly quota tracking via the usage_counters table.
 * Server-only via .server.ts.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/index.server";
import { usageCounters } from "./db/schema";

/** YYYY-MM key for the current month. */
export function currentYearMonth(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export interface UsageSnapshot {
  used: number;
  limit: number;
  remaining: number;
  yearMonth: string;
}

export async function getUsage(
  accountId: number,
  limit: number
): Promise<UsageSnapshot> {
  const ym = currentYearMonth();
  const rows = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        eq(usageCounters.yearMonth, ym)
      )
    )
    .limit(1);
  const used = rows[0]?.eventCount ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used), yearMonth: ym };
}

/**
 * Atomically increment the current month's counter by `delta` and return
 * the new total. Uses Postgres ON CONFLICT to upsert in one round trip.
 */
export async function incrementUsage(
  accountId: number,
  delta: number
): Promise<number> {
  const ym = currentYearMonth();
  const rows = await db
    .insert(usageCounters)
    .values({ accountId, yearMonth: ym, eventCount: delta })
    .onConflictDoUpdate({
      target: [usageCounters.accountId, usageCounters.yearMonth],
      set: {
        eventCount: sql`${usageCounters.eventCount} + ${delta}`,
      },
    })
    .returning({ eventCount: usageCounters.eventCount });
  return rows[0]?.eventCount ?? delta;
}
