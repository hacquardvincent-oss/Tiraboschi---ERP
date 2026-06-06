import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'fr' | 'en';

const dict: Record<string, Record<Lang, string>> = {
  'app.title': { fr: 'Tiraboschi', en: 'Tiraboschi' },
  'nav.dashboard': { fr: 'Accueil', en: 'Home' },
  'nav.pos': { fr: 'Caisse', en: 'POS' },
  'nav.collection': { fr: 'Collection', en: 'Collection' },
  'nav.crm': { fr: 'Clients', en: 'CRM' },
  'nav.sales': { fr: 'Ventes', en: 'Sales' },
  'nav.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'nav.admin': { fr: 'Admin', en: 'Admin' },
  'login.title': { fr: 'Connexion', en: 'Sign in' },
  'login.email': { fr: 'Email', en: 'Email' },
  'login.password': { fr: 'Mot de passe', en: 'Password' },
  'login.submit': { fr: 'Se connecter', en: 'Sign in' },
  'common.logout': { fr: 'Déconnexion', en: 'Logout' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…' },
  'common.soon': { fr: 'Bientôt disponible', en: 'Coming soon' },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(
    (localStorage.getItem('tiraboschi_lang') as Lang) || 'fr',
  );
  const set = (l: Lang) => {
    setLang(l);
    localStorage.setItem('tiraboschi_lang', l);
  };
  const t = (key: string) => dict[key]?.[lang] ?? key;
  return <Ctx.Provider value={{ lang, setLang: set, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n hors provider');
  return ctx;
}
