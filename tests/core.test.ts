import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatDate, todayISO, isValidISO } from "@/lib/dates";
import { buildViews, dashboardMetrics, expiryBuckets, filterViews, statusOf, summarizeProducts, DEFAULT_FILTERS } from "@/lib/expiry";
import { levelFor, planAlertSync } from "@/lib/alerts";
import { planMovement } from "@/lib/movements";
import { buildSeed, defaultSettings } from "@/lib/seed";
import { toCSV, csvCell } from "@/lib/csv";
import { validateBatchForm } from "@/lib/validation";
import { wasteSummary, wasteInRange } from "@/lib/reports";
import type { AppNotification, Batch } from "@/lib/types";

const TODAY = "2026-11-10";
let n = 0;
const id = () => `id-${++n}`;

describe("dates", () => {
  it("computes day differences across month, year and DST boundaries", () => {
    expect(daysBetween("2026-11-10", "2026-11-11")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-11-10", "2026-11-05")).toBe(-5);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
  it("formats DD/MM/YYYY by default and validates real calendar dates", () => {
    expect(formatDate("2026-11-05")).toBe("05/11/2026");
    expect(formatDate("2026-11-05", "MM/DD/YYYY")).toBe("11/05/2026");
    expect(isValidISO("2026-02-30")).toBe(false);
    expect(isValidISO("2028-02-29")).toBe(true);
  });
  it("uses the shop's time zone for 'today'", () => {
    const t = new Date("2026-11-10T20:00:00Z"); // 01:30 on the 11th in India
    expect(todayISO("Asia/Kolkata", t)).toBe("2026-11-11");
    expect(todayISO("UTC", t)).toBe("2026-11-10");
  });
});

describe("expiry status", () => {
  it("derives status from days left and the threshold", () => {
    expect(statusOf(-1, 7)).toBe("expired");
    expect(statusOf(0, 7)).toBe("today");
    expect(statusOf(1, 7)).toBe("soon");
    expect(statusOf(7, 7)).toBe("soon");
    expect(statusOf(8, 7)).toBe("safe");
    expect(statusOf(8, 10)).toBe("soon"); // configurable threshold
  });
  it("changes as the date moves forward", () => {
    const seed = buildSeed(TODAY, "s", id);
    const v1 = buildViews(seed, seed.settings, TODAY);
    const milkB = v1.find((v) => v.batch.batch_no === "AM-B")!;
    expect(milkB.status).toBe("soon");
    const v2 = buildViews(seed, seed.settings, addDays(TODAY, 4));
    expect(v2.find((v) => v.batch.batch_no === "AM-B")!.status).toBe("expired");
  });
});

describe("seed data and dashboard metrics", () => {
  const seed = buildSeed(TODAY, "s", id);
  const views = buildViews(seed, seed.settings, TODAY);
  const summaries = summarizeProducts(views, seed.products, seed.settings);
  const m = dashboardMetrics(views, summaries, seed.settings);

  it("has 15–20 products with a realistic mix of statuses", () => {
    expect(seed.products.length).toBeGreaterThanOrEqual(15);
    expect(seed.products.length).toBeLessThanOrEqual(20);
    const b = Object.fromEntries(expiryBuckets(views).map((x) => [x.key, x.batches]));
    for (const k of ["expired", "today", "d3", "d7", "d30", "safe"]) expect(b[k]).toBeGreaterThan(0);
  });
  it("metrics are derived from batches", () => {
    const sum = (f: (v: (typeof views)[number]) => boolean) => views.filter((v) => !v.empty && f(v)).reduce((s, v) => s + v.batch.quantity, 0);
    expect(m.totalUnits).toBe(sum(() => true));
    expect(m.sellableUnits).toBe(sum((v) => v.days >= 0));
    expect(m.expiredUnits).toBe(sum((v) => v.days < 0));
    expect(m.expiredBatches).toBe(2);
    expect(m.expiringSoonBatches).toBe(views.filter((v) => v.days >= 0 && v.days <= 7).length);
    expect(m.potentialLoss).toBeCloseTo(m.expiredCost + m.atRiskCost);
    expect(m.lowStockProducts).toBeGreaterThanOrEqual(1);
  });
  it("expired stock is never sellable and never FEFO-recommended", () => {
    for (const v of views) if (v.days < 0) expect(v.sellable || v.fefo).toBe(false);
    const milk = views.filter((v) => v.product.name.startsWith("Amul Taaza"));
    expect(milk.find((v) => v.fefo)!.batch.batch_no).toBe("AM-A"); // earliest-expiring sellable batch
    const jam = views.filter((v) => v.product.name.startsWith("Kissan"));
    expect(jam.find((v) => v.fefo)!.batch.batch_no).toBe("KJ-05"); // skips the expired one
  });
  it("expired quantity is excluded from a product's sellable quantity", () => {
    const jam = summaries.find((s) => s.product.name.startsWith("Kissan"))!;
    expect(jam.sellableQty).toBe(9);
    expect(jam.expiredQty).toBe(4);
  });
  it("batch quantities reconcile with the movement history", () => {
    for (const b of seed.batches) {
      const last = seed.movements.filter((x) => x.batch_id === b.id).sort((a, c) => a.created_at.localeCompare(c.created_at)).pop()!;
      const total = seed.movements.filter((x) => x.batch_id === b.id).reduce((s, x) => s + x.qty_change, 0);
      expect(total).toBe(b.quantity);
      expect(last.qty_after).toBe(b.quantity);
    }
  });
});

describe("filters and sorting", () => {
  const seed = buildSeed(TODAY, "s", id);
  const views = buildViews(seed, seed.settings, TODAY);
  const sums = summarizeProducts(views, seed.products, seed.settings);
  it("searches name, brand, barcode and batch number", () => {
    expect(filterViews(views, { ...DEFAULT_FILTERS, q: "amul" }, sums).length).toBe(4);
    expect(filterViews(views, { ...DEFAULT_FILTERS, q: "AM-B" }, sums).length).toBe(1);
    expect(filterViews(views, { ...DEFAULT_FILTERS, q: seed.products[3].barcode! }, sums).length).toBe(2);
  });
  it("filters by status, category and date range; sorts", () => {
    expect(filterViews(views, { ...DEFAULT_FILTERS, status: "expired" }, sums).every((v) => v.status === "expired")).toBe(true);
    expect(filterViews(views, { ...DEFAULT_FILTERS, category: "Dairy" }, sums).every((v) => v.product.category === "Dairy")).toBe(true);
    const r = filterViews(views, { ...DEFAULT_FILTERS, from: TODAY, to: addDays(TODAY, 7) }, sums);
    expect(r.every((v) => v.days >= 0 && v.days <= 7)).toBe(true);
    const byQty = filterViews(views, { ...DEFAULT_FILTERS, sort: "quantity", dir: "desc" }, sums);
    expect(byQty[0].batch.quantity).toBeGreaterThanOrEqual(byQty[1].batch.quantity);
    const byName = filterViews(views, { ...DEFAULT_FILTERS, sort: "name" }, sums);
    expect(byName[0].product.name.localeCompare(byName[1].product.name)).toBeLessThanOrEqual(0);
  });
});

describe("alerts", () => {
  const cfg = defaultSettings("s");
  it("maps days to a single level per the default rules", () => {
    expect(levelFor(40, cfg)).toBeNull();
    expect(levelFor(30, cfg)).toBe("upcoming");
    expect(levelFor(7, cfg)).toBe("warning");
    expect(levelFor(3, cfg)).toBe("high");
    expect(levelFor(1, cfg)).toBe("critical");
    expect(levelFor(0, cfg)).toBe("today");
    expect(levelFor(-1, cfg)).toBe("expired");
  });
  it("creates alerts once and never duplicates them", () => {
    const seed = buildSeed(TODAY, "s", id);
    const plan1 = planAlertSync({ ...seed, notifications: [] }, TODAY, "now", id);
    expect(plan1.create.length).toBeGreaterThan(5);
    const again = planAlertSync({ ...seed, notifications: plan1.create }, TODAY, "now", id);
    expect(again.create).toEqual([]);
    expect(again.patch).toEqual([]);
    const keys = plan1.create.map((a) => `${a.batch_id}:${a.level}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("moves to the next level when time passes and resolves the old alert", () => {
    const seed = buildSeed(TODAY, "s", id);
    const first = planAlertSync({ ...seed, notifications: [] }, TODAY, "t0", id).create;
    const later = addDays(TODAY, 1);
    const plan = planAlertSync({ ...seed, notifications: first }, later, "t1", id);
    const milkA = seed.batches.find((b) => b.batch_no === "AM-A")!;
    expect(first.find((a) => a.batch_id === milkA.id)!.level).toBe("today");
    expect(plan.create.find((a) => a.batch_id === milkA.id)!.level).toBe("expired");
    expect(plan.patch.some((p) => p.resolved && first.find((a) => a.id === p.id)!.batch_id === milkA.id)).toBe(true);
  });
  it("dismissing or reading an alert does not change expiry status", () => {
    const seed = buildSeed(TODAY, "s", id);
    const alerts: AppNotification[] = planAlertSync({ ...seed, notifications: [] }, TODAY, "t", id).create.map((a) => ({ ...a, dismissed: true, read: true }));
    const before = buildViews(seed, seed.settings, TODAY).map((v) => [v.batch.id, v.status, v.sellable]);
    const plan = planAlertSync({ ...seed, notifications: alerts }, TODAY, "t", id);
    expect(plan.create).toEqual([]); // dismissed alerts are not regenerated
    const after = buildViews(seed, seed.settings, TODAY).map((v) => [v.batch.id, v.status, v.sellable]);
    expect(after).toEqual(before);
  });
  it("resolves alerts when a batch is emptied", () => {
    const seed = buildSeed(TODAY, "s", id);
    const alerts = planAlertSync({ ...seed, notifications: [] }, TODAY, "t", id).create;
    const target = seed.batches.find((b) => b.batch_no === "GD-08")!;
    const emptied = seed.batches.map((b) => (b.id === target.id ? { ...b, quantity: 0 } : b));
    const plan = planAlertSync({ ...seed, batches: emptied, notifications: alerts }, TODAY, "t", id);
    expect(plan.patch.filter((p) => p.resolved).length).toBe(1);
  });
});

describe("stock movements", () => {
  const batch = (over: Partial<Batch> = {}): Batch => ({
    id: "b", shop_id: "s", product_id: "p", batch_no: "X", quantity: 10, initial_quantity: 10,
    purchase_price: 10, selling_price: 12, purchase_date: "2026-11-01", mfg_date: null, expiry_date: "2026-11-20", created_at: "", ...over,
  });
  it("sells and never goes negative", () => {
    expect(planMovement(batch(), { type: "sold", quantity: 4 }, TODAY)).toEqual({ ok: true, qty_change: -4, qty_after: 6 });
    expect(planMovement(batch(), { type: "sold", quantity: 11 }, TODAY).ok).toBe(false);
    expect(planMovement(batch(), { type: "sold", quantity: 0 }, TODAY).ok).toBe(false);
    expect(planMovement(batch(), { type: "sold", quantity: -3 }, TODAY).ok).toBe(false);
  });
  it("blocks selling or receiving into expired stock; only expired stock can be 'expired removed'", () => {
    const old = batch({ expiry_date: "2026-11-09" });
    expect(planMovement(old, { type: "sold", quantity: 1 }, TODAY).ok).toBe(false);
    expect(planMovement(old, { type: "received", quantity: 1 }, TODAY).ok).toBe(false);
    expect(planMovement(old, { type: "expired_removed", quantity: 10 }, TODAY)).toEqual({ ok: true, qty_change: -10, qty_after: 0 });
    expect(planMovement(batch(), { type: "expired_removed", quantity: 1 }, TODAY).ok).toBe(false);
  });
  it("received adds, adjustment sets the counted quantity", () => {
    expect(planMovement(batch(), { type: "received", quantity: 5 }, TODAY)).toEqual({ ok: true, qty_change: 5, qty_after: 15 });
    expect(planMovement(batch(), { type: "adjustment", quantity: 7 }, TODAY)).toEqual({ ok: true, qty_change: -3, qty_after: 7 });
    expect(planMovement(batch(), { type: "adjustment", quantity: -1 }, TODAY).ok).toBe(false);
    expect(planMovement(batch(), { type: "adjustment", quantity: 10 }, TODAY).ok).toBe(false);
  });
  it("handles decimal quantities without float drift", () => {
    expect(planMovement(batch({ quantity: 0.3 }), { type: "sold", quantity: 0.1 }, TODAY)).toEqual({ ok: true, qty_change: -0.1, qty_after: 0.2 });
  });
});

describe("waste maths", () => {
  it("values waste at purchase price × quantity and ignores returns", () => {
    const seed = buildSeed(TODAY, "s", id);
    const ms = wasteInRange(seed.movements, { from: "2000-01-01", to: TODAY }, "UTC");
    const s = wasteSummary(ms);
    const expectedQty = 2 + 6 + 4 + 5 + 8 + 10 + 3 + 4 + 15 + 3 + 2 + 10 + 12;
    expect(s.qty).toBe(expectedQty);
    expect(s.cost).toBeCloseTo(
      2 * 26 + 6 * 26 + 4 * 26 + 5 * 34 + 8 * 34 + 10 * 18 + 3 * 145 + 4 * 12 + 15 * 8.5 + 3 * 17 + 2 * 52 + 10 * 9 + 12 * 17,
    );
    expect(s.expiredCost + s.damagedCost).toBeCloseTo(s.cost);
  });
});

describe("CSV", () => {
  it("escapes quotes/commas/newlines and neutralises spreadsheet formulas", () => {
    expect(csvCell('Tea, "Gold"')).toBe('"Tea, ""Gold"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
    expect(toCSV([["a", 1], ["b", null]])).toBe("a,1\r\nb,");
  });
});

describe("form validation", () => {
  const ok = {
    name: "Amul Milk", brand: "Amul", category: "Dairy", barcode: "", batch_no: "", quantity: "10", unit: "packs",
    purchase_price: "20", selling_price: "25", purchase_date: "2026-11-10", mfg_date: "", expiry_date: "2026-11-20",
    min_stock: "", supplier: "", notes: "",
  };
  it("accepts a valid form", () => {
    const r = validateBatchForm(ok, "add");
    expect(r.ok).toBe(true);
  });
  it("rejects negative quantity/prices, bad dates and missing fields with clear messages", () => {
    const r = validateBatchForm({ ...ok, name: "", quantity: "-2", purchase_price: "-1", expiry_date: "2026-02-31" }, "add");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toMatch(/required/i);
      expect(r.errors.quantity).toBeTruthy();
      expect(r.errors.purchase_price).toMatch(/negative/i);
      expect(r.errors.expiry_date).toMatch(/valid date/i);
    }
    expect(validateBatchForm({ ...ok, quantity: "0" }, "add").ok).toBe(false);
    expect(validateBatchForm({ ...ok, quantity: "0" }, "edit").ok).toBe(true);
    expect(validateBatchForm({ ...ok, mfg_date: "2026-12-01" }, "add").ok).toBe(false);
  });
});
