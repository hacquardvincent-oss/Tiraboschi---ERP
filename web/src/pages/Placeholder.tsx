import { useI18n } from '../i18n';

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useI18n();
  return (
    <div className="card text-center py-10">
      <h2 className="text-base mb-2">{t(titleKey)}</h2>
      <p className="text-white/40 text-sm">{t('common.soon')}</p>
    </div>
  );
}
