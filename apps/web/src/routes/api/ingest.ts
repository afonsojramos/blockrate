import { createFileRoute } from "@tanstack/react-router";

/**
 * Public ingest endpoint. Customers POST block-rate payloads here from their
 * production websites. Cross-origin (CORS *) and unauthenticated except for
 * the per-account API key in `x-block-rate-key`.
 *
 * Hot path:
 *   1. Parse + validate header api key
 *   2. Look up api_keys row by prefix + constant-time hash compare
 *   3. Per-key rate limit (TokenBucketLimiter from packages/server)
 *   4. Read monthly usage; reject 429 if over the plan limit
 *   5. Validate payload via blockRatePayloadSchema (from packages/server)
 *   6. Truncate user_agent via truncateUserAgent (PII-stripping)
 *   7. Insert events + increment usage_counters
 *   8. (best-effort) Touch api_keys.last_used_at — non-blocking
 *
 * Failure modes are explicit response codes — no leakage of internals.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-block-rate-key",
  "Access-Control-Max-Age": "86400",
} as const;

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

function jsonError(message: string, status: number): Response {
  return withCors(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        // Defer all server-only imports so they never hit the client bundle
        const [
          { db },
          { apiKeys, events, appAccounts },
          { hashKey, keyPrefix, compareHashes },
          { ingestLimiter },
          { getUsage, incrementUsage },
          { getPlan },
          { blockRatePayloadSchema },
          { truncateUserAgent },
          { and, eq, isNull, sql },
        ] = await Promise.all([
          import("@/lib/db/index.server"),
          import("@/lib/db/schema"),
          import("@/lib/keys.server"),
          import("@/lib/ingest-limiter.server"),
          import("@/lib/quota.server"),
          import("@/lib/plans"),
          import("block-rate-server/validate"),
          import("block-rate-server/ua"),
          import("drizzle-orm"),
        ]);

        // 1. Resolve API key
        const headerKey = request.headers.get("x-block-rate-key");
        if (!headerKey || !headerKey.startsWith("br_")) {
          return jsonError("missing or malformed x-block-rate-key", 401);
        }

        const prefix = keyPrefix(headerKey);
        const expectedHash = hashKey(headerKey);

        const candidates = await db
          .select({
            id: apiKeys.id,
            accountId: apiKeys.accountId,
            keyHash: apiKeys.keyHash,
            service: apiKeys.service,
            revokedAt: apiKeys.revokedAt,
          })
          .from(apiKeys)
          .where(
            and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt))
          );

        const matched = candidates.find((c) =>
          compareHashes(c.keyHash, expectedHash)
        );
        if (!matched) {
          return jsonError("invalid api key", 401);
        }

        // 2. Per-key rate limit
        if (!ingestLimiter.take(`apikey:${matched.id}`)) {
          return jsonError("rate limited", 429);
        }

        // 3. Monthly quota check (read before insert; cheap)
        const accountRows = await db
          .select({ plan: appAccounts.plan })
          .from(appAccounts)
          .where(eq(appAccounts.id, matched.accountId))
          .limit(1);
        const plan = getPlan(accountRows[0]?.plan ?? "free");
        const usage = await getUsage(matched.accountId, plan.eventsPerMonth);
        if (usage.used >= plan.eventsPerMonth) {
          return withCors(
            new Response(
              JSON.stringify({
                error: "monthly quota exceeded",
                limit: plan.eventsPerMonth,
                used: usage.used,
              }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "X-BlockRate-Quota-Limit": String(plan.eventsPerMonth),
                  "X-BlockRate-Quota-Used": String(usage.used),
                },
              }
            )
          );
        }

        // 4. Parse + validate body
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid json", 400);
        }
        const parsed = blockRatePayloadSchema.safeParse(body);
        if (!parsed.success) {
          return withCors(
            new Response(
              JSON.stringify({
                error: "invalid payload",
                issues: parsed.error.issues,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }

        // 5. Truncate UA + build rows
        const { timestamp, url, userAgent, service, providers } = parsed.data;
        const truncatedUa = truncateUserAgent(userAgent);
        const ts = new Date(timestamp);
        const rows = providers.map((p) => ({
          accountId: matched.accountId,
          apiKeyId: matched.id,
          service: service ?? matched.service,
          timestamp: ts,
          url: url.slice(0, 2048),
          userAgent: truncatedUa,
          provider: p.name,
          status: p.status,
          latency: p.latency,
        }));

        // 6. Insert events + increment counter
        // (Single-instance Phase 1 — these are two queries; Phase 5 may
        // wrap in a real transaction once we have multi-instance concerns.)
        await db.insert(events).values(rows);
        await incrementUsage(matched.accountId, rows.length);

        // 7. Best-effort touch last_used_at — fire and forget
        void db
          .update(apiKeys)
          .set({ lastUsedAt: sql`now()` })
          .where(eq(apiKeys.id, matched.id))
          .catch(() => {});

        return withCors(new Response(null, { status: 204 }));
      },
    },
  },
});
