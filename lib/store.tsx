"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { planAlertSync, type AlertPlan } from "./alerts";
import { todayISO } from "./dates";
import {
  buildViews,
  dashboardMetrics,
  summarizeProducts,
  type BatchView,
  type DashboardMetrics,
  type ProductSummary,
} from "./expiry";
import { uid } from "./format";
import type { MovementInput } from "./movements";
import { localRepo } from "./repo/local";
import { makeSupabaseRepo } from "./repo/supabase";
import { RepoError, type Repo } from "./repo/types";
import { getSupabase, supabaseConfigured } from "./supabase/client";
import type { AppData, Batch, ISODate, Movement, Product, Settings } from "./types";
import type { ParsedBatchForm } from "./validation";

type Phase = "init" | "signed_out" | "loading" | "ready" | "error";
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

interface Toast {
  id: number;
  text: string;
  kind: "success" | "error" | "info";
}

export interface AppContextValue {
  phase: Phase;
  mode: "demo" | "supabase" | null;
  supabaseConfigured: boolean;
  userEmail: string | null;
  error: string | null;
  data: AppData;
  today: ISODate;
  views: BatchView[];
  summaries: ProductSummary[];
  metrics: DashboardMetrics;
  settings: Settings;
  // auth
  enterDemo: () => void;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string, shopName: string, ownerName: string) => Promise<Result<{ needsConfirmation: boolean }>>;
  signOut: () => Promise<void>;
  // inventory
  addBatch: (v: ParsedBatchForm, opts?: { productId?: string }) => Promise<Result<{ productId: string; batchId: string; merged: boolean }>>;
  updateBatch: (batchId: string, v: ParsedBatchForm) => Promise<Result<{ productId: string }>>;
  deleteBatch: (batchId: string) => Promise<Result>;
  deleteProduct: (productId: string) => Promise<Result>;
  recordMovement: (input: MovementInput) => Promise<Result<{ movement: Movement }>>;
  // notifications
  markRead: (ids: string[], read?: boolean) => Promise<void>;
  dismiss: (ids: string[]) => Promise<void>;
  // settings & data
  saveSettings: (s: Settings) => Promise<Result>;
  loadSample: () => Promise<Result>;
  refresh: () => Promise<void>;
  enableBrowserNotifications: () => Promise<Result>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<AppContextValue | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
};

const MODE_KEY = "expirix:mode";
const EMPTY: AppData = {
  products: [],
  batches: [],
  movements: [],
  notifications: [],
  settings: {
    shop_id: "",
    shop_name: "",
    owner_name: "",
    phone: "",
    email: "",
    address: "",
    expiry_threshold_days: 7,
    alert_upcoming_days: 30,
    alert_warning_days: 7,
    alert_high_days: 3,
    alert_critical_days: 1,
    low_stock_default: 5,
    currency: "INR",
    date_format: "DD/MM/YYYY",
    timezone: "Asia/Kolkata",
    in_app_alerts: true,
    browser_notifications: false,
  },
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

function applyPlan(d: AppData, plan: AlertPlan): AppData {
  const known = new Set(d.notifications.map((n) => `${n.batch_id}:${n.level}`));
  const patches = new Map(plan.patch.map((p) => [p.id, p.resolved]));
  return {
    ...d,
    notifications: [
      ...d.notifications.map((n) => (patches.has(n.id) ? { ...n, resolved: patches.get(n.id)! } : n)),
      ...plan.create.filter((n) => !known.has(`${n.batch_id}:${n.level}`)),
    ],
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("init");
  const [mode, setMode] = useState<"demo" | "supabase" | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [today, setToday] = useState<ISODate>(() => todayISO("Asia/Kolkata"));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const repoRef = useRef<Repo | null>(null);
  const dataRef = useRef<AppData>(EMPTY);
  dataRef.current = data;
  const syncing = useRef(false);

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  /* ------------------------------ loading ------------------------------ */

  const start = useCallback(async (repo: Repo) => {
    repoRef.current = repo;
    setMode(repo.mode);
    setPhase("loading");
    setError(null);
    try {
      const d = await repo.load();
      setData(d);
      setToday(todayISO(d.settings.timezone));
      setPhase("ready");
    } catch (e) {
      setError(msg(e));
      setPhase("error");
    }
  }, []);

  const refresh = useCallback(async () => {
    const repo = repoRef.current;
    if (!repo) return;
    const d = await repo.load();
    setData(d);
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      let demo = false;
      try {
        demo = localStorage.getItem(MODE_KEY) === "demo";
      } catch {
        /* storage blocked */
      }
      const sb = getSupabase();
      if (sb) {
        const { data: sub } = sb.auth.onAuthStateChange((event, session: Session | null) => {
          if (event === "SIGNED_OUT") {
            if (repoRef.current?.mode === "supabase") {
              repoRef.current = null;
              setData(EMPTY);
              setUserEmail(null);
              setMode(null);
              setPhase("signed_out");
            }
          } else if (session && repoRef.current?.mode !== "supabase" && !demoActive()) {
            setUserEmail(session.user.email ?? null);
            void start(makeSupabaseRepo(sb));
          }
        });
        unsub = () => sub.subscription.unsubscribe();
      }
      if (demo) {
        if (!cancelled) void start(localRepo);
        return;
      }
      if (sb) {
        const { data: s } = await sb.auth.getSession();
        if (cancelled) return;
        if (s.session) {
          setUserEmail(s.session.user.email ?? null);
          void start(makeSupabaseRepo(sb));
        } else setPhase("signed_out");
      } else setPhase("signed_out");
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  function demoActive() {
    try {
      return localStorage.getItem(MODE_KEY) === "demo";
    } catch {
      return false;
    }
  }

  /* --------------------- today ticks over at midnight --------------------- */

  const tz = data.settings.timezone;
  useEffect(() => {
    const tick = () => setToday((prev) => {
      const t = todayISO(tz);
      return t === prev ? prev : t;
    });
    const i = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(i);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [tz]);

  /* --------------- alert sync: runs whenever data or the date changes --------------- */

  useEffect(() => {
    const repo = repoRef.current;
    if (phase !== "ready" || !repo || syncing.current) return;
    const plan = planAlertSync(data, today, new Date().toISOString(), uid);
    if (!plan.create.length && !plan.patch.length) return;
    syncing.current = true;
    (async () => {
      try {
        await repo.applyAlertPlan(plan);
        setData((cur) => applyPlan(cur, plan));
        if (
          plan.create.length &&
          data.settings.browser_notifications &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          const urgent = plan.create.filter((n) => ["critical", "today", "expired"].includes(n.level)).length;
          new Notification("Expirix", {
            body: `${plan.create.length} new expiry alert${plan.create.length > 1 ? "s" : ""}${urgent ? ` — ${urgent} urgent` : ""}.`,
          });
        }
      } catch (e) {
        toast(`Could not update alerts: ${msg(e)}`, "error");
      } finally {
        syncing.current = false;
      }
    })();
  }, [data, today, phase, toast]);

  /* ------------------------------ derived ------------------------------ */

  const views = useMemo(() => buildViews(data, data.settings, today), [data, today]);
  const summaries = useMemo(() => summarizeProducts(views, data.products, data.settings), [views, data.products, data.settings]);
  const metrics = useMemo(() => dashboardMetrics(views, summaries, data.settings), [views, summaries, data.settings]);

  /* -------------------------------- auth -------------------------------- */

  const enterDemo = useCallback(() => {
    try {
      localStorage.setItem(MODE_KEY, "demo");
    } catch {
      /* ignore */
    }
    setUserEmail(null);
    void start(localRepo);
  }, [start]);

  const signIn: AppContextValue["signIn"] = async (email, password) => {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: "Cloud login is not set up. Use demo mode or add your Supabase keys." };
    try {
      localStorage.removeItem(MODE_KEY);
    } catch {
      /* ignore */
    }
    const { error: e } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (e) return { ok: false, error: e.message === "Invalid login credentials" ? "Wrong email or password." : e.message };
    return { ok: true };
  };

  const signUp: AppContextValue["signUp"] = async (email, password, shopName, ownerName) => {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: "Cloud login is not set up. Use demo mode or add your Supabase keys." };
    try {
      localStorage.removeItem(MODE_KEY);
    } catch {
      /* ignore */
    }
    const { data: r, error: e } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { shop_name: shopName.trim(), owner_name: ownerName.trim() },
      },
    });
    if (e) return { ok: false, error: e.message };
    return { ok: true, needsConfirmation: !r.session };
  };

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    try {
      localStorage.removeItem(MODE_KEY);
    } catch {
      /* ignore */
    }
    if (repoRef.current?.mode === "supabase" && sb) await sb.auth.signOut();
    repoRef.current = null;
    setData(EMPTY);
    setUserEmail(null);
    setMode(null);
    setPhase("signed_out");
  }, []);

  /* --------------------------- mutation helper --------------------------- */

  async function guard<T extends object>(fn: (repo: Repo) => Promise<T>): Promise<Result<T>> {
    const repo = repoRef.current;
    if (!repo) return { ok: false, error: "You are signed out. Please sign in again." };
    try {
      const out = await fn(repo);
      setData(await repo.load());
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  }

  const addBatch: AppContextValue["addBatch"] = (v, opts) =>
    guard(async (repo) => {
      const d = dataRef.current;
      const nameKey = `${v.name}|${v.brand}`.toLowerCase();
      let product =
        (opts?.productId ? d.products.find((p) => p.id === opts.productId) : undefined) ??
        (v.barcode ? d.products.find((p) => p.barcode === v.barcode) : undefined) ??
        d.products.find((p) => `${p.name}|${p.brand}`.toLowerCase() === nameKey);
      const merged = Boolean(product);
      const now = new Date().toISOString();
      if (!product) {
        const created: Product = {
          id: uid(),
          shop_id: d.settings.shop_id,
          name: v.name,
          brand: v.brand,
          category: v.category,
          barcode: v.barcode,
          unit: v.unit,
          min_stock: v.min_stock,
          supplier: v.supplier,
          notes: v.notes,
          created_at: now,
        };
        await repo.upsertProduct(created);
        product = created;
      }
      const batch: Batch = {
        id: uid(),
        shop_id: d.settings.shop_id,
        product_id: product.id,
        batch_no: v.batch_no,
        quantity: v.quantity,
        initial_quantity: v.quantity,
        purchase_price: v.purchase_price,
        selling_price: v.selling_price,
        purchase_date: v.purchase_date,
        mfg_date: v.mfg_date,
        expiry_date: v.expiry_date,
        created_at: now,
      };
      const opening: Movement = {
        id: uid(),
        shop_id: d.settings.shop_id,
        product_id: product.id,
        batch_id: batch.id,
        product_name: product.name,
        batch_no: v.batch_no,
        unit: product.unit,
        type: "received",
        qty_change: v.quantity,
        qty_after: v.quantity,
        unit_cost: v.purchase_price,
        unit_price: v.selling_price,
        notes: "Initial stock",
        created_at: now,
      };
      try {
        await repo.insertBatch(batch, opening);
      } catch (e) {
        if (!merged) await repo.deleteProduct(product.id).catch(() => undefined);
        throw e;
      }
      return { productId: product.id, batchId: batch.id, merged };
    });

  const updateBatch: AppContextValue["updateBatch"] = (batchId, v) =>
    guard(async (repo) => {
      const d = dataRef.current;
      const batch = d.batches.find((b) => b.id === batchId);
      const product = batch && d.products.find((p) => p.id === batch.product_id);
      if (!batch || !product) throw new RepoError("That batch no longer exists.");
      await repo.upsertProduct({
        ...product,
        name: v.name,
        brand: v.brand,
        category: v.category,
        barcode: v.barcode,
        unit: v.unit,
        min_stock: v.min_stock,
        supplier: v.supplier,
        notes: v.notes,
      });
      await repo.updateBatch({
        ...batch,
        batch_no: v.batch_no,
        purchase_price: v.purchase_price,
        selling_price: v.selling_price,
        purchase_date: v.purchase_date,
        mfg_date: v.mfg_date,
        expiry_date: v.expiry_date,
      });
      if (v.quantity !== batch.quantity) {
        await repo.recordMovement(
          { batchId, type: "adjustment", quantity: v.quantity, notes: "Quantity edited" },
          { today, id: uid(), nowTs: new Date().toISOString() },
        );
      }
      return { productId: product.id };
    });

  const deleteBatch: AppContextValue["deleteBatch"] = (id) => guard((repo) => repo.deleteBatch(id).then(() => ({})));
  const deleteProduct: AppContextValue["deleteProduct"] = (id) => guard((repo) => repo.deleteProduct(id).then(() => ({})));

  const recordMovement: AppContextValue["recordMovement"] = (input) =>
    guard(async (repo) => {
      const r = await repo.recordMovement(input, { today, id: uid(), nowTs: new Date().toISOString() });
      return { movement: r.movement };
    });

  /* ---------------------------- notifications ---------------------------- */

  const patchLocal = (ids: string[], patch: { read?: boolean; dismissed?: boolean }) =>
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)) }));

  const markRead: AppContextValue["markRead"] = async (ids, read = true) => {
    if (!ids.length || !repoRef.current) return;
    try {
      await repoRef.current.patchNotifications(ids, { read });
      patchLocal(ids, { read });
    } catch (e) {
      toast(msg(e), "error");
    }
  };

  const dismiss: AppContextValue["dismiss"] = async (ids) => {
    if (!ids.length || !repoRef.current) return;
    try {
      await repoRef.current.patchNotifications(ids, { dismissed: true, read: true });
      patchLocal(ids, { dismissed: true, read: true });
    } catch (e) {
      toast(msg(e), "error");
    }
  };

  /* ------------------------------- settings ------------------------------- */

  const saveSettings: AppContextValue["saveSettings"] = async (s) => {
    const r = await guard((repo) => repo.saveSettings(s).then(() => ({})));
    if (r.ok) setToday(todayISO(s.timezone));
    return r;
  };

  const loadSample: AppContextValue["loadSample"] = () => guard((repo) => repo.loadSample(today).then(() => ({})));

  const enableBrowserNotifications: AppContextValue["enableBrowserNotifications"] = async () => {
    if (typeof Notification === "undefined") return { ok: false, error: "This browser does not support notifications." };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "Permission was not granted. You can allow notifications in your browser's site settings." };
    return saveSettings({ ...dataRef.current.settings, browser_notifications: true });
  };

  const value: AppContextValue = {
    phase,
    mode,
    supabaseConfigured,
    userEmail,
    error,
    data,
    today,
    views,
    summaries,
    metrics,
    settings: data.settings,
    enterDemo,
    signIn,
    signUp,
    signOut,
    addBatch,
    updateBatch,
    deleteBatch,
    deleteProduct,
    recordMovement,
    markRead,
    dismiss,
    saveSettings,
    loadSample,
    refresh,
    enableBrowserNotifications,
    toast,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "error" ? "bg-red-700 text-white" : t.kind === "info" ? "bg-slate-800 text-white" : "bg-brand-700 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
