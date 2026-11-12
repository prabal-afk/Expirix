import { daysLeft } from "./expiry";
import { MOVEMENT_LABELS, type Batch, type ISODate, type Movement, type MovementType } from "./types";

export interface MovementInput {
  batchId: string;
  type: MovementType;
  /**
   * received / sold / damaged / expired_removed / returned: a positive amount to add or take away.
   * adjustment: the NEW counted quantity on the shelf (the difference is calculated for you).
   */
  quantity: number;
  notes?: string;
}

export type MovementPlan =
  | { ok: true; qty_change: number; qty_after: number }
  | { ok: false; error: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Validates a stock movement against the batch. Used identically by the UI, the local demo
 * store and (as a mirror) by the SQL function in supabase/schema.sql.
 */
export function planMovement(batch: Batch, input: Pick<MovementInput, "type" | "quantity">, today: ISODate): MovementPlan {
  const q = Number(input.quantity);
  const cur = batch.quantity;
  const expired = daysLeft(batch.expiry_date, today) < 0;
  if (!Number.isFinite(q)) return { ok: false, error: "Enter a valid quantity." };

  if (input.type === "adjustment") {
    if (q < 0) return { ok: false, error: "Counted quantity cannot be negative." };
    const change = r3(q - cur);
    if (change === 0) return { ok: false, error: "That is already the current quantity." };
    return { ok: true, qty_change: change, qty_after: r3(q) };
  }

  if (q <= 0) return { ok: false, error: "Quantity must be greater than zero." };

  switch (input.type) {
    case "received":
      if (expired) return { ok: false, error: "This batch has expired. Add new stock as a new batch instead." };
      return { ok: true, qty_change: r3(q), qty_after: r3(cur + q) };
    case "sold":
      if (expired) return { ok: false, error: "Expired stock cannot be sold. Use “Expired stock removed”." };
      break;
    case "expired_removed":
      if (!expired) return { ok: false, error: "This batch has not expired yet. Use “Damaged” or “Returned” instead." };
      break;
  }
  if (q > cur) return { ok: false, error: `Only ${cur} in stock — you cannot remove ${q}.` };
  return { ok: true, qty_change: r3(-q), qty_after: r3(cur - q) };
}

export function isWaste(m: Pick<Movement, "type">): boolean {
  return m.type === "expired_removed" || m.type === "damaged";
}

export const movementLabel = (t: MovementType) => MOVEMENT_LABELS[t];
