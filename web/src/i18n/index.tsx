import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Key } from './en.ts';
import { he, heServerMessages } from './he.ts';
import { adminEn, type AdminKey } from './admin-en.ts';
import { adminHe } from './admin-he.ts';

export type Lang = 'en' | 'he';
export type AnyKey = Key | AdminKey;
type Vars = Record<string, string | number>;

const DICTS: Record<Lang, Record<AnyKey, string>> = { en: { ...en, ...adminEn }, he: { ...he, ...adminHe } };
const STORAGE_KEY = 'outlier.lang';

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'he') return saved;
  return navigator.language.toLowerCase().startsWith('he') ? 'he' : 'en';
}

/** Translate outside React (e.g. in error handlers). */
export function translate(lang: Lang, key: AnyKey, vars?: Vars): string {
  const dict = DICTS[lang];
  let s: string = dict[key];
  if (vars && typeof vars['n'] === 'number' && new Intl.PluralRules(lang).select(vars['n']) === 'one') {
    const one = dict[`${key}.one` as AnyKey] as string | undefined;
    if (one) s = one;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: AnyKey, vars?: Vars) => string;
  /** Translate a message that came from the server (English text). */
  server: (message: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => { localStorage.setItem(STORAGE_KEY, l); setLangState(l); }, []);
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = dir; }, [lang, dir]);
  const value = useMemo<I18n>(() => ({
    lang, dir, setLang, locale: lang === 'he' ? 'he-IL' : 'en-GB',
    t: (key, vars) => translate(lang, key, vars),
    server: message => (lang === 'he' ? heServerMessages[message] ?? message : message),
  }), [lang, dir, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}
