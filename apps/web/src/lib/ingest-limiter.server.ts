/**
 * In-process token bucket rate limiter for /api/ingest, keyed by api_key_id.
 * Re-uses the implementation from packages/server.
 *
 * Phase 5 multi-instance note: this is process-local. With Railway running
 * a single Node instance for v1, that's fine. When we scale horizontally,
 * the architecture-strategist review flagged this as needing a Postgres- or
 * Redis-backed implementation.
 */

import { TokenBucketLimiter } from "blockrate-server/rate-limit";

// 60 events/minute burst, refilled at 2/sec → ~120 events/minute sustained.
// Per api_key, not per IP, so a customer with multiple users on one key
// shares the bucket.
export const ingestLimiter = new TokenBucketLimiter(60, 2);
