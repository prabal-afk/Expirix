import { HI } from "./i18n-hi";

export type Lang = "en" | "hi";
export const LANG_KEY = "expirix:lang";

let current: Lang = "en";
export const getLang = (): Lang => current;
export const setCurrentLang = (l: Lang) => {
  current = l;
};

/** Translates a UI string. Unknown strings stay in English. Safe to call on the server (always English there). */
export function t(s: string): string {
  return current === "hi" ? (HI[s] ?? s) : s;
}
