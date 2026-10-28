// The plans on /pricing, in one place so the page and the reservation API
// agree. Prices are whole US dollars, paid once; there are no subscriptions.
// Neither paid plan is open yet, so both can be reserved, never bought. Team
// is announced with no price and cannot be reserved.

export type PlanId = "hosted" | "kit" | "team";
/** The plans a person can reserve. */
export type ReservablePlanId = "hosted" | "kit";

export type PlanStatus = "early" | "soon" | "coming";

export interface Plan {
  id: PlanId;
  name: string;
  /** One line under the name: who the plan is for. */
  audience: string;
  /** Paid once, in dollars; null when there is no price yet. */
  price: number | null;
  status: PlanStatus;
  features: readonly string[];
}

/** Days a new klef.sh account can use everything before paying. */
export const TRIAL_DAYS = 30;

/** Months of kit updates one payment includes; the kit keeps working after. */
export const KIT_UPDATE_MONTHS = 12;

/** The early price: Hosted for less, for the first people who reserve it. */
export const EARLY = { plan: "hosted", price: 29, spots: 100 } as const satisfies {
  plan: ReservablePlanId;
  price: number;
  spots: number;
};

export const PLANS: readonly Plan[] = [
  {
    id: "hosted",
    name: "Hosted",
    audience: "Klef on klef.sh, for one person, for life",
    price: 49,
    status: "early",
    features: [
      "Nothing to run: we host, back up and update it",
      "Unlimited projects and machines",
      "Full version history",
      "The CLI, klef run and klef audit",
      "Setup for Claude Code and Cursor",
      "Every future feature for one person",
      "Email support from the person who builds Klef",
    ],
  },
  {
    id: "kit",
    name: "Self-host kit",
    audience: "The Klef server, on your own Cloudflare account",
    price: 29,
    status: "soon",
    features: [
      "One command sets up the database, secrets and deploy",
      "One command applies each update",
      `${KIT_UPDATE_MONTHS} months of updates, and it keeps working after`,
      "Your data never touches klef.sh",
      "Email help with setup",
    ],
  },
  {
    id: "team",
    name: "Team",
    audience: "Small teams sharing projects",
    price: null,
    status: "coming",
    features: [
      "Shared projects, still end-to-end encrypted",
      "Everything in Hosted, for each person",
    ],
  },
];

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** True for a plan that can be reserved; the API's only input check. */
export function isReservablePlanId(value: unknown): value is ReservablePlanId {
  return value === "hosted" || value === "kit";
}

/** "$49". Whole dollars only, by design. */
export function formatUsd(amount: number): string {
  return `$${amount}`;
}
