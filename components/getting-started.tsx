"use client";

import { t } from "@/lib/i18n-core";
import { Check, PackagePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, ConfirmDialog, LinkButton } from "@/components/ui";
import { useApp } from "@/lib/store";

/** Shown on the dashboard while a shop has no products yet. */
export function GettingStarted() {
  const { settings, mode, loadSample, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const shopNamed = Boolean(settings.shop_name) && settings.shop_name !== "My Shop";

  const steps = [
    { done: false, title: "Add your first product", text: "Enter its name, quantity and expiry date. A barcode is optional.", href: "/inventory/add", cta: "Add product" },
    { done: shopNamed && Boolean(settings.phone || settings.address), title: "Fill in your shop details", text: "Shop name, phone and address, and how many days before expiry you want warnings.", href: "/settings", cta: "Open settings" },
    ...(mode === "supabase"
      ? [{ done: settings.email_digest, title: "Choose how you get alerts", text: "A daily email summary and push alerts on your phone, so you hear about expiring stock even when the app is closed.", href: "/settings#delivery", cta: "Set up alerts" }]
      : []),
  ];

  async function fill() {
    setBusy(true);
    const r = await loadSample();
    setBusy(false);
    setConfirm(false);
    toast(r.ok ? "Sample products added. You can delete them any time." : r.error, r.ok ? "success" : "error");
  }

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">Welcome to {settings.shop_name || "Expirix"}</h2>
            <p className="mt-0.5 text-sm text-slate-600">{t("Three quick steps and Expirix starts watching your shelves.")}</p>
          </div>
        </div>
        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${s.done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
                  aria-label={s.done ? "Done" : `Step ${i + 1}`}
                >
                  {s.done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600">{s.text}</p>
                </div>
              </div>
              {i === 0 ? (
                <LinkButton href={s.href}>
                  <PackagePlus className="h-5 w-5" /> {s.cta}
                </LinkButton>
              ) : (
                <Link href={s.href} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">Just looking around? Fill the shop with sample products to see how everything works.</p>
          <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
            {t("Fill with sample products")}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Add sample products?"
        confirmLabel="Add sample products"
        loading={busy}
        onConfirm={() => void fill()}
        onCancel={() => setConfirm(false)}
        body={<p>This adds about 18 example products with batches that expire on different dates, so the dashboard and alerts have something to show. You can delete them later.</p>}
      />
    </>
  );
}
