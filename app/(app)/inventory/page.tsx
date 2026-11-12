"use client";

import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Download, Filter, Package, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "@/components/ui-context";
import { Button, Card, ConfirmDialog, EmptyState, Input, LinkButton, PageHeader, Pill, Select, Spinner, StatusBadge, cx } from "@/components/ui";
import { downloadCSV } from "@/lib/csv";
import { daysLabel, formatDate } from "@/lib/dates";
import { DEFAULT_FILTERS, STATUS_LABEL, filterViews, type BatchView, type InventoryFilters, type SortKey, type StatusFilter } from "@/lib/expiry";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApp } from "@/lib/store";
import { CATEGORIES, type ExpiryStatus } from "@/lib/types";

const PAGE_SIZE = 15;
const STATUS_OPTIONS: [StatusFilter, string][] = [
  ["all", "All statuses"],
  ["safe", "Safe"],
  ["soon", "Expiring Soon"],
  ["today", "Expiring Today"],
  ["expired", "Expired"],
  ["expiring", "Expiring (today + soon)"],
  ["low", "Low stock products"],
];

export default function InventoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const { views, summaries, settings, today, deleteBatch, toast } = useApp();
  const { openMovement } = useUI();
  const router = useRouter();
  const params = useSearchParams();

  const filters: InventoryFilters = {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    status: (params.get("status") as StatusFilter) || "all",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    sort: (params.get("sort") as SortKey) || "expiry",
    dir: params.get("dir") === "desc" ? "desc" : "asc",
    showEmpty: params.get("empty") === "1",
  };
  const view = params.get("view") === "products" ? "products" : "batches";

  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BatchView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [qText, setQText] = useState(filters.q);

  function setParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setPage(1);
    const qs = next.toString();
    router.replace(qs ? `/inventory?${qs}` : "/inventory", { scroll: false });
  }

  // keep the search box in step with the URL (e.g. when arriving from the global search)
  useEffect(() => setQText(params.get("q") ?? ""), [params]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearch(v: string) {
    setQText(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setParams({ q: v.trim() || undefined }), 250);
  }

  const rows = useMemo(() => filterViews(views, filters, summaries), [views, summaries, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const productRows = useMemo(() => {
    const map = new Map<string, { product: BatchView["product"]; batches: BatchView[] }>();
    for (const r of rows) {
      const e = map.get(r.product.id) ?? { product: r.product, batches: [] };
      e.batches.push(r);
      map.set(r.product.id, e);
    }
    const rank: Record<ExpiryStatus, number> = { expired: 0, today: 1, soon: 2, safe: 3 };
    return [...map.values()].map((e) => {
      const live = e.batches.filter((b) => !b.empty);
      const worst = live.sort((a, b) => rank[a.status] - rank[b.status])[0]?.status;
      const next = live.filter((b) => b.sellable).map((b) => b.batch.expiry_date).sort()[0];
      return {
        product: e.product,
        batchCount: live.length,
        total: live.reduce((s, b) => s + b.batch.quantity, 0),
        sellable: live.filter((b) => b.sellable).reduce((s, b) => s + b.batch.quantity, 0),
        expired: live.filter((b) => b.status === "expired").reduce((s, b) => s + b.batch.quantity, 0),
        value: live.reduce((s, b) => s + b.value, 0),
        worst,
        next,
      };
    });
  }, [rows]);

  const total = view === "batches" ? rows.length : productRows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const slice = <T,>(a: T[]) => a.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const activeFilterCount = [filters.category, filters.status !== "all", filters.from, filters.to, filters.showEmpty].filter(Boolean).length;
  const anyFilter = activeFilterCount > 0 || filters.q;

  function exportCSV() {
    downloadCSV(`expirix-inventory-${today}.csv`, [
      ["Product", "Brand", "Category", "Barcode", "Batch no.", "Quantity", "Unit", "Purchase price", "Selling price", "Purchase date", "Expiry date", "Days left", "Status", "Stock value (purchase)"],
      ...rows.map((v) => [
        v.product.name,
        v.product.brand,
        v.product.category,
        v.product.barcode,
        v.batch.batch_no,
        v.batch.quantity,
        v.product.unit,
        v.batch.purchase_price,
        v.batch.selling_price,
        formatDate(v.batch.purchase_date, settings.date_format),
        formatDate(v.batch.expiry_date, settings.date_format),
        v.days,
        v.empty ? "Empty" : STATUS_LABEL[v.status],
        v.value,
      ]),
    ]);
    toast(`Exported ${rows.length} rows.`);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await deleteBatch(toDelete.batch.id);
    setDeleting(false);
    setToDelete(null);
    toast(r.ok ? "Batch deleted." : r.error, r.ok ? "success" : "error");
  }

  const money = (n: number) => formatMoney(n, settings.currency);
  const sortToggle = (k: SortKey) => setParams({ sort: k === "expiry" ? undefined : k, dir: filters.sort === k && filters.dir === "asc" ? "desc" : undefined });

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${rows.length} batch${rows.length === 1 ? "" : "es"} of ${new Set(rows.map((r) => r.product.id)).size} products${anyFilter ? " (filtered)" : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <LinkButton href="/inventory/add" size="lg">
              <Plus className="h-5 w-5" /> Add Product
            </LinkButton>
          </>
        }
      />

      {/* ---------------- search + filters ---------------- */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input aria-label="Search by product name, brand, barcode or batch" type="search" placeholder="Search name, brand, barcode or batch…" value={qText} onChange={(e) => onSearch(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} className="sm:hidden">
            <Filter className="h-4 w-4" /> Filters {activeFilterCount > 0 && <Pill tone="green">{activeFilterCount}</Pill>}
          </Button>
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="View">
            {(["batches", "products"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setParams({ view: v === "batches" ? undefined : v })}
                className={cx("min-h-9 flex-1 rounded-lg px-3 text-sm font-semibold", view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
              >
                {v === "batches" ? "By batch" : "By product"}
              </button>
            ))}
          </div>
        </div>
        <div className={cx("mt-3 grid gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-6", filtersOpen ? "grid" : "hidden")}>
          <Select aria-label="Category" value={filters.category} onChange={(e) => setParams({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Expiry status" value={filters.status} onChange={(e) => setParams({ status: e.target.value === "all" ? undefined : e.target.value })}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="w-10 shrink-0 font-medium">From</span>
            <Input type="date" aria-label="Expiry from date" value={filters.from} onChange={(e) => setParams({ from: e.target.value || undefined })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="w-10 shrink-0 font-medium">To</span>
            <Input type="date" aria-label="Expiry to date" value={filters.to} onChange={(e) => setParams({ to: e.target.value || undefined })} />
          </label>
          <div className="flex gap-2">
            <Select aria-label="Sort by" value={filters.sort} onChange={(e) => setParams({ sort: e.target.value === "expiry" ? undefined : e.target.value, dir: undefined })}>
              <option value="expiry">Sort: Expiry date</option>
              <option value="name">Sort: Name</option>
              <option value="quantity">Sort: Quantity</option>
            </Select>
            <Button variant="outline" aria-label={filters.dir === "asc" ? "Ascending" : "Descending"} onClick={() => setParams({ dir: filters.dir === "asc" ? "desc" : undefined })}>
              {filters.dir === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={filters.showEmpty} onChange={(e) => setParams({ empty: e.target.checked ? "1" : undefined })} />
              Show empty batches
            </label>
            {anyFilter && (
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline" onClick={() => router.replace("/inventory", { scroll: false })}>
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
      </Card>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={views.length === 0 ? "No products yet" : "No products match these filters"}
            action={
              views.length === 0 ? (
                <LinkButton href="/inventory/add">
                  <Plus className="h-5 w-5" /> Add your first product
                </LinkButton>
              ) : (
                <Button variant="outline" onClick={() => router.replace("/inventory")}>
                  Clear filters
                </Button>
              )
            }
          >
            {views.length === 0 ? "Add a product with its expiry date to start tracking." : "Try a different search or clear the filters."}
          </EmptyState>
        </Card>
      ) : view === "batches" ? (
        <>
          {/* desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <Th sortable onClick={() => sortToggle("name")} active={filters.sort === "name"} dir={filters.dir}>Product</Th>
                    <Th>Category</Th>
                    <Th>Batch</Th>
                    <Th sortable onClick={() => sortToggle("quantity")} active={filters.sort === "quantity"} dir={filters.dir} right>Qty</Th>
                    <Th right>Purchase</Th>
                    <Th right>Selling</Th>
                    <Th>Purchased</Th>
                    <Th sortable onClick={() => sortToggle("expiry")} active={filters.sort === "expiry"} dir={filters.dir}>Expiry</Th>
                    <Th>Status</Th>
                    <Th right>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slice(rows).map((v) => (
                    <tr key={v.batch.id} className={cx("hover:bg-slate-50", v.status === "expired" && !v.empty && "bg-red-50/40")}>
                      <td className="px-3 py-3">
                        <Link href={`/inventory/${v.product.id}`} className="font-semibold text-slate-900 hover:underline">
                          {v.product.name}
                        </Link>
                        <div className="text-xs text-slate-600">{v.product.brand}</div>
                        {v.fefo && rows.filter((r) => r.product.id === v.product.id && r.sellable).length > 1 && <Pill tone="green">Sell first (FEFO)</Pill>}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{v.product.category}</td>
                      <td className="px-3 py-3 text-slate-700">{v.batch.batch_no ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {formatNumber(v.batch.quantity)} <span className="font-normal text-slate-600">{v.product.unit}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(v.batch.purchase_price)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(v.batch.selling_price)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-700">{formatDate(v.batch.purchase_date, settings.date_format)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-medium">{formatDate(v.batch.expiry_date, settings.date_format)}</div>
                        {!v.empty && <div className={cx("text-xs", v.days <= 1 ? "font-semibold text-red-700" : "text-slate-600")}>{daysLabel(v.days)}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={v.status} empty={v.empty} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {!v.empty && <IconAction label={`Record movement for ${v.product.name}`} onClick={() => openMovement({ batchId: v.batch.id, type: v.days < 0 ? "expired_removed" : "sold" })}><Truck className="h-4 w-4" /></IconAction>}
                          <IconLink label={`Edit ${v.product.name} batch`} href={`/inventory/edit/${v.batch.id}`}><Pencil className="h-4 w-4" /></IconLink>
                          <IconAction label={`Delete ${v.product.name} batch`} onClick={() => setToDelete(v)} danger><Trash2 className="h-4 w-4" /></IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* mobile cards */}
          <ul className="space-y-3 md:hidden">
            {slice(rows).map((v) => (
              <li key={v.batch.id}>
                <Card className={cx("p-4", v.status === "expired" && !v.empty && "border-red-300 bg-red-50/40")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/inventory/${v.product.id}`} className="block truncate py-1.5 text-base font-semibold text-slate-900">
                        {v.product.name}
                      </Link>
                      <p className="text-sm text-slate-600">
                        {v.product.brand} · {v.product.category}
                      </p>
                    </div>
                    <StatusBadge status={v.status} empty={v.empty} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Cell label="Quantity" value={`${formatNumber(v.batch.quantity)} ${v.product.unit}`} bold />
                    <Cell label="Batch" value={v.batch.batch_no ?? "—"} />
                    <Cell label="Expiry" value={`${formatDate(v.batch.expiry_date, settings.date_format)}${v.empty ? "" : ` · ${daysLabel(v.days)}`}`} />
                    <Cell label="Buy / Sell" value={`${money(v.batch.purchase_price)} / ${money(v.batch.selling_price)}`} />
                  </dl>
                  {v.fefo && rows.filter((r) => r.product.id === v.product.id && r.sellable).length > 1 && <div className="mt-2"><Pill tone="green">Sell this first (FEFO)</Pill></div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!v.empty && (
                      <Button size="sm" variant={v.days < 0 ? "danger" : "secondary"} onClick={() => openMovement({ batchId: v.batch.id, type: v.days < 0 ? "expired_removed" : "sold", quantity: v.days < 0 ? v.batch.quantity : undefined })}>
                        {v.days < 0 ? "Mark as removed" : "Update qty"}
                      </Button>
                    )}
                    <LinkButton href={`/inventory/edit/${v.batch.id}`} variant="outline" size="sm"><Pencil className="h-4 w-4" /> Edit</LinkButton>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete(v)}><Trash2 className="h-4 w-4" /> Delete</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <Th>Product</Th><Th>Category</Th><Th right>Batches</Th><Th right>Total</Th><Th right>Sellable</Th><Th right>Expired</Th><Th>Next expiry</Th><Th>Status</Th><Th right>Value</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slice(productRows).map((p) => (
                  <tr key={p.product.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <Link href={`/inventory/${p.product.id}`} className="font-semibold hover:underline">{p.product.name}</Link>
                      <div className="text-xs text-slate-600">{p.product.brand}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{p.product.category}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.batchCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(p.total)} <span className="text-slate-600">{p.product.unit}</span></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-brand-800">{formatNumber(p.sellable)}</td>
                    <td className={cx("px-3 py-3 text-right tabular-nums", p.expired > 0 && "font-semibold text-red-700")}>{formatNumber(p.expired)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{p.next ? formatDate(p.next, settings.date_format) : "—"}</td>
                    <td className="px-3 py-3">{p.worst ? <StatusBadge status={p.worst} /> : <StatusBadge status="safe" empty />}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-slate-700">
            Page {cur} of {pages}
          </span>
          <Button variant="outline" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this batch?"
        confirmLabel="Delete batch"
        loading={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
        body={
          toDelete && (
            <>
              <p>
                <strong>{toDelete.product.name}</strong> — batch {toDelete.batch.batch_no ?? "(no number)"}, {toDelete.batch.quantity} {toDelete.product.unit}, expiry {formatDate(toDelete.batch.expiry_date, settings.date_format)}.
              </p>
              <p className="mt-2">This removes the batch and its alerts. Past movement history is kept.</p>
              {toDelete.days < 0 && !toDelete.empty && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2.5 font-medium text-amber-900">
                  This batch has expired. To keep your waste report accurate, use “Mark as removed” instead of deleting it.
                </p>
              )}
            </>
          )
        }
      />
    </div>
  );
}

function Th({ children, right, sortable, active, dir, onClick }: { children: React.ReactNode; right?: boolean; sortable?: boolean; active?: boolean; dir?: "asc" | "desc"; onClick?: () => void }) {
  return (
    <th scope="col" className={cx("px-3 py-3 font-semibold", right && "text-right")} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      {sortable ? (
        <button type="button" onClick={onClick} className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900", active && "text-slate-900")}>
          {children} {active && (dir === "asc" ? "↑" : "↓")}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Cell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cx("text-slate-900", bold && "font-semibold")}>{value}</dd>
    </div>
  );
}

const iconCls = "grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100";
function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cx(iconCls, danger && "hover:bg-red-50 hover:text-red-700")}>
      {children}
    </button>
  );
}
function IconLink({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  return (
    <Link aria-label={label} title={label} href={href} className={iconCls}>
      {children}
    </Link>
  );
}
