import { useAuth, useCurrency } from '../store';
import { useI18n } from '../i18n';

export function Header() {
  const { user, logout } = useAuth();
  const { lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();

  return (
    <header className="sticky top-0 z-10 bg-ink border-b border-white/10 px-4 py-3 flex items-center justify-between"
      style={{ boxShadow: '0 2px 0 0 #00D4FF' }}>
      <div className="text-azure font-semibold tracking-editorial text-sm">TIRABOSCHI</div>
      <div className="flex items-center gap-2 text-xs">
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
