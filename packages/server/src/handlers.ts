import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "./db";
import { tenants, events } from "./schema";
import { blockRatePayloadSchema } from "./validate";
import type { Tenant } from "./schema";

export async function authenticate(
  db: DB,
  request: Request
): Promise<Tenant | null> {
  const key =
    request.headers.get("x-block-rate-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;
  if (!key) return null;
  const row = db
    .select()
    .from(tenants)
    .where(eq(tenants.apiKey, key))
    .get();
  return row ?? null;
}

export async function handleIngest(
  db: DB,
  request: Request,
  tenant: Tenant
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const parsed = blockRatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: parsed.error.issues }, 400);
  }
  const { timestamp, url, userAgent, service, providers } = parsed.data;
  const ts = new Date(timestamp);
  const rows = providers.map((p) => ({
    tenantId: tenant.id,
    service: service ?? "default",
    timestamp: ts,
    url,
    userAgent,
    provider: p.name,
    status: p.status,
    latency: p.latency,
  }));
  db.insert(events).values(rows).run();
  return new Response(null, { status: 204 });
}

export interface StatsRow {
  provider: string;
  total: number;
  blocked: number;
  blockRate: number;
  avgLatency: number;
}

export async function handleStats(
  db: DB,
  request: Request,
  tenant: Tenant
): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  const sinceParam = url.searchParams.get("since");
  const sinceDays = sinceParam ? Math.max(1, parseInt(sinceParam, 10)) : 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const where = service
    ? and(
        eq(events.tenantId, tenant.id),
        eq(events.service, service),
        gte(events.timestamp, since)
      )
    : and(eq(events.tenantId, tenant.id), gte(events.timestamp, since));

  const rows = db
    .select({
      provider: events.provider,
      total: sql<number>`COUNT(*)`.as("total"),
      blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.as(
        "blocked"
      ),
      avgLatency: sql<number>`AVG(${events.latency})`.as("avg_latency"),
    })
    .from(events)
    .where(where)
    .groupBy(events.provider)
    .all();

  const stats: StatsRow[] = rows.map((r) => ({
    provider: r.provider,
    total: Number(r.total),
    blocked: Number(r.blocked),
    blockRate: Number(r.total) > 0 ? Number(r.blocked) / Number(r.total) : 0,
    avgLatency: Math.round(Number(r.avgLatency) || 0),
  }));

  return json({
    tenant: tenant.name,
    service: service ?? null,
    sinceDays,
    stats,
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
