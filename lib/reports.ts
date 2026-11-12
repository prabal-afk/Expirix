import { addMonths, dateOfTimestamp, monthKey, monthLabel } from "./dates";
import type { BatchView } from "./expiry";
import { isWaste } from "./movements";
import type { ISODate, Movement, Settings } from "./types";

export interface Range {
  from: ISODate;
  to: ISODate;
}

export function inRange(date: ISODate, r: Range) {
  return date >= r.from && date <= r.to;
}

export function inventoryReport(views: BatchView[]) {
  const active = views.filter((v) => !v.empty);
  const sellable = active.filter((v) => v.days >= 0);
  const byCat = new Map<string, { category: string; units: number; sellableUnits: number; cost: number }>();
  for (const v of active) {
    const row = byCat.get(v.product.category) ?? { category: v.product.category, units: 0, sellableUnits: 0, cost: 0 };
    row.units += v.batch.quantity;
    if (v.days >= 0) row.sellableUnits += v.batch.quantity;
    row.cost += v.value;
    byCat.set(v.product.category, row);
  }
  return {
    totalUnits: active.reduce((s, v) => s + v.batch.quantity, 0),
    purchaseValue: active.reduce((s, v) => s + v.value, 0),
    retailValueEligible: sellable.reduce((s, v) => s + v.retail, 0),
    categories: [...byCat.values()].sort((a, b) => b.units - a.units),
  };
}

export function wasteInRange(movements: Movement[], r: Range, tz: string) {
  return movements.filter((m) => isWaste(m) && inRange(dateOfTimestamp(m.created_at, tz), r));
}

export function wasteSummary(ms: Movement[]) {
  let qty = 0,
    cost = 0,
    expiredQty = 0,
    expiredCost = 0,
    damagedQty = 0,
    damagedCost = 0;
  const byProduct = new Map<string, { name: string; qty: number; cost: number; times: number }>();
  for (const m of ms) {
    const q = -m.qty_change;
    const c = q * m.unit_cost;
    qty += q;
    cost += c;
    if (m.type === "expired_removed") {
      expiredQty += q;
      expiredCost += c;
    } else {
      damagedQty += q;
      damagedCost += c;
    }
    const row = byProduct.get(m.product_name) ?? { name: m.product_name, qty: 0, cost: 0, times: 0 };
    row.qty += q;
    row.cost += c;
    row.times += 1;
    byProduct.set(m.product_name, row);
  }
  return {
    qty,
    cost,
    expiredQty,
    expiredCost,
    damagedQty,
    damagedCost,
    top: [...byProduct.values()].sort((a, b) => b.times - a.times || b.cost - a.cost).slice(0, 5),
  };
}

/** Waste cost per calendar month between two months (inclusive). */
export function monthlyWaste(movements: Movement[], fromMonth: string, toMonth: string, tz: string) {
  const out: { key: string; label: string; cost: number; qty: number }[] = [];
  for (let k = fromMonth; k <= toMonth; k = monthKey(addMonths(`${k}-01`, 1))) {
    out.push({ key: k, label: monthLabel(k), cost: 0, qty: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const m of movements) {
    if (!isWaste(m)) continue;
    const i = idx.get(monthKey(dateOfTimestamp(m.created_at, tz)));
    if (i === undefined) continue;
    out[i].qty += -m.qty_change;
    out[i].cost += -m.qty_change * m.unit_cost;
  }
  return out;
}

export function lastMonthsWaste(movements: Movement[], today: ISODate, months: number, tz: string) {
  const to = monthKey(today);
  const from = monthKey(addMonths(`${to}-01`, -(months - 1)));
  return monthlyWaste(movements, from, to, tz);
}

export function expiryReport(views: BatchView[], movements: Movement[], r: Range, settings: Settings, tz: string) {
  const active = views.filter((v) => !v.empty);
  const expiring = active.filter((v) => v.days >= 0 && inRange(v.batch.expiry_date, r));
  const expired = active.filter((v) => v.days < 0);
  const atRisk = active.filter((v) => v.days >= 0 && v.days <= settings.expiry_threshold_days);
  const removed = movements.filter((m) => m.type === "expired_removed" && inRange(dateOfTimestamp(m.created_at, tz), r));
  return {
    expiring,
    expired,
    atRiskUnits: atRisk.reduce((s, v) => s + v.batch.quantity, 0) + expired.reduce((s, v) => s + v.batch.quantity, 0),
    atRiskCost: atRisk.reduce((s, v) => s + v.value, 0),
    expiredOnShelfCost: expired.reduce((s, v) => s + v.value, 0),
    removed,
  };
}
