import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Terms of Use — Expirix" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="14 November 2026">
      <section>
        <h2>1. About Expirix</h2>
        <p>Expirix is a free tool that helps small shops keep track of product expiry dates and stock. By creating an account or using the demo, you agree to these terms. If you do not agree, please do not use it.</p>
      </section>
      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>You are responsible for the email and password you use, and for what happens under your account.</li>
          <li>Give correct information and keep your password private.</li>
          <li>You can download your data or delete your account at any time from Settings.</li>
        </ul>
      </section>
      <section>
        <h2>3. Your data</h2>
        <p>The products, batches, stock records and settings you enter belong to you. We use them only to run the app for you. See the Privacy Policy for details. The demo shop stores its data only in your own browser.</p>
      </section>
      <section>
        <h2>4. Not a safety guarantee</h2>
        <p>Expirix shows dates and alerts based on what you type in. It cannot check the real condition of any product. Alerts may be late or missing (for example if email, notifications or your internet fail). Always check the printed date and the product itself before selling or consuming anything. You stay responsible for food safety and for following the law that applies to your shop.</p>
      </section>
      <section>
        <h2>5. Acceptable use</h2>
        <ul>
          <li>Do not try to break, overload or gain access to other people's data.</li>
          <li>Do not use the app for anything unlawful.</li>
          <li>Do not upload content you have no right to use.</li>
        </ul>
      </section>
      <section>
        <h2>6. Availability and changes</h2>
        <p>Expirix is provided "as is" and "as available", with no promise that it will always work or stay free. Features may change or stop, and these terms may be updated. Keep a backup from Settings if your data matters to you.</p>
      </section>
      <section>
        <h2>7. Limit of responsibility</h2>
        <p>To the extent the law allows, the makers of Expirix are not liable for losses caused by using it, including spoiled stock, missed alerts, lost data or lost sales.</p>
      </section>
      <section>
        <h2>8. Governing law and contact</h2>
        <p>These terms are governed by the laws of India. For questions or requests, open an issue at <a className="font-semibold text-brand-700 hover:underline" href="https://github.com/prabal-afk/expirix" target="_blank" rel="noreferrer">github.com/prabal-afk/expirix</a>.</p>
      </section>
    </LegalPage>
  );
}
