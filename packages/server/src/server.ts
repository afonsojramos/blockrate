import { createDb, type DB } from "./db";
import { authenticate, handleIngest, handleStats, json } from "./handlers";
import { TokenBucketLimiter } from "./rate-limit";
import { dashboardHtml } from "./dashboard";
import { tenants } from "./schema";
import { randomBytes } from "node:crypto";

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  /** Requests/second per api key. Default 10. */
  rateLimit?: number;
  /** Burst capacity per api key. Default 60. */
  rateLimitBurst?: number;
  /** CORS allowed origin. Default "*". */
  corsOrigin?: string;
}

const CORS_HEADERS = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-block-rate-key, authorization",
  "Access-Control-Max-Age": "86400",
});

export function createServer(options: ServerOptions = {}) {
  const db = createDb(options.dbPath);
  const corsOrigin = options.corsOrigin ?? "*";
  const limiter = new TokenBucketLimiter(
    options.rateLimitBurst ?? 60,
    options.rateLimit ?? 10
  );

  ensureBootstrapTenant(db);

  return {
    db,
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

      const needsAuth =
        url.pathname === "/ingest" || url.pathname === "/stats";
      if (!needsAuth) {
        return withCors(json({ error: "not found" }, 404));
      }

      const tenant = await authenticate(db, request);
      if (!tenant) {
        return withCors(json({ error: "unauthorized" }, 401));
      }

      if (!limiter.take(`tenant:${tenant.id}`)) {
        return withCors(json({ error: "rate limited" }, 429));
      }

      if (url.pathname === "/ingest" && request.method === "POST") {
        return withCors(await handleIngest(db, request, tenant));
      }
      if (url.pathname === "/stats" && request.method === "GET") {
        return withCors(await handleStats(db, request, tenant));
      }

      return withCors(json({ error: "method not allowed" }, 405));
    },
  };
}

function ensureBootstrapTenant(db: DB) {
  const existing = db.select().from(tenants).limit(1).all();
  if (existing.length > 0) return;
  const apiKey =
    process.env.BLOCK_RATE_BOOTSTRAP_KEY ||
    "br_" + randomBytes(24).toString("hex");
  db.insert(tenants)
    .values({
      name: process.env.BLOCK_RATE_BOOTSTRAP_NAME || "default",
      apiKey,
    })
    .run();
  console.log(
    `[block-rate-server] Bootstrapped default tenant. API key: ${apiKey}`
  );
  console.log(
    "[block-rate-server] Store this securely — it will not be shown again."
  );
}
