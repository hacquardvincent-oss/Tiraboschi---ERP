import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../toast';
import { useI18n } from '../i18n';
import { EmptyState } from '../components/ui';

interface Sale {
  id: string;
  reference: string;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  totalCents: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  shopifyOrderName?: string | null;
  syncError?: string | null;
  paymentUrl?: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<Sale['status'], string> = {
  PENDING: 'À encaisser',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
};

export function Sales() {
  const toast = useToast();
  const { t } = useI18n();
  const [sales, setSales] = useState<Sale[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => api<Sale[]>('/api/pos/sales').then(setSales).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  async function pay(id: string) {
    setBusy(id);
    setErr('');
    try {
      await api('/api/pos/sales/' + id + '/pay', { method: 'POST', body: {} });
      await load();
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
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function genLink(id: string) {
    setBusy(id);
    setErr('');
    try {
      const res = await api<{ url: string }>('/api/pos/sales/' + id + '/payment-link', { method: 'POST', body: {} });
      await load();
      navigator.clipboard?.writeText(res.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function refund(id: string) {
    if (!confirm('Rembourser cette vente ? Le remboursement Stripe sera déclenché.')) return;
    setBusy(id);
    setErr('');
    try {
      await api('/api/pos/sales/' + id + '/refund', { method: 'POST', body: {} });
      toast('Vente remboursée.', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function cancel(id: string) {
    if (!confirm('Annuler cette vente ?')) return;
    setBusy(id);
    setErr('');
    try {
      await api('/api/pos/sales/' + id + '/cancel', { method: 'POST', body: {} });
      toast('Vente annulée.', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const fmt = (s: Sale) => (s.totalCents / 100).toFixed(2) + ' ' + (s.currency === 'EUR' ? '€' : '$');
  const filtered = sales.filter((s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      s.reference.toLowerCase().includes(t) ||
      (s.customerName ?? '').toLowerCase().includes(t) ||
      (s.customerEmail ?? '').toLowerCase().includes(t) ||
      (s.shopifyOrderName ?? '').toLowerCase().includes(t)
    );
  });

  return (
    <div className="card">
      <h2 className="text-base mb-3">{t('Ventes')}</h2>
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
          {filtered.map((s) => (
            <tr key={s.id} className="border-t border-white/10 align-top">
              <td className="py-1.5">
                <div className="font-mono text-xs">{s.reference}</div>
                <div className="text-white/40 text-xs">{new Date(s.createdAt).toLocaleString()}</div>
              </td>
              <td className="py-1.5">{s.customerName || s.customerEmail || '—'}</td>
              <td className="py-1.5">{fmt(s)}</td>
              <td className="py-1.5">{t(STATUS_LABEL[s.status])}</td>
              <td className="py-1.5">
                {s.shopifyOrderName ? (
                  <span className="text-green-400">{s.shopifyOrderName}</span>
                ) : s.status === 'PAID' ? (
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
                {s.status === 'PENDING' && (
                  <div className="flex gap-3 justify-end">
                    <button className="text-azure" disabled={busy === s.id} onClick={() => genLink(s.id)}>
                      {busy === s.id ? '…' : s.paymentUrl ? t('Lien') + ' ↻' : t('Lien')}
                    </button>
                    <button className="text-white/60" disabled={busy === s.id} onClick={() => pay(s.id)}>
                      {t('Encaisser')}
                    </button>
                  </div>
                )}
                {s.status === 'PAID' && (
                  <div className="flex gap-3 justify-end items-center">
                    {s.syncStatus === 'FAILED' && (
                      <button className="text-amber-400" disabled={busy === s.id} onClick={() => resync(s.id)}>
                        {busy === s.id ? '…' : t('Resync')}
                      </button>
                    )}
                    <a className="text-azure" href={'/receipt/' + s.id} target="_blank" rel="noreferrer">{t('Reçu')}</a>
                    <button className="text-white/60" disabled={busy === s.id} onClick={() => refund(s.id)}>{t('Rembourser')}</button>
                  </div>
                )}
                {s.status === 'PENDING' && (
                  <button className="text-red-400/70 mt-1" disabled={busy === s.id} onClick={() => cancel(s.id)}>{t('Annuler')}</button>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6}>
                <EmptyState title={t('Aucune vente')} hint={t('Enregistre une commande depuis le POS.')} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-white/40 text-[11px] mt-2">
        « Encaisser » = marquage payé intérim (encaissement externe). Dès l'étape 3b, le paiement Stripe
        (lien / TPE S710) déclenchera ce marquage, et la commande Shopify est créée automatiquement.
      </p>
    </div>
  );
}
