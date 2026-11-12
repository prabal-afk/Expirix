# Expirix — Track Expiry. Reduce Waste. Sell Fresh.

A mobile-first web app that helps small shops (kirana stores, convenience stores) track batch-level expiry dates,
get alerts, record stock movements and see how much money waste costs them.

Built with **Next.js 16 (React, TypeScript)**, **Tailwind CSS**, **Recharts**, **Lucide icons**, **Zod** validation,
and **Supabase** (Postgres + Auth + Row Level Security) — deployable on **Vercel**.

## Two modes

| | Demo mode | Cloud mode |
|---|---|---|
| Needs setup? | No — works the moment you open it | Supabase project + 2 env vars |
| Login | "Try the demo shop" button | Real email + password accounts |
| Data lives in | This browser only (localStorage) | Supabase Postgres, one private shop per account |
| Background daily alert job | No (alerts are created when you open the app) | Yes (Vercel Cron, once a day) |
| Banner | "Demo mode" is always visible | — |

If the Supabase keys are missing, the app automatically runs in demo mode. Nothing breaks.

## Run it on your computer

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests for the business rules
```

## 1) Put the code on GitHub

1. On github.com click **New repository** → name it `expirix` → **Create** (leave it empty).
2. In this project folder:
   ```bash
   git init
   git add .
   git commit -m "Expirix first version"
   git branch -M main
   git remote add origin https://github.com/<your-username>/expirix.git
   git push -u origin main
   ```
   (No Git installed? On the empty repo page choose **uploading an existing file** and drag the project files in.
   Do **not** upload `node_modules` or `.next` — the `.gitignore` already excludes them.)

## 2) Deploy the frontend on Vercel (demo mode first)

1. vercel.com → **Add New… → Project** → import the `expirix` repo.
2. Framework: **Next.js** (auto-detected). Root directory: leave as is. Click **Deploy**.
3. Open the URL — you can already use the demo shop. 🎉

## 3) Connect Supabase (real accounts + cloud database)

1. supabase.com → **New project** (free tier is fine). Wait until it is ready.
2. **SQL Editor → New query** → paste the whole file `supabase/schema.sql` → **Run**.
   (It is safe to run again; it creates tables, security rules and the stock-movement function.)
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key.
4. In **Vercel → your project → Settings → Environment Variables** add:

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | public (protected by Row Level Security) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **secret** — server only, never share it |
   | `CRON_SECRET` | any long random text | protects the daily job |

5. **Deployments → ⋯ → Redeploy** so the new variables are used.
6. Supabase → **Authentication → URL Configuration**: set **Site URL** to your Vercel URL
   (needed so confirmation e-mails link back to your app).
   For quick testing you can switch off **Authentication → Providers → Email → Confirm email**.
7. Open the app → **Create account** → enter shop name, e-mail, password. Then add products, or
   **Settings → Add sample inventory** to see realistic examples.

For local development copy `.env.example` to `.env.local` and fill in the same values.

## Daily alert sync

`vercel.json` schedules `/api/cron/sync-alerts` once a day (00:30 UTC ≈ 06:00 IST; Vercel's free plan
allows one run per day and may start it up to an hour late). It creates the day's alerts for every shop even if nobody
opened the app. Alerts are **also** created every time the app is opened, so nothing depends on the cron alone.

**What is *not* included:** there is no e-mail, SMS or WhatsApp delivery. Alerts appear inside Expirix
(bell icon + Alerts page). Optional browser pop-ups work only while Expirix is open in the browser.

## How the rules work

* **Status is never stored** — it is calculated from today's date (in the shop's time zone) for every batch:
  Expired (< today) · Expiring Today · Expiring Soon (within the configurable window, default 7 days) · Safe.
* **Batches** keep their own expiry date, quantity and prices; one product can have many batches.
* **Expired stock is never sellable.** It is excluded from sellable counts, FEFO, and cannot be sold or received into.
  Selling more than is in stock is blocked. The database enforces this too (`record_movement` SQL function + checks).
* **FEFO:** the earliest-expiring, non-expired batch is recommended first.
* **Alerts:** one per batch per level (Upcoming 30d, Warning 7d, High 3d, Critical 1d, Expires today, Expired), no duplicates
  (unique constraint). Moving to a new level resolves the old alert. Dismissing/reading never changes stock or status.
* **Waste** = purchase price × quantity of *expired removed* and *damaged* stock. Supplier returns are not counted as waste.
  Financial numbers are labelled estimates, not guaranteed savings.
* **Audit trail:** every change of quantity is a stock movement (received, sold, damaged, expired removed, returned,
  manual adjustment). Movement rows can't be edited or deleted from the app and keep the product name/cost,
  so reports survive deleting a product.

## Project layout

```
app/                 pages: /login /dashboard /inventory /inventory/add /inventory/[id] /inventory/edit/[batchId]
                     /calendar /alerts /reports /settings, plus /api/cron/sync-alerts
components/          UI pieces (shell/navigation, forms, scanner, stock-movement dialog)
lib/                 business logic (dates, expiry, alerts, movements, reports, seed data), storage backends, store
supabase/schema.sql  database tables, security rules, functions
tests/               unit tests for the business rules
```

## Honest limitations

* **Barcode scanning** uses the phone camera (needs https — works on your Vercel site) and a typed-in fallback. It only matches
  barcodes against products *you already added*; it does not look up product names online. The camera path has not been tested with
  a real barcode on a real phone yet — please try it on your phone and report issues.
* No password-reset screen yet (reset from the Supabase dashboard if needed).
* One owner login per shop (no staff roles).
* Demo mode data is per browser; clearing site data erases it.
