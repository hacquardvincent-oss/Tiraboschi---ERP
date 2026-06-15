import { useEffect, useState } from 'react';
import { useAuth, useCurrency } from '../store';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { Logo } from './Logo';

export function Header() {
  const { user, logout } = useAuth();
  const { lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const [conn, setConn] = useState<{ stripe: boolean; terminal: boolean } | null>(null);

  useEffect(() => {
    api<{ stripe: boolean; terminal: boolean }>('/api/health/connectivity').then(setConn).catch(() => setConn(null));
  }, []);

  const dot = (ok: boolean) => (ok ? 'bg-green-400' : 'bg-white/30');

  return (
    <header className="sticky top-0 z-10 bg-ink border-b border-white/10 px-4 py-3 flex items-center justify-between"
      style={{ boxShadow: '0 1px 0 0 #C9A86A' }}>
      <Logo compact />
      <div className="flex items-center gap-2 text-xs">
        {conn && (
          <>
            <span className="hidden sm:flex items-center gap-1 text-white/60" title={conn.stripe ? 'Stripe configuré' : 'Stripe non configuré'}>
              <span className={'w-1.5 h-1.5 rounded-full ' + dot(conn.stripe)} /> Stripe
            </span>
            <span className="hidden sm:flex items-center gap-1 text-white/60" title={conn.terminal ? 'TPE configuré' : 'TPE non configuré'}>
              <span className={'w-1.5 h-1.5 rounded-full ' + dot(conn.terminal)} /> TPE
            </span>
          </>
        )}
        <button
          className="px-2 py-1 rounded border border-white/20"
          onClick={() => setCurrency(currency === 'EUR' ? 'USD' : 'EUR')}
        >
          {currency === 'EUR' ? '€ EUR' : '$ USD'}
        </button>
        <button
          className="px-2 py-1 rounded border border-white/20 uppercase"
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        >
          {lang}
        </button>
        {user && (
          <button className="px-2 py-1 rounded border border-white/20 text-white/70" onClick={logout}>
            ⏻
          </button>
        )}
      </div>
    </header>
  );
}
