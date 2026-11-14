import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { planAlertSync } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import { buildDigest, digestHtml, digestSubject, digestSummaryLine, digestText } from "@/lib/digest";
import { buildViews } from "@/lib/expiry";
import { APP_URL, brevoConfigured, pushConfigured, sendBrevoEmail, sendPush, type PushSub } from "@/lib/server/notify";
import { loadShop } from "@/lib/server/shop";

// Runs once a day (see vercel.json). Creates the day's expiry alerts for every shop, even if nobody opened the app.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.STORAGE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
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
  let emails = 0;
  let pushes = 0;
  const failures: { shop: string; error: string }[] = [];
  const canEmail = brevoConfigured();
  const canPush = pushConfigured();
  for (const shop of shops ?? []) {
    try {
      const snap = await loadShop(sb, shop.id);
      const { settings, products, batches, notifications } = snap;
      const today = todayISO(settings.timezone);
      const plan = planAlertSync({ products, batches, notifications, settings }, today, new Date().toISOString(), () => crypto.randomUUID());
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

      // Daily summary by email and push, at most once per shop per day.
      if ((canEmail || canPush) && snap.lastDigestOn !== today) {
        const digest = buildDigest(buildViews({ products, batches }, settings, today), settings, today);
        if (digest.total > 0) {
          let delivered = false;
          if (canEmail && settings.email_digest) {
            const { data: profile } = await sb.from("profiles").select("id").eq("shop_id", shop.id).limit(1).maybeSingle();
            const { data: user } = profile ? await sb.auth.admin.getUserById(profile.id) : { data: null };
            const to = user?.user?.email;
            if (to) {
              try {
                await sendBrevoEmail({
                  to,
                  subject: digestSubject(digest),
                  html: digestHtml(digest, { appUrl: APP_URL }),
                  text: digestText(digest, { appUrl: APP_URL }),
                });
                emails++;
                delivered = true;
              } catch (e) {
                failures.push({ shop: shop.id, error: `email: ${e instanceof Error ? e.message : String(e)}` });
              }
            }
          }
          if (canPush) {
            const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("shop_id", shop.id);
            if (subs?.length) {
              const r = await sendPush(subs as PushSub[], { title: `Expirix: ${digest.shopName}`, body: digestSummaryLine(digest), url: "/alerts" });
              pushes += r.sent;
              if (r.sent) delivered = true;
              if (r.gone.length) await sb.from("push_subscriptions").delete().in("id", r.gone);
            }
          }
          if (delivered) await sb.from("user_preferences").update({ last_digest_on: today }).eq("shop_id", shop.id);
        }
      }
    } catch (e) {
      failures.push({ shop: shop.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: failures.length === 0, shops: shops?.length ?? 0, alertsCreated: created, alertsUpdated: patched, emailsSent: emails, pushesSent: pushes, failures });
}
