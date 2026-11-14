import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification, Batch, Product, Settings } from "../types";

export async function fetchAll<T>(sb: SupabaseClient, table: string, shopId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").eq("shop_id", shopId).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface ShopSnapshot {
  settings: Settings;
  lastDigestOn: string | null;
  products: Product[];
  batches: Batch[];
  notifications: AppNotification[];
}

/** Reads one shop's settings and stock. Works with the service-role client (cron) or a signed-in user's client (RLS applies). */
export async function loadShop(sb: SupabaseClient, shopId: string): Promise<ShopSnapshot> {
  const [shopRes, prefsRes] = await Promise.all([
    sb.from("shops").select("id, name, owner_name, phone, email, address").eq("id", shopId).single(),
    sb.from("user_preferences").select("*").eq("shop_id", shopId).single(),
  ]);
  if (shopRes.error || !shopRes.data) throw new Error(shopRes.error?.message ?? "shop not found");
  if (prefsRes.error || !prefsRes.data) throw new Error(prefsRes.error?.message ?? "no preferences");
  const shop = shopRes.data;
  const prefs = prefsRes.data as Record<string, unknown>;
  const settings = {
    ...prefs,
    shop_id: shop.id,
    shop_name: shop.name,
    owner_name: shop.owner_name,
    phone: shop.phone,
    email: shop.email,
    address: shop.address,
    email_digest: prefs.email_digest !== false,
  } as unknown as Settings;
  const [products, batches, notifications] = await Promise.all([
    fetchAll<Product>(sb, "products", shopId),
    fetchAll<Batch>(sb, "batches", shopId),
    fetchAll<AppNotification>(sb, "notifications", shopId),
  ]);
  return {
    settings,
    lastDigestOn: (prefs.last_digest_on as string | null) ?? null,
    products,
    batches: batches.map((b) => ({ ...b, quantity: Number(b.quantity) })),
    notifications,
  };
}
