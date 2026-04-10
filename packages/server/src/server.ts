import { createStore } from "./stores";
import { authenticate, handleIngest, handleStats, json } from "./handlers";
import { TokenBucketLimiter } from "./rate-limit";
import { dashboardHtml } from "./dashboard";
import { generateApiKey } from "./tenant";
import type { BlockRateStore, Dialect } from "./store";

export interface ServerOptions {
  port?: number;
  /** SQLite file path or Postgres connection string. */
  dbPath?: string;
  /** Storage backend. Default "sqlite". */
  dialect?: Dialect;
  /** Requests/second per api key. Default 10. */
  rateLimit?: number;
  /** Burst capacity per api key. Default 60. */
  rateLimitBurst?: number;
  /** CORS allowed origin. Default "*". */
  corsOrigin?: string;
  /** Inject a pre-built store (e.g. for tests). */
  store?: BlockRateStore;
}

const CORS_HEADERS = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-blockrate-key, authorization",
  "Access-Control-Max-Age": "86400",
});

export async function createServer(options: ServerOptions = {}) {
  const store =
    options.store ??
    (await createStore({
      dialect: options.dialect,
      url: options.dbPath,
    }));
  const corsOrigin = options.corsOrigin ?? "*";
  const limiter = new TokenBucketLimiter(options.rateLimitBurst ?? 60, options.rateLimit ?? 10);

  await ensureBootstrapTenant(store);

  return {
    store,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const cors = CORS_HEADERS(corsOrigin);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const withCors = (res: Response) => {
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      };

      if (url.pathname === "/health") {
        return withCors(json({ ok: true }));
      }
      if (url.pathname === "/" || url.pathname === "/dashboard") {
        return new Response(dashboardHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const needsAuth = url.pathname === "/ingest" || url.pathname === "/stats";
      if (!needsAuth) {
        return withCors(json({ error: "not found" }, 404));
      }

      const tenant = await authenticate(store, request);
      if (!tenant) {
        return withCors(json({ error: "unauthorized" }, 401));
      }

      if (!limiter.take(`tenant:${tenant.id}`)) {
        return withCors(json({ error: "rate limited" }, 429));
      }

      if (url.pathname === "/ingest" && request.method === "POST") {
        return withCors(await handleIngest(store, request, tenant));
      }
      if (url.pathname === "/stats" && request.method === "GET") {
        return withCors(await handleStats(store, request, tenant));
      }

      return withCors(json({ error: "method not allowed" }, 405));
    },
  };
}

async function ensureBootstrapTenant(store: BlockRateStore): Promise<void> {
  const existing = await store.listTenants();
  if (existing.length > 0) return;
  const apiKey = process.env.BLOCK_RATE_BOOTSTRAP_KEY || generateApiKey();
  await store.createTenant({
    name: process.env.BLOCK_RATE_BOOTSTRAP_NAME || "default",
    apiKey,
  });
  console.log(`[blockrate-server] Bootstrapped default tenant. API key: ${apiKey}`);
  console.log("[blockrate-server] Store this securely — it will not be shown again.");
}
