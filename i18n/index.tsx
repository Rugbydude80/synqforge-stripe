import React, { createContext, useContext, useMemo, useState } from 'react';
import en from './en.json';
import es from './es.json';

export type Locale = 'en' | 'es';
type Dict = any; // allow nested dictionaries for now

const dictionaries: Record<Locale, Dict> = { en, es } as const;

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] || dictionaries.en;
}

export const I18nContext = createContext<{ t: (key: string) => string; locale: Locale; setLocale: (l: Locale) => void } | null>(null);

export function I18nProvider({ children, defaultLocale = 'en' as Locale }: { children: React.ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const dict = getDictionary(locale);
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: string) => dict[key] || key
    }),
    [locale, dict]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nProvider missing');
  return ctx;
}


