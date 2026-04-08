import { blockRatePayloadSchema } from "./validate";
import { truncateUserAgent } from "./ua";
import type { BlockRateStore, StoredTenant } from "./store";

export async function authenticate(
  store: BlockRateStore,
  request: Request
): Promise<StoredTenant | null> {
  const key =
    request.headers.get("x-block-rate-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;
  if (!key) return null;
  return store.findTenantByApiKey(key);
}

export async function handleIngest(
  store: BlockRateStore,
  request: Request,
  tenant: StoredTenant
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
  const truncatedUa = truncateUserAgent(userAgent);
  const ts = new Date(timestamp);
  await store.insertEvents(
    providers.map((p) => ({
      tenantId: tenant.id,
      service: service ?? "default",
      timestamp: ts,
      url,
      userAgent: truncatedUa,
      provider: p.name,
      status: p.status,
      latency: p.latency,
    }))
  );
  return new Response(null, { status: 204 });
}

export async function handleStats(
  store: BlockRateStore,
  request: Request,
  tenant: StoredTenant
): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get("service") ?? undefined;
  const sinceParam = url.searchParams.get("since");
  const sinceDays = sinceParam ? Math.max(1, parseInt(sinceParam, 10)) : 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const stats = await store.getStats({
    tenantId: tenant.id,
    service,
    since,
  });

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
