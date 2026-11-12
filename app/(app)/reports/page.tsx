"use client";

import { Download, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, Input, PageHeader, Select, SectionTitle, StatusBadge } from "@/components/ui";
import { downloadCSV } from "@/lib/csv";
import { addDays, addMonths, dateOfTimestamp, formatDate, monthKey } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/expiry";
import { formatMoney, formatNumber } from "@/lib/format";
import { expiryReport, inventoryReport, monthlyWaste, wasteInRange, wasteSummary, type Range } from "@/lib/reports";
import { useApp } from "@/lib/store";

const PRESETS = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["month", "This month"],
  ["180", "Last 6 months"],
  ["year", "This year"],
  ["all", "All time"],
  ["next30", "Next 30 days"],
  ["custom", "Custom range"],
] as const;

export default function ReportsPage() {
  const { views, data, settings, today } = useApp();
  const tz = settings.timezone;
  const money = (n: number) => formatMoney(n, settings.currency);
  const [preset, setPreset] = useState<(typeof PRESETS)[number][0]>("90");
  const [custom, setCustom] = useState<Range>({ from: addDays(today, -30), to: today });

  const range: Range = useMemo(() => {
    switch (preset) {
      case "30":
        return { from: addDays(today, -29), to: today };
      case "90":
        return { from: addDays(today, -89), to: today };
      case "180":
        return { from: addDays(today, -179), to: today };
      case "month":
        return { from: `${monthKey(today)}-01`, to: today };
      case "year":
        return { from: `${today.slice(0, 4)}-01-01`, to: today };
      case "all":
        return { from: "2000-01-01", to: "2100-12-31" };
      case "next30":
        return { from: today, to: addDays(today, 30) };
      default:
        return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
    }
  }, [preset, today, custom]);

  const inv = useMemo(() => inventoryReport(views), [views]);
  const exp = useMemo(() => expiryReport(views, data.movements, range, settings, tz), [views, data.movements, range, settings, tz]);
  const wasteRows = useMemo(() => wasteInRange(data.movements, range, tz), [data.movements, range, tz]);
  const waste = useMemo(() => wasteSummary(wasteRows), [wasteRows]);

  const trend = useMemo(() => {
    const wasteAll = data.movements.filter((m) => m.type === "expired_removed" || m.type === "damaged");
    const months = wasteAll.map((m) => monthKey(dateOfTimestamp(m.created_at, tz))).sort();
    const rangeFrom = range.from < "2001-01-01" ? months[0] ?? monthKey(today) : monthKey(range.from);
    let to = range.to > "2099-01-01" ? monthKey(today) : monthKey(range.to);
    let from = rangeFrom;
    if (to > monthKey(today)) to = monthKey(today);
    if (from > to) from = to;
    // cap at 12 months so the chart stays readable
    const cap = monthKey(addMonths(`${to}-01`, -11));
    if (from < cap) from = cap;
    return monthlyWaste(data.movements, from, to, tz);
  }, [data.movements, range, today, tz]);

  const avgMonthly = trend.length ? trend.reduce((s, t) => s + t.cost, 0) / trend.length : 0;
  const rangeLabel = preset === "all" ? "all time" : `${formatDate(range.from, settings.date_format)} – ${formatDate(range.to, settings.date_format)}`;

  /* --------------------------- exports --------------------------- */
  const dateF = (d: string) => formatDate(d, settings.date_format);
  function exportInventory() {
    downloadCSV(`expirix-inventory-report-${today}.csv`, [
      ["Category", "Units on hand", "Sellable units", "Purchase value"],
      ...inv.categories.map((c) => [c.category, c.units, c.sellableUnits, c.cost]),
      [],
      ["Total units", inv.totalUnits],
      ["Total purchase value", inv.purchaseValue],
      ["Estimated retail value (eligible, non-expired stock)", inv.retailValueEligible],
    ]);
  }
  function exportExpiry() {
    downloadCSV(`expirix-expiry-report-${today}.csv`, [
      ["Section", "Product", "Brand", "Batch", "Quantity", "Unit", "Expiry date", "Status", "Purchase value"],
      ...exp.expiring.map((v) => ["Expiring in period", v.product.name, v.product.brand, v.batch.batch_no, v.batch.quantity, v.product.unit, dateF(v.batch.expiry_date), STATUS_LABEL[v.status], v.value]),
      ...exp.expired.map((v) => ["Expired on shelf (today)", v.product.name, v.product.brand, v.batch.batch_no, v.batch.quantity, v.product.unit, dateF(v.batch.expiry_date), STATUS_LABEL[v.status], v.value]),
      ...exp.removed.map((m) => ["Removed due to expiry", m.product_name, "", m.batch_no, -m.qty_change, m.unit, "", "", -m.qty_change * m.unit_cost]),
    ]);
  }
  function exportWaste() {
    downloadCSV(`expirix-waste-report-${today}.csv`, [
      ["Date", "Product", "Type", "Quantity", "Unit", "Purchase price", "Waste cost", "Notes"],
      ...wasteRows.map((m) => [dateF(dateOfTimestamp(m.created_at, tz)), m.product_name, m.type === "expired_removed" ? "Expired removed" : "Damaged", -m.qty_change, m.unit, m.unit_cost, -m.qty_change * m.unit_cost, m.notes]),
      [],
      ["Total", "", "", waste.qty, "", "", waste.cost],
    ]);
  }
  function exportFinancial() {
    downloadCSV(`expirix-financial-insights-${today}.csv`, [
      ["Measure", "Amount", "How it is calculated"],
      ["Inventory at risk (expired + expiring soon)", exp.atRiskCost, "Purchase price x quantity of batches that expired or expire within the threshold"],
      ["Expired stock still on shelf", exp.expiredOnShelfCost, "Purchase price x quantity of expired batches not yet removed"],
      [`Recorded waste cost (${rangeLabel})`, waste.cost, "Purchase price x quantity of expired + damaged stock removed"],
      ["Average monthly waste cost", avgMonthly, "Recorded waste cost / number of months in the chart"],
      ...trend.map((t) => [`Waste cost ${t.label}`, t.cost, "Monthly total"]),
    ]);
  }

  const atRiskNote = exp.atRiskCost;

  return (
    <div className="space-y-8">
      <PageHeader title="Reports & Analytics" subtitle={`Period: ${rangeLabel}`} />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <label htmlFor="preset" className="mb-1.5 block text-sm font-semibold">
            Period
          </label>
          <Select id="preset" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
            {PRESETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <label htmlFor="rf" className="mb-1.5 block text-sm font-semibold">
                From
              </label>
              <Input id="rf" type="date" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="rt" className="mb-1.5 block text-sm font-semibold">
                To
              </label>
              <Input id="rt" type="date" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        <p className="text-sm text-slate-600 sm:ml-auto sm:max-w-md">
          The period applies to expiry dates and to recorded waste. Stock values are always “as of today”.
        </p>
      </Card>

      {/* ---------------- inventory ---------------- */}
      <section id="inventory" aria-labelledby="h-inv">
        <SectionTitle action={<ExportBtn onClick={exportInventory} />}>
          <span id="h-inv">Inventory report (as of today)</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="Total stock units" value={formatNumber(inv.totalUnits)} />
          <Metric label="Inventory purchase value" value={money(inv.purchaseValue)} sub="what you paid for stock on hand" />
          <Metric label="Estimated retail value" value={money(inv.retailValueEligible)} sub="sellable (non-expired) stock only" className="col-span-2 lg:col-span-1" />
        </div>
        <Card className="mt-3 p-4">
          <h3 className="mb-2 text-sm font-semibold">Stock by category (units)</h3>
          {inv.categories.length === 0 ? (
            <EmptyState title="No stock yet" />
          ) : (
            <div className="h-64" role="img" aria-label="Stacked bar chart of sellable and expired units by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inv.categories.map((c) => ({ category: c.category, Sellable: c.sellableUnits, Expired: c.units - c.sellableUnits }))} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Sellable" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Expired" stackId="a" fill="#dc2626" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      {/* ---------------- expiry ---------------- */}
      <section id="expiry" aria-labelledby="h-exp">
        <SectionTitle action={<ExportBtn onClick={exportExpiry} />}>
          <span id="h-exp">Expiry report</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Batches expiring in period" value={String(exp.expiring.length)} sub="still in stock, not yet expired" />
          <Metric label="Expired on shelf now" value={String(exp.expired.length)} sub={money(exp.expiredOnShelfCost)} tone="red" />
          <Metric label="Quantity at risk" value={formatNumber(exp.atRiskUnits)} sub="expired + expiring soon, units" />
          <Metric label="Removed due to expiry" value={formatNumber(exp.removed.reduce((s, m) => s - m.qty_change, 0))} sub={`${exp.removed.length} removals in period`} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ListCard title="Expiring in this period" empty="No batches with an expiry date in this period." rows={exp.expiring.sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date)).slice(0, 12).map((v) => ({ key: v.batch.id, a: v.product.name, b: `batch ${v.batch.batch_no ?? "—"} · ${v.batch.quantity} ${v.product.unit}`, c: dateF(v.batch.expiry_date), badge: <StatusBadge status={v.status} /> }))} />
          <ListCard title="Expired batches still on shelf" empty="No expired stock on the shelf." rows={exp.expired.sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date)).map((v) => ({ key: v.batch.id, a: v.product.name, b: `batch ${v.batch.batch_no ?? "—"} · ${v.batch.quantity} ${v.product.unit}`, c: dateF(v.batch.expiry_date), badge: <StatusBadge status="expired" /> }))} />
        </div>
      </section>

      {/* ---------------- waste ---------------- */}
      <section id="waste" aria-labelledby="h-waste">
        <SectionTitle action={<ExportBtn onClick={exportWaste} />}>
          <span id="h-waste">Waste report</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Quantity discarded" value={formatNumber(waste.qty)} sub={`${waste.expiredQty} expired · ${waste.damagedQty} damaged`} />
          <Metric label="Estimated waste cost" value={money(waste.cost)} sub="purchase price × quantity" tone="red" testId="waste-cost" />
          <Metric label="Expired stock cost" value={money(waste.expiredCost)} />
          <Metric label="Damaged stock cost" value={money(waste.damagedCost)} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Most frequently wasted</h3>
            {waste.top.length === 0 ? (
              <EmptyState title="No waste recorded in this period" />
            ) : (
              <ol className="divide-y divide-slate-100">
                {waste.top.map((t, i) => (
                  <li key={t.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{i + 1}</span>
                      <span className="font-semibold">{t.name}</span>
                    </span>
                    <span className="shrink-0 text-right text-slate-700">
                      {t.times}× · {t.qty} units · <strong>{money(t.cost)}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Waste cost by month</h3>
            {trend.every((t) => t.cost === 0) ? (
              <EmptyState title="No waste to chart" />
            ) : (
              <div className="h-56" role="img" aria-label="Bar chart of waste cost per month">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ left: -8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [money(Number(v)), "Waste cost"]} />
                    <Bar dataKey="cost" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ---------------- financial ---------------- */}
      <section id="financial" aria-labelledby="h-fin">
        <SectionTitle action={<ExportBtn onClick={exportFinancial} />}>
          <span id="h-fin">Financial insights (estimates)</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Inventory at risk" value={money(atRiskNote)} sub={`expiring in ≤ ${settings.expiry_threshold_days} days, at cost`} tone="amber" />
          <Metric label="Expired, not yet removed" value={money(exp.expiredOnShelfCost)} sub="loss if never sold" tone="red" />
          <Metric label="Recorded losses (period)" value={money(waste.cost)} sub="expired + damaged removed" />
          <Metric label="Average monthly waste" value={money(avgMonthly)} sub={`over ${trend.length} month${trend.length === 1 ? "" : "s"}`} />
        </div>
        <Card className="mt-3 space-y-2 p-4 text-sm text-slate-700">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Info className="h-4 w-4 text-sky-700" /> Potential savings (illustration, not a guarantee)
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Selling the <strong>{money(atRiskNote)}</strong> of at-risk stock before it expires would avoid up to that much in write-offs (at purchase cost).
            </li>
            <li>
              If monthly waste fell by 25%, you would waste about <strong>{money(avgMonthly * 0.25)}</strong> less per month. This is an example scenario, not a forecast.
            </li>
          </ul>
          <p className="border-t border-slate-100 pt-2 text-xs text-slate-600">
            How it is calculated: every value uses your <em>purchase price × quantity</em> (what the stock cost you), never the selling price. Waste includes only “expired removed” and “damaged” movements. Supplier returns are not counted as waste. These figures are estimates to help you decide, not promised savings or profit.
          </p>
        </Card>
      </section>
    </div>
  );
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="h-4 w-4" /> Export CSV
    </Button>
  );
}

function Metric({ label, value, sub, tone, className, testId }: { label: string; value: string; sub?: string; tone?: "red" | "amber"; className?: string; testId?: string }) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p data-testid={testId} className={`mt-1 text-2xl font-bold tracking-tight ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
    </Card>
  );
}

function ListCard({ title, rows, empty }: { title: string; empty: string; rows: { key: string; a: string; b: string; c: string; badge: React.ReactNode }[] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.a}</span>
                <span className="block truncate text-xs text-slate-600">
                  {r.b} · {r.c}
                </span>
              </span>
              {r.badge}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
