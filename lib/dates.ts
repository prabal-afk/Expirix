import type { ISODate, Settings } from "./types";

/** Today's calendar date in the given IANA time zone, as YYYY-MM-DD. */
export function todayISO(timezone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(iso: ISODate): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export function isValidISO(iso: string | null | undefined): iso is ISODate {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days from `from` to `to` (positive when `to` is later). Pure calendar math, DST-proof. */
export function daysBetween(from: ISODate, to: ISODate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const [y, m, d] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return dt.toISOString().slice(0, 10);
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function formatDate(iso: ISODate | null | undefined, fmt: Settings["date_format"] = "DD/MM/YYYY"): string {
  if (!iso || !isValidISO(iso.slice(0, 10))) return "—";
  const [y, m, d] = parts(iso.slice(0, 10));
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  if (fmt === "MM/DD/YYYY") return `${mm}/${dd}/${y}`;
  if (fmt === "YYYY-MM-DD") return `${y}-${mm}-${dd}`;
  return `${dd}/${mm}/${y}`;
}

/** Date part (in the shop's time zone) of an ISO timestamp. */
export function dateOfTimestamp(ts: string, timezone = "Asia/Kolkata"): ISODate {
  return todayISO(timezone, new Date(ts));
}

export function formatDateTime(ts: string, fmt: Settings["date_format"], timezone = "Asia/Kolkata"): string {
  const d = new Date(ts);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatDate(dateOfTimestamp(ts, timezone), fmt)}, ${time}`;
}

export function daysLabel(daysLeft: number): string {
  if (daysLeft < -1) return `Expired ${Math.abs(daysLeft)} days ago`;
  if (daysLeft === -1) return "Expired yesterday";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  return `Expires in ${daysLeft} days`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}
