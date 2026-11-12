import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { LANG_COOKIE, isLang, type Lang } from "./i18n";

type LanguageContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  toggle: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    if (!isLang(next)) return;
    setLangState(next);
    if (typeof document !== "undefined") {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, toggle: () => setLang(lang === "bn" ? "en" : "bn") }),
    [lang, setLang],
  );

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return { lang: "bn" as Lang, setLang: () => {}, toggle: () => {} };
  }
  return ctx;
}
