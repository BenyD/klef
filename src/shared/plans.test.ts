import { describe, expect, it } from "vitest";
import {
  FOUNDING,
  PLANS,
  formatUsd,
  isPaidPlanId,
  monthsFreeYearly,
  planById,
} from "./plans.ts";

describe("plans", () => {
  it("lists Free, Pro and Team in that order", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro", "team"]);
  });

  it("keeps Free free and open, and no paid plan purchasable yet", () => {
    const free = planById("free");
    expect(free.monthly).toBe(0);
    expect(free.yearly).toBeNull();
    expect(free.status).toBe("available");
    for (const plan of PLANS.filter((p) => p.id !== "free")) {
      expect(plan.status).not.toBe("available");
    }
  });

  it("makes every yearly price three months free", () => {
    expect(monthsFreeYearly(planById("pro"))).toBe(3);
    expect(monthsFreeYearly(planById("team"))).toBe(3);
    expect(monthsFreeYearly(planById("free"))).toBe(0);
  });

  it("prices the founding offer below Pro's yearly price", () => {
    const pro = planById(FOUNDING.plan);
    expect(pro.yearly).not.toBeNull();
    expect(FOUNDING.yearly).toBeLessThan(pro.yearly!);
    expect(FOUNDING.spots).toBeGreaterThan(0);
  });

  it("accepts only paid plan ids for a reservation", () => {
    expect(isPaidPlanId("pro")).toBe(true);
    expect(isPaidPlanId("team")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("PRO")).toBe(false);
    expect(isPaidPlanId(undefined)).toBe(false);
    expect(isPaidPlanId(1)).toBe(false);
  });

  it("formats whole dollars", () => {
    expect(formatUsd(4)).toBe("$4");
    expect(formatUsd(0)).toBe("$0");
  });

  it("writes no em dashes in anything a visitor reads", () => {
    for (const plan of PLANS) {
      for (const text of [plan.name, plan.audience, ...plan.features]) {
        expect(text).not.toMatch(/[–—]/);
      }
    }
  });
});
