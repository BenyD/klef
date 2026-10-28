// The plans on /pricing, in one place so the page and the reservation API
// agree. Prices are whole US dollars. Paid plans are not open yet: a "presale"
// or "coming" plan can be reserved, never bought.

export type PlanId = "free" | "pro" | "team";
export type PaidPlanId = Exclude<PlanId, "free">;

export type PlanStatus = "available" | "presale" | "coming";

export interface Plan {
  id: PlanId;
  name: string;
  /** One line under the name: who the plan is for. */
  audience: string;
  /** Per month, billed monthly. */
  monthly: number;
  /** Per year, billed yearly; null for the free plan. */
  yearly: number | null;
  status: PlanStatus;
  features: readonly string[];
}

/** People in a Team plan, for one flat price. */
export const TEAM_SEATS = 5;

/** Free-plan limits that start when paid plans open. */
export const FREE_PROJECTS = 3;
export const FREE_HISTORY_DAYS = 30;

/** The pre-sale: Pro at this yearly price, for life, for the first reservations. */
export const FOUNDING = { plan: "pro", yearly: 24, spots: 100 } as const satisfies {
  plan: PaidPlanId;
  yearly: number;
  spots: number;
};

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    audience: "One developer getting started",
    monthly: 0,
    yearly: null,
    status: "available",
    features: [
      "End-to-end encryption, in your browser and CLI",
      "Every machine you own",
      "The CLI, klef run and klef audit",
      "Setup for Claude Code and Cursor",
      `Up to ${FREE_PROJECTS} projects`,
      `${FREE_HISTORY_DAYS} days of version history`,
    ],
  },
  {
    id: "pro",
    name: "Pro",
    audience: "One developer with many projects",
    monthly: 4,
    yearly: 36,
    status: "presale",
    features: [
      "Everything in Free",
      "Unlimited projects",
      "Full version history",
      "Email support from the person who builds Klef",
    ],
  },
  {
    id: "team",
    name: "Team",
    audience: `Small teams and freelancers, up to ${TEAM_SEATS} people`,
    monthly: 12,
    yearly: 108,
    status: "coming",
    features: [
      "Everything in Pro, for each person",
      "Shared projects, still end-to-end encrypted",
      `One flat price for up to ${TEAM_SEATS} people`,
    ],
  },
];

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** True for a plan that can be reserved; the API's only input check. */
export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "pro" || value === "team";
}

/** Months a yearly bill saves against twelve monthly ones, rounded down. */
export function monthsFreeYearly(plan: Pick<Plan, "monthly" | "yearly">): number {
  if (plan.yearly === null || plan.monthly === 0) return 0;
  return Math.floor((plan.monthly * 12 - plan.yearly) / plan.monthly);
}

/** "$4", "$0". Whole dollars only, by design. */
export function formatUsd(amount: number): string {
  return `$${amount}`;
}
