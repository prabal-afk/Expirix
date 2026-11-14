import type { AlertPlan } from "../alerts";
import { todayISO } from "../dates";
import { planMovement, type MovementInput } from "../movements";
import { buildSeed, DEMO_SHOP_ID } from "../seed";
import type { AppData, AppNotification, Batch, ISODate, Movement, Product, Settings } from "../types";
import { RepoError, type Repo } from "./types";

const KEY = "expirix:demo:v1";

function read(): AppData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    throw new RepoError("This browser is blocking local storage, so demo data cannot be saved. Turn off private browsing or allow site data.");
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.batches) && parsed.settings) return parsed;
    } catch {
      /* fall through and re-seed */
    }
  }
  const fresh = buildSeed(todayISO("Asia/Kolkata"));
  write(fresh);
  return fresh;
}

function write(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    throw new RepoError("Could not save to this browser's storage (it may be full or blocked).");
  }
}

/** Demo mode: everything lives in this browser's localStorage. Nothing is sent to any server. */
export const localRepo: Repo = {
  mode: "demo",

  async load() {
    return read();
  },

  async upsertProduct(p: Product) {
    const d = read();
    const i = d.products.findIndex((x) => x.id === p.id);
    if (i >= 0) d.products[i] = p;
    else d.products.push(p);
    write(d);
  },

  async deleteProduct(id) {
    const d = read();
    const batchIds = new Set(d.batches.filter((b) => b.product_id === id).map((b) => b.id));
    d.products = d.products.filter((p) => p.id !== id);
    d.batches = d.batches.filter((b) => b.product_id !== id);
    d.notifications = d.notifications.filter((n) => n.product_id !== id);
    d.movements = d.movements.map((m) =>
      m.product_id === id || (m.batch_id && batchIds.has(m.batch_id)) ? { ...m, product_id: null, batch_id: null } : m,
    );
    write(d);
  },

  async insertBatch(b: Batch, opening: Movement) {
    const d = read();
    d.batches.push(b);
    d.movements.push(opening);
    write(d);
  },

  async updateBatch(b: Batch) {
    const d = read();
    const i = d.batches.findIndex((x) => x.id === b.id);
    if (i < 0) throw new RepoError("That batch no longer exists.");
    d.batches[i] = { ...b, quantity: d.batches[i].quantity }; // quantity is never changed here
    write(d);
  },

  async deleteBatch(id) {
    const d = read();
    d.batches = d.batches.filter((b) => b.id !== id);
    d.notifications = d.notifications.filter((n) => n.batch_id !== id);
    d.movements = d.movements.map((m) => (m.batch_id === id ? { ...m, batch_id: null } : m));
    write(d);
  },

  async recordMovement(input: MovementInput, ctx) {
    const d = read();
    const i = d.batches.findIndex((b) => b.id === input.batchId);
    if (i < 0) throw new RepoError("That batch no longer exists.");
    const batch = d.batches[i];
    const plan = planMovement(batch, input, ctx.today);
    if (!plan.ok) throw new RepoError(plan.error);
    const product = d.products.find((p) => p.id === batch.product_id);
    const updated: Batch = { ...batch, quantity: plan.qty_after };
    const movement: Movement = {
      id: ctx.id,
      shop_id: batch.shop_id,
      product_id: batch.product_id,
      batch_id: batch.id,
      product_name: product?.name ?? "Unknown product",
      batch_no: batch.batch_no,
      unit: product?.unit ?? "",
      type: input.type,
      qty_change: plan.qty_change,
      qty_after: plan.qty_after,
      unit_cost: batch.purchase_price,
      unit_price: batch.selling_price,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      created_at: ctx.nowTs,
    };
    d.batches[i] = updated;
    d.movements.push(movement);
    write(d);
    return { batch: updated, movement };
  },

  async applyAlertPlan(plan: AlertPlan) {
    const d = read();
    const known = new Set(d.notifications.map((n) => `${n.batch_id}:${n.level}`));
    for (const n of plan.create) if (!known.has(`${n.batch_id}:${n.level}`)) d.notifications.push(n);
    const patches = new Map(plan.patch.map((p) => [p.id, p.resolved]));
    d.notifications = d.notifications.map((n) => (patches.has(n.id) ? { ...n, resolved: patches.get(n.id)! } : n));
    write(d);
  },

  async patchNotifications(ids, patch) {
    const d = read();
    const set = new Set(ids);
    d.notifications = d.notifications.map((n): AppNotification => (set.has(n.id) ? { ...n, ...patch } : n));
    write(d);
  },

  async saveSettings(s: Settings) {
    const d = read();
    d.settings = { ...s, shop_id: d.settings.shop_id };
    write(d);
  },

  async loadSample(today: ISODate) {
    const d = read();
    const fresh = buildSeed(today, DEMO_SHOP_ID);
    fresh.settings = { ...fresh.settings, ...pickPrefs(d.settings) };
    write(fresh);
  },
};

// keep the user's own preferences when the sample inventory is reset
function pickPrefs(s: Settings): Partial<Settings> {
  return {
    date_format: s.date_format,
    currency: s.currency,
    expiry_threshold_days: s.expiry_threshold_days,
    alert_upcoming_days: s.alert_upcoming_days,
    alert_warning_days: s.alert_warning_days,
    alert_high_days: s.alert_high_days,
    alert_critical_days: s.alert_critical_days,
    low_stock_default: s.low_stock_default,
    in_app_alerts: s.in_app_alerts,
    browser_notifications: s.browser_notifications,
    email_digest: s.email_digest,
  };
}

export function clearDemoData() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
