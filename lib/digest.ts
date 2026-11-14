import { daysLabel, formatDate } from "./dates";
import type { BatchView } from "./expiry";
import { formatMoney, formatNumber } from "./format";
import type { ISODate, Settings } from "./types";

/**
 * The "what needs attention today" summary. Pure functions, so the same wording is used by
 * the daily email, the push notification, the WhatsApp share button and the tests.
 * To change what the email says, edit this file (the wording lives in digestText and digestHtml).
 */

export interface DigestItem {
  name: string;
  batchNo: string;
  qty: string; // e.g. "8 packs"
  expiry: string; // formatted date
  days: number;
  label: string; // "Expired 2 days ago"
  value: number; // purchase value of stock on hand
}

export interface Digest {
  shopName: string;
  today: ISODate;
  dateText: string;
  currency: string;
  expired: DigestItem[];
  urgent: DigestItem[]; // today, or within the "critical" window
  soon: DigestItem[]; // up to the "Expiring Soon" window
  total: number;
  atRisk: number; // purchase value of expired + urgent + soon stock
}

export function buildDigest(views: BatchView[], settings: Settings, today: ISODate): Digest {
  const item = (v: BatchView): DigestItem => ({
    name: v.product.brand ? `${v.product.brand} ${v.product.name}` : v.product.name,
    batchNo: v.batch.batch_no || "none",
    qty: `${formatNumber(v.batch.quantity)} ${v.product.unit}`,
    expiry: formatDate(v.batch.expiry_date, settings.date_format),
    days: v.days,
    label: daysLabel(v.days),
    value: v.value,
  });
  const withStock = views.filter((v) => !v.empty).sort((a, b) => a.days - b.days);
  const critical = Math.max(1, settings.alert_critical_days);
  const expired = withStock.filter((v) => v.days < 0).map(item);
  const urgent = withStock.filter((v) => v.days >= 0 && v.days <= critical).map(item);
  const soon = withStock.filter((v) => v.days > critical && v.days <= settings.expiry_threshold_days).map(item);
  const all = [...expired, ...urgent, ...soon];
  return {
    shopName: settings.shop_name || "Your shop",
    today,
    dateText: formatDate(today, settings.date_format),
    currency: settings.currency,
    expired,
    urgent,
    soon,
    total: all.length,
    atRisk: all.reduce((s, i) => s + i.value, 0),
  };
}

export function digestSubject(d: Digest): string {
  const parts: string[] = [];
  if (d.expired.length) parts.push(`${d.expired.length} expired`);
  const near = d.urgent.length + d.soon.length;
  if (near) parts.push(`${near} expiring soon`);
  return `Expirix: ${parts.join(", ") || "nothing expiring"} · ${d.shopName}`;
}

/** Short line for push notifications. */
export function digestSummaryLine(d: Digest): string {
  const bits: string[] = [];
  if (d.expired.length) bits.push(`${d.expired.length} expired`);
  if (d.urgent.length) bits.push(`${d.urgent.length} expiring today or tomorrow`);
  if (d.soon.length) bits.push(`${d.soon.length} expiring this week`);
  return bits.join(" · ");
}

const MAX_ROWS = 12;

const SECTIONS = [
  { key: "expired", title: "Expired. Take off the shelf", color: "#b42318", bg: "#fef3f2" },
  { key: "urgent", title: "Expiring today or tomorrow", color: "#b54708", bg: "#fffaeb" },
  { key: "soon", title: "Expiring soon", color: "#a15c07", bg: "#fefdf0" },
] as const;

/** Plain-text version. `whatsapp` uses *bold* markers instead of plain headings. */
export function digestText(d: Digest, opts: { appUrl?: string; whatsapp?: boolean } = {}): string {
  const b = (s: string) => (opts.whatsapp ? `*${s}*` : s.toUpperCase());
  const lines: string[] = [`${opts.whatsapp ? "*Expirix*" : "Expirix daily summary"} - ${d.shopName} (${d.dateText})`, ""];
  if (d.total === 0) lines.push("Nothing is expired or about to expire. Good work.");
  for (const s of SECTIONS) {
    const items = d[s.key];
    if (!items.length) continue;
    lines.push(b(`${s.title} (${items.length})`));
    for (const i of items.slice(0, MAX_ROWS)) lines.push(`- ${i.name}, ${i.qty} - ${i.label.toLowerCase()} (${i.expiry})`);
    if (items.length > MAX_ROWS) lines.push(`- and ${items.length - MAX_ROWS} more`);
    lines.push("");
  }
  if (d.atRisk > 0) lines.push(`Stock value at risk: ${formatMoney(d.atRisk, d.currency)}`, "");
  if (opts.appUrl) lines.push(`Open Expirix: ${opts.appUrl}`);
  return lines.join("\n").trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML email. Inline styles and simple tables only, so it renders in Gmail and on phones. */
export function digestHtml(d: Digest, opts: { appUrl?: string } = {}): string {
  const blocks = SECTIONS.map((s) => {
    const items = d[s.key];
    if (!items.length) return "";
    const rows = items
      .slice(0, MAX_ROWS)
      .map(
        (i) => `<tr><td style="padding:10px 12px;border-top:1px solid #e5e7eb;font-size:15px;color:#111827">
<strong>${esc(i.name)}</strong><br><span style="font-size:13px;color:#6b7280">${esc(i.qty)} · batch ${esc(i.batchNo)}</span></td>
<td align="right" style="padding:10px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:${s.color};white-space:nowrap"><strong>${esc(i.label)}</strong><br><span style="color:#6b7280">${esc(i.expiry)}</span></td></tr>`,
      )
      .join("");
    const more = items.length > MAX_ROWS ? `<tr><td colspan="2" style="padding:10px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">and ${items.length - MAX_ROWS} more in the app</td></tr>` : "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td colspan="2" style="background:${s.bg};padding:10px 12px;font-size:14px;color:${s.color}"><strong>${esc(s.title)}</strong> · ${items.length}</td></tr>${rows}${more}</table>`;
  }).join("");
  const empty = d.total === 0 ? `<p style="margin:0 0 20px;font-size:15px;color:#166534">Nothing is expired or about to expire today. Good work.</p>` : "";
  const risk = d.atRisk > 0 ? `<p style="margin:0 0 20px;font-size:14px;color:#374151">Stock value at risk: <strong>${esc(formatMoney(d.atRisk, d.currency))}</strong></p>` : "";
  const button = opts.appUrl
    ? `<p style="margin:0 0 8px"><a href="${esc(opts.appUrl)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Open Expirix</a></p>`
    : "";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f3f6f2;font-family:Inter,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #d9e2db"><tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#15803d"><strong>Expirix</strong> · ${esc(d.dateText)}</p>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#10231a">${esc(d.shopName)}</h1>
${empty}${blocks}${risk}${button}
<p style="margin:20px 0 0;font-size:12px;color:#6b7280">You get this because the daily summary is on. Turn it off in Expirix under Settings, Alerts.</p>
</td></tr></table></td></tr></table></body></html>`;
}
