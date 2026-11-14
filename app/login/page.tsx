"use client";

import { t } from "@/lib/i18n-core";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitch } from "@/lib/i18n";
import { LoginArt } from "@/components/login-art";
import { Info, ShieldCheck, Timer, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shell";
import { Button, Card, Field, Input } from "@/components/ui";
import { useApp } from "@/lib/store";

export default function LoginPage() {
  const { phase, supabaseConfigured, signIn, signUp, requestPasswordReset, enterDemo } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shop, setShop] = useState("");
  const [owner, setOwner] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase === "ready") router.replace("/dashboard");
  }, [phase, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Enter a valid email address.");
    if (forgot) {
      setBusy(true);
      const r = await requestPasswordReset(email);
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      return setInfo("If that email has an account, a reset link is on its way. Check your inbox and spam folder.");
    }
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    if (tab === "up" && !shop.trim()) return setErr("Enter your shop name.");
    setBusy(true);
    if (tab === "in") {
      const r = await signIn(email, password);
      if (!r.ok) setErr(r.error);
    } else {
      const r = await signUp(email, password, shop, owner);
      if (!r.ok) setErr(r.error);
      else if (r.needsConfirmation) setInfo("Account created. Check your email and tap the confirmation link, then sign in.");
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-800 p-12 text-white lg:flex">
        <LoginArt />
        <span className="relative inline-flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-700">
            <BrandMark className="h-7 w-7" cut="#ffffff" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight">Expirix</span>
        </span>
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">{t("Track Expiry.")}<br />{t("Reduce Waste.")}<br />{t("Sell Fresh.")}</h2>
          <ul className="mt-8 space-y-4 text-brand-100">
            <li className="flex gap-3"><Timer className="mt-0.5 h-5 w-5 shrink-0" /> {t("See what is expiring before it becomes a loss.")}</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> {t("Keep expired products off the shelf and customers safe.")}</li>
            <li className="flex gap-3"><TrendingDown className="mt-0.5 h-5 w-5 shrink-0" /> {t("Know exactly how much money waste is costing you.")}</li>
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">{t("Built for kirana stores and small shops.")}</p>
      </div>

      <div className="relative flex items-center justify-center p-5">
        <LanguageSwitch className="absolute right-4 top-4" />
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Logo />
            <p className="mt-1.5 text-sm font-medium text-brand-700">{t("Track Expiry. Reduce Waste. Sell Fresh.")}</p>
          </div>
          <Card className="p-6">
            {supabaseConfigured ? (
              <>
                <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist">
                  {(["in", "up"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      type="button"
                      onClick={() => {
                        setTab(t); setForgot(false);
                        setErr("");
                        setInfo("");
                      }}
                      className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
                    >
                      {t === "in" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
                <form onSubmit={submit} className="space-y-4" noValidate>
                  {tab === "up" && (
                    <>
                      <Field label={t("Shop name")} htmlFor="shop" required>
                        <Input id="shop" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="e.g. Rajesh Kirana Store" autoComplete="organization" />
                      </Field>
                      <Field label={t("Your name")} htmlFor="owner">
                        <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Rajesh Kumar" autoComplete="name" />
                      </Field>
                    </>
                  )}
                  <Field label={t("Email")} htmlFor="email" required>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
                  </Field>
                  {!forgot && (
                    <Field label={t("Password")} htmlFor="password" required hint={tab === "up" ? "At least 6 characters." : undefined}>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "in" ? "current-password" : "new-password"} />
                    </Field>
                  )}
                  {forgot && <p className="text-sm text-slate-600">{t("Enter your email and we will send a link to choose a new password.")}</p>}
                  {err && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">{err}</p>}
                  {info && <p role="status" className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-900">{info}</p>}
                  <Button type="submit" size="lg" className="w-full" loading={busy}>
                    {forgot ? "Send reset link" : tab === "in" ? "Sign in" : "Create my shop"}
                  </Button>
                  {tab === "in" && (
                    <button
                      type="button"
                      className="block min-h-11 w-full text-center text-sm font-semibold text-brand-700 hover:underline"
                      onClick={() => { setForgot((v) => !v); setErr(""); setInfo(""); }}
                    >
                      {forgot ? "Back to sign in" : "Forgot password?"}
                    </button>
                  )}
                </form>
                <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                  <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            ) : (
              <div className="mb-4">
                <h1 className="text-xl font-bold">{t("Welcome to Expirix")}</h1>
                <p className="mt-1 text-sm text-slate-600">{t("Try the app with a ready-made shop. Nothing to set up.")}</p>
              </div>
            )}

            <Button type="button" size="lg" variant={supabaseConfigured ? "outline" : "primary"} className="w-full" onClick={enterDemo} data-testid="enter-demo">
              {t("Try the demo shop (Rajesh Kirana Store)")}
            </Button>
            <p className="mt-2 text-center text-xs text-slate-600">{t("Demo data is saved only in this browser and can be reset any time.")}</p>

            {!supabaseConfigured && (
              <div className="mt-5 flex gap-2.5 rounded-xl bg-sky-50 p-3.5 text-sm text-sky-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Cloud login is not available right now.</strong> The demo shop works fully on this device in the meantime.
                </p>
              </div>
            )}
          </Card>
          <p className="mt-4 text-center text-xs text-slate-600">
            {supabaseConfigured && tab === "up" ? t("By creating an account you agree to the") : t("By using Expirix you agree to the")}{" "}
            <Link href="/terms" className="font-semibold text-brand-700 hover:underline">{t("Terms")}</Link>
            {" "}{t("and")}{" "}
            <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">{t("Privacy Policy")}</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
