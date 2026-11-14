"use client";

import { t } from "@/lib/i18n-core";
import { ArrowLeft, Download, Lightbulb, Pencil, Plus, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useUI } from "@/components/ui-context";
import { Button, Card, ConfirmDialog, EmptyState, LinkButton, Pill, SectionTitle, StatusBadge, cx } from "@/components/ui";
import { downloadCSV } from "@/lib/csv";
import { daysLabel, formatDate, formatDateTime } from "@/lib/dates";
import { suggestAction } from "@/lib/expiry";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApp } from "@/lib/store";
import { MOVEMENT_LABELS } from "@/lib/types";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, views, summaries, settings, deleteBatch, deleteProduct, toast } = useApp();
  const { openMovement } = useUI();
  const router = useRouter();
  const [delBatch, setDelBatch] = useState<string | null>(null);
  const [delProduct, setDelProduct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const product = data.products.find((p) => p.id === id);
  const sum = summaries.find((s) => s.product.id === id);
  const money = (n: number) => formatMoney(n, settings.currency);
  const mine = useMemo(() => views.filter((v) => v.product.id === id).sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date)), [views, id]);
  const history = useMemo(
    () => data.movements.filter((m) => m.product_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data.movements, id],
  );

  if (!product || !sum)
    return (
      <Card>
        <EmptyState title={t("Product not found")} action={<LinkButton href="/inventory">{t("Back to inventory")}</LinkButton>}>
          It may have been deleted.
        </EmptyState>
      </Card>
    );

  const live = mine.filter((v) => !v.empty);
  const shownBatches = showEmpty ? mine : live;
  const fefo = live.find((v) => v.fefo);
  const expiredLive = live.filter((v) => v.status === "expired");
  const sellableBatchCount = live.filter((v) => v.sellable).length;
  const value = live.reduce((s, v) => s + v.value, 0);
  const latest = [...mine].sort((a, b) => b.batch.created_at.localeCompare(a.batch.created_at))[0];
  const toDelete = mine.find((v) => v.batch.id === delBatch);

  async function removeBatch() {
    if (!delBatch) return;
    setBusy(true);
    const r = await deleteBatch(delBatch);
    setBusy(false);
    setDelBatch(null);
    toast(r.ok ? "Batch deleted." : r.error, r.ok ? "success" : "error");
  }
  async function removeProduct() {
    setBusy(true);
    const r = await deleteProduct(id);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(`“${product!.name}” deleted.`);
    router.replace("/inventory");
  }

  function exportHistory() {
    downloadCSV(`expirix-${product!.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-history.csv`, [
      ["Date & time", "Type", "Batch", "Change", "Balance after", "Unit", "Unit cost", "Notes"],
      ...history.map((m) => [formatDateTime(m.created_at, settings.date_format, settings.timezone), MOVEMENT_LABELS[m.type], m.batch_no, m.qty_change, m.batch_id ? m.qty_after : null, m.unit, m.unit_cost, m.notes]),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {t("Inventory")}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {product.brand} · {product.category}
              {product.barcode && <> · Barcode {product.barcode}</>}
              {product.supplier && <> · Supplier: {product.supplier}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openMovement({ batchId: fefo?.batch.id ?? live[0]?.batch.id })} disabled={live.length === 0}>
              <Truck className="h-4 w-4" /> Record movement
            </Button>
            <LinkButton href={`/inventory/add?product=${product.id}`}>
              <Plus className="h-5 w-5" /> Add batch
            </LinkButton>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Product summary">
        <Stat label={t("On hand")} value={`${formatNumber(sum.totalQty)} ${product.unit}`} />
        <Stat label={t("Sellable")} value={`${formatNumber(sum.sellableQty)} ${product.unit}`} tone="green" sub={sum.low ? `Low (min ${sum.minStock})` : undefined} />
        <Stat label={t("Expired on shelf")} value={`${formatNumber(sum.expiredQty)} ${product.unit}`} tone={sum.expiredQty ? "red" : undefined} />
        <Stat label={t("Stock value")} value={money(value)} sub="at purchase price" />
      </section>

      {/* FEFO */}
      <Card className={cx("p-4", expiredLive.length ? "border-red-300" : "border-brand-200")}>
        <div className="flex gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-slate-900">First-Expiry-First-Out (FEFO)</p>
            {fefo ? (
              <p data-testid="fefo">
                Sell <strong>batch {fefo.batch.batch_no ?? "(no number)"}</strong> first: {fefo.batch.quantity} {product.unit}, expiry {formatDate(fefo.batch.expiry_date, settings.date_format)} ({daysLabel(fefo.days).toLowerCase()}).
                {sellableBatchCount > 1 ? " Keep the newer batches behind it." : ""}
              </p>
            ) : (
              <p className="text-slate-700">No sellable stock for this product right now.</p>
            )}
            {expiredLive.length > 0 && (
              <p className="font-medium text-red-800">
                {expiredLive.length} expired batch{expiredLive.length > 1 ? "es" : ""} ({expiredLive.reduce((s, v) => s + v.batch.quantity, 0)} {product.unit}) must be removed — never sold.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* batches */}
      <section>
        <SectionTitle
          action={
            mine.length > live.length && (
              <button type="button" onClick={() => setShowEmpty((s) => !s)} className="text-sm font-semibold text-brand-700 hover:underline">
                {showEmpty ? "Hide empty batches" : `Show ${mine.length - live.length} empty`}
              </button>
            )
          }
        >
          Batches ({live.length})
        </SectionTitle>
        {shownBatches.length === 0 ? (
          <Card>
            <EmptyState title="No batches with stock" action={<LinkButton href={`/inventory/add?product=${product.id}`}>Add a batch</LinkButton>}>
              Add a batch when new stock arrives.
            </EmptyState>
          </Card>
        ) : (
          <div className="space-y-3">
            {shownBatches.map((v) => {
              const tip = v.empty ? null : suggestAction(v, settings.expiry_threshold_days, live.filter((x) => x.sellable && x.batch.id !== v.batch.id).length);
              return (
                <Card key={v.batch.id} className={cx("p-4", v.status === "expired" && !v.empty && "border-red-300 bg-red-50/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        Batch {v.batch.batch_no ?? "—"} {v.fefo && sellableBatchCount > 1 && <Pill tone="green">Sell first</Pill>}
                      </p>
                      <p className="text-sm text-slate-600">
                        Expiry {formatDate(v.batch.expiry_date, settings.date_format)}
                        {!v.empty && <> · {daysLabel(v.days)}</>}
                      </p>
                    </div>
                    <StatusBadge status={v.status} empty={v.empty} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                    <D label={t("Quantity")} value={`${formatNumber(v.batch.quantity)} ${product.unit}`} bold />
                    <D label={t("Purchase price")} value={money(v.batch.purchase_price)} />
                    <D label={t("Selling price")} value={money(v.batch.selling_price)} />
                    <D label={t("Purchased")} value={formatDate(v.batch.purchase_date, settings.date_format)} />
                    <D label={t("Stock value")} value={money(v.value)} />
                  </dl>
                  {tip && (v.days <= settings.expiry_threshold_days || v.days < 0) && (
                    <p className={cx("mt-3 rounded-lg px-3 py-2 text-sm font-medium", tip.tone === "red" ? "bg-red-100 text-red-900" : "bg-amber-50 text-amber-900")}>{tip.text}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!v.empty && (
                      <Button size="sm" variant={v.days < 0 ? "danger" : "secondary"} onClick={() => openMovement({ batchId: v.batch.id, type: v.days < 0 ? "expired_removed" : "sold", quantity: v.days < 0 ? v.batch.quantity : undefined })}>
                        {v.days < 0 ? "Mark as removed" : "Record sale / movement"}
                      </Button>
                    )}
                    <LinkButton href={`/inventory/edit/${v.batch.id}`} variant="outline" size="sm">
                      <Pencil className="h-4 w-4" /> Edit
                    </LinkButton>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDelBatch(v.batch.id)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* history */}
      <section>
        <SectionTitle
          action={
            history.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportHistory}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )
          }
        >
          Stock movement history
        </SectionTitle>
        <Card className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <EmptyState title={t("No movements yet")}>Every sale, delivery, removal and correction is logged here.</EmptyState>
          ) : (
            (showAll ? history : history.slice(0, 10)).map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 p-3.5 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {t(MOVEMENT_LABELS[m.type])}
                    {m.batch_no && <span className="font-normal text-slate-600"> · batch {m.batch_no}</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {formatDateTime(m.created_at, settings.date_format, settings.timezone)}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx("font-bold tabular-nums", m.qty_change > 0 ? "text-brand-700" : "text-red-700")}>
                    {m.qty_change > 0 ? "+" : ""}
                    {m.qty_change} {m.unit}
                  </p>
                  {m.batch_id && <p className="text-xs text-slate-500">balance {m.qty_after}</p>}
                </div>
              </div>
            ))
          )}
        </Card>
        {history.length > 10 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
            {showAll ? "Show fewer" : `Show all ${history.length}`}
          </button>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        {latest && (
          <LinkButton href={`/inventory/edit/${latest.batch.id}`} variant="outline">
            <Pencil className="h-4 w-4" /> Edit product details
          </LinkButton>
        )}
        <Button variant="ghost" className="text-red-700" onClick={() => setDelProduct(true)}>
          <Trash2 className="h-4 w-4" /> Delete product
        </Button>
      </div>

      <ConfirmDialog
        open={delBatch !== null}
        title={t("Delete this batch?")}
        confirmLabel="Delete batch"
        loading={busy}
        onCancel={() => setDelBatch(null)}
        onConfirm={removeBatch}
        body={
          <>
            <p>
              Batch {toDelete?.batch.batch_no ?? "(no number)"} — {toDelete?.batch.quantity} {product.unit}. Its alerts are removed; movement history is kept.
            </p>
            {toDelete && toDelete.days < 0 && !toDelete.empty && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 font-medium text-amber-900">It has expired. Use “Mark as removed” so the waste is recorded in your reports.</p>}
          </>
        }
      />
      <ConfirmDialog
        open={delProduct}
        title={t("Delete this product?")}
        confirmLabel="Delete product"
        loading={busy}
        onCancel={() => setDelProduct(false)}
        onConfirm={removeProduct}
        body={<p>“{product.name}” and all {mine.length} of its batches and alerts will be removed. Past movement history is kept for your reports.</p>}
      />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 text-xl font-bold", tone === "green" && "text-brand-800", tone === "red" && "text-red-700")}>{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </Card>
  );
}
function D({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cx("text-slate-900", bold && "font-semibold")}>{value}</dd>
    </div>
  );
}
