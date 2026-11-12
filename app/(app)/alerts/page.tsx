"use client";

import { Bell, BellRing, Check, CheckCheck, Eye, EyeOff, Info, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useUI } from "@/components/ui-context";
import { Button, Card, EmptyState, LevelBadge, LinkButton, PageHeader, Select, cx } from "@/components/ui";
import { LEVEL_LABEL, LEVEL_RANK, isActiveAlert } from "@/lib/alerts";
import { daysLabel, formatDate, formatDateTime } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { ALERT_LEVELS, type AlertLevel } from "@/lib/types";

type Tab = "active" | "unread" | "history";

export default function AlertsPage() {
  const { data, views, settings, markRead, dismiss, enableBrowserNotifications, saveSettings, toast, mode } = useApp();
  const { openMovement } = useUI();
  const [tab, setTab] = useState<Tab>("active");
  const [level, setLevel] = useState<"" | AlertLevel>("");

  const batchById = useMemo(() => new Map(views.map((v) => [v.batch.id, v])), [views]);
  const all = data.notifications;
  const active = all.filter(isActiveAlert);
  const unread = active.filter((n) => !n.read);
  const list = useMemo(() => {
    const base = tab === "active" ? active : tab === "unread" ? unread : all.filter((n) => !isActiveAlert(n));
    return base
      .filter((n) => !level || n.level === level)
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.expiry_date.localeCompare(b.expiry_date) || b.created_at.localeCompare(a.created_at));
  }, [all, active, unread, tab, level]);

  const supported = typeof Notification !== "undefined";
  const perm = supported ? Notification.permission : "denied";

  return (
    <div>
      <PageHeader
        title="Alerts & Notifications"
        subtitle={unread.length ? `${unread.length} unread · ${active.length} active` : `${active.length} active alert${active.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="outline" disabled={unread.length === 0} onClick={() => void markRead(unread.map((n) => n.id))}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 text-sky-700" /> How alerts work
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>
              One alert per batch for the current level: <strong>Upcoming</strong> ({settings.alert_upcoming_days}d), <strong>Warning</strong> ({settings.alert_warning_days}d), <strong>High priority</strong> ({settings.alert_high_days}d), <strong>Critical</strong> ({settings.alert_critical_days}d), <strong>Expires today</strong>, <strong>Expired</strong>.
            </li>
            <li>No duplicates. When a batch moves to the next level, the older alert moves to History.</li>
            <li>Dismissing an alert only hides it. The batch stays flagged in your inventory and expired stock is never sellable.</li>
            <li>{mode === "supabase" ? "Alerts are created when you open Expirix and by a daily server job." : "Demo mode: alerts are created whenever you open Expirix. Background reminders need the cloud setup."}</li>
          </ul>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4 text-brand-700" /> Browser notifications
          </p>
          {!supported ? (
            <p className="mt-2 text-sm text-slate-700">This browser does not support notifications. In-app alerts still work.</p>
          ) : settings.browser_notifications && perm === "granted" ? (
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <p>On. You get a pop-up when new alerts are created while Expirix is open in your browser.</p>
              <Button size="sm" variant="outline" onClick={() => void saveSettings({ ...settings, browser_notifications: false }).then((r) => toast(r.ok ? "Browser notifications turned off." : r.error, r.ok ? "info" : "error"))}>
                Turn off
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <p>
                {perm === "denied"
                  ? "Notifications are blocked for this site. Allow them in your browser’s site settings, then come back."
                  : "Get a pop-up when new alerts appear. This works only while Expirix is open. It is not a background push or SMS service."}
              </p>
              {perm !== "denied" && (
                <Button
                  size="sm"
                  onClick={async () => {
                    const r = await enableBrowserNotifications();
                    toast(r.ok ? "Browser notifications are on." : r.error, r.ok ? "success" : "error");
                  }}
                >
                  Enable browser notifications
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Alert views">
          {(
            [
              ["active", `Active (${active.length})`],
              ["unread", `Unread (${unread.length})`],
              ["history", "History"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cx("min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold", tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>
              {label}
            </button>
          ))}
        </div>
        <Select aria-label="Filter by severity" value={level} onChange={(e) => setLevel(e.target.value as AlertLevel | "")} className="sm:max-w-52">
          <option value="">All severities</option>
          {ALERT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </Select>
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell className="h-6 w-6" />} title={tab === "history" ? "No past alerts" : "You’re all caught up"}>
            {tab === "history" ? "Alerts you dismiss or that move to a newer level show up here." : "No alerts need attention right now."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="alert-list">
          {list.map((n) => {
            const live = batchById.get(n.batch_id);
            const qty = live ? live.batch.quantity : n.quantity;
            const days = live?.days;
            const isHistory = !isActiveAlert(n);
            return (
              <li key={n.id}>
                <Card className={cx("p-4", !n.read && !isHistory && "border-l-4 border-l-brand-600", n.level === "expired" && !isHistory && "bg-red-50/50")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <LevelBadge level={n.level} />
                        {!n.read && !isHistory && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">New</span>}
                        {isHistory && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{n.dismissed ? "Dismissed" : n.resolved ? "Updated / resolved" : ""}</span>}
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold text-slate-900">{n.title}</h3>
                    </div>
                    <p className="text-xs text-slate-600">{formatDateTime(n.created_at, settings.date_format, settings.timezone)}</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-slate-500">Batch</dt>
                      <dd>{n.batch_no ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Quantity remaining</dt>
                      <dd className="font-semibold">{qty}{live ? ` ${live.product.unit}` : ""}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Expiry date</dt>
                      <dd>{formatDate(n.expiry_date, settings.date_format)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Today</dt>
                      <dd className={cx(days !== undefined && days <= 1 && "font-semibold text-red-700")}>{days !== undefined ? daysLabel(days) : "—"}</dd>
                    </div>
                  </dl>
                  {n.level === "expired" && !isHistory && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-900">Do not sell. Remove this batch from the shelf and record the removal.</p>}
                  {!isHistory && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <LinkButton href={`/inventory/${n.product_id}`} variant="outline" size="sm">
                        View Product
                      </LinkButton>
                      {n.level === "expired" && live && !live.empty && (
                        <Button size="sm" variant="danger" onClick={() => openMovement({ batchId: n.batch_id, type: "expired_removed", quantity: live.batch.quantity })}>
                          Mark as removed
                        </Button>
                      )}
                      {n.read ? (
                        <Button size="sm" variant="ghost" onClick={() => void markRead([n.id], false)}>
                          <EyeOff className="h-4 w-4" /> Mark as unread
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => void markRead([n.id])}>
                          <Check className="h-4 w-4" /> Mark as Read
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void dismiss([n.id])}>
                        <X className="h-4 w-4" /> Dismiss
                      </Button>
                    </div>
                  )}
                  {isHistory && live && (
                    <p className="mt-3 text-xs text-slate-600">
                      <Eye className="mr-1 inline h-3.5 w-3.5" />
                      <Link className="font-semibold text-brand-700 hover:underline" href={`/inventory/${n.product_id}`}>
                        View product
                      </Link>
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
