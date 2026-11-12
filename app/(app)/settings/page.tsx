"use client";

import { Download, LogOut, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ConfirmDialog, Field, Input, PageHeader, Select, Toggle } from "@/components/ui";
import { downloadCSV } from "@/lib/csv";
import { formatDate, formatDateTime } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/expiry";
import { useApp } from "@/lib/store";
import { MOVEMENT_LABELS, type Settings } from "@/lib/types";
import { settingsSchema } from "@/lib/validation";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Dhaka", "Asia/Kathmandu", "Asia/Colombo", "Asia/Karachi", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

export default function SettingsPage() {
  const { settings, saveSettings, mode, userEmail, signOut, loadSample, enableBrowserNotifications, data, views, today, toast } = useApp();
  const router = useRouter();
  const [f, setF] = useState({
    shop_name: settings.shop_name,
    owner_name: settings.owner_name,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    expiry_threshold_days: String(settings.expiry_threshold_days),
    alert_upcoming_days: String(settings.alert_upcoming_days),
    alert_warning_days: String(settings.alert_warning_days),
    alert_high_days: String(settings.alert_high_days),
    alert_critical_days: String(settings.alert_critical_days),
    low_stock_default: String(settings.low_stock_default),
    currency: settings.currency,
    date_format: settings.date_format,
    timezone: settings.timezone,
    in_app_alerts: settings.in_app_alerts,
    browser_notifications: settings.browser_notifications,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);

  const str = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setSaved(false);
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({
      shop_name: f.shop_name,
      owner_name: f.owner_name,
      phone: f.phone,
      email: f.email,
      address: f.address,
      expiry_threshold_days: Number(f.expiry_threshold_days),
      alert_upcoming_days: Number(f.alert_upcoming_days),
      alert_warning_days: Number(f.alert_warning_days),
      alert_high_days: Number(f.alert_high_days),
      alert_critical_days: Number(f.alert_critical_days),
      low_stock_default: Number(f.low_stock_default),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = errs[String(i.path[0])] ?? i.message;
      setErrors(errs);
      toast("Please fix the highlighted settings.", "error");
      return;
    }
    setErrors({});
    setBusy(true);
    const next: Settings = {
      ...settings,
      ...parsed.data,
      currency: f.currency,
      date_format: f.date_format as Settings["date_format"],
      timezone: f.timezone,
      in_app_alerts: f.in_app_alerts,
      browser_notifications: f.browser_notifications,
    };
    const r = await saveSettings(next);
    setBusy(false);
    if (r.ok) {
      setSaved(true);
      toast("Settings saved.");
    } else toast(r.error, "error");
  }

  async function toggleBrowser(on: boolean) {
    if (!on) return setF((s) => ({ ...s, browser_notifications: false }));
    const r = await enableBrowserNotifications();
    if (r.ok) setF((s) => ({ ...s, browser_notifications: true }));
    else toast(r.error, "error");
  }

  const dateF = (d: string) => formatDate(d, settings.date_format);
  function exportInventory() {
    downloadCSV(`expirix-inventory-${today}.csv`, [
      ["Product", "Brand", "Category", "Barcode", "Batch no.", "Quantity", "Unit", "Purchase price", "Selling price", "Purchase date", "Expiry date", "Status"],
      ...views.map((v) => [v.product.name, v.product.brand, v.product.category, v.product.barcode, v.batch.batch_no, v.batch.quantity, v.product.unit, v.batch.purchase_price, v.batch.selling_price, dateF(v.batch.purchase_date), dateF(v.batch.expiry_date), v.empty ? "Empty" : STATUS_LABEL[v.status]]),
    ]);
  }
  function exportMovements() {
    downloadCSV(`expirix-stock-movements-${today}.csv`, [
      ["Date & time", "Product", "Batch", "Type", "Change", "Balance after", "Unit", "Unit cost", "Notes"],
      ...[...data.movements].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => [formatDateTime(m.created_at, settings.date_format, settings.timezone), m.product_name, m.batch_no, MOVEMENT_LABELS[m.type], m.qty_change, m.batch_id ? m.qty_after : null, m.unit, m.unit_cost, m.notes]),
    ]);
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expirix-backup-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function doSample() {
    setBusy(true);
    const r = await loadSample();
    setBusy(false);
    setConfirmReset(false);
    toast(r.ok ? (mode === "demo" ? "Demo data reset to the original sample inventory." : "Sample inventory added.") : r.error, r.ok ? "success" : "error");
  }

  const num = (k: "expiry_threshold_days" | "alert_upcoming_days" | "alert_warning_days" | "alert_high_days" | "alert_critical_days" | "low_stock_default", label: string, hint?: string) => (
    <Field label={label} htmlFor={k} error={errors[k]} hint={hint}>
      <Input id={k} type="number" inputMode="numeric" min="0" value={f[k]} onChange={str(k)} invalid={!!errors[k]} />
    </Field>
  );

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-5" noValidate>
      <PageHeader title="Settings" subtitle="Shop details, alert rules and preferences." />

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold">Shop profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="shop_name" required error={errors.shop_name}>
            <Input id="shop_name" value={f.shop_name} onChange={str("shop_name")} invalid={!!errors.shop_name} />
          </Field>
          <Field label="Owner name" htmlFor="owner_name" required error={errors.owner_name}>
            <Input id="owner_name" value={f.owner_name} onChange={str("owner_name")} invalid={!!errors.owner_name} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" type="tel" value={f.phone} onChange={str("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={f.email} onChange={str("email")} invalid={!!errors.email} />
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2">
            <Input id="address" value={f.address} onChange={str("address")} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-1 text-base font-bold">Expiry & stock rules</h2>
        <p className="mb-4 text-sm text-slate-600">Defaults suit a small kirana store. Change them any time; statuses update straight away.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("expiry_threshold_days", "“Expiring Soon” window (days)", "Batches expiring within this many days are shown as Expiring Soon. Default 7.")}
          {num("low_stock_default", "Default low-stock level (units)", "Used when a product has no minimum of its own.")}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-bold">Alert thresholds (days before expiry)</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num("alert_upcoming_days", "Upcoming")}
          {num("alert_warning_days", "Warning")}
          {num("alert_high_days", "High priority")}
          {num("alert_critical_days", "Critical")}
        </div>
        <p className="mt-2 text-xs text-slate-600">Alerts at “Expires today” and “Expired” are always on. Each must be smaller than the one before.</p>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-2 text-base font-bold">Notifications</h2>
        <Toggle id="in_app" checked={f.in_app_alerts} onChange={(v) => { setF((s) => ({ ...s, in_app_alerts: v })); setSaved(false); }} label="In-app alerts" description="Always shown in Alerts & Notifications and the bell icon." />
        <Toggle id="browser" checked={f.browser_notifications} onChange={(v) => { void toggleBrowser(v); setSaved(false); }} label="Browser notifications" description="A pop-up when new alerts appear while Expirix is open. Your browser will ask for permission. This is not background push, SMS or WhatsApp." />
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold">Region & format</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" value={f.currency} onChange={str("currency")}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="AED">AED (د.إ)</option>
            </Select>
          </Field>
          <Field label="Date format" htmlFor="date_format">
            <Select id="date_format" value={f.date_format} onChange={str("date_format")}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
          </Field>
          <Field label="Time zone" htmlFor="timezone" hint="Decides when “today” changes.">
            <Select id="timezone" value={f.timezone} onChange={str("timezone")}>
              {TIMEZONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        {saved && <span className="text-sm font-medium text-brand-700">Saved ✓</span>}
        <Button type="submit" size="lg" loading={busy}>
          <Save className="h-5 w-5" /> Save settings
        </Button>
      </div>

      <Card className="p-4 sm:p-5" id="data">
        <h2 className="mb-1 text-base font-bold">Your data</h2>
        <p className="mb-4 text-sm text-slate-600">Download your records any time.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportInventory}>
            <Download className="h-4 w-4" /> Inventory (CSV)
          </Button>
          <Button type="button" variant="outline" onClick={exportMovements}>
            <Download className="h-4 w-4" /> Stock movements (CSV)
          </Button>
          <Button type="button" variant="outline" onClick={exportJSON}>
            <Download className="h-4 w-4" /> Full backup (JSON)
          </Button>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          {mode === "demo" ? (
            <>
              <p className="mb-2 text-sm text-slate-700">Demo data is saved only in this browser. Reset it to get the original sample inventory back, with fresh dates relative to today.</p>
              <Button type="button" variant="danger" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-4 w-4" /> Reset demo data
              </Button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-700">Want to explore with realistic examples? Add the sample inventory to your shop (it can be edited or deleted like any other product).</p>
              <Button type="button" variant="outline" onClick={() => setConfirmReset(true)}>
                Add sample inventory
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-2 text-base font-bold">Account & session</h2>
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Mode</dt>
            <dd className="font-medium">{mode === "demo" ? "Demo (stored in this browser only)" : "Cloud account (Supabase)"}</dd>
          </div>
          {mode === "supabase" && (
            <div>
              <dt className="text-xs text-slate-500">Signed in as</dt>
              <dd className="font-medium">{userEmail}</dd>
            </div>
          )}
        </dl>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> {mode === "demo" ? "Exit demo" : "Sign out"}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title={mode === "demo" ? "Reset demo data?" : "Add sample inventory?"}
        confirmLabel={mode === "demo" ? "Reset demo data" : "Add sample inventory"}
        loading={busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doSample}
        body={mode === "demo" ? <p>All changes you made in demo mode (products, movements, alerts) will be replaced by the original sample shop.</p> : <p>About 18 sample products with several batches each will be added to your shop.</p>}
      />
    </form>
  );
}
