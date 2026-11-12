import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { planAlertSync } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import type { AppNotification, Batch, Product, Settings } from "@/lib/types";

// Runs once a day (see vercel.json). Creates the day's expiry alerts for every shop, even if nobody opened the app.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchAll<T>(sb: SupabaseClient, table: string, shopId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").eq("shop_id", shopId).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !key) {
    return NextResponse.json({ ok: false, error: "Server is not configured (CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: shops, error } = await sb.from("shops").select("id, name, owner_name, phone, email, address");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let created = 0;
  let patched = 0;
  const failures: { shop: string; error: string }[] = [];
  for (const shop of shops ?? []) {
    try {
      const { data: prefs, error: pe } = await sb.from("user_preferences").select("*").eq("shop_id", shop.id).single();
      if (pe || !prefs) throw new Error(pe?.message ?? "no preferences");
      const settings = { ...prefs, shop_id: shop.id, shop_name: shop.name, owner_name: shop.owner_name, phone: shop.phone, email: shop.email, address: shop.address } as unknown as Settings;
      const [products, batches, notifications] = await Promise.all([
        fetchAll<Product>(sb, "products", shop.id),
        fetchAll<Batch>(sb, "batches", shop.id),
        fetchAll<AppNotification>(sb, "notifications", shop.id),
      ]);
      const plan = planAlertSync(
        { products, batches: batches.map((b) => ({ ...b, quantity: Number(b.quantity) })), notifications, settings },
        todayISO(settings.timezone),
        new Date().toISOString(),
        () => crypto.randomUUID(),
      );
      if (plan.create.length) {
        const { error: ie } = await sb.from("notifications").upsert(plan.create, { onConflict: "batch_id,level", ignoreDuplicates: true });
        if (ie) throw new Error(ie.message);
      }
      for (const resolved of [true, false]) {
        const ids = plan.patch.filter((p) => p.resolved === resolved).map((p) => p.id);
        if (ids.length) {
          const { error: ue } = await sb.from("notifications").update({ resolved }).in("id", ids);
          if (ue) throw new Error(ue.message);
        }
      }
      created += plan.create.length;
      patched += plan.patch.length;
    } catch (e) {
      failures.push({ shop: shop.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: failures.length === 0, shops: shops?.length ?? 0, alertsCreated: created, alertsUpdated: patched, failures });
}
