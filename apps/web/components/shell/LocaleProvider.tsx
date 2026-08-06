"use client";

import { createContext, useContext, useMemo } from "react";
import {
  t as translate,
  tf as translateWithVars,
  type Locale,
  type MessageKey,
} from "@matchread/i18n";

type LocaleContextValue = {
  locale: Locale;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type Props = {
  locale: Locale;
  children: React.ReactNode;
};

/** Client-side locale context — wraps AppShell so client components can translate without cookies(). */
export function LocaleProvider({ locale, children }: Props) {
  const value = useMemo(() => ({ locale }), [locale]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  return ctx?.locale ?? "en";
}

/** Returns a `t(key)` translator bound to the current locale. */
export function useT(): (key: MessageKey) => string {
  const locale = useLocale();
  return useMemo(() => (key: MessageKey) => translate(locale, key), [locale]);
}

/** Returns a `tf(key, vars)` translator (with `{placeholder}` substitution) bound to the current locale. */
export function useTf(): (
  key: MessageKey,
  vars: Record<string, string | number>
) => string {
  const locale = useLocale();
  return useMemo(
    () => (key: MessageKey, vars: Record<string, string | number>) =>
      translateWithVars(locale, key, vars),
    [locale]
  );
}
