import { addDays, daysBetween } from "./dates";
import type { AppData, Batch, ExpiryStatus, ISODate, Product, Settings } from "./types";

export function daysLeft(expiry: ISODate, today: ISODate): number {
  return daysBetween(today, expiry);
}

/** Status is always derived from today's date — never stored. */
export function statusOf(days: number, thresholdDays: number): ExpiryStatus {
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= thresholdDays) return "soon";
  return "safe";
}

export const STATUS_LABEL: Record<ExpiryStatus, string> = {
  expired: "Expired",
  today: "Expiring Today",
  soon: "Expiring Soon",
  safe: "Safe",
};

export interface BatchView {
  batch: Batch;
  product: Product;
  days: number;
  status: ExpiryStatus;
  empty: boolean; // no stock left in this batch
  sellable: boolean; // has stock and has not expired
  fefo: boolean; // recommended "sell first" batch of its product
  value: number; // purchase value of stock on hand
  retail: number; // retail value of stock on hand
}

export function buildViews(data: Pick<AppData, "products" | "batches">, settings: Settings, today: ISODate): BatchView[] {
  const productById = new Map(data.products.map((p) => [p.id, p]));
  const views: BatchView[] = [];
  for (const batch of data.batches) {
    const product = productById.get(batch.product_id);
    if (!product) continue;
    const days = daysLeft(batch.expiry_date, today);
    const empty = batch.quantity <= 0;
    views.push({
      batch,
      product,
      days,
      status: statusOf(days, settings.expiry_threshold_days),
      empty,
      sellable: !empty && days >= 0,
      fefo: false,
      value: batch.quantity * batch.purchase_price,
      retail: batch.quantity * batch.selling_price,
    });
  }
  // First-Expiry-First-Out: earliest-expiring batch that is still sellable.
  const byProduct = new Map<string, BatchView[]>();
  for (const v of views) {
    if (!v.sellable) continue;
    const arr = byProduct.get(v.product.id) ?? [];
    arr.push(v);
    byProduct.set(v.product.id, arr);
  }
  for (const arr of byProduct.values()) {
    arr.sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date));
    arr[0].fefo = true;
  }
  return views;
}

export interface ProductSummary {
  product: Product;
  totalQty: number;
  sellableQty: number;
  expiredQty: number;
  batchCount: number;
  nextExpiry: ISODate | null; // earliest expiry among sellable batches
  fefoBatchId: string | null;
  low: boolean;
  minStock: number;
}

export function minStockOf(product: Product, settings: Settings): number {
  return product.min_stock ?? settings.low_stock_default;
}

export function summarizeProducts(views: BatchView[], products: Product[], settings: Settings): ProductSummary[] {
  return products.map((product) => {
    const mine = views.filter((v) => v.product.id === product.id && !v.empty);
    const sellable = mine.filter((v) => v.sellable);
    const sellableQty = sellable.reduce((s, v) => s + v.batch.quantity, 0);
    const minStock = minStockOf(product, settings);
    const next = sellable.map((v) => v.batch.expiry_date).sort()[0] ?? null;
    return {
      product,
      totalQty: mine.reduce((s, v) => s + v.batch.quantity, 0),
      sellableQty,
      expiredQty: mine.filter((v) => v.status === "expired").reduce((s, v) => s + v.batch.quantity, 0),
      batchCount: mine.length,
      nextExpiry: next,
      fefoBatchId: sellable.find((v) => v.fefo)?.batch.id ?? null,
      low: minStock > 0 && sellableQty < minStock,
      minStock,
    };
  });
}

export interface Bucket {
  key: "expired" | "today" | "d3" | "d7" | "d30" | "safe";
  label: string;
  batches: number;
  units: number;
  cost: number;
}

/** Disjoint expiry buckets over batches that still have stock. */
export function expiryBuckets(views: BatchView[]): Bucket[] {
  const defs: Array<[Bucket["key"], string, (d: number) => boolean]> = [
    ["expired", "Expired", (d) => d < 0],
    ["today", "Expiring today", (d) => d === 0],
    ["d3", "In 1–3 days", (d) => d >= 1 && d <= 3],
    ["d7", "In 4–7 days", (d) => d >= 4 && d <= 7],
    ["d30", "In 8–30 days", (d) => d >= 8 && d <= 30],
    ["safe", "Safe (30+ days)", (d) => d > 30],
  ];
  return defs.map(([key, label, test]) => {
    const rows = views.filter((v) => !v.empty && test(v.days));
    return {
      key,
      label,
      batches: rows.length,
      units: rows.reduce((s, v) => s + v.batch.quantity, 0),
      cost: rows.reduce((s, v) => s + v.value, 0),
    };
  });
}

export interface DashboardMetrics {
  totalProducts: number;
  totalUnits: number;
  sellableUnits: number;
  expiredUnits: number;
  expiringSoonBatches: number;
  expiringSoonUnits: number;
  expiredBatches: number;
  lowStockProducts: number;
  expiredCost: number;
  atRiskCost: number;
  potentialLoss: number;
}

export function dashboardMetrics(views: BatchView[], summaries: ProductSummary[], settings: Settings): DashboardMetrics {
  const active = views.filter((v) => !v.empty);
  const soon = active.filter((v) => v.days >= 0 && v.days <= settings.expiry_threshold_days);
  const expired = active.filter((v) => v.days < 0);
  const expiredCost = expired.reduce((s, v) => s + v.value, 0);
  const atRiskCost = soon.reduce((s, v) => s + v.value, 0);
  return {
    totalProducts: summaries.length,
    totalUnits: active.reduce((s, v) => s + v.batch.quantity, 0),
    sellableUnits: active.filter((v) => v.days >= 0).reduce((s, v) => s + v.batch.quantity, 0),
    expiredUnits: expired.reduce((s, v) => s + v.batch.quantity, 0),
    expiringSoonBatches: soon.length,
    expiringSoonUnits: soon.reduce((s, v) => s + v.batch.quantity, 0),
    expiredBatches: expired.length,
    lowStockProducts: summaries.filter((s) => s.low).length,
    expiredCost,
    atRiskCost,
    potentialLoss: expiredCost + atRiskCost,
  };
}

export type Urgency = "urgent" | "warning" | "monitor";

export function urgencyOf(days: number, thresholdDays: number): Urgency {
  if (days <= 1) return "urgent"; // expired, today, tomorrow
  if (days <= thresholdDays) return "warning";
  return "monitor";
}

export interface SuggestedAction {
  text: string;
  tone: "red" | "amber" | "blue" | "green";
}

/** Practical, safe suggestions. Never suggests selling expired stock. */
export function suggestAction(v: BatchView, thresholdDays: number, otherSellableBatches: number): SuggestedAction {
  if (v.days < 0)
    return { text: "Remove from shelf now and record the removal. Do not sell.", tone: "red" };
  if (v.days === 0)
    return { text: "Sell today if the label allows; otherwise remove it from the shelf at closing.", tone: "red" };
  if (v.days <= 3)
    return {
      text: v.fefo && otherSellableBatches > 0
        ? "Place at the front and sell this batch before the newer ones (FEFO)."
        : "Place at the front. Ask your supplier if a safe return is possible.",
      tone: "amber",
    };
  if (v.days <= thresholdDays)
    return { text: "Sell this batch first and avoid re-ordering more of it for now.", tone: "amber" };
  return { text: "No action yet. Keep rotating stock oldest-first.", tone: "blue" };
}

/* ----------------------------- filtering / sorting ----------------------------- */

export type StatusFilter = "all" | "safe" | "soon" | "today" | "expired" | "expiring" | "low";
export type SortKey = "name" | "quantity" | "expiry";

export interface InventoryFilters {
  q: string;
  category: string; // "" = all
  status: StatusFilter;
  from: ISODate | "";
  to: ISODate | "";
  sort: SortKey;
  dir: "asc" | "desc";
  showEmpty: boolean;
}

export const DEFAULT_FILTERS: InventoryFilters = {
  q: "",
  category: "",
  status: "all",
  from: "",
  to: "",
  sort: "expiry",
  dir: "asc",
  showEmpty: false,
};

export function matchesQuery(v: { product: Product; batch?: Batch }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const { product, batch } = v;
  return (
    product.name.toLowerCase().includes(needle) ||
    product.brand.toLowerCase().includes(needle) ||
    (product.barcode ?? "").toLowerCase().includes(needle) ||
    (batch?.batch_no ?? "").toLowerCase().includes(needle)
  );
}

export function filterViews(views: BatchView[], f: InventoryFilters, summaries: ProductSummary[]): BatchView[] {
  const lowIds = new Set(summaries.filter((s) => s.low).map((s) => s.product.id));
  let rows = views.filter((v) => {
    if (!f.showEmpty && v.empty && f.status === "all") return false;
    if (v.empty && f.status !== "all" && !f.showEmpty) return false;
    if (!matchesQuery(v, f.q)) return false;
    if (f.category && v.product.category !== f.category) return false;
    switch (f.status) {
      case "safe":
      case "soon":
      case "today":
      case "expired":
        if (v.status !== f.status) return false;
        break;
      case "expiring":
        if (!(v.status === "soon" || v.status === "today")) return false;
        break;
      case "low":
        if (!lowIds.has(v.product.id)) return false;
        break;
    }
    if (f.from && v.batch.expiry_date < f.from) return false;
    if (f.to && v.batch.expiry_date > f.to) return false;
    return true;
  });
  const m = f.dir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    let c = 0;
    if (f.sort === "name") c = a.product.name.localeCompare(b.product.name);
    else if (f.sort === "quantity") c = a.batch.quantity - b.batch.quantity;
    else c = a.batch.expiry_date.localeCompare(b.batch.expiry_date);
    if (c === 0) c = a.product.name.localeCompare(b.product.name);
    return c * m;
  });
  return rows;
}

/** Next 30 days, one entry per day, for the dashboard bar chart. */
export function expiryByDay(views: BatchView[], today: ISODate, days = 30) {
  const out: { date: ISODate; offset: number; batches: number; units: number }[] = [];
  for (let i = 0; i <= days; i++) out.push({ date: addDays(today, i), offset: i, batches: 0, units: 0 });
  for (const v of views) {
    if (v.empty || v.days < 0 || v.days > days) continue;
    out[v.days].batches += 1;
    out[v.days].units += v.batch.quantity;
  }
  return out;
}
