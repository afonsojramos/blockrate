/**
 * Shared utilities for API route handlers (server-only).
 *
 * - jsonError: consistent JSON error response
 *
 * The auth gate for API routes lives in require-account.server.ts
 * (`requireAccountForApi`), next to its server-function sibling.
 */

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
