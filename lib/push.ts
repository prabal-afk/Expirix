"use client";

import { getSupabase } from "./supabase/client";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushResult = { ok: true } | { ok: false; error: string };

export const pushKeyPresent = () => Boolean(VAPID_PUBLIC);

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return Boolean(reg && (await reg.pushManager.getSubscription()) && Notification.permission === "granted");
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, error: "This browser cannot receive push alerts. On iPhone, add Expirix to the Home Screen first." };
  if (!VAPID_PUBLIC) return { ok: false, error: "Push alerts are not set up on the server yet." };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Push alerts need a signed-in cloud account." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Permission was not granted. Allow notifications for this site in your browser settings." };
  const reg = await registerWorker();
  if (!reg) return { ok: false, error: "Could not start the background service. Reload the page and try again." };
  await navigator.serviceWorker.ready;
  try {
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
    const j = sub.toJSON();
    if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return { ok: false, error: "The browser returned an incomplete subscription." };
    const { data: profile, error: pe } = await sb.from("profiles").select("shop_id").single();
    if (pe || !profile) return { ok: false, error: "Could not find your shop. Sign in again." };
    const { error } = await sb
      .from("push_subscriptions")
      .upsert({ shop_id: profile.shop_id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "shop_id,endpoint" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not turn on push alerts." };
  }
}

export async function disablePush(): Promise<PushResult> {
  const sb = getSupabase();
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not turn off push alerts." };
  }
}

export async function sendTest(channel: "email" | "push"): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const sb = getSupabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Please sign in again." };
  try {
    const res = await fetch("/api/notify/test", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ channel }) });
    const j = (await res.json()) as { ok: boolean; error?: string; sentTo?: string; sent?: number };
    if (!j.ok) return { ok: false, error: j.error ?? "The test did not go through." };
    return { ok: true, detail: j.sentTo ? `Sent to ${j.sentTo}. Check your inbox and spam folder.` : "Sent. It should appear on this device in a moment." };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}
