import { useState } from 'react';
import { api } from '../lib/api';
import { useNav } from '../nav';
import { useToast } from '../toast';
import { useI18n } from '../i18n';

const COUNTRY_CODE: Record<string, string> = { france: 'FR', 'united states': 'US', 'états-unis': 'US', 'royaume-uni': 'GB', 'united kingdom': 'GB', italie: 'IT', italy: 'IT' };

interface Money {
  amount: string;
  currencyCode: string;
}
interface Customer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  numberOfOrders?: string | null;
  amountSpent?: Money | null;
  note?: string | null;
  defaultAddress?: {
    address1?: string | null;
    city?: string | null;
    zip?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
  orders?: { nodes: { name: string; createdAt: string; displayFinancialStatus: string; totalPriceSet: { presentmentMoney: Money } }[] };
}

const fullName = (c: Customer) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '(sans nom)';
const money = (m?: Money | null) => (m ? `${parseFloat(m.amount).toFixed(2)} ${m.currencyCode}` : '—');

export function Crm() {
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', note: '' });
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const { goTo, setPosCustomer } = useNav();
  const toast = useToast();
  const { t } = useI18n();

  function choose(c: Customer) {
    const a = c.defaultAddress;
    setPosCustomer({
      firstName: c.firstName ?? undefined,
      lastName: c.lastName ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      address1: a?.address1 ?? undefined,
      city: a?.city ?? undefined,
      zip: a?.zip ?? undefined,
      province: a?.province ?? undefined,
      country: a?.country ? COUNTRY_CODE[a.country.toLowerCase()] ?? undefined : undefined,
      note: c.note ?? undefined,
    });
    toast(`${fullName(c)} rattaché·e à la vente.`, 'info');
    goTo('pos');
  }

  async function saveEdit() {
    if (!selected) return;
    setErr('');
    try {
      await api('/api/crm/customer', { method: 'PUT', body: { id: selected.id, ...form } });
      setEditing(false);
      toast('Client mis à jour.', 'success');
      open(selected);
    } catch (e) {
      toast((e as Error).message, 'error');
      setErr((e as Error).message);
    }
  }

  async function search(query: string) {
    setQ(query);
    setSelected(null);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      const d = await api<{ customers: { nodes: Customer[] } }>('/api/crm/search?q=' + encodeURIComponent(query));
      setResults(d.customers.nodes);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function open(c: Customer) {
    setErr('');
    try {
      const d = await api<{ customer: Customer }>('/api/crm/customer?id=' + encodeURIComponent(c.id));
      setSelected(d.customer);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function create() {
    setErr('');
    setMsg('');
    if (!form.email && !form.lastName) {
      setErr('Email ou nom requis.');
      return;
    }
    try {
      const d = await api<{ customerCreate: { userErrors: { message: string }[] } }>('/api/crm/customer', {
        method: 'POST',
        body: form,
      });
      const ue = d.customerCreate?.userErrors;
      if (ue && ue.length) {
        setErr(ue.map((e) => e.message).join(', '));
        return;
      }
      toast('Client créé.', 'success');
      setMsg('Client créé.');
      setForm({ firstName: '', lastName: '', email: '', phone: '', note: '' });
      setMode('search');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // détail
  if (selected) {
    const a = selected.defaultAddress;
    const missing: string[] = [];
    if (!selected.email) missing.push('email');
    if (!selected.phone) missing.push('téléphone');
    if (!a || !a.address1) missing.push('adresse');
    return (
      <div className="card">
        <button className="text-white/50 text-sm mb-3" onClick={() => { setSelected(null); setEditing(false); }}>
          {t('← Résultats')}
        </button>
        <div className="flex items-center justify-between">
          <h2 className="text-base">{fullName(selected)}</h2>
          <div className="flex gap-3 text-sm">
            <button className="text-azure" onClick={() => { setForm({ firstName: selected.firstName ?? '', lastName: selected.lastName ?? '', email: selected.email ?? '', phone: selected.phone ?? '', note: selected.note ?? '' }); setEditing(!editing); }}>{t('Modifier')}</button>
            <button className="btn py-1" onClick={() => choose(selected)}>{t('Choisir')} →</button>
          </div>
        </div>
        <div className="text-white/60 text-sm mb-3">{selected.email || '—'} · {selected.phone || '—'}</div>

        {editing && (
          <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="field" placeholder={t('Prénom')} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <input className="field" placeholder={t('Nom')} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <input className="field" placeholder={t('Email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="field" placeholder={t('Téléphone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <input className="field" placeholder={t('Notes')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={saveEdit}>{t('Enregistrer')}</button>
              <button className="text-white/50 text-sm px-3" onClick={() => setEditing(false)}>{t('Annuler')}</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <Info label={t('Commandes')} value={selected.numberOfOrders ?? '0'} />
          <Info label={t('Total dépensé')} value={money(selected.amountSpent)} />
          <Info label={t('Adresse')} value={a ? [a.address1, a.zip, a.city, a.country].filter(Boolean).join(', ') : '—'} />
        </div>

        {missing.length > 0 && (
          <div className="mb-3 text-sm text-amber-400">⚠️ Données manquantes : {missing.join(', ')}</div>
        )}

        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t("Habitudes d'achat")}</div>
        <table className="w-full text-sm">
          <tbody>
            {(selected.orders?.nodes ?? []).map((o) => (
              <tr key={o.name} className="border-t border-white/10">
                <td className="py-1.5">{o.name}</td>
                <td className="py-1.5 text-white/60">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="py-1.5">{money(o.totalPriceSet.presentmentMoney)}</td>
                <td className="py-1.5 text-white/60">{o.displayFinancialStatus}</td>
              </tr>
            ))}
            {(selected.orders?.nodes?.length ?? 0) === 0 && (
              <tr><td className="py-2 text-white/40">Aucune commande.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // nouveau client
  if (mode === 'new') {
    return (
      <div className="card">
        <button className="text-white/50 text-sm mb-3" onClick={() => setMode('search')}>{t('← Annuaire')}</button>
        <h2 className="text-base mb-3">{t('Nouveau client')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className="field" placeholder={t('Prénom')} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className="field" placeholder={t('Nom')} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <input className="field" placeholder={t('Email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="field" placeholder={t('Téléphone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <input className="field mt-3" placeholder={t('Notes')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <p className="text-white/40 text-[11px] mt-1">L'adresse postale sera ajoutable à l'étape suivante.</p>
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        <button className="btn w-full mt-3" onClick={create}>{t('Enregistrer le client')}</button>
      </div>
    );
  }

  // annuaire
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base">{t('Annuaire clients')}</h2>
        <button className="btn" onClick={() => setMode('new')}>{t('+ Nouveau client')}</button>
      </div>
      <input className="field mb-2" placeholder={t('Rechercher (email ou nom)…')} value={q} onChange={(e) => search(e.target.value)} />
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {!q.trim() && <p className="text-white/40 text-sm mt-2">Saisis une recherche pour afficher des clients.</p>}
      <div className="divide-y divide-white/10">
        {results.map((c) => (
          <div key={c.id} className="py-2 flex items-center justify-between gap-2">
            <button className="text-left flex-1 hover:opacity-80" onClick={() => open(c)}>
              <span className="block">{fullName(c)}</span>
              <span className="text-white/50 text-xs">{c.email || '—'} · {c.numberOfOrders ?? '0'} cmd · {money(c.amountSpent)}</span>
            </button>
            <div className="flex gap-2 text-xs">
              <button className="text-azure" onClick={() => open(c)}>{t('Modifier')}</button>
              <button className="px-2 py-1 rounded border border-azure text-azure" onClick={() => choose(c)}>{t('Choisir')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/40 text-xs">{label}</div>
      <div>{value}</div>
    </div>
  );
}
