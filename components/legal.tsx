import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/login" className="text-sm font-semibold text-brand-700 hover:underline">← Back to Expirix</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">Last updated {updated}</p>
        <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/terms" className="font-semibold text-brand-700 hover:underline">Terms</Link>
          {" · "}
          <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy</Link>
        </p>
      </div>
    </main>
  );
}
