import type { BlockRateResult } from "./types";

/**
 * Lightweight shape + bounds validator mirroring the strict zod schema in
 * `packages/server/src/validate.ts`. This is intentionally core-local so the
 * library stays zero-dependency. It exists to reject obviously malformed
 * bodies before we forward them (preventing the handler from being used
 * as a dumb open proxy) and to keep `onResult` from being invoked with
 * garbage. The authoritative validator still runs on the ingest server.
 *
 * Contract: anything this function accepts should pass the upstream zod
 * schema as well — we want core to be at most as lenient as upstream, so
 * a passing shape here always 2xx's upstream on data grounds. The test
 * suite enforces this with a shared fixture set and asymmetric-drift
 * fixtures (malformed ISO timestamps, etc.).
 */

// Matches z.string().datetime() — ISO-8601 with a mandatory `T` separator
// and a timezone suffix (Z or ±HH:MM). Rejects `"2026-01-01"` and other
// partial timestamps that `Date.parse` would happily accept, which is
// what upstream rejects too.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidBlockRateResult(value: unknown): value is BlockRateResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;

  if (typeof r.timestamp !== "string") return false;
  if (!ISO_DATETIME.test(r.timestamp)) return false;
  if (Number.isNaN(Date.parse(r.timestamp))) return false;

  if (typeof r.url !== "string" || r.url.length > 2048) return false;

  if (typeof r.userAgent !== "string" || r.userAgent.length > 1024) return false;

  if (r.service !== undefined) {
    if (typeof r.service !== "string" || r.service.length === 0 || r.service.length > 64) {
      return false;
    }
  }

  if (!Array.isArray(r.providers) || r.providers.length < 1 || r.providers.length > 64) {
    return false;
  }

  for (const entry of r.providers) {
    if (!entry || typeof entry !== "object") return false;
    const p = entry as Record<string, unknown>;
    if (typeof p.name !== "string" || p.name.length === 0 || p.name.length > 64) return false;
    if (p.status !== "loaded" && p.status !== "blocked") return false;
    if (
      typeof p.latency !== "number" ||
      !Number.isInteger(p.latency) ||
      p.latency < 0 ||
      p.latency > 60_000
    ) {
      return false;
    }
  }

  return true;
}
