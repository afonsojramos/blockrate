/**
 * Billing price-id ↔ plan mapping. These pure functions are the decision core
 * of both the checkout endpoint (resolvePriceId) and the webhook handler
 * (planFromPriceId); a wrong mapping silently provisions the wrong tier.
 *
 * plans.ts reads price IDs from process.env at call time and does not import
 * env.server. The price-id values come from test/setup.ts (bun test preload);
 * this file reads them rather than mutating them, since the webhook handler
 * reads the same process.env values at call time in the same test process.
 */

import { describe, expect, it } from "bun:test";
import { getPlan, planFromPriceId, resolvePriceId } from "@/lib/plans";

const PRO_M = process.env.STRIPE_PRO_MONTHLY_PRICE_ID!;
const PRO_A = process.env.STRIPE_PRO_ANNUAL_PRICE_ID!;
const TEAM_M = process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!;
const TEAM_A = process.env.STRIPE_TEAM_ANNUAL_PRICE_ID!;

describe("planFromPriceId", () => {
  it("maps both pro price IDs to pro", () => {
    expect(planFromPriceId(PRO_M)).toBe("pro");
    expect(planFromPriceId(PRO_A)).toBe("pro");
  });

  it("maps both team price IDs to team", () => {
    expect(planFromPriceId(TEAM_M)).toBe("team");
    expect(planFromPriceId(TEAM_A)).toBe("team");
  });

  it("returns null for an unrecognized price ID (caller logs + retries, never silently downgrades)", () => {
    expect(planFromPriceId("price_unknown")).toBeNull();
    expect(planFromPriceId("")).toBeNull();
  });
});

describe("resolvePriceId", () => {
  it("resolves pro monthly vs annual", () => {
    expect(resolvePriceId("pro", false)).toBe(PRO_M);
    expect(resolvePriceId("pro", true)).toBe(PRO_A);
  });

  it("resolves team monthly vs annual", () => {
    expect(resolvePriceId("team", false)).toBe(TEAM_M);
    expect(resolvePriceId("team", true)).toBe(TEAM_A);
  });

  it("defaults to monthly when annual is omitted", () => {
    expect(resolvePriceId("pro")).toBe(PRO_M);
  });

  it("returns null for invalid or free plans", () => {
    expect(resolvePriceId("free")).toBeNull();
    expect(resolvePriceId("enterprise")).toBeNull();
    expect(resolvePriceId(undefined)).toBeNull();
  });

  it("round-trips: a resolved price ID maps back to the same plan", () => {
    expect(planFromPriceId(resolvePriceId("pro", true)!)).toBe("pro");
    expect(planFromPriceId(resolvePriceId("team", false)!)).toBe("team");
  });
});

describe("getPlan", () => {
  it("returns the named plan tier", () => {
    expect(getPlan("pro").name).toBe("pro");
    expect(getPlan("team").retentionDays).toBe(365);
  });

  it("falls back to free for unknown plan names (fail-safe default)", () => {
    expect(getPlan("bogus").name).toBe("free");
    expect(getPlan("").name).toBe("free");
  });
});
