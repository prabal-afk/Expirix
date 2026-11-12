"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState, PageHeader, Select, SectionTitle, StatusBadge, cx } from "@/components/ui";
import { addDays, addMonths, daysBetween, daysLabel, formatDate, monthKey } from "@/lib/dates";
import type { BatchView } from "@/lib/expiry";
import { formatNumber } from "@/lib/format";
import { useApp } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const { views, settings, today } = useApp();
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(
    () => views.filter((v) => !v.empty && (!category || v.product.category === category) && (!status || v.status === status)),
    [views, category, status],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, BatchView[]>();
    for (const v of rows) {
      const a = m.get(v.batch.expiry_date) ?? [];
      a.push(v);
      m.set(v.batch.expiry_date, a);
    }
    return m;
  }, [rows]);

  const first = `${month}-01`;
  const startWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const daysInMonth = daysBetween(first, addMonths(first, 1));
  const cells: (string | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);

  const [y, m] = month.split("-").map(Number);
  const monthRows = rows.filter((v) => v.batch.expiry_date.startsWith(month));
  const selectedRows = (byDate.get(selected) ?? []).sort((a, b) => a.product.name.localeCompare(b.product.name));
  const upcoming = rows.filter((v) => v.days >= 0).sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date) || a.product.name.localeCompare(b.product.name)).slice(0, 10);

  function tone(date: string) {
    const d = daysBetween(today, date);
    if (d < 0) return "bg-red-600 text-white";
    if (d === 0) return "bg-red-100 text-red-800 ring-1 ring-red-300";
    if (d <= settings.expiry_threshold_days) return "bg-amber-100 text-amber-900";
    return "bg-brand-100 text-brand-800";
  }

  function go(delta: number) {
    const next = monthKey(addMonths(first, delta));
    setMonth(next);
  }

  return (
    <div>
      <PageHeader title="Expiry Calendar" subtitle="See which days stock expires. Tap a date to see the products." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:max-w-56">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-56">
          <option value="">All statuses</option>
          <option value="expired">Expired</option>
          <option value="today">Expiring Today</option>
          <option value="soon">Expiring Soon</option>
          <option value="safe">Safe</option>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold" aria-live="polite">
              {MONTHS[m - 1]} {y}
            </h2>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" aria-label="Previous month" onClick={() => go(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMonth(monthKey(today));
                  setSelected(today);
                }}
              >
                Today
              </Button>
              <Button variant="outline" size="sm" aria-label="Next month" onClick={() => go(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-600">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS[m - 1]} ${y} expiry calendar`}>
            {cells.map((date, i) => {
              if (!date) return <div key={`b${i}`} />;
              const list = byDate.get(date) ?? [];
              const isSel = date === selected;
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-date={date}
                  aria-label={`${Number(date.slice(8))} ${MONTHS[m - 1]}, ${list.length} batch${list.length === 1 ? "" : "es"} expiring`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(date)}
                  className={cx(
                    "flex aspect-square min-h-12 flex-col items-center justify-between rounded-xl border p-1 text-sm sm:aspect-[5/4] sm:p-1.5",
                    isSel ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/40" : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <span className={cx("grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold", isToday ? "bg-slate-900 text-white" : "text-slate-800")}>{Number(date.slice(8))}</span>
                  {list.length > 0 && <span className={cx("mb-0.5 min-w-6 rounded-full px-1.5 text-xs font-bold", tone(date))}>{list.length}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <Key cls="bg-red-600" label="Already expired" />
            <Key cls="bg-red-200" label="Today" />
            <Key cls="bg-amber-200" label={`Within ${settings.expiry_threshold_days} days`} />
            <Key cls="bg-brand-200" label="Later" />
          </p>
          <p className="mt-2 text-sm text-slate-700">
            This month: <strong>{monthRows.length}</strong> batch{monthRows.length === 1 ? "" : "es"} · <strong>{formatNumber(monthRows.reduce((s, v) => s + v.batch.quantity, 0))}</strong> units expire.
          </p>
        </Card>

        <div className="space-y-4">
          <section aria-live="polite">
            <SectionTitle>Expiring on {formatDate(selected, settings.date_format)}</SectionTitle>
            <Card className="divide-y divide-slate-100" data-testid="day-list">
              {selectedRows.length === 0 ? (
                <EmptyState title="Nothing expires this day">Pick another date on the calendar.</EmptyState>
              ) : (
                selectedRows.map((v) => <Item key={v.batch.id} v={v} />)
              )}
            </Card>
          </section>
          <section>
            <SectionTitle>Upcoming expiries</SectionTitle>
            <Card className="divide-y divide-slate-100">
              {upcoming.length === 0 ? <EmptyState title="No upcoming expiries" /> : upcoming.map((v) => <Item key={v.batch.id} v={v} showDate />)}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-3 w-3 rounded", cls)} /> {label}
    </span>
  );
}

function Item({ v, showDate }: { v: BatchView; showDate?: boolean }) {
  const { settings } = useApp();
  return (
    <Link href={`/inventory/${v.product.id}`} className="flex items-center justify-between gap-3 p-3.5 hover:bg-slate-50">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{v.product.name}</p>
        <p className="text-xs text-slate-600">
          {v.product.brand} · batch {v.batch.batch_no ?? "—"} · {v.batch.quantity} {v.product.unit}
        </p>
        {showDate && (
          <p className="text-xs font-medium text-slate-700">
            {formatDate(v.batch.expiry_date, settings.date_format)} · {daysLabel(v.days).replace("Expires ", "")}
          </p>
        )}
      </div>
      <StatusBadge status={v.status} />
    </Link>
  );
}
