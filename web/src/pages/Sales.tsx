import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api';
import { useToast } from '../toast';
import { useI18n } from '../i18n';
import { EmptyState } from '../components/ui';

type SaleStatus = 'PENDING' | 'AWAITING_BALANCE' | 'PAID' | 'CANCELLED' | 'REFUNDED';

interface Sale {
  id: string;
  reference: string;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  totalCents: number;
  status: SaleStatus;
  paymentPlan: 'FULL' | 'DEPOSIT_50';
  depositCents: number;
  balanceCents: number;
  depositPaidAt?: string | null;
  balancePaidAt?: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  shopifyOrderName?: string | null;
  syncError?: string | null;
  paymentUrl?: string | null;
  createdAt: string;
}

interface Alert {
  id: string;
  reference: string;
  customerName?: string | null;
  currency: string;
  status: SaleStatus;
  dueCents: number;
  kind: 'deposit' | 'balance' | 'full';
  ageDays: number;
}

const STATUS_LABEL: Record<SaleStatus, string> = {
  PENDING: 'À encaisser',
  AWAITING_BALANCE: 'Solde dû',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
};
const STATUS_TONE: Record<SaleStatus, string> = {
  PENDING: 'text-amber-400',
  AWAITING_BALANCE: 'text-azure',
  PAID: 'text-green-400',
  CANCELLED: 'text-white/40',
  REFUNDED: 'text-white/40',
};

const money = (cents: number, currency: string) => (cents / 100).toFixed(2) + ' ' + (currency === 'EUR' ? '€' : '$');

export function Sales() {
  const toast = useToast();
  const { t } = useI18n();
  const [sales, setSales] = useState<Sale[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api<Sale[]>('/api/pos/sales').then(setSales).catch((e) => setErr((e as Error).message));
    api<Alert[]>('/api/pos/sales/alerts').then(setAlerts).catch(() => setAlerts([]));
  };
  useEffect(() => {
    load();
  }, []);

  async function pay(id: string) {
    setBusy(id);
    setErr('');
    try {
      await api('/api/pos/sales/' + id + '/pay', { method: 'POST', body: {} });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function resync(id: string) {
    setBusy(id);
    try {
      await api('/api/pos/sales/' + id + '/sync', { method: 'POST', body: {} });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  /** Génère/renvoie un lien (acompte ou solde) et copie le lien brandé /pay/:id. */
  async function genLink(id: string, leg?: 'deposit' | 'balance' | 'full') {
    setBusy(id);
    setErr('');
    try {
      await api<{ url: string; leg: string }>('/api/pos/sales/' + id + '/payment-link', { method: 'POST', body: leg ? { leg } : {} });
      const branded = `${location.origin}/pay/${id}`;
      navigator.clipboard?.writeText(branded);
      toast(leg === 'balance' ? t('Lien du solde copié.') : t('Lien copié.'), 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function downloadDoc(id: string, type: 'quote' | 'invoice', ref: string) {
    try {
      await apiDownload(`/api/pos/sales/${id}/document?type=${type}`, `${type === 'invoice' ? 'facture' : 'devis'}-${ref}.pdf`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function refund(id: string) {
    if (!confirm('Rembourser cette vente ? Le remboursement Stripe sera déclenché.')) return;
    setBusy(id);
    try {
      await api('/api/pos/sales/' + id + '/refund', { method: 'POST', body: {} });
      toast('Vente remboursée.', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }
  async function cancel(id: string) {
    if (!confirm('Annuler cette vente ?')) return;
    setBusy(id);
    try {
      await api('/api/pos/sales/' + id + '/cancel', { method: 'POST', body: {} });
      toast('Vente annulée.', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  const filtered = sales.filter((s) => {
    const tq = q.trim().toLowerCase();
    if (!tq) return true;
    return (
      s.reference.toLowerCase().includes(tq) ||
      (s.customerName ?? '').toLowerCase().includes(tq) ||
      (s.customerEmail ?? '').toLowerCase().includes(tq) ||
      (s.shopifyOrderName ?? '').toLowerCase().includes(tq)
    );
  });

  return (
    <div className="card">
      <h2 className="text-base mb-3">{t('Ventes')}</h2>

      {/* Alertes paiement : acomptes/soldes en attente */}
      {alerts.length > 0 && (
        <div className="border border-amber-400/30 bg-amber-400/5 rounded p-3 mb-3">
          <div className="text-xs uppercase tracking-editorial text-amber-300/90 mb-2">
            ⚠ {alerts.length} {t('paiement(s) en attente')}
          </div>
          <div className="space-y-1">
            {alerts.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-white/70">
                  {a.customerName || a.reference} · <span className={a.kind === 'balance' ? 'text-azure' : 'text-amber-400'}>{a.kind === 'balance' ? t('Solde dû') : a.kind === 'deposit' ? t('Acompte en attente') : t('Paiement en attente')}</span> {money(a.dueCents, a.currency)}
                  {a.ageDays > 0 && <span className="text-white/30"> · {a.ageDays} j</span>}
                </span>
                <button className="text-azure" disabled={busy === a.id} onClick={() => genLink(a.id, a.kind === 'balance' ? 'balance' : undefined)}>
                  {a.kind === 'balance' ? t('Encaisser le solde') : t('Renvoyer le lien')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <input className="field mb-3" placeholder={t('Rechercher (réf, client, commande)…')} value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-1">{t('Réf / Date')}</th>
            <th className="py-1">{t('Client')}</th>
            <th className="py-1">{t('Total')}</th>
            <th className="py-1">{t('Statut')}</th>
            <th className="py-1">{t('Shopify')}</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const is5050 = s.paymentPlan === 'DEPOSIT_50';
            return (
              <tr key={s.id} className="border-t border-white/10 align-top">
                <td className="py-1.5">
                  <div className="font-mono text-xs">{s.reference}</div>
                  <div className="text-white/40 text-xs">{new Date(s.createdAt).toLocaleString()}</div>
                </td>
                <td className="py-1.5">{s.customerName || s.customerEmail || '—'}</td>
                <td className="py-1.5">
                  {money(s.totalCents, s.currency)}
                  {is5050 && (
                    <div className="text-[10px] text-white/40">
                      {t('Acompte')} {money(s.depositCents, s.currency)} · {t('Solde')} {money(s.balanceCents, s.currency)}
                    </div>
                  )}
                </td>
                <td className={'py-1.5 ' + STATUS_TONE[s.status]}>{t(STATUS_LABEL[s.status])}</td>
                <td className="py-1.5">
                  {s.shopifyOrderName ? (
                    <span className="text-green-400">{s.shopifyOrderName}</span>
                  ) : s.status === 'PAID' || s.status === 'AWAITING_BALANCE' ? (
                    s.syncStatus === 'FAILED' ? (
                      <span className="text-red-400" title={s.syncError ?? ''}>{t('échec sync')}</span>
                    ) : (
                      <span className="text-white/50">{t('sync…')}</span>
                    )
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <div className="flex gap-3 justify-end flex-wrap">
                    {/* Documents */}
                    <button className="text-white/50" onClick={() => downloadDoc(s.id, 'quote', s.reference)}>{t('Devis')}</button>
                    <button className="text-white/50" onClick={() => downloadDoc(s.id, 'invoice', s.reference)}>{t('Facture')}</button>
                    {s.status === 'PENDING' && (
                      <>
                        <button className="text-azure" disabled={busy === s.id} onClick={() => genLink(s.id)}>
                          {busy === s.id ? '…' : s.paymentUrl ? t('Renvoyer le lien') : t('Lien')}
                        </button>
                        <button className="text-white/60" disabled={busy === s.id} onClick={() => pay(s.id)}>{t('Encaisser')}</button>
                      </>
                    )}
                    {s.status === 'AWAITING_BALANCE' && (
                      <button className="text-azure font-medium" disabled={busy === s.id} onClick={() => genLink(s.id, 'balance')}>
                        {busy === s.id ? '…' : t('Encaisser le solde')}
                      </button>
                    )}
                    {s.status === 'PAID' && (
                      <>
                        {s.syncStatus === 'FAILED' && (
                          <button className="text-amber-400" disabled={busy === s.id} onClick={() => resync(s.id)}>{busy === s.id ? '…' : t('Resync')}</button>
                        )}
                        <a className="text-azure" href={'/receipt/' + s.id} target="_blank" rel="noreferrer">{t('Reçu')}</a>
                        <button className="text-white/60" disabled={busy === s.id} onClick={() => refund(s.id)}>{t('Rembourser')}</button>
                      </>
                    )}
                  </div>
                  {(s.status === 'PENDING' || s.status === 'AWAITING_BALANCE') && (
                    <button className="text-red-400/70 mt-1" disabled={busy === s.id} onClick={() => cancel(s.id)}>{t('Annuler')}</button>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6}>
                <EmptyState title={t('Aucune vente')} hint={t('Enregistre une commande depuis le POS.')} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
