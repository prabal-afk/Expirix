import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { todayISO } from "@/lib/dates";
import { buildDigest, digestHtml, digestSubject, digestSummaryLine, digestText } from "@/lib/digest";
import { buildViews } from "@/lib/expiry";
import { APP_URL, brevoConfigured, pushConfigured, sendBrevoEmail, sendPush, type PushSub } from "@/lib/server/notify";
import { loadShop } from "@/lib/server/shop";

// "Send me a test" buttons in Settings. Always sends to the signed-in user's own login email / own devices only.
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.STORAGE_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.STORAGE_SUPABASE_ANON_KEY || process.env.STORAGE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return fail("Server is not connected to the database.", 503);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("Please sign in again.", 401);
  let channel: string;
  try {
    channel = String(((await req.json()) as { channel?: string }).channel ?? "");
  } catch {
    return fail("Bad request.", 400);
  }
  if (channel !== "email" && channel !== "push") return fail("Unknown channel.", 400);

  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return fail("Please sign in again.", 401);

  try {
    const { data: profile, error: pe } = await sb.from("profiles").select("shop_id").maybeSingle();
    if (pe || !profile) return fail("No shop found for this account.", 404);
    const snap = await loadShop(sb, profile.shop_id);
    const today = todayISO(snap.settings.timezone);
    const digest = buildDigest(buildViews({ products: snap.products, batches: snap.batches }, snap.settings, today), snap.settings, today);

    if (channel === "email") {
      if (!brevoConfigured()) return fail("Email sending is not set up on the server yet.", 503);
      if (!u.user.email) return fail("This account has no email address.", 400);
      await sendBrevoEmail({
        to: u.user.email,
        subject: `Test: ${digestSubject(digest)}`,
        html: digestHtml(digest, { appUrl: APP_URL }),
        text: digestText(digest, { appUrl: APP_URL }),
      });
      return NextResponse.json({ ok: true, sentTo: u.user.email });
    }

    if (!pushConfigured()) return fail("Push alerts are not set up on the server yet.", 503);
    const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs?.length) return fail("No device has push turned on yet. Turn it on first.", 400);
    const r = await sendPush(subs as PushSub[], {
      title: `Expirix: ${digest.shopName}`,
      body: digest.total ? digestSummaryLine(digest) : "Test notification. Nothing is expiring right now.",
      url: "/alerts",
    });
    if (r.gone.length) await sb.from("push_subscriptions").delete().in("id", r.gone);
    if (!r.sent) return fail("The device did not accept the notification. Turn push off and on again.", 502);
    return NextResponse.json({ ok: true, sent: r.sent });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.", 500);
  }
}
