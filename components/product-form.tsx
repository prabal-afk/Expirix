"use client";

import { t } from "@/lib/i18n-core";
import { AlertTriangle, Check, Info, Link2, ScanBarcode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { addDays, daysBetween, daysLabel, isValidISO } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { CATEGORIES, UNITS, type Product } from "@/lib/types";
import { validateBatchForm, type BatchFormValues } from "@/lib/validation";
import { useUI } from "./ui-context";
import { Button, Card, Field, Input, Select, Textarea, cx } from "./ui";

const blank = (today: string): BatchFormValues => ({
  name: "",
  brand: "",
  category: "",
  barcode: "",
  batch_no: "",
  quantity: "",
  unit: "packs",
  purchase_price: "",
  selling_price: "",
  purchase_date: today,
  mfg_date: "",
  expiry_date: "",
  min_stock: "",
  supplier: "",
  notes: "",
});

function fromProduct(p: Product, base: BatchFormValues): BatchFormValues {
  return {
    ...base,
    name: p.name,
    brand: p.brand,
    category: p.category,
    barcode: p.barcode ?? "",
    unit: p.unit,
    min_stock: p.min_stock === null ? "" : String(p.min_stock),
    supplier: p.supplier ?? "",
    notes: p.notes ?? "",
  };
}

export function ProductForm({ mode, batchId, productId, barcode }: { mode: "add" | "edit"; batchId?: string; productId?: string; barcode?: string }) {
  const { data, today, settings, addBatch, updateBatch, toast } = useApp();
  const { openScanner } = useUI();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const editBatch = mode === "edit" ? data.batches.find((b) => b.id === batchId) : undefined;
  const editProduct = editBatch ? data.products.find((p) => p.id === editBatch.product_id) : undefined;
  const presetProduct = mode === "add" && productId ? data.products.find((p) => p.id === productId) : undefined;

  const [linkedId, setLinkedId] = useState<string | null>(presetProduct?.id ?? null);
  const linked = linkedId ? data.products.find((p) => p.id === linkedId) : undefined;

  const [v, setV] = useState<BatchFormValues>(() => {
    const base = blank(today);
    if (editBatch && editProduct) {
      return {
        ...fromProduct(editProduct, base),
        batch_no: editBatch.batch_no ?? "",
        quantity: String(editBatch.quantity),
        purchase_price: String(editBatch.purchase_price),
        selling_price: String(editBatch.selling_price),
        purchase_date: editBatch.purchase_date,
        mfg_date: editBatch.mfg_date ?? "",
        expiry_date: editBatch.expiry_date,
      };
    }
    if (presetProduct) {
      const last = data.batches.filter((b) => b.product_id === presetProduct.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { ...fromProduct(presetProduct, base), purchase_price: last ? String(last.purchase_price) : "", selling_price: last ? String(last.selling_price) : "" };
    }
    return { ...base, barcode: barcode ?? "" };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "another">("");

  const set = (k: keyof BatchFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

  const productLocked = Boolean(linked);

  // existing products that look like what is being typed
  const suggestions = useMemo(() => {
    if (mode !== "add" || linked) return [];
    const name = v.name.trim().toLowerCase();
    const code = v.barcode.trim();
    return data.products
      .filter((p) => (code && p.barcode === code) || (name.length >= 2 && (p.name.toLowerCase().includes(name) || `${p.brand} ${p.name}`.toLowerCase().includes(name))))
      .slice(0, 4);
  }, [mode, linked, v.name, v.barcode, data.products]);

  function link(p: Product) {
    setLinkedId(p.id);
    const last = data.batches.filter((b) => b.product_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    setV((s) => ({
      ...fromProduct(p, s),
      purchase_price: s.purchase_price || (last ? String(last.purchase_price) : ""),
      selling_price: s.selling_price || (last ? String(last.selling_price) : ""),
    }));
    setErrors({});
  }

  // live expiry feedback
  const expiryInfo = useMemo(() => {
    if (!isValidISO(v.expiry_date)) return null;
    const days = daysBetween(today, v.expiry_date);
    if (days < 0) return { tone: "red", text: `This date has already passed (${daysLabel(days).toLowerCase()}). The batch will be saved as expired and must not be sold.` };
    if (days === 0) return { tone: "red", text: "Expires today. Sell it first or remove it at closing." };
    if (days <= settings.expiry_threshold_days) return { tone: "amber", text: `${daysLabel(days)}. This batch will show as “Expiring Soon”.` };
    return { tone: "green", text: `${daysLabel(days)}. Good shelf life.` };
  }, [v.expiry_date, today, settings.expiry_threshold_days]);

  const pp = Number(v.purchase_price);
  const sp = Number(v.selling_price);
  const lowMargin = v.purchase_price !== "" && v.selling_price !== "" && Number.isFinite(pp) && Number.isFinite(sp) && sp < pp;

  async function submit(again: boolean) {
    setFormError("");
    const res = validateBatchForm(v, mode);
    if (!res.ok) {
      setErrors(res.errors);
      setFormError("Please fix the highlighted fields.");
      const first = Object.keys(res.errors)[0];
      const idMap: Record<string, string> = { name: "name", brand: "brand" };
      requestAnimationFrame(() => (formRef.current?.querySelector(`#${idMap[first] ?? first}`) as HTMLElement | null)?.focus());
      return;
    }
    setErrors({});
    setBusy(again ? "another" : "save");
    if (mode === "edit" && batchId) {
      const r = await updateBatch(batchId, res.value);
      setBusy("");
      if (!r.ok) return setFormError(r.error);
      toast("Changes saved.");
      router.push(`/inventory/${r.productId}`);
      return;
    }
    const r = await addBatch(res.value, { productId: linkedId ?? undefined });
    setBusy("");
    if (!r.ok) return setFormError(r.error);
    toast(r.merged ? `Saved as a new batch of the existing product “${res.value.name}”.` : `“${res.value.name}” added to your inventory.`);
    if (again) {
      const saved = data.products.find((p) => p.id === r.productId);
      setLinkedId(r.productId);
      setV((s) => ({ ...s, ...(saved ? fromProduct(saved, s) : {}), batch_no: "", quantity: "", mfg_date: "", expiry_date: "" }));
      requestAnimationFrame(() => (formRef.current?.querySelector("#batch_no") as HTMLElement | null)?.focus());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else router.push(`/inventory/${r.productId}`);
  }

  if (mode === "edit" && (!editBatch || !editProduct))
    return (
      <Card className="p-8 text-center">
        <p className="font-semibold">That batch could not be found.</p>
        <p className="mt-1 text-sm text-slate-600">It may have been deleted.</p>
        <Button className="mt-4" onClick={() => router.push("/inventory")}>
          {t("Back to inventory")}
        </Button>
      </Card>
    );

  const chip = (label: string, days: number) => (
    <button key={label} type="button" onClick={() => setV((s) => ({ ...s, expiry_date: addDays(today, days) }))} className="min-h-9 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
      {label}
    </button>
  );

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      className="space-y-5"
    >
      {linked && mode === "add" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-medium text-brand-900">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
            Adding a new batch to the existing product <strong>{linked.name}</strong>. Product details are locked; only batch details change.
          </p>
          {!presetProduct && (
            <Button type="button" variant="outline" size="sm" onClick={() => setLinkedId(null)}>
              Not this product
            </Button>
          )}
        </div>
      )}

      {mode === "edit" && (
        <div className="flex gap-2 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Product details (name, brand, category…) are shared by all batches of this product. Changing the quantity is saved as a “Manual adjustment” in the stock history.</p>
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold">{t("Product")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Product name")} htmlFor="name" required error={errors.name} className="sm:col-span-2">
            <Input id="name" value={v.name} onChange={set("name")} invalid={!!errors.name} disabled={productLocked} placeholder="e.g. Amul Taaza Milk 500ml" autoComplete="off" />
          </Field>

          {suggestions.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:col-span-2" role="region" aria-label="Matching products">
              <p className="mb-2 text-sm font-semibold text-amber-900">Already in your inventory — add a batch to it instead of creating a duplicate?</p>
              <ul className="space-y-1.5">
                {suggestions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 text-sm">
                    <span className="min-w-0 truncate">
                      <strong>{p.name}</strong> <span className="text-slate-600">· {p.brand}</span>
                    </span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => link(p)}>
                      Use this product
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field label={t("Brand")} htmlFor="brand" required error={errors.brand}>
            <Input id="brand" value={v.brand} onChange={set("brand")} invalid={!!errors.brand} disabled={productLocked} placeholder="e.g. Amul" />
          </Field>
          <Field label={t("Category")} htmlFor="category" required error={errors.category}>
            <Select id="category" value={v.category} onChange={set("category")} invalid={!!errors.category} disabled={productLocked}>
              <option value="">Choose category…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("Barcode (optional)")} htmlFor="barcode" error={errors.barcode} hint="Type it, or tap Scan.">
            <div className="flex gap-2">
              <Input id="barcode" value={v.barcode} onChange={set("barcode")} invalid={!!errors.barcode} disabled={productLocked} inputMode="numeric" placeholder="e.g. 8901234567890" />
              {!productLocked && (
                <Button type="button" variant="outline" onClick={openScanner} aria-label={t("Scan barcode")}>
                  <ScanBarcode className="h-5 w-5" />
                </Button>
              )}
            </div>
          </Field>
          <Field label={t("Unit")} htmlFor="unit" required error={errors.unit}>
            <Select id="unit" value={v.unit} onChange={set("unit")} disabled={productLocked}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum stock level (optional)" htmlFor="min_stock" error={errors.min_stock} hint={`Low-stock alert below this. Empty = shop default (${settings.low_stock_default}).`}>
            <Input id="min_stock" type="number" inputMode="decimal" min="0" step="any" value={v.min_stock} onChange={set("min_stock")} invalid={!!errors.min_stock} disabled={productLocked} />
          </Field>
          <Field label="Supplier (optional)" htmlFor="supplier" error={errors.supplier}>
            <Input id="supplier" value={v.supplier} onChange={set("supplier")} disabled={productLocked} placeholder="e.g. Gupta Wholesale" />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold">{mode === "edit" ? "This batch" : "Batch details"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Quantity")} htmlFor="quantity" required error={errors.quantity}>
            <Input id="quantity" type="number" inputMode="decimal" min="0" step="any" value={v.quantity} onChange={set("quantity")} invalid={!!errors.quantity} placeholder="0" />
          </Field>
          <Field label={t("Batch number (optional)")} htmlFor="batch_no" error={errors.batch_no}>
            <Input id="batch_no" value={v.batch_no} onChange={set("batch_no")} placeholder="e.g. B1256" />
          </Field>
          <Field label="Purchase price per unit (₹)" htmlFor="purchase_price" required error={errors.purchase_price}>
            <Input id="purchase_price" type="number" inputMode="decimal" min="0" step="any" value={v.purchase_price} onChange={set("purchase_price")} invalid={!!errors.purchase_price} />
          </Field>
          <Field label="Selling price per unit (₹)" htmlFor="selling_price" required error={errors.selling_price} hint={lowMargin ? undefined : undefined}>
            <Input id="selling_price" type="number" inputMode="decimal" min="0" step="any" value={v.selling_price} onChange={set("selling_price")} invalid={!!errors.selling_price} />
            {lowMargin && !errors.selling_price && (
              <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Selling price is lower than purchase price.
              </p>
            )}
          </Field>
          <Field label={t("Purchase date")} htmlFor="purchase_date" required error={errors.purchase_date}>
            <Input id="purchase_date" type="date" value={v.purchase_date} onChange={set("purchase_date")} invalid={!!errors.purchase_date} />
          </Field>
          <Field label={t("Manufacturing date (optional)")} htmlFor="mfg_date" error={errors.mfg_date}>
            <Input id="mfg_date" type="date" value={v.mfg_date} onChange={set("mfg_date")} invalid={!!errors.mfg_date} />
          </Field>
          <Field label={t("Expiry date")} htmlFor="expiry_date" required error={errors.expiry_date} className="sm:col-span-2">
            <Input id="expiry_date" type="date" value={v.expiry_date} onChange={set("expiry_date")} invalid={!!errors.expiry_date} />
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Quick expiry dates">
              {chip("1 week", 7)}
              {chip("1 month", 30)}
              {chip("3 months", 90)}
              {chip("6 months", 180)}
              {chip("1 year", 365)}
            </div>
            {expiryInfo && !errors.expiry_date && (
              <p
                data-testid="expiry-info"
                className={cx(
                  "mt-2 rounded-xl px-3 py-2 text-sm font-medium",
                  expiryInfo.tone === "red" && "bg-red-50 text-red-800",
                  expiryInfo.tone === "amber" && "bg-amber-50 text-amber-900",
                  expiryInfo.tone === "green" && "bg-brand-50 text-brand-800",
                )}
              >
                {expiryInfo.text}
              </p>
            )}
          </Field>
          <Field label={t("Notes (optional)")} htmlFor="notes" error={errors.notes} className="sm:col-span-2">
            <Textarea id="notes" value={v.notes} onChange={set("notes")} disabled={productLocked} maxLength={500} rows={2} />
          </Field>
        </div>
      </Card>

      {formError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {formError}
        </p>
      )}

      <div className="sticky bottom-20 z-10 -mx-4 flex gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <Button type="button" variant="outline" size="lg" className="hidden sm:inline-flex" onClick={() => router.back()}>
          {t("Cancel")}
        </Button>
        {mode === "add" && (
          <Button type="button" variant="secondary" size="lg" className="flex-1 px-3 sm:flex-none sm:px-5" loading={busy === "another"} disabled={busy === "save"} onClick={() => void submit(true)}>
            <span className="sm:hidden">{t("Save & add more")}</span>
            <span className="hidden sm:inline">Save & add another batch</span>
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1 px-3 sm:flex-none sm:px-5" loading={busy === "save"} disabled={busy === "another"}>
          <Check className="h-5 w-5" /> {mode === "edit" ? "Save changes" : "Save product"}
        </Button>
      </div>
    </form>
  );
}
