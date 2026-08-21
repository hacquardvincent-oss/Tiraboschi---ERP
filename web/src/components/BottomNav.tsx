import { NAV, type Section } from '../sections';
import { useI18n } from '../i18n';

export function BottomNav({
  active,
  onSelect,
}: {
  active: Section;
  onSelect: (s: Section) => void;
}) {
  const { t } = useI18n();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-10 bg-ink border-t border-white/10 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV.map((item) => {
        const on = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={
              'flex-1 flex flex-col items-center gap-0.5 py-2 ' +
              (on ? 'text-azure' : 'text-white/55')
            }
            style={{ minHeight: 56 }}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[0.7rem]">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
