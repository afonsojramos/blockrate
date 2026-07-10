/**
 * Production mailer fail-closed gate. Exercises the shipped assertCanSendEmail
 * helper that sendEmail always calls before logging or Resend.
 */

import { describe, expect, it } from "bun:test";
import { assertCanSendEmail } from "@/lib/mailer.server";

describe("assertCanSendEmail", () => {
  it("throws in production when Resend is not configured", () => {
    expect(() => assertCanSendEmail({ nodeEnv: "production", hasResend: false })).toThrow(
      /RESEND_API_KEY is required in production/,
    );
  });

  it("allows development without Resend (console fallback path)", () => {
    expect(() => assertCanSendEmail({ nodeEnv: "development", hasResend: false })).not.toThrow();
  });

  it("allows test without Resend (console fallback path)", () => {
    expect(() => assertCanSendEmail({ nodeEnv: "test", hasResend: false })).not.toThrow();
  });

  it("allows production when Resend is configured", () => {
    expect(() => assertCanSendEmail({ nodeEnv: "production", hasResend: true })).not.toThrow();
  });
});
