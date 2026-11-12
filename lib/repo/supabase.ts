import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertPlan } from "../alerts";
import type { MovementInput } from "../movements";
import { buildSeed } from "../seed";
import type { AppData, AppNotification, Batch, Movement, Product, Settings } from "../types";
import { RepoError, type Repo } from "./types";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new RepoError(res.error.message);
  return res.data as T;
}

async function fetchAll<T>(sb: SupabaseClient, table: string, order: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = check(
      await sb.from(table).select("*").order(order, { ascending: false }).order("id").range(from, from + size - 1),
    ) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));

function fixBatch(b: Batch): Batch {
  return { ...b, quantity: Number(b.quantity), initial_quantity: Number(b.initial_quantity), purchase_price: Number(b.purchase_price), selling_price: Number(b.selling_price) };
}
function fixMovement(m: Movement): Movement {
  return { ...m, qty_change: Number(m.qty_change), qty_after: Number(m.qty_after), unit_cost: Number(m.unit_cost), unit_price: Number(m.unit_price) };
}
function fixProduct(p: Product): Product {
  return { ...p, min_stock: num(p.min_stock) as number | null };
}
function fixNotification(n: AppNotification): AppNotification {
  return { ...n, quantity: Number(n.quantity) };
}

/** Real cloud database (Supabase Postgres). Every table is protected by Row Level Security. */
export function makeSupabaseRepo(sb: SupabaseClient): Repo {
  let shopId: string | null = null;

  async function getShopId(): Promise<string> {
    if (shopId) return shopId;
    const { data: u } = await sb.auth.getUser();
    if (!u.user) throw new RepoError("You are signed out. Please sign in again.");
    const prof = check(await sb.from("profiles").select("shop_id").eq("id", u.user.id).maybeSingle());
    if (!prof) throw new RepoError("Your account has no shop yet. Did you run supabase/schema.sql in the SQL editor?");
    shopId = (prof as { shop_id: string }).shop_id;
    return shopId;
  }

  return {
    mode: "supabase",

    async load(): Promise<AppData> {
      const sid = await getShopId();
      const [shop, prefs, products, batches, movements, notifications] = await Promise.all([
        sb.from("shops").select("*").eq("id", sid).single(),
        sb.from("user_preferences").select("*").eq("shop_id", sid).single(),
        fetchAll<Product>(sb, "products", "created_at"),
        fetchAll<Batch>(sb, "batches", "created_at"),
        fetchAll<Movement>(sb, "stock_movements", "created_at"),
        fetchAll<AppNotification>(sb, "notifications", "created_at"),
      ]);
      const s = check(shop) as Record<string, string>;
      const p = check(prefs) as Record<string, unknown>;
      const settings: Settings = {
        shop_id: sid,
        shop_name: s.name,
        owner_name: s.owner_name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        expiry_threshold_days: Number(p.expiry_threshold_days),
        alert_upcoming_days: Number(p.alert_upcoming_days),
        alert_warning_days: Number(p.alert_warning_days),
        alert_high_days: Number(p.alert_high_days),
        alert_critical_days: Number(p.alert_critical_days),
        low_stock_default: Number(p.low_stock_default),
        currency: String(p.currency),
        date_format: p.date_format as Settings["date_format"],
        timezone: String(p.timezone),
        in_app_alerts: Boolean(p.in_app_alerts),
        browser_notifications: Boolean(p.browser_notifications),
      };
      return {
        settings,
        products: products.map(fixProduct),
        batches: batches.map(fixBatch),
        movements: movements.map(fixMovement),
        notifications: notifications.map(fixNotification),
      };
    },

    async upsertProduct(p) {
      check(await sb.from("products").upsert({ ...p, shop_id: await getShopId() }));
    },

    async deleteProduct(id) {
      check(await sb.from("products").delete().eq("id", id));
    },

    async insertBatch(b, opening) {
      const sid = await getShopId();
      check(await sb.from("batches").insert({ ...b, shop_id: sid }));
      const res = await sb.from("stock_movements").insert({ ...opening, shop_id: sid });
      if (res.error) {
        await sb.from("batches").delete().eq("id", b.id); // keep batch + audit row in step
        throw new RepoError(res.error.message);
      }
    },

    async updateBatch(b) {
      check(
        await sb
          .from("batches")
          .update({
            batch_no: b.batch_no,
            purchase_price: b.purchase_price,
            selling_price: b.selling_price,
            purchase_date: b.purchase_date,
            mfg_date: b.mfg_date,
            expiry_date: b.expiry_date,
          })
          .eq("id", b.id),
      );
    },

    async deleteBatch(id) {
      check(await sb.from("batches").delete().eq("id", id));
    },

    async recordMovement(input: MovementInput) {
      const res = await sb.rpc("record_movement", {
        p_batch_id: input.batchId,
        p_type: input.type,
        p_quantity: input.quantity,
        p_notes: input.notes ?? null,
      });
      const out = check(res) as { batch: Batch; movement: Movement };
      return { batch: fixBatch(out.batch), movement: fixMovement(out.movement) };
    },

    async applyAlertPlan(plan: AlertPlan) {
      const sid = await getShopId();
      if (plan.create.length) {
        check(
          await sb
            .from("notifications")
            .upsert(plan.create.map((n) => ({ ...n, shop_id: sid })), { onConflict: "batch_id,level", ignoreDuplicates: true }),
        );
      }
      for (const resolved of [true, false]) {
        const ids = plan.patch.filter((p) => p.resolved === resolved).map((p) => p.id);
        if (ids.length) check(await sb.from("notifications").update({ resolved }).in("id", ids));
      }
    },

    async patchNotifications(ids, patch) {
      if (!ids.length) return;
      check(await sb.from("notifications").update(patch).in("id", ids));
    },

    async saveSettings(s: Settings) {
      const sid = await getShopId();
      check(
        await sb
          .from("shops")
          .update({ name: s.shop_name, owner_name: s.owner_name, phone: s.phone, email: s.email, address: s.address })
          .eq("id", sid),
      );
      check(
        await sb.from("user_preferences").upsert({
          shop_id: sid,
          expiry_threshold_days: s.expiry_threshold_days,
          alert_upcoming_days: s.alert_upcoming_days,
          alert_warning_days: s.alert_warning_days,
          alert_high_days: s.alert_high_days,
          alert_critical_days: s.alert_critical_days,
          low_stock_default: s.low_stock_default,
          currency: s.currency,
          date_format: s.date_format,
          timezone: s.timezone,
          in_app_alerts: s.in_app_alerts,
          browser_notifications: s.browser_notifications,
        }),
      );
    },

    async loadSample(today) {
      const sid = await getShopId();
      const seed = buildSeed(today, sid);
      const chunk = <T,>(rows: T[], n = 200) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, i * n + n));
      for (const c of chunk(seed.products)) check(await sb.from("products").insert(c));
      for (const c of chunk(seed.batches)) check(await sb.from("batches").insert(c));
      for (const c of chunk(seed.movements)) check(await sb.from("stock_movements").insert(c));
    },
  };
}
