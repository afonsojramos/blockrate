/**
 * SSRF guard for user-supplied webhook/Slack URLs. blockrate's cron POSTs to
 * these server-side, so a customer could otherwise aim delivery at an internal
 * address. We enforce https elsewhere; this blocks the obvious internal hosts.
 *
 * The WHATWG URL parser normalises IPv4 literals (octal/hex/integer forms all
 * canonicalise to dotted-decimal for https), so checking `url.hostname` here is
 * robust for IPv4. Known residual: DNS rebinding (a public hostname whose A
 * record points at a private IP) is NOT caught — resolve-and-pin at fetch time
 * is the follow-up. Paired with `redirect: "manual"` at delivery (so an https
 * URL can't 302 to an internal http target), this is a proportionate MVP guard.
 */
export function isBlockedWebhookHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[/, "").replace(/\]$/, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // IPv6 loopback / unspecified, unique-local (fc00::/7), link-local (fe80::/10).
  if (host === "::1" || host === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;

  // IPv4 literal (already canonicalised to dotted-decimal by the URL parser).
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, private
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  return false;
}
