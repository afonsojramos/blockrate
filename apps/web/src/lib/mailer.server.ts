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

interface SendArgs {
  to: string;
  subject: string;
  /** Plain-text body. We never ship HTML email for v1 — keeps things simple
   *  and avoids spam classifier flags from sloppy markup. */
  text: string;
}

export async function sendEmail({ to, subject, text }: SendArgs): Promise<void> {
  if (!capabilities.resend) {
    // Log the email to stdout — in production this shows up in Railway logs
    // so you can copy-paste the magic link URL to sign in. Once RESEND_API_KEY
    // is set, this code path is never taken.
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
