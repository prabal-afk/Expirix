export type ISODate = string; // "YYYY-MM-DD" (date only, no time zone surprises)

export const CATEGORIES = [
  "Packaged Foods",
  "Biscuits & Snacks",
  "Beverages",
  "Dairy",
  "Personal Care",
  "Household",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNITS = ["pieces", "packs", "bottles", "kg", "litres", "boxes", "sachets"] as const;

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  brand: string;
  category: string;
  barcode: string | null;
  unit: string;
  min_stock: number | null; // null = use shop default
  supplier: string | null;
  notes: string | null;
  created_at: string; // ISO timestamp
}

export interface Batch {
  id: string;
  shop_id: string;
  product_id: string;
  batch_no: string | null;
  quantity: number; // current quantity on hand
  initial_quantity: number;
  purchase_price: number; // per unit
  selling_price: number; // per unit
  purchase_date: ISODate;
  mfg_date: ISODate | null;
  expiry_date: ISODate;
  created_at: string;
}

export const MOVEMENT_TYPES = ["received", "sold", "damaged", "expired_removed", "returned", "adjustment"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  received: "Stock received",
  sold: "Stock sold",
  damaged: "Damaged stock",
  expired_removed: "Expired stock removed",
  returned: "Returned to supplier",
  adjustment: "Manual adjustment",
};

export interface Movement {
  id: string;
  shop_id: string;
  product_id: string | null; // null once the product has been deleted (history is kept)
  batch_id: string | null;
  product_name: string; // snapshot so history survives deletion
  batch_no: string | null;
  unit: string;
  type: MovementType;
  qty_change: number; // signed
  qty_after: number;
  unit_cost: number; // purchase price per unit at the time (used for waste value)
  unit_price: number; // selling price per unit at the time
  notes: string | null;
  created_at: string;
}

export const ALERT_LEVELS = ["upcoming", "warning", "high", "critical", "today", "expired"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export interface AppNotification {
  id: string;
  shop_id: string;
  batch_id: string;
  product_id: string;
  level: AlertLevel;
  title: string;
  product_name: string;
  batch_no: string | null;
  quantity: number; // quantity when the alert was generated
  expiry_date: ISODate;
  created_at: string;
  read: boolean;
  dismissed: boolean;
  resolved: boolean; // true when the batch has moved to another level or has no stock left
}

export interface Settings {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  expiry_threshold_days: number; // "Expiring Soon" window (default 7)
  alert_upcoming_days: number; // 30
  alert_warning_days: number; // 7
  alert_high_days: number; // 3
  alert_critical_days: number; // 1
  low_stock_default: number; // used when a product has no own minimum
  currency: string; // INR
  date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timezone: string; // Asia/Kolkata
  in_app_alerts: boolean;
  browser_notifications: boolean;
}

export interface AppData {
  products: Product[];
  batches: Batch[];
  movements: Movement[];
  notifications: AppNotification[];
  settings: Settings;
}

export type ExpiryStatus = "expired" | "today" | "soon" | "safe";
