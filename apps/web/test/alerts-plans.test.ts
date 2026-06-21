/**
 * Alert-rule plan caps. `maxAlertRules` is the single gate that makes alerting
 * a Pro/Team capability — Free must be 0 so createAlertRuleForAccount rejects
 * every Free create (see alerts-crud.test.ts for the enforcement path).
 */

import { describe, expect, it } from "bun:test";
import { PLANS, getPlan } from "@/lib/plans";

describe("plan maxAlertRules", () => {
  it("disables alerting on Free (0 rules)", () => {
    expect(PLANS.free.maxAlertRules).toBe(0);
  });

  it("allows rules on Pro and Team, with Team at least as high as Pro", () => {
    expect(PLANS.pro.maxAlertRules).toBeGreaterThan(0);
    expect(PLANS.team.maxAlertRules).toBeGreaterThanOrEqual(PLANS.pro.maxAlertRules);
  });

  it("falls back to the Free cap for an unknown plan name", () => {
    expect(getPlan("nonsense").maxAlertRules).toBe(PLANS.free.maxAlertRules);
  });
});
