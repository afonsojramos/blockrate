import { env } from "./env.server";

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

const defaultAllowlist = parseAllowlist(env.ADMIN_EMAILS);

export function isAdminEmail(email: string | null | undefined, allowlist?: string): boolean {
  if (!email) return false;
  const set = allowlist === undefined ? defaultAllowlist : parseAllowlist(allowlist);
  return set.has(email.trim().toLowerCase());
}
