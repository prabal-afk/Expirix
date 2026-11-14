"use client";

import { t } from "@/lib/i18n-core";
import { AlertTriangle, Boxes, Package, PackageX, Plus, ScanBarcode, Timer, TrendingDown, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GettingStarted } from "@/components/getting-started";
import { useUI } from "@/components/ui-context";
import { Button, Card, EmptyState, LinkButton, PageHeader, SectionTitle, cx } from "@/components/ui";
import { addDays, daysLabel, formatDate } from "@/lib/dates";
import { expiryBuckets, expiryByDay, suggestAction, urgencyOf, type BatchView } from "@/lib/expiry";
import { formatMoney, formatNumber } from "@/lib/format";
import { lastMonthsWaste } from "@/lib/reports";
import { useApp } from "@/lib/store";

const COLORS = { red: "#dc2626", orange: "#ea580c", amber: "#d97706", green: "#16a34a", blue: "#2563eb", slate: "#64748b" };

export default function DashboardPage() {
  const { views, metrics, settings, today, data } = useApp();
  const { openScanner, openMovement } = useUI();
  const money = (n: number) => formatMoney(n, settings.currency);
  const buckets = useMemo(() => expiryBuckets(views), [views]);
  const byDay = useMemo(() => expiryByDay(views, today, 30), [views, today]);
  const loss = useMemo(() => lastMonthsWaste(data.movements, today, 6, settings.timezone), [data.movements, today, settings.timezone]);
  const lossTotal = loss.reduce((s, m) => s + m.cost, 0);

  const urgent = useMemo(
    () =>
      views
        .filter((v) => !v.empty && v.days <= 30)
        .sort((a, b) => a.days - b.days || b.value - a.value),
    [views],
  );

  const doughnut = [
    { name: "Expired", value: buckets[0].units, color: COLORS.red },
    { name: "Expiring today", value: buckets[1].units, color: COLORS.orange },
    {
      name: `Expiring soon (1–${settings.expiry_threshold_days} days)`,
      value: views.filter((v) => !v.empty && v.days >= 1 && v.days <= settings.expiry_threshold_days).reduce((s, v) => s + v.batch.quantity, 0),
      color: COLORS.amber,
    },
    { name: "Safe", value: views.filter((v) => !v.empty && v.days > settings.expiry_threshold_days).reduce((s, v) => s + v.batch.quantity, 0), color: COLORS.green },
  ];
  const doughnutTotal = doughnut.reduce((s, d) => s + d.value, 0);

  const cards: { label: string; value: string; sub: ReactNode; href: string; icon: ReactNode; tone: string }[] = [
    { label: "Total Products", value: formatNumber(metrics.totalProducts), sub: "product records", href: "/inventory", icon: <Package className="h-5 w-5" />, tone: "text-sky-700 bg-sky-50" },
    {
      label: "Total Stock Units",
      value: formatNumber(metrics.totalUnits),
      sub: `${formatNumber(metrics.sellableUnits)} sellable · ${formatNumber(metrics.expiredUnits)} expired`,
      href: "/inventory",
      icon: <Boxes className="h-5 w-5" />,
      tone: "text-brand-700 bg-brand-50",
    },
    {
      label: "Expiring Soon",
      value: formatNumber(metrics.expiringSoonBatches),
      sub: `batches in next ${settings.expiry_threshold_days} days · ${formatNumber(metrics.expiringSoonUnits)} units`,
      href: "/inventory?status=expiring",
      icon: <Timer className="h-5 w-5" />,
      tone: "text-amber-800 bg-amber-50",
    },
    {
      label: "Expired Products",
      value: formatNumber(metrics.expiredBatches),
      sub: metrics.expiredBatches ? `${formatNumber(metrics.expiredUnits)} units to remove` : "nothing expired",
      href: "/inventory?status=expired",
      icon: <PackageX className="h-5 w-5" />,
      tone: "text-red-700 bg-red-50",
    },
    {
      label: "Low Stock",
      value: formatNumber(metrics.lowStockProducts),
      sub: "below minimum level",
      href: "/inventory?status=low",
      icon: <TrendingDown className="h-5 w-5" />,
      tone: "text-orange-800 bg-orange-50",
    },
    {
      label: "Potential Loss",
      value: money(metrics.potentialLoss),
      sub: `${money(metrics.expiredCost)} expired + ${money(metrics.atRiskCost)} at risk (est.)`,
      href: "/reports#financial",
      icon: <Wallet className="h-5 w-5" />,
      tone: "text-red-700 bg-red-50",
    },
  ];

  const dayOffset = (n: number) => addDays(today, n);
  const bucketLinks: Record<string, string> = {
    expired: "/inventory?status=expired",
    today: "/inventory?status=today",
    d3: `/inventory?from=${dayOffset(1)}&to=${dayOffset(3)}`,
    d7: `/inventory?from=${dayOffset(4)}&to=${dayOffset(7)}`,
    d30: `/inventory?from=${dayOffset(8)}&to=${dayOffset(30)}`,
    safe: `/inventory?from=${dayOffset(31)}`,
  };
  const bucketTone: Record<string, string> = {
    expired: "border-red-300 bg-red-50 text-red-800",
    today: "border-red-200 bg-red-50/60 text-red-800",
    d3: "border-orange-200 bg-orange-50 text-orange-900",
    d7: "border-amber-200 bg-amber-50 text-amber-900",
    d30: "border-sky-200 bg-sky-50 text-sky-900",
    safe: "border-brand-200 bg-brand-50 text-brand-800",
  };

  const empty = data.products.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Dashboard")}
        subtitle={
          <>
            {t("What needs attention at")} <strong>{settings.shop_name}</strong> · {formatDate(today, settings.date_format)}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={openScanner}>
              <ScanBarcode className="h-5 w-5" /> {t("Scan")}
            </Button>
            <LinkButton href="/inventory/add" size="lg">
              <Plus className="h-5 w-5" /> {t("Add Product")}
            </LinkButton>
          </>
        }
      />

      {empty ? (
        <GettingStarted />
      ) : (
        <>
          {metrics.expiredBatches > 0 && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2.5 text-sm font-medium text-red-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  {metrics.expiredBatches} expired batch{metrics.expiredBatches > 1 ? "es" : ""} ({formatNumber(metrics.expiredUnits)} units, {money(metrics.expiredCost)}) still counted in your stock. Do not sell them. Remove them and record the waste.
                </span>
              </p>
              <LinkButton href="/inventory?status=expired" variant="danger">
                Review expired stock
              </LinkButton>
            </div>
          )}

          {/* ---------------- summary cards ---------------- */}
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {cards.map((c) => (
              <Link key={c.label} href={c.href} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-brand-300 hover:shadow-md">
                <span className={cx("mb-3 grid h-9 w-9 place-items-center rounded-xl", c.tone)}>{c.icon}</span>
                <p className="text-2xl font-bold tracking-tight text-slate-900">{c.value}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{c.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-600">{c.sub}</p>
              </Link>
            ))}
          </section>

          {/* ---------------- expiry overview ---------------- */}
          <section>
            <SectionTitle>{t("Expiry overview")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {buckets.map((b) => (
                <Link key={b.key} href={bucketLinks[b.key]} className={cx("rounded-2xl border p-3.5 transition hover:shadow-md", bucketTone[b.key])}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{b.label}</p>
                  <p className="mt-1 text-2xl font-bold">{b.batches}</p>
                  <p className="text-xs opacity-90">
                    batch{b.batches === 1 ? "" : "es"} · {formatNumber(b.units)} units
                  </p>
                </Link>
              ))}
            </div>
          </section>

          {/* ---------------- urgent attention ---------------- */}
          <section>
            <SectionTitle
              action={
                <Link href="/inventory?status=expiring" className="text-sm font-semibold text-brand-700 hover:underline">
                  View all expiring
                </Link>
              }
            >
              Needs attention now
            </SectionTitle>
            <Card className="divide-y divide-slate-100">
              {urgent.length === 0 ? (
                <EmptyState title={t("Nothing needs attention")}>{t("No batch is expired or expiring in the next 30 days. Nice work.")}</EmptyState>
              ) : (
                urgent.slice(0, 8).map((v) => (
                  <UrgentRow
                    key={v.batch.id}
                    v={v}
                    others={views.filter((x) => x.product.id === v.product.id && x.sellable && x.batch.id !== v.batch.id).length}
                    onRemove={() => openMovement({ batchId: v.batch.id, type: "expired_removed", quantity: v.batch.quantity })}
                    onUpdate={() => openMovement({ batchId: v.batch.id, type: "sold" })}
                  />
                ))
              )}
            </Card>
            {urgent.length > 8 && <p className="mt-2 text-center text-sm text-slate-600">Showing 8 of {urgent.length}. <Link className="font-semibold text-brand-700 hover:underline" href={`/inventory?to=${dayOffset(30)}`}>{t("See all in Inventory")}</Link></p>}
          </section>

          {/* ---------------- charts ---------------- */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 lg:col-span-2">
              <SectionTitle>{t("Batches expiring over the next 30 days")}</SectionTitle>
              <div className="h-64" role="img" aria-label="Bar chart of the number of batches expiring on each of the next 30 days">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="offset" tickFormatter={(o: number) => (o === 0 ? "Today" : `+${o}`)} interval={2} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "#f1f5f9" }}
                      formatter={(value, name) => [value, name === "batches" ? "Batches" : String(name)]}
                      labelFormatter={(_l, p) => {
                        const d = p?.[0]?.payload as { date: string; units: number } | undefined;
                        return d ? `${formatDate(d.date, settings.date_format)} · ${d.units} units` : "";
                      }}
                    />
                    <Bar dataKey="batches" radius={[4, 4, 0, 0]}>
                      {byDay.map((d) => (
                        <Cell key={d.date} fill={d.offset === 0 ? COLORS.red : d.offset <= settings.expiry_threshold_days ? COLORS.amber : COLORS.blue} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-600">
                <Legend color={COLORS.red} label={t("Today")} />
                <Legend color={COLORS.amber} label={`Within ${settings.expiry_threshold_days} days`} />
                <Legend color={COLORS.blue} label={t("Later")} />
              </p>
            </Card>

            <Card className="p-4">
              <SectionTitle>{t("Inventory by expiry status (units)")}</SectionTitle>
              {doughnutTotal === 0 ? (
                <EmptyState title={t("No stock yet")} />
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-52 w-52 shrink-0" role="img" aria-label="Doughnut chart of units by expiry status">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={doughnut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
                          {doughnut.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${v} units`, String(n)]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full space-y-2 text-sm">
                    {doughnut.map((d) => (
                      <li key={d.name} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          {d.name}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatNumber(d.value)} <span className="font-normal text-slate-500">({Math.round((d.value / doughnutTotal) * 100)}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>{t("Estimated loss over time")}</SectionTitle>
              {lossTotal === 0 ? (
                <EmptyState title={t("No waste recorded yet")}>{t("When you remove expired or damaged stock, the cost appears here.")}</EmptyState>
              ) : (
                <>
                  <div className="h-52" role="img" aria-label="Line chart of recorded waste cost per month for the last 6 months">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={loss} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v) => [money(Number(v)), "Waste cost"]} />
                        <Line type="monotone" dataKey="cost" stroke={COLORS.red} strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">Recorded expired + damaged stock at purchase price. Last 6 months total: <strong>{money(lossTotal)}</strong>.</p>
                </>
              )}
            </Card>
          </section>

          {/* ---------------- quick actions ---------------- */}
          <section aria-label={t("Quick actions")}>
            <SectionTitle>{t("Quick actions")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <QuickTile href="/inventory/add" icon={<Plus className="h-5 w-5" />} label={t("Add Product")} />
              <QuickTile onClick={openScanner} icon={<ScanBarcode className="h-5 w-5" />} label={t("Scan Barcode")} />
              <QuickTile href="/inventory?status=expiring" icon={<Timer className="h-5 w-5" />} label={t("View Expiring Items")} />
              <QuickTile href="/inventory?status=expired" icon={<PackageX className="h-5 w-5" />} label={t("View Expired Stock")} />
              <QuickTile onClick={() => openMovement()} icon={<Truck className="h-5 w-5" />} label={t("Record Stock Movement")} />
            </div>
          </section>
          
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

function QuickTile({ href, onClick, icon, label }: { href?: string; onClick?: () => void; icon: ReactNode; label: string }) {
  const cls = "flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-brand-300 hover:bg-brand-50/40";
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function UrgentRow({ v, others, onRemove, onUpdate }: { v: BatchView; others: number; onRemove: () => void; onUpdate: () => void }) {
  const { settings } = useApp();
  const urgency = urgencyOf(v.days, settings.expiry_threshold_days);
  const action = suggestAction(v, settings.expiry_threshold_days, others);
  const badge = {
    urgent: "bg-red-600 text-white",
    warning: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300",
    monitor: "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-200",
  }[urgency];
  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 lg:w-[30%]">
        <div className="flex items-center gap-2">
          <Link href={`/inventory/${v.product.id}`} className="truncate font-semibold text-slate-900 hover:underline">
            {v.product.name}
          </Link>
          <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide", badge)}>{urgency}</span>
        </div>
        <p className="text-sm text-slate-600">
          {v.product.brand} · Batch {v.batch.batch_no ?? "—"}
        </p>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4 lg:w-[40%]">
        <Info label={t("Quantity")} value={`${v.batch.quantity} ${v.product.unit}`} />
        <Info label={t("Expiry date")} value={formatDate(v.batch.expiry_date, settings.date_format)} />
        <Info label={t("Status")} value={daysLabel(v.days)} strong={v.days <= 1} />
        <Info label={t("Stock value")} value={formatMoney(v.value, settings.currency)} />
      </div>
      <div className="lg:w-[30%]">
        <p className={cx("text-sm font-medium", action.tone === "red" ? "text-red-800" : action.tone === "amber" ? "text-amber-900" : "text-slate-700")}>{action.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <LinkButton href={`/inventory/${v.product.id}`} variant="outline" size="sm">
            View Product
          </LinkButton>
          {v.days < 0 ? (
            <Button size="sm" variant="danger" onClick={onRemove}>
              Mark as Removed
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onUpdate}>
              Update Quantity
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx("font-medium text-slate-900", strong && "font-bold text-red-700")}>{value}</p>
    </div>
  );
}
