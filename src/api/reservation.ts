import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";
import type { PlanReservation } from "../shared/api-types.ts";
import { isReservablePlanId } from "../shared/plans.ts";

// Plan reservations from /pricing: Hosted or the self-host kit. A reservation records intent and
// charges nothing; there is no payment provider behind it yet. Mounted behind
// requireAuth + requireSession in index.ts: reserving is a browser action, and
// an access token has no business changing it.
export const reservation = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

interface ReservationRow {
  plan: PlanReservation["plan"];
  created_at: string;
  updated_at: string;
}

function toReservation(row: ReservationRow): PlanReservation {
  return { plan: row.plan, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function load(db: D1Database, userId: string): Promise<PlanReservation | null> {
  const row = await db
    .prepare("SELECT plan, created_at, updated_at FROM plan_reservations WHERE user_id = ?")
    .bind(userId)
    .first<ReservationRow>();
  return row ? toReservation(row) : null;
}

reservation.get("/", async (c) => {
  return c.json({ reservation: await load(c.env.DB, c.get("user").id) });
});

// Create or switch. Switching plans keeps created_at, which is what the
// early price goes by.
reservation.put("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { plan?: unknown } | null;
  const plan = body?.plan;
  if (!isReservablePlanId(plan)) {
    return c.json({ error: "plan must be \"hosted\" or \"kit\"" }, 400);
  }
  const userId = c.get("user").id;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO plan_reservations (user_id, plan, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at`,
  )
    .bind(userId, plan, now)
    .run();
  return c.json({ reservation: await load(c.env.DB, userId) });
});

reservation.delete("/", async (c) => {
  await c.env.DB.prepare("DELETE FROM plan_reservations WHERE user_id = ?")
    .bind(c.get("user").id)
    .run();
  return c.json({ reservation: null });
});
