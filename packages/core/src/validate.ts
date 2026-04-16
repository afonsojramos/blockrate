import type { BlockRateResult } from "./types";

/**
 * Lightweight shape + bounds validator mirroring the strict zod schema in
 * `packages/server/src/validate.ts`. This is intentionally core-local so the
 * library stays zero-dependency; it is also intentionally _lenient_ — the
 * authoritative validator runs on the hosted ingest server. Core exists here
 * to reject obviously malformed bodies before we forward them (preventing
 * the handler from being used as a dumb open proxy) and to keep `onResult`
 * from being invoked with garbage.
 *
 * Contract: anything this function accepts should pass the upstream zod
 * schema as well. The test suite verifies this with a shared fixture set.
 */
export function isValidBlockRateResult(value: unknown): value is BlockRateResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;

  if (typeof r.timestamp !== "string") return false;
  const ts = Date.parse(r.timestamp);
  if (Number.isNaN(ts)) return false;

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
      !Number.isFinite(p.latency) ||
      !Number.isInteger(p.latency) ||
      p.latency < 0 ||
      p.latency > 60_000
    ) {
      return false;
    }
  }

  return true;
}
