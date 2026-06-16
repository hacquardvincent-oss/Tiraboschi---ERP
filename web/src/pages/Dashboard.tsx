import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store';
import { useI18n } from '../i18n';

interface Reports {
  currency: string;
  daily: number;
  weekly: number;
  monthly: number;
  orderCount: number;
  crmCount: number | null;
  recent: { name: string; createdAt: string; customer: string | null; amount: number; currency: string; status: string }[];
}

const SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

const STATUS_FR: Record<string, string> = {
  PAID: 'Payé',
  PENDING: 'En attente',
  REFUNDED: 'Remboursé',
  PARTIALLY_REFUNDED: 'Part. remboursé',
  VOIDED: 'Annulé',
  AUTHORIZED: 'Autorisé',
};

export function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rep, setRep] = useState<Reports | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Reports>('/api/reports')
      .then(setRep)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const money = (n: number, cur = rep?.currency ?? 'EUR') =>
    n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' ' + (SYM[cur] ?? cur);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-base">{t('Bonjour')} {user?.firstName || ''}</h2>
        <p className="text-white/40 text-xs">{t('Activité Shopify — 31 derniers jours')}</p>
      </div>

      {loading && <p className="text-white/40 text-sm">{t('Chargement des KPIs…')}</p>}
      {err && (
        <div className="card">
          <p className="text-red-400 text-sm">KPIs indisponibles : {err}</p>
          <p className="text-white/40 text-xs mt-1">Vérifie la connexion Shopify (config back).</p>
        </div>
      )}

      {rep && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={t("Aujourd'hui")} value={money(rep.daily)} accent />
            <Kpi label={t('Cette semaine')} value={money(rep.weekly)} />
            <Kpi label={t('Ce mois')} value={money(rep.monthly)} />
            <Kpi label={t('Base clients')} value={rep.crmCount === null ? '—' : String(rep.crmCount)} />
          </div>

          <div className="card">
            <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">
              {t('Dernières transactions')}
            </div>
            {rep.recent.length === 0 && <p className="text-white/40 text-sm">{t('Aucune transaction récente.')}</p>}
            {rep.recent.map((o) => (
              <div key={o.name} className="flex items-center justify-between py-1.5 border-b border-white/10 text-sm">
                <div>
                  <div className="font-mono text-azure text-xs">{o.name}</div>
                  <div className="text-white/50 text-xs">
                    {o.customer || t('Client inconnu')} · {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="text-right">
                  <div>{money(o.amount, o.currency)}</div>
                  <div className="text-white/40 text-[11px]">{STATUS_FR[o.status] ?? o.status}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card">
      <div className="text-white/50 text-xs uppercase tracking-editorial">{label}</div>
      <div className={'text-xl font-semibold mt-1 ' + (accent ? 'text-azure' : '')}>{value}</div>
    </div>
  );
}
