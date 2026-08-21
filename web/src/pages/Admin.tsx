import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api';
import { Tabs } from '../components/ui';
import { useI18n } from '../i18n';

interface RefItem {
  id: string;
  category: string;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  models: 'Modèles',
  years: 'Années',
  seasons: 'Saisons',
  options: 'Options',
  optionTypes: "Types d'option",
  colors: 'Couleurs',
  sizes: 'Tailles',
  globalMaterials: 'Matières globales',
  animalTypes: 'Animaux',
  skinTypes: 'Types de peau',
  linings: 'Doublures',
  materialDetails: 'Détails matière',
  suppliers: 'Fournisseurs',
  jewelry: 'Bijouterie',
  origins: 'Origines',
  hsCodes: 'Codes HS',
  ateliers: 'Ateliers',
};

export function Admin() {
  const [adminTab, setAdminTab] = useState<'bdd' | 'users' | 'coherence'>('bdd');
  return (
    <div>
      <div className="mb-3">
        <Tabs active={adminTab} onChange={setAdminTab} tabs={[['bdd', 'Base de données'], ['users', 'Utilisateurs'], ['coherence', 'Cohérence']] as ['bdd' | 'users' | 'coherence', string][]} />
      </div>
      {adminTab === 'bdd' && (
        <>
          <GlobalSettings />
          <RefAdmin />
        </>
      )}
      {adminTab === 'users' && <UsersAdmin />}
      {adminTab === 'coherence' && <BddAssistant />}
    </div>
  );
}

function BddAssistant() {
  const { t } = useI18n();
  const [seg, setSeg] = useState({ cat: '', ani: '', typ: '', col: '' });
  const [exists, setExists] = useState<boolean | null>(null);
  const [conflicts, setConflicts] = useState<{ labelConflicts: { label: string; codes: string[] }[]; codeConflicts: { code: string; labels: string[] }[] } | null>(null);
  const code = [seg.cat, seg.ani, seg.typ, seg.col].map((s) => s.trim().toUpperCase()).filter(Boolean).join('-');

  useEffect(() => {
    api<typeof conflicts>('/api/ref/color-conflicts').then(setConflicts).catch(() => {});
  }, []);
  useEffect(() => {
    if (code.split('-').length < 4) { setExists(null); return; }
    const id = setTimeout(() => {
      api<{ exists: boolean }>('/api/erp/material-exists?code=' + encodeURIComponent(code)).then((r) => setExists(r.exists)).catch(() => setExists(null));
    }, 300);
    return () => clearTimeout(id);
  }, [code]);

  return (
    <>
      <div className="card mb-4">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t("Générateur d'ID matière")}</div>
        <div className="text-[11px] text-white/40 mb-2">{t('Format : Catégorie-Animal-Type-Couleur (ex. PEA-VEA-DEL-001)')}</div>
        <div className="grid grid-cols-4 gap-2">
          <input className="field" placeholder="CAT" value={seg.cat} onChange={(e) => setSeg({ ...seg, cat: e.target.value })} />
          <input className="field" placeholder="ANI" value={seg.ani} onChange={(e) => setSeg({ ...seg, ani: e.target.value })} />
          <input className="field" placeholder="TYP" value={seg.typ} onChange={(e) => setSeg({ ...seg, typ: e.target.value })} />
          <input className="field" placeholder="COL" value={seg.col} onChange={(e) => setSeg({ ...seg, col: e.target.value })} />
        </div>
        {code && (
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-lg text-azure">{code}</span>
            {exists === true && <span className="text-red-400 text-xs">⚠ {t('déjà utilisé')}</span>}
            {exists === false && <span className="text-green-400 text-xs">✓ {t('disponible')}</span>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Conflits de coloris')}</div>
        {!conflicts && <p className="text-white/40 text-sm">{t('common.loading')}</p>}
        {conflicts && conflicts.labelConflicts.length === 0 && conflicts.codeConflicts.length === 0 && (
          <p className="text-green-400/80 text-sm">{t('Aucun conflit ✓')}</p>
        )}
        {conflicts?.labelConflicts.map((c) => (
          <div key={c.label} className="flex justify-between py-1 text-sm border-b border-white/10">
            <span>« {c.label} »</span>
            <span className="text-amber-400 font-mono text-xs">{c.codes.join(', ')}</span>
          </div>
        ))}
        {conflicts?.codeConflicts.map((c) => (
          <div key={c.code} className="flex justify-between py-1 text-sm border-b border-white/10">
            <span className="font-mono text-xs">{c.code}</span>
            <span className="text-amber-400">{c.labels.join(', ')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function GlobalSettings() {
  const { t } = useI18n();
  const [shipping, setShipping] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api<{ value: string | null }>('/api/settings/globalShippingUsd').then((s) => setShipping(s.value ?? '')).catch(() => {});
  }, []);
  async function save() {
    try {
      await api('/api/settings/globalShippingUsd', { method: 'PUT', body: { value: shipping } });
      setMsg('Enregistré.');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <div className="card mb-4">
      <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Frais de port globaux (Expédié DDP)')}</div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold mb-1">{t('Montant $ (pré-rempli au POS)')}</label>
          <input className="field" type="number" step="0.01" placeholder="ex. 100" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </div>
        <button className="btn" onClick={save}>{t('Enregistrer')}</button>
        {msg && <span className="text-green-400 text-xs">{msg}</span>}
      </div>
    </div>
  );
}

function RefAdmin() {
  const { t } = useI18n();
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [items, setItems] = useState<RefItem[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [impCat, setImpCat] = useState('');
  const [impCsv, setImpCsv] = useState('');
  const [impMode, setImpMode] = useState<'full' | 'single' | 'multi'>('full');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  useEffect(() => {
    api<string[]>('/api/ref/categories')
      .then((c) => {
        setCats(c);
        if (c.length) setCat((prev) => prev || c[0]);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!cat) return;
    api<RefItem[]>('/api/ref/' + cat)
      .then(setItems)
      .catch((e) => setErr((e as Error).message));
  }, [cat]);

  async function reload() {
    setItems(await api<RefItem[]>('/api/ref/' + cat));
  }

  async function add() {
    setErr('');
    setMsg('');
    if (!code || !label) {
      setErr('Code et libellé requis.');
      return;
    }
    try {
      await api('/api/ref', { method: 'POST', body: { category: cat, code, label } });
      setCode('');
      setLabel('');
      setMsg('Ajouté.');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function runImport() {
    setErr('');
    setMsg('');
    if (!impCsv.trim()) return setErr('CSV requis.');
    try {
      let r: { created: number; updated: number; skipped: number };
      if (impMode === 'full') {
        r = await api('/api/ref/import-full', { method: 'POST', body: { csv: impCsv } });
      } else if (impMode === 'multi') {
        r = await api('/api/ref/import-multi', { method: 'POST', body: { csv: impCsv } });
      } else {
        const category = (impCat || cat).trim();
        if (!category) return setErr('Catégorie requise.');
        r = await api('/api/ref/import', { method: 'POST', body: { category, csv: impCsv } });
      }
      setMsg(`${r.created} créé(s), ${r.updated} mis à jour, ${r.skipped} ignoré(s).`);
      setImpCsv('');
      const c = await api<string[]>('/api/ref/categories');
      setCats(c);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function exportCsv() {
    setErr('');
    try {
      await apiDownload('/api/ref/export', 'referentiel.csv');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Générateur d'ID : règles exactes de la V1 (le libellé sert aux règles années/saisons/CU-CE).
  async function generateCode() {
    setErr('');
    if (!cat) return;
    try {
      const r = await api<{ code: string }>('/api/ref/' + encodeURIComponent(cat) + '/next-code?name=' + encodeURIComponent(label));
      setCode(r.code);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveEdit(id: string) {
    try {
      await api('/api/ref/' + id, { method: 'PUT', body: { label: editLabel } });
      setEditId(null);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api('/api/ref/' + id, { method: 'DELETE' });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base">{t('Admin — Référentiel (base de données)')}</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={exportCsv}>{t('Exporter CSV')}</button>
          <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={() => setShowImport(!showImport)}>{t('Importer CSV')}</button>
        </div>
      </div>
      <p className="text-white/40 text-xs mb-4">
        Les valeurs qui pré-remplissent les formulaires (Collection, POS…).
      </p>

      {showImport && (
        <div className="border border-white/10 rounded p-3 mb-4 space-y-2">
          <div className="flex gap-2 text-xs">
            {([['full', 'Base complète'], ['single', 'Une catégorie'], ['multi', 'Multi-colonnes']] as ['full' | 'single' | 'multi', string][]).map(([m, lbl]) => (
              <label key={m} className={'px-2 py-1 rounded border cursor-pointer ' + (impMode === m ? 'border-azure text-azure' : 'border-white/20 text-white/50')}>
                <input type="radio" className="hidden" checked={impMode === m} onChange={() => setImpMode(m)} />
                {t(lbl)}
              </label>
            ))}
          </div>
          <div className="text-xs text-white/50">
            {impMode === 'full' && 'Toute la base en un seul fichier — colonnes : category;code;label (format identique à l’export, pour corriger/réimporter en masse).'}
            {impMode === 'single' && 'Une seule catégorie ; colonnes reconnues : code et/ou label (code = libellé si absent).'}
            {impMode === 'multi' && 'Chaque colonne devient une liste (en-tête = nom de catégorie ; valeurs = entrées).'}
          </div>
          {impMode === 'single' && <input className="field" placeholder="Catégorie (ex. ateliers, suppliers, animalTypes…)" value={impCat || cat} onChange={(e) => setImpCat(e.target.value)} />}
          <input type="file" accept=".csv,text/csv" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setImpCsv); }} />
          <textarea className="field font-mono text-[11px]" rows={3} placeholder={impMode === 'full' ? 'category;code;label' : impMode === 'multi' ? 'colonne1;colonne2…' : 'code;label  (ou label seul)'} value={impCsv} onChange={(e) => setImpCsv(e.target.value)} />
          <button className="btn" onClick={runImport}>Importer</button>
        </div>
      )}

      <label className="block text-xs font-semibold mb-1">{t('Catégorie')}</label>
      <select className="field mb-4" value={cat} onChange={(e) => setCat(e.target.value)}>
        {cats.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c] ?? c} ({c})
          </option>
        ))}
      </select>

      <div className="flex gap-2 items-end mb-3">
        <div className="w-40">
          <label className="block text-xs font-semibold mb-1">{t('Code / ID')}</label>
          <div className="flex gap-1">
            <input className="field font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AA009" />
            <button type="button" className="px-2 rounded border border-white/20 text-white/70 text-xs whitespace-nowrap" onClick={generateCode} title={t('Calculer le prochain ID')}>{t('Générer')}</button>
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold mb-1">{t('Libellé')}</label>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('Libellé')} />
        </div>
        <button className="btn" onClick={add}>
          {t('Ajouter')}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {msg && <p className="text-green-400 text-sm">{msg}</p>}

      <table className="w-full text-sm mt-2">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-1 w-28">{t('Code')}</th>
            <th className="py-1">{t('Libellé')}</th>
            <th className="py-1 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-white/10">
              <td className="py-1.5 font-mono">{it.code}</td>
              <td className="py-1.5">
                {editId === it.id ? (
                  <input className="field py-1" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} autoFocus />
                ) : (
                  it.label
                )}
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">
                {editId === it.id ? (
                  <>
                    <button className="text-azure text-xs mr-2" onClick={() => saveEdit(it.id)}>OK</button>
                    <button className="text-white/40 text-xs" onClick={() => setEditId(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <button className="text-azure text-xs mr-3" onClick={() => { setEditId(it.id); setEditLabel(it.label); }}>{t('Modifier')}</button>
                    <button className="text-red-400/70 hover:text-red-400" onClick={() => remove(it.id)} title="Supprimer">✕</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={3} className="py-3 text-white/40">
                Aucune entrée.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface AppUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'ADMIN' | 'SELLER';
  permissions: string[];
  active: boolean;
}
const MODULES: [string, string][] = [
  ['dashboard', 'Accueil'],
  ['pos', 'Caisse'],
  ['collection', 'Collection'],
  ['crm', 'Clients'],
  ['sales', 'Ventes'],
  ['inventory', 'OPS / Stock'],
  ['admin', 'Admin'],
];
const EMPTY_USER = { email: '', password: '', firstName: '', lastName: '', role: 'SELLER' as 'ADMIN' | 'SELLER', permissions: [] as string[] };

function UsersAdmin() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ ...EMPTY_USER });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const reload = () => api<AppUser[]>('/api/users').then(setUsers).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    reload();
  }, []);

  function openNew() {
    setEditingId(null);
    setF({ ...EMPTY_USER });
    setAdding(true);
    setErr('');
    setMsg('');
  }
  function openEdit(u: AppUser) {
    setEditingId(u.id);
    setF({ email: u.email, password: '', firstName: u.firstName ?? '', lastName: u.lastName ?? '', role: u.role, permissions: u.permissions });
    setAdding(true);
    setErr('');
    setMsg('');
  }
  function togglePerm(code: string) {
    setF((s) => ({ ...s, permissions: s.permissions.includes(code) ? s.permissions.filter((p) => p !== code) : [...s.permissions, code] }));
  }
  async function save() {
    setErr('');
    setMsg('');
    if (!f.email || (!editingId && !f.password)) return setErr('Email et mot de passe requis.');
    try {
      if (editingId) {
        const { ...body } = f;
        await api('/api/users/' + editingId, { method: 'PATCH', body });
      } else {
        await api('/api/users', { method: 'POST', body: f });
      }
      setAdding(false);
      setMsg('Enregistré.');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      await api('/api/users/' + id, { method: 'DELETE' });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base">{t('Gestion des utilisateurs')}</h2>
        <button className="btn" onClick={openNew}>{t('+ Utilisateur')}</button>
      </div>
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}

      {adding && (
        <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="field" placeholder={t('Prénom')} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <input className="field" placeholder={t('Nom')} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            <input className="field" type="email" placeholder={t('Email')} value={f.email} disabled={!!editingId} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className="field" type="password" placeholder={editingId ? t('Nouveau mot de passe (option)') : t('Mot de passe')} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'ADMIN' | 'SELLER' })}>
            <option value="SELLER">{t('Vendeur')}</option>
            <option value="ADMIN">{t('Administrateur')}</option>
          </select>
          <div>
            <div className="text-[11px] text-white/40 mb-1">{t('Accès par module')}</div>
            <div className="flex flex-wrap gap-2">
              {MODULES.map(([code, label]) => (
                <label key={code} className={'text-xs px-2 py-1 rounded border cursor-pointer ' + (f.permissions.includes(code) ? 'border-azure text-azure' : 'border-white/20 text-white/50')}>
                  <input type="checkbox" className="hidden" checked={f.permissions.includes(code)} onChange={() => togglePerm(code)} />
                  {t(label)}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={save}>{editingId ? t('Enregistrer') : t('Créer')}</button>
            <button className="text-white/50 text-sm px-3" onClick={() => setAdding(false)}>{t('Annuler')}</button>
          </div>
        </div>
      )}

      {users.map((u) => (
        <div key={u.id} className="flex items-center justify-between py-2 border-b border-white/10">
          <div>
            <div className="font-semibold text-sm">{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email} {!u.active && <span className="text-red-400 text-[11px]">({t('Inactif')})</span>}</div>
            <div className="text-white/50 text-[11px]">
              {u.role === 'ADMIN' ? t('Administrateur') : t('Vendeur')} · {u.permissions.length ? u.permissions.join(', ') : '—'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-azure text-xs" onClick={() => openEdit(u)}>{t('Modifier')}</button>
            <button className="text-red-400/70 text-xs" onClick={() => remove(u.id)}>✕</button>
          </div>
        </div>
      ))}
      {users.length === 0 && <p className="text-white/40 text-sm py-2">{t('Aucun utilisateur.')}</p>}
    </div>
  );
}
