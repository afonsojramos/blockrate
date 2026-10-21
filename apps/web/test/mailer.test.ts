/**
 * Production mailer fail-closed gate. Exercises the shipped assertCanSendEmail
 * helper that sendEmail always calls before logging or Resend.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCanSendEmail, assertEmailRecipient, sendEmail } from "@/lib/mailer.server";
import { capabilities, env } from "@/lib/env.server";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const original = {
  nodeEnv: env.NODE_ENV,
  authUrl: env.BETTER_AUTH_URL,
  recipients: env.EMAIL_TEST_RECIPIENTS,
  resend: capabilities.resend,
};
afterEach(() => {
  env.NODE_ENV = original.nodeEnv;
  env.BETTER_AUTH_URL = original.authUrl;
  env.EMAIL_TEST_RECIPIENTS = original.recipients;
  capabilities.resend = original.resend;
  vi.restoreAllMocks();
  send.mockReset();
});

const recipient = "person@delivery.dev";
const message = { to: recipient, subject: "Test sign-in", text: "Local fixture" };

function configure(nodeEnv: "production" | "development" | "test", authUrl: string) {
  env.NODE_ENV = nodeEnv;
  env.BETTER_AUTH_URL = authUrl;
  capabilities.resend = true;
  send.mockResolvedValue({ data: { id: "fixture" }, error: null });
}

describe("recipient delivery policy", () => {
  it.each(["test", "invalid", "localhost", "example", "example.com", "example.net", "example.org"])(
    "blocks %s and its subdomains before calling Resend",
    async (domain) => {
      configure("production", "https://blockrate.app");
      for (const to of [`person@${domain}`, `person@SUB.${domain.toUpperCase()}`]) {
        await expect(sendEmail({ ...message, to })).rejects.toThrow("recipient policy");
      }
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    "bad-address",
    "Person <person@delivery.dev>",
    "person@delivery.dev,other@delivery.dev",
    "person@delivery.dev\r\nBcc: other@delivery.dev",
    `${"a".repeat(65)}@delivery.dev`,
    `person@${"a".repeat(64)}.dev`,
  ])("blocks malformed recipient %j", async (to) => {
    configure("production", "https://blockrate.app");
    await expect(sendEmail({ ...message, to })).rejects.toThrow("recipient policy");
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["https://blockrate.app", "https://blockrate.app/"])(
    "delivers once from the production auth URL %s",
    async (authUrl) => {
      configure("production", authUrl);
      await sendEmail(message);
      expect(send).toHaveBeenCalledExactlyOnceWith({ ...message, from: env.EMAIL_FROM });
    },
  );

  it.each([
    ["development", "https://blockrate.app"],
    ["production", "http://localhost:3000"],
    ["production", "https://preview.blockrate.app"],
    ["production", "https://blockrate.app.attacker.dev"],
  ] as const)("blocks unapproved delivery in %s at %s", async (nodeEnv, authUrl) => {
    configure(nodeEnv, authUrl);
    await expect(sendEmail(message)).rejects.toThrow("recipient policy");
    expect(send).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "other@delivery.dev", `${recipient},not-an-email`, "@delivery.dev"])(
    "rejects a missing, nonmatching or invalid allowlist %j",
    (testRecipients) => {
      expect(() =>
        assertEmailRecipient({
          recipient,
          nodeEnv: "development",
          authUrl: "http://localhost:3000",
          testRecipients,
        }),
      ).toThrow("recipient policy");
    },
  );

  it("allows only a case-insensitive exact allowlist match outside production", () => {
    const opts = {
      recipient,
      nodeEnv: "development",
      authUrl: "http://localhost:3000",
      testRecipients: ` other@delivery.dev, ${recipient.toUpperCase()} `,
    };
    expect(() => assertEmailRecipient(opts)).not.toThrow();
    expect(() => assertEmailRecipient({ ...opts, recipient: `prefix-${recipient}` })).toThrow(
      "recipient policy",
    );
    expect(() => assertEmailRecipient({ ...opts, nodeEnv: "test" })).toThrow("recipient policy");
    expect(() => assertEmailRecipient({ ...opts, nodeEnv: "unknown" })).toThrow("recipient policy");
  });

  it("delivers an explicitly allowed development recipient once", async () => {
    configure("development", "http://localhost:3000");
    env.EMAIL_TEST_RECIPIENTS = recipient.toUpperCase();
    await sendEmail(message);
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...message, from: env.EMAIL_FROM });
  });

  it("keeps credential-free local magic links available without a provider call", async () => {
    capabilities.resend = false;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail({ ...message, to: "person@example.test" });
    expect(log).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("propagates provider rejection", async () => {
    configure("production", "https://blockrate.app");
    send.mockResolvedValue({ data: null, error: { message: "fixture rejection" } });
    await expect(sendEmail(message)).rejects.toThrow("resend send failed: fixture rejection");
  });
});

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
