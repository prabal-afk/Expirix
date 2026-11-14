import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { Intro } from "@/components/intro";
import { I18nRoot } from "@/lib/i18n";
import { PwaSetup } from "@/components/pwa";
import { INTRO_KEY } from "@/lib/intro-key";

// Runs before first paint: play the intro only if this browser has not seen it and motion is allowed.
const introScript = `try{if(!localStorage.getItem("${INTRO_KEY}")&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.intro="play"}catch(e){}`;

export const metadata: Metadata = {
  title: "Expirix — Track Expiry. Reduce Waste. Sell Fresh.",
  description: "Simple expiry-date and stock tracking for kirana stores and small shops.",
  icons: { apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Expirix", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15803d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      <body>
        <Intro />
        <PwaSetup />
        <AppProvider>
          <I18nRoot>{children}</I18nRoot>
        </AppProvider>
      </body>
    </html>
  );
}
