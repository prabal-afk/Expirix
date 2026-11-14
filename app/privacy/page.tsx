import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy Policy — Expirix" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="14 November 2026">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your email, your name and shop name, and your password (stored hashed by our login provider, never readable by us).</li>
          <li><strong>Shop data:</strong> products, batches, stock movements, notifications and settings you enter.</li>
          <li><strong>Push notifications (optional):</strong> a browser address for your device, only if you turn them on.</li>
          <li><strong>On your device:</strong> your language choice and, in demo mode, the demo data, kept in your browser's storage.</li>
        </ul>
        <p className="mt-2">We do not use advertising or tracking cookies.</p>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run the app and keep each shop's data separate from every other shop.</li>
          <li>To send account emails (confirmation, password reset) and, if you leave it on, a daily summary of expired and expiring items to your login email.</li>
          <li>To send push notifications to devices you enabled.</li>
        </ul>
        <p className="mt-2">We do not sell your data and do not send marketing emails.</p>
      </section>
      <section>
        <h2>Who handles it</h2>
        <p>Expirix relies on a few providers to work: Supabase (database and login), Vercel (hosting), Brevo (sending email), and your browser's push service (notifications). They process data only to provide those services.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Turn the daily email and push notifications off in Settings.</li>
          <li>Download a full copy of your data from Settings.</li>
          <li>Permanently delete your account and all its data from Settings. This cannot be undone.</li>
        </ul>
      </section>
      <section>
        <h2>Security</h2>
        <p>Data is sent over HTTPS and protected by per-shop access rules in the database. No system is perfectly secure, so please use a strong, unique password.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions or requests: open an issue at <a className="font-semibold text-brand-700 hover:underline" href="https://github.com/prabal-afk/expirix" target="_blank" rel="noreferrer">github.com/prabal-afk/expirix</a>.</p>
      </section>
    </LegalPage>
  );
}
