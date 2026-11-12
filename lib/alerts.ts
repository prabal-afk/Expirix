import { daysLeft } from "./expiry";
import type { AlertLevel, AppNotification, Batch, ISODate, Product, Settings } from "./types";

export const LEVEL_LABEL: Record<AlertLevel, string> = {
  upcoming: "Upcoming",
  warning: "Warning",
  high: "High priority",
  critical: "Critical",
  today: "Expires today",
  expired: "Expired",
};

/** Order of seriousness (higher = more serious). */
export const LEVEL_RANK: Record<AlertLevel, number> = {
  upcoming: 1,
  warning: 2,
  high: 3,
  critical: 4,
  today: 5,
  expired: 6,
};

type Cfg = Pick<Settings, "alert_upcoming_days" | "alert_warning_days" | "alert_high_days" | "alert_critical_days">;

/**
 * The single alert level a batch is at right now (or null if it is further away than the
 * earliest threshold). Only the most serious applicable level is used, so a batch that is
 * 2 days from expiry produces one "High priority" alert, not three.
 */
export function levelFor(days: number, cfg: Cfg): AlertLevel | null {
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= cfg.alert_critical_days) return "critical";
  if (days <= cfg.alert_high_days) return "high";
  if (days <= cfg.alert_warning_days) return "warning";
  if (days <= cfg.alert_upcoming_days) return "upcoming";
  return null;
}

export interface AlertPlan {
  create: AppNotification[];
  patch: { id: string; resolved: boolean }[];
}

/**
 * Pure planner used by both the browser and the daily server cron job.
 *  - creates at most ONE notification per (batch, level)  -> no duplicates
 *  - marks a notification "resolved" once the batch is at a different level or has no stock
 *  - never changes batch data; dismissing/reading an alert has no effect on expiry status
 */
export function planAlertSync(
  input: { products: Product[]; batches: Batch[]; notifications: AppNotification[]; settings: Settings },
  today: ISODate,
  nowTs: string,
  makeId: () => string,
): AlertPlan {
  const { products, batches, notifications, settings } = input;
  const productById = new Map(products.map((p) => [p.id, p]));
  const byBatch = new Map<string, AppNotification[]>();
  for (const n of notifications) {
    const arr = byBatch.get(n.batch_id) ?? [];
    arr.push(n);
    byBatch.set(n.batch_id, arr);
  }
  const plan: AlertPlan = { create: [], patch: [] };
  for (const batch of batches) {
    const product = productById.get(batch.product_id);
    if (!product) continue;
    const level = batch.quantity > 0 ? levelFor(daysLeft(batch.expiry_date, today), settings) : null;
    const existing = byBatch.get(batch.id) ?? [];
    for (const n of existing) {
      const shouldBeResolved = n.level !== level;
      if (n.resolved !== shouldBeResolved) plan.patch.push({ id: n.id, resolved: shouldBeResolved });
    }
    if (level && !existing.some((n) => n.level === level)) {
      plan.create.push({
        id: makeId(),
        shop_id: batch.shop_id,
        batch_id: batch.id,
        product_id: product.id,
        level,
        title: `${LEVEL_LABEL[level]}: ${product.name}`,
        product_name: product.name,
        batch_no: batch.batch_no,
        quantity: batch.quantity,
        expiry_date: batch.expiry_date,
        created_at: nowTs,
        read: false,
        dismissed: false,
        resolved: false,
      });
    }
  }
  return plan;
}

export const isActiveAlert = (n: AppNotification) => !n.resolved && !n.dismissed;
