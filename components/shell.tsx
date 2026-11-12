"use client";

import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Leaf,
  LayoutDashboard,
  LogOut,
  Package,
  PackageX,
  Plus,
  ScanBarcode,
  Search,
  Settings as SettingsIcon,
  Timer,
  Truck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isActiveAlert } from "@/lib/alerts";
import { matchesQuery } from "@/lib/expiry";
import { useApp } from "@/lib/store";
import { Button, cx, Spinner } from "./ui";
import { UIProvider, useUI } from "./ui-context";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
        <Leaf className="h-5 w-5" aria-hidden />
      </span>
      <span className={cx("text-xl font-extrabold tracking-tight text-slate-900", compact && "max-sm:sr-only")}>Expirix</span>
    </span>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/calendar", label: "Expiry Calendar", short: "Calendar", icon: CalendarDays },
  { href: "/alerts", label: "Alerts & Notifications", short: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports & Analytics", short: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function useUnread() {
  const { data } = useApp();
  return data.notifications.filter((n) => isActiveAlert(n) && !n.read).length;
}

export function Shell({ children }: { children: ReactNode }) {
  const { phase, error, signOut, mode } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (phase === "signed_out") router.replace("/login");
  }, [phase, router]);

  if (phase === "init" || phase === "loading" || phase === "signed_out")
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label={phase === "signed_out" ? "Redirecting to sign in…" : "Loading your shop…"} />
      </div>
    );

  if (phase === "error")
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-3 text-lg font-bold">We couldn’t load your data</h1>
          <p className="mt-2 text-sm text-slate-700">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => location.reload()}>Try again</Button>
            <Button variant="outline" onClick={() => void signOut().then(() => router.replace("/login"))}>
              {mode === "supabase" ? "Sign out" : "Back"}
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <UIProvider>
      <ShellInner>{children}</ShellInner>
    </UIProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings, mode } = useApp();
  const unread = useUnread();
  const { openScanner } = useUI();
  const [mobileSearch, setMobileSearch] = useState(false);

  const mobileNav = NAV.filter((n) => n.href !== "/settings");
  const initials = (settings.owner_name || settings.shop_name || "E")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Logo />
          <p className="mt-1.5 text-xs font-medium text-brand-700">Track Expiry. Reduce Waste. Sell Fresh.</p>
        </div>
        <div className="px-4 pb-3">
          <Link href="/inventory/add" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
            <Plus className="h-5 w-5" /> Add Product
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium",
                  active ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <n.icon className="h-5 w-5" aria-hidden />
                <span className="flex-1">{n.label}</span>
                {n.href === "/alerts" && unread > 0 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" aria-label={`${unread} unread alerts`}>
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <ProfileMenu initials={initials} placement="top" />
        </div>
      </aside>

      {/* ---------- top bar ---------- */}
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center gap-2 px-4 lg:px-8">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="mx-2 hidden max-w-xl flex-1 lg:block">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setMobileSearch((s) => !s)} className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Search">
              <Search className="h-5 w-5" />
            </button>
            <button type="button" onClick={openScanner} className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label="Scan barcode">
              <ScanBarcode className="h-5 w-5" />
            </button>
            <QuickActions />
            <Link href="/alerts" className="relative grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link href="/inventory/add" aria-label="Add Product" className="ml-1 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-2.5 text-[15px] sm:px-3.5 font-semibold text-white shadow-sm hover:bg-brand-700 lg:hidden">
              <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Add</span>
            </Link>
            <div className="lg:hidden">
              <ProfileMenu initials={initials} compact placement="bottom" />
            </div>
          </div>
        </div>
        {mobileSearch && (
          <div className="border-t border-slate-100 px-4 pb-3 pt-2 lg:hidden">
            <GlobalSearch autoFocus onDone={() => setMobileSearch(false)} />
          </div>
        )}
        {mode === "demo" && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-sky-50 px-4 py-2 text-center text-xs font-medium text-sky-900" data-testid="demo-banner">
            <span>
              <strong>Demo mode</strong> — sample data stored only in this browser (not a real shop).
            </span>
            <Link href="/settings#data" className="inline-flex min-h-9 items-center px-2 underline underline-offset-2">
              Reset demo data
            </Link>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-7">{children}</main>

      {/* ---------- mobile bottom navigation ---------- */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden" aria-label="Main">
        <ul className="grid grid-cols-5">
          {mobileNav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-brand-700" : "text-slate-600")}
                >
                  <span className={cx("grid h-7 w-12 place-items-center rounded-full", active && "bg-brand-100")}>
                    <n.icon className="h-5 w-5" aria-hidden />
                  </span>
                  {"short" in n ? n.short : n.label}
                  {n.href === "/alerts" && unread > 0 && (
                    <span className="absolute right-4 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/* ------------------------------ profile ------------------------------ */

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOut();
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, onOut, active]);
}

function ProfileMenu({ initials, compact, placement }: { initials: string; compact?: boolean; placement: "top" | "bottom" }) {
  const { settings, mode, signOut, userEmail } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
        className={cx("flex items-center gap-3 rounded-xl text-left hover:bg-slate-100", compact ? "h-11 w-11 justify-center" : "w-full p-2")}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{initials}</span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{settings.shop_name}</span>
              <span className="block truncate text-xs text-slate-600">{settings.owner_name}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className={cx("absolute z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl", placement === "top" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2")}>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{settings.shop_name}</p>
            <p className="truncate text-xs text-slate-600">{settings.owner_name}{mode === "supabase" && userEmail ? ` · ${userEmail}` : ""}</p>
            {mode === "demo" && <p className="mt-1 text-xs font-medium text-sky-800">Demo account</p>}
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-slate-100">
            <SettingsIcon className="h-4 w-4" /> Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.replace("/login");
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> {mode === "demo" ? "Exit demo" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------- quick actions --------------------------- */

function QuickActions() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  const { openScanner, openMovement } = useUI();
  const router = useRouter();
  const items: { label: string; icon: ReactNode; run: () => void }[] = [
    { label: "Add Product", icon: <Plus className="h-4 w-4" />, run: () => router.push("/inventory/add") },
    { label: "Scan Barcode", icon: <ScanBarcode className="h-4 w-4" />, run: openScanner },
    { label: "View Expiring Items", icon: <Timer className="h-4 w-4" />, run: () => router.push("/inventory?status=expiring") },
    { label: "View Expired Stock", icon: <PackageX className="h-4 w-4" />, run: () => router.push("/inventory?status=expired") },
    { label: "Record Stock Movement", icon: <Truck className="h-4 w-4" />, run: () => openMovement() },
  ];
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        <Zap className="h-4 w-4 text-amber-500" /> Quick actions
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {items.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                i.run();
              }}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium hover:bg-slate-100"
            >
              {i.icon} {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- global search ---------------------------- */

function GlobalSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { views, data } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);

  const results = useMemo(() => {
    const needle = q.trim();
    if (!needle) return [];
    const out: { id: string; name: string; sub: string; hint: string }[] = [];
    for (const p of data.products) {
      const mine = views.filter((v) => v.product.id === p.id);
      const batchHit = mine.find((v) => matchesQuery({ product: { ...p, name: "", brand: "", barcode: null }, batch: v.batch }, needle));
      const direct = matchesQuery({ product: p }, needle);
      if (!direct && !batchHit) continue;
      const n = needle.toLowerCase();
      const hint = batchHit && !direct ? `Batch ${batchHit.batch.batch_no}` : p.barcode?.toLowerCase().includes(n) ? `Barcode ${p.barcode}` : "";
      out.push({ id: p.id, name: p.name, sub: `${p.brand} · ${p.category}`, hint });
    }
    return out.slice(0, 8);
  }, [q, data.products, views]);

  function go(path: string) {
    setOpen(false);
    setQ("");
    onDone?.();
    router.push(path);
  }

  return (
    <div ref={ref} className="relative" role="search">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        type="search"
        aria-label="Search products, brands, barcodes or batch numbers"
        placeholder="Search product, brand, barcode or batch…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) go(`/inventory?q=${encodeURIComponent(q.trim())}`);
        }}
        className="block min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-10 pr-3 text-base placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30"
      />
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-600">No product matches “{q}”.</p>
          ) : (
            <>
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => go(`/inventory/${r.id}`)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{r.name}</span>
                    <span className="block truncate text-xs text-slate-600">{r.sub}</span>
                  </span>
                  {r.hint && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{r.hint}</span>}
                </button>
              ))}
              <button type="button" onClick={() => go(`/inventory?q=${encodeURIComponent(q.trim())}`)} className="mt-1 flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50">
                See all results in Inventory →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
