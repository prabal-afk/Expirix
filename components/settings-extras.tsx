"use client";

import { t } from "@/lib/i18n-core";
import { Download, Mail, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Input, Modal, Toggle } from "@/components/ui";
import { disablePush, enablePush, pushIsOn, pushKeyPresent, pushSupported, sendTest } from "@/lib/push";
import { useApp } from "@/lib/store";
import { getSupabase } from "@/lib/supabase/client";

/** Email summary, push alerts and app install. Cloud accounts only (demo mode has no server to send from). */
export function DeliveryCard() {
  const { mode, settings, saveSettings, userEmail, toast } = useApp();
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<"email" | "push" | "test-email" | "test-push" | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    void pushIsOn().then(setPushOn);
    const check = () => setCanInstall(Boolean((window as unknown as { __installPrompt?: Event }).__installPrompt));
    check();
    window.addEventListener("expirix:installable", check);
    return () => window.removeEventListener("expirix:installable", check);
  }, []);

  async function toggleEmail(on: boolean) {
    setBusy("email");
    const r = await saveSettings({ ...settings, email_digest: on });
    setBusy(null);
    toast(r.ok ? (on ? "Daily email summary is on." : "Daily email summary is off.") : r.error, r.ok ? "success" : "error");
  }
  async function togglePush(on: boolean) {
    setBusy("push");
    const r = on ? await enablePush() : await disablePush();
    setBusy(null);
    if (r.ok) {
      setPushOn(on);
      toast(on ? "Push alerts are on for this device." : "Push alerts are off for this device.");
    } else toast(r.error, "error");
  }
  async function test(channel: "email" | "push") {
    setBusy(channel === "email" ? "test-email" : "test-push");
    const r = await sendTest(channel);
    setBusy(null);
    toast(r.ok ? r.detail : r.error, r.ok ? "success" : "error");
  }
  async function install() {
    const ev = (window as unknown as { __installPrompt?: Event & { prompt?: () => Promise<void> } }).__installPrompt;
    if (!ev?.prompt) return;
    await ev.prompt();
    (window as unknown as { __installPrompt?: Event }).__installPrompt = undefined;
    setCanInstall(false);
  }

  return (
    <Card className="p-4 sm:p-5" id="delivery">
      <h2 className="mb-1 text-base font-bold">{t("Alerts on your phone and email")}</h2>
      <p className="mb-3 text-sm text-slate-600">Get told about expired and expiring items even when Expirix is closed. A summary goes out every morning, only when something needs attention.</p>

      {mode !== "supabase" ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Email and push alerts need a real account. Sign out of the demo and create an account to turn them on.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          <div className="pb-3">
            <Toggle
              id="email_digest"
              checked={settings.email_digest}
              onChange={(v) => void toggleEmail(v)}
              label={t("Daily email summary")}
              description={`Sent to ${userEmail ?? "your login email"}. Lists what is expired, expiring today or tomorrow, and expiring soon.`}
            />
            <Button type="button" variant="outline" size="sm" className="mt-1" loading={busy === "test-email"} onClick={() => void test("email")}>
              <Mail className="h-4 w-4" /> {t("Send me a test email")}
            </Button>
          </div>
          <div className="py-3">
            <Toggle
              id="push_on"
              checked={pushOn}
              onChange={(v) => void togglePush(v)}
              label={t("Push alerts on this device")}
              description={
                !pushKeyPresent()
                  ? "Not set up on the server yet."
                  : pushSupported()
                    ? "A notification on this phone or computer each morning. Turn it on for each device you use."
                    : "This browser cannot receive push alerts. On iPhone, tap Share, then Add to Home Screen, and open Expirix from there."
              }
            />
            {pushOn && (
              <Button type="button" variant="outline" size="sm" className="mt-1" loading={busy === "test-push"} onClick={() => void test("push")}>
                <Smartphone className="h-4 w-4" /> {t("Send a test notification")}
              </Button>
            )}
          </div>
          <div className="pt-3">
            <p className="text-sm font-semibold text-slate-900">{t("Install Expirix")}</p>
            <p className="mt-0.5 text-sm text-slate-600">Add it to your home screen so it opens like an app, full screen.</p>
            {canInstall ? (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void install()}>
                <Download className="h-4 w-4" /> Install on this device
              </Button>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Android Chrome: menu, then Install app. iPhone Safari: Share, then Add to Home Screen.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Full backup download and (cloud accounts) permanent account deletion. */
export function AccountCard() {
  const { mode, data, signOut, toast, userEmail } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  function backup() {
    const payload = { app: "Expirix", exportedAt: new Date().toISOString(), shop: data.settings.shop_name, ...data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expirix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup downloaded.");
  }

  async function deleteAccount() {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      toast(error.message.includes("delete_my_account") ? "Account deletion is not set up in the database yet. Run supabase/update-2026-11.sql." : error.message, "error");
      return;
    }
    toast("Your account and all its data were deleted.");
    setOpen(false);
    await signOut();
  }

  return (
    <>
      <Card className="p-4 sm:p-5" id="backup">
        <h2 className="mb-1 text-base font-bold">{t("Backup and delete")}</h2>
        <p className="mb-3 text-sm text-slate-600">
          The backup is one file with your products, batches, stock history, alerts and settings. Keep it somewhere safe.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={backup}>
            <Download className="h-4 w-4" /> {t("Download full backup (JSON)")}
          </Button>
          {mode === "supabase" && (
            <Button type="button" variant="danger" onClick={() => { setTyped(""); setOpen(true); }}>
              <Trash2 className="h-4 w-4" /> {t("Delete my account")}
            </Button>
          )}
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?" size="sm">
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            This permanently deletes <strong>{userEmail}</strong>, your shop, every product, batch, stock record and alert. It cannot be undone. Download a backup first if you may need the data.
          </p>
          <label htmlFor="del-confirm" className="block font-semibold text-slate-900">
            Type DELETE to confirm
          </label>
          <Input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("Cancel")}
          </Button>
          <Button variant="danger" disabled={typed.trim() !== "DELETE"} loading={busy} onClick={() => void deleteAccount()}>
            Delete everything
          </Button>
        </div>
      </Modal>
    </>
  );
}
