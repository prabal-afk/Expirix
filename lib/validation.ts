import { z } from "zod";
import { isValidISO } from "./dates";

export interface BatchFormValues {
  name: string;
  brand: string;
  category: string;
  barcode: string;
  batch_no: string;
  quantity: string;
  unit: string;
  purchase_price: string;
  selling_price: string;
  purchase_date: string;
  mfg_date: string;
  expiry_date: string;
  min_stock: string;
  supplier: string;
  notes: string;
}

function parseNum(label: string, opts: { min?: number; positive?: boolean }, s: string, ctx: z.RefinementCtx): number {
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `${label} must be a number` });
    return z.NEVER;
  }
  if (opts.positive && n <= 0) {
    ctx.addIssue({ code: "custom", message: `${label} must be greater than 0` });
    return z.NEVER;
  }
  if ((opts.min ?? 0) > n) {
    ctx.addIssue({ code: "custom", message: `${label} cannot be negative` });
    return z.NEVER;
  }
  if (n > 10_000_000) {
    ctx.addIssue({ code: "custom", message: `${label} is too large` });
    return z.NEVER;
  }
  return n;
}

const num = (label: string, opts: { min?: number; positive?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((s, ctx): number => {
      if (s === "") {
        ctx.addIssue({ code: "custom", message: `${label} is required` });
        return z.NEVER;
      }
      return parseNum(label, opts, s, ctx);
    });

const numOpt = (label: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx): number | null => (s === "" ? null : parseNum(label, {}, s, ctx)));

function parseDate(label: string, s: string, ctx: z.RefinementCtx): string {
  if (!isValidISO(s) || s < "2000-01-01" || s > "2100-12-31") {
    ctx.addIssue({ code: "custom", message: `${label} is not a valid date` });
    return z.NEVER;
  }
  return s;
}

const date = (label: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx): string => {
      if (s === "") {
        ctx.addIssue({ code: "custom", message: `${label} is required` });
        return z.NEVER;
      }
      return parseDate(label, s, ctx);
    });

const dateOpt = (label: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx): string | null => (s === "" ? null : parseDate(label, s, ctx)));

export function makeBatchSchema(mode: "add" | "edit") {
  return z
    .object({
      name: z.string().trim().min(1, "Product name is required").max(120, "Name is too long"),
      brand: z.string().trim().min(1, "Brand is required").max(80, "Brand is too long"),
      category: z.string().trim().min(1, "Choose a category"),
      barcode: z
        .string()
        .trim()
        .max(32, "Barcode is too long")
        .regex(/^[0-9A-Za-z-]*$/, "Barcode can only contain letters, numbers and dashes")
        .transform((s) => (s === "" ? null : s)),
      batch_no: z
        .string()
        .trim()
        .max(40, "Batch number is too long")
        .transform((s) => (s === "" ? null : s)),
      quantity: mode === "add" ? num("Quantity", { positive: true }) : num("Quantity", { min: 0 }),
      unit: z.string().trim().min(1, "Choose a unit"),
      purchase_price: num("Purchase price"),
      selling_price: num("Selling price"),
      purchase_date: date("Purchase date"),
      mfg_date: dateOpt("Manufacturing date"),
      expiry_date: date("Expiry date"),
      min_stock: numOpt("Minimum stock"),
      supplier: z
        .string()
        .trim()
        .max(120)
        .transform((s) => (s === "" ? null : s)),
      notes: z
        .string()
        .trim()
        .max(500, "Notes can be at most 500 characters")
        .transform((s) => (s === "" ? null : s)),
    })
    .superRefine((v, ctx) => {
      if (v.mfg_date && v.expiry_date && v.mfg_date > v.expiry_date)
        ctx.addIssue({ code: "custom", path: ["expiry_date"], message: "Expiry date cannot be before the manufacturing date" });
      if (v.mfg_date && v.purchase_date && v.mfg_date > v.purchase_date)
        ctx.addIssue({ code: "custom", path: ["mfg_date"], message: "Manufacturing date cannot be after the purchase date" });
    });
}

export type ParsedBatchForm = z.output<ReturnType<typeof makeBatchSchema>>;

export function validateBatchForm(
  values: BatchFormValues,
  mode: "add" | "edit",
): { ok: true; value: ParsedBatchForm } | { ok: false; errors: Record<string, string> } {
  const r = makeBatchSchema(mode).safeParse(values);
  if (r.success) return { ok: true, value: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export const settingsSchema = z
  .object({
    shop_name: z.string().trim().min(1, "Shop name is required").max(80),
    owner_name: z.string().trim().min(1, "Owner name is required").max(80),
    phone: z.string().trim().max(30),
    email: z.string().trim().max(120).refine((s) => s === "" || /^\S+@\S+\.\S+$/.test(s), "Enter a valid email"),
    address: z.string().trim().max(200),
    expiry_threshold_days: z.number().int().min(1, "Must be at least 1 day").max(60, "Must be 60 days or less"),
    alert_upcoming_days: z.number().int().min(1).max(365),
    alert_warning_days: z.number().int().min(1).max(365),
    alert_high_days: z.number().int().min(1).max(365),
    alert_critical_days: z.number().int().min(1).max(365),
    low_stock_default: z.number().min(0, "Cannot be negative").max(100000),
  })
  .refine(
    (s) =>
      s.alert_upcoming_days > s.alert_warning_days &&
      s.alert_warning_days > s.alert_high_days &&
      s.alert_high_days > s.alert_critical_days,
    { path: ["alert_upcoming_days"], message: "Alert days must go down: Upcoming > Warning > High > Critical" },
  );
