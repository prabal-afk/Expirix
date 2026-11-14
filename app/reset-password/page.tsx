"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button, Card, Field, Input } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";

/** Opened from the "reset your password" email. Supabase signs the person in with a short-lived recovery session. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setState("invalid");
      return;
    }
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });
    // The link may already have been processed before this page mounted.
    const timer = window.setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      setState((s) => (s === "checking" ? (data.session && /type=recovery/.test(window.location.hash + window.location.search) ? "ready" : "invalid") : s));
    }, 2500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    if (pw !== pw2) return setErr("The two passwords do not match.");
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setState("done");
    window.setTimeout(() => router.replace("/dashboard"), 1500);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <BrandMark className="h-6 w-6" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">Expirix</span>
        </div>
        {state === "checking" && <p className="text-sm text-slate-600" role="status">Checking your reset link...</p>}
        {state === "invalid" && (
          <div className="space-y-3">
            <h1 className="text-lg font-bold">This link has expired</h1>
            <p className="text-sm text-slate-600">Reset links work once and stop working after a while. Request a new one from the sign-in page.</p>
            <Button type="button" className="w-full" onClick={() => router.replace("/login")}>Back to sign in</Button>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <h1 className="text-lg font-bold">Choose a new password</h1>
              <p className="mt-1 text-sm text-slate-600">You will be signed in right after.</p>
            </div>
            <Field label="New password" htmlFor="pw" required hint="At least 6 characters.">
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Type it again" htmlFor="pw2" required>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </Field>
            {err && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>Save new password</Button>
          </form>
        )}
        {state === "done" && <p role="status" className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-900">Password changed. Taking you to your dashboard...</p>}
      </Card>
    </main>
  );
}
