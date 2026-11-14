"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LANG_KEY, setCurrentLang, type Lang } from "./i18n-core";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => undefined });
export const useLang = () => useContext(Ctx);

/** Holds the chosen language. Changing it re-renders the page below with the new words. */
export function I18nRoot({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  setCurrentLang(lang);

  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === "hi") setLangState("hi");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  }, []);

  return (
    <Ctx.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`inline-flex overflow-hidden rounded-xl border border-slate-300 bg-white text-sm font-semibold ${className}`} role="group" aria-label="Language">
      {([["en", "English"], ["hi", "हिन्दी"]] as const).map(([code, label]) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`min-h-10 px-3.5 ${lang === code ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
