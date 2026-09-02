import { es } from "./locales/es";
import { en } from "./locales/en";
import { pt } from "./locales/pt";
import type { Locale } from "./locales/es";

export type LangCode = "es" | "en" | "pt";

const locales: Record<LangCode, Locale> = { es, en, pt };

const STORAGE_KEY = "crossy-road:lang";

function detectLang(): LangCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en" || stored === "pt") return stored;
  } catch { /* ignore */ }
  const browser = navigator.language.slice(0, 2).toLowerCase();
  if (browser === "pt") return "pt";
  if (browser === "en") return "en";
  return "es";
}

let currentLang: LangCode = detectLang();

export function getLang(): LangCode { return currentLang; }

export function setLang(lang: LangCode): void {
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

export function t(key: keyof Locale, vars?: Record<string, string | number>): string {
  let str: string = locales[currentLang][key] as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
