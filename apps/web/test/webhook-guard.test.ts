/**
 * SSRF host guard for outbound webhook/Slack delivery. Blocks internal targets
 * a customer could otherwise aim the cron's POST at.
 */

import { describe, expect, it } from "bun:test";
import { isBlockedWebhookHost } from "@/lib/webhook";

/** Extract the (normalised) hostname the guard actually sees from a URL. */
const host = (u: string) => new URL(u).hostname;

describe("isBlockedWebhookHost — blocks internal targets", () => {
  const blocked = [
    "https://localhost/h",
    "https://app.localhost/h",
    "https://svc.internal/h",
    "https://db.local/h",
    "https://127.0.0.1/h",
    "https://10.1.2.3/h",
    "https://172.16.0.1/h",
    "https://172.31.255.255/h",
    "https://192.168.1.1/h",
    "https://169.254.169.254/latest/meta-data", // cloud metadata
    "https://100.100.0.1/h", // CGNAT
    "https://0.0.0.0/h",
    "https://[::1]/h",
    "https://[fc00::1]/h",
    "https://[fe80::1]/h",
    "https://2130706433/h", // integer form of 127.0.0.1 — URL canonicalises it
  ];
  for (const u of blocked) {
    it(`blocks ${u}`, () => {
      expect(isBlockedWebhookHost(host(u))).toBe(true);
    });
  }
});

describe("isBlockedWebhookHost — allows public targets", () => {
  const allowed = [
    "https://hooks.slack.com/services/T/B/x",
    "https://hooks.example.com/abc",
    "https://8.8.8.8/h",
    "https://172.32.0.1/h", // just outside the 172.16/12 private range
    "https://192.169.0.1/h", // not 192.168
  ];
  for (const u of allowed) {
    it(`allows ${u}`, () => {
      expect(isBlockedWebhookHost(host(u))).toBe(false);
    });
  }
});
