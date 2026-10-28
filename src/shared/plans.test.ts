import { describe, expect, it } from "vitest";
import { EARLY, PLANS, TRIAL_DAYS, formatUsd, isReservablePlanId, planById } from "./plans.ts";

describe("plans", () => {
  it("lists Hosted, the self-host kit and Team in that order", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["hosted", "kit", "team"]);
  });

  it("prices both paid plans once, and neither is open yet", () => {
    for (const id of ["hosted", "kit"] as const) {
      const plan = planById(id);
      expect(plan.price).toBeGreaterThan(0);
      expect(plan.status).not.toBe("coming");
    }
  });

  it("announces Team with no price", () => {
    const team = planById("team");
    expect(team.price).toBeNull();
    expect(team.status).toBe("coming");
  });

  it("prices the early offer below Hosted", () => {
    expect(EARLY.price).toBeLessThan(planById(EARLY.plan).price!);
    expect(EARLY.spots).toBeGreaterThan(0);
  });

  it("offers a trial", () => {
    expect(TRIAL_DAYS).toBeGreaterThan(0);
  });

  it("lets only Hosted and the kit be reserved", () => {
    expect(isReservablePlanId("hosted")).toBe(true);
    expect(isReservablePlanId("kit")).toBe(true);
    for (const value of ["team", "free", "lifetime", "pro", "HOSTED", undefined, 1]) {
      expect(isReservablePlanId(value)).toBe(false);
    }
  });

  it("formats whole dollars", () => {
    expect(formatUsd(49)).toBe("$49");
  });

  it("writes no em dashes in anything a visitor reads", () => {
    for (const plan of PLANS) {
      for (const text of [plan.name, plan.audience, ...plan.features]) {
        expect(text).not.toMatch(/[–—]/);
      }
    }
  });
});

describe("plans and search metadata", () => {
  it("lists the same one-time prices in the page's structured data", async () => {
    const { structuredData } = await import("../web/lib/seo.ts");
    const graph = (structuredData("/pricing") as { "@graph": { "@type": string; offers?: { name: string; price: string }[] }[] })["@graph"];
    const app = graph.find((node) => node["@type"] === "SoftwareApplication");
    expect(app?.offers).toEqual([
      expect.objectContaining({ name: "Hosted", price: String(planById("hosted").price) }),
      expect.objectContaining({ name: "Self-host kit", price: String(planById("kit").price) }),
    ]);
  });
});
