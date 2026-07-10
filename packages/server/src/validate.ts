import { z } from "zod";

export const providerResultSchema = z.object({
  name: z.string().min(1).max(64),
  status: z.enum(["loaded", "blocked"]),
  latency: z.number().int().min(0).max(60_000),
});

export const blockRatePayloadSchema = z.object({
  timestamp: z.string().datetime(),
  url: z.string().max(2048),
  userAgent: z.string().max(1024),
  service: z.string().min(1).max(64).optional(),
  providers: z.array(providerResultSchema).min(1).max(64),
});

export type BlockRatePayload = z.infer<typeof blockRatePayloadSchema>;

/** Max |client timestamp − server now| accepted at ingest. Wider than normal
 *  clock skew; tight enough that a key cannot rewrite sealed historical days. */
export const MAX_TIMESTAMP_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * True when `iso` parses and lies within ±`skewMs` of `now`. Used by hosted
 * and self-hosted ingest so public/account rollups cannot be poisoned with
 * far-past or far-future client clocks.
 */
export function isTimestampWithinSkew(
  iso: string,
  now: number = Date.now(),
  skewMs: number = MAX_TIMESTAMP_SKEW_MS,
): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Math.abs(t - now) <= skewMs;
}
