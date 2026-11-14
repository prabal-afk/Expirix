import { sendNotification, setVapidDetails } from "web-push";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://expirix.vercel.app";

/* ------------------------------- email (Brevo) ------------------------------- */

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendBrevoEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Expirix", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 200)}`);
  }
}

/* ------------------------------ web push ------------------------------ */

export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && process.env.VAPID_PRIVATE_KEY);
}

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one notification to each subscription. Returns the ids of subscriptions the browser says are gone. */
export async function sendPush(subs: PushSub[], payload: { title: string; body: string; url?: string }): Promise<{ sent: number; gone: string[] }> {
  setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.BREVO_SENDER_EMAIL || "admin@example.com"}`,
    VAPID_PUBLIC,
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs) {
    try {
      await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, url: payload.url ?? "/alerts" }), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
    }
  }
  return { sent, gone };
}
