/**
 * Transactional email via Resend. Lazy — only loads the SDK when an
 * email actually needs to be sent. Server-only.
 *
 * Behaviour matrix:
 *
 *   NODE_ENV     RESEND_API_KEY     send result
 *   ──────────   ────────────────   ────────────
 *   development  unset              console.log only (dev convenience)
 *   development  set                attempt Resend send (allows local QA)
 *   production   unset              throws (fail-closed; deployment bug)
 *   production   set                Resend send
 */

import { env, capabilities } from "./env.server";
import { formatRatePercent } from "./providers";

interface SendArgs {
  to: string;
  subject: string;
  /** Plain-text body. We never ship HTML email for v1 — keeps things simple
   *  and avoids spam classifier flags from sloppy markup. */
  text: string;
}

/**
 * Fail-closed gate for transactional email. Production without Resend is a
 * deployment bug — never log magic-link tokens and pretend the send succeeded.
 * Development/test without Resend is allowed (console fallback).
 * Exported for unit tests; `sendEmail` always goes through this.
 */
export function assertCanSendEmail(opts: { nodeEnv: string; hasResend: boolean }): void {
  if (!opts.hasResend && opts.nodeEnv === "production") {
    throw new Error("RESEND_API_KEY is required in production");
  }
}

export async function sendEmail({ to, subject, text }: SendArgs): Promise<void> {
  assertCanSendEmail({ nodeEnv: env.NODE_ENV, hasResend: capabilities.resend });

  if (!capabilities.resend) {
    // Dev/test only — production is rejected above. Log so local magic-link
    // flows stay usable without Resend.
    console.log(`[mailer] to=${to} subject="${subject}"\n${text.replace(/^/gm, "  ")}`);
    return;
  }

  const { Resend } = await import("resend");
  const client = new Resend(env.RESEND_API_KEY!);
  const result = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
  });
  if (result.error) {
    throw new Error(`resend send failed: ${result.error.message}`);
  }
}

/**
 * Magic-link email body. Plain text, single CTA URL, instructions for what
 * to do if you didn't request this. The link is the entire payload — no
 * tracking pixels, no marketing footer.
 */
export function magicLinkBody(url: string): string {
  return `Click the link below to sign in to blockrate:

${url}

This link expires in 10 minutes and can only be used once.

If you didn't request this, you can safely ignore this email — no account
will be created or modified.

— blockrate.app
`;
}

/**
 * Alert notification body. Plain text, one CTA to the alerts page. Describes
 * which scope crossed which threshold so the email stands on its own without
 * opening the dashboard.
 */
export function alertEmailBody(args: {
  ruleName: string;
  provider: string | null;
  service: string | null;
  ratePct: number;
  comparator: "gte" | "lte";
  threshold: number;
  windowHours: number;
}): string {
  const scope = args.provider ?? "all providers";
  const where = args.service ? ` (service "${args.service}")` : "";
  const direction = args.comparator === "gte" ? "at or above" : "at or below";
  const rate = `${args.ratePct.toFixed(1)}%`;
  const siteUrl = (env.VITE_SITE_URL ?? "https://blockrate.app").replace(/\/$/, "");

  return `Heads up — your blockrate alert "${args.ruleName}" just fired.

${scope}${where} is now ${rate} blocked over the last ${args.windowHours}h,
which is ${direction} your ${args.threshold}% threshold.

Review the rule or adjust the threshold:
${siteUrl}/app/alerts

You'll only get one email per rule until its cooldown elapses.

— blockrate.app
`;
}

/**
 * Weekly digest body. Plain text, one worst-first line per provider, a link to
 * the dashboard, and a one-line opt-out. No HTML, no tracking.
 */
export function digestEmailBody(args: {
  providers: { label: string; rate: number; total: number }[];
  windowDays: number;
}): string {
  const siteUrl = (env.VITE_SITE_URL ?? "https://blockrate.app").replace(/\/$/, "");
  const lines = args.providers
    .map(
      (p) =>
        `  • ${p.label} — ${formatRatePercent(p.rate)} blocked over ${p.total.toLocaleString()} ${p.total === 1 ? "check" : "checks"}`,
    )
    .join("\n");

  return `Your blockrate digest — block rates over the last ${args.windowDays} days:

${lines}

See the full dashboard:
${siteUrl}/app

You can turn this weekly digest off in Settings.

— blockrate.app
`;
}
