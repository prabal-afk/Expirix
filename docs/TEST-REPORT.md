# Expirix — Test report (Nov 2026)

| Suite | What it covers | Result |
|---|---|---|
| Unit (Vitest) | expiry maths, alert planning, stock rules, digest grouping/escaping, Hindi dictionary | 35 / 35 |
| Database (embedded Postgres) | schema, RLS isolation between shops, `record_movement`, push subscriptions, `email_digest` default, `delete_my_account` | 48 / 48 |
| Browser journey (Playwright) | full demo flow: add, edit, move stock, alerts, reports, calendar, settings, reset | 79 / 79 |
| Browser features (Playwright) | Hindi switch + persistence, first-run checklist, sample data, backup JSON, WhatsApp text, barcode-by-photo (known and unknown), cloud login tabs, forgot-password, expired reset link, manifest, service worker, API auth (401/503), intro | 30 / 30 |
| Build | `tsc` clean, `next build` succeeds | pass |

**Total: 192 automated checks, 0 failures.**

## Not covered by automation
- Live camera scanning on a real phone (the photo path is tested).
- Real Brevo delivery and real web-push delivery (need live keys; the routes, auth and digest content are tested).
- Supabase Auth emails against the live project.
- iPhone push requires the app to be added to the Home Screen.
