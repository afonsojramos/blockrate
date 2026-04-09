/**
 * API key generation and verification helpers. Server-only via .server.ts.
 *
 * Format: `br_` + 48 hex chars (24 random bytes). Total length 51 chars.
 *   prefix = first 8 chars (e.g. "br_a1b2c") — shown in UI for ID
 *   hash   = sha256(plaintext) — stored in DB
 *
 * Lookup at /api/ingest:
 *   1. Read x-block-rate-key header → plaintext
 *   2. Compute prefix + hash
 *   3. SELECT api_keys WHERE key_prefix = $1 AND key_hash = $2 AND revoked_at IS NULL
 *   The unique index on (key_hash) makes this fast; the prefix index is for
 *   the dashboard/key list views.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface GeneratedKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedKey {
  const plaintext = "br_" + randomBytes(24).toString("hex");
  return {
    plaintext,
    prefix: plaintext.slice(0, 8),
    hash: hashKey(plaintext),
  };
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 8);
}

/**
 * Constant-time comparison of two hash strings. Defends against timing
 * attacks if the prefix index ever produces multiple candidate rows.
 */
export function compareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
