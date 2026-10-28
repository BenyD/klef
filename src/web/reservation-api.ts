import type { PlanReservation } from "../shared/api-types.ts";
import type { ReservablePlanId } from "../shared/plans.ts";

// The /pricing page's reservation calls. Plain fetch, not apiFetch: the page
// is public, so a 401 means "signed out" here, not an expired session to
// bounce to /auth.

export type ReservationState =
  | { kind: "signedOut" }
  | { kind: "ready"; reservation: PlanReservation | null };

async function call(init?: RequestInit): Promise<ReservationState> {
  const res = await fetch("/api/reservation", { credentials: "same-origin", ...init });
  if (res.status === 401) return { kind: "signedOut" };
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  const body = (await res.json()) as { reservation: PlanReservation | null };
  return { kind: "ready", reservation: body.reservation };
}

export const fetchReservation = () => call();

export const reservePlan = (plan: ReservablePlanId) =>
  call({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });

export const cancelReservation = () => call({ method: "DELETE" });
