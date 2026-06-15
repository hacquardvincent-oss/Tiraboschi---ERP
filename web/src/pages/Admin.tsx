import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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
  const [adminTab, setAdminTab] = useState<'bdd' | 'users'>('bdd');
  return (
    <div>
      <div className="flex gap-2 mb-3 text-sm">
        <button className={'px-3 py-1 rounded border ' + (adminTab === 'bdd' ? 'border-azure text-azure' : 'border-white/20 text-white/60')} onClick={() => setAdminTab('bdd')}>Base de données</button>
        <button className={'px-3 py-1 rounded border ' + (adminTab === 'users' ? 'border-azure text-azure' : 'border-white/20 text-white/60')} onClick={() => setAdminTab('users')}>Utilisateurs</button>
      </div>
      {adminTab === 'bdd' ? (
        <>
          <GlobalSettings />
          <RefAdmin />
        </>
      ) : (
        <UsersAdmin />
      )}
    </div>
  );
}

function GlobalSettings() {
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
      <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Frais de port globaux (Expédié DDP)</div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold mb-1">Montant $ (pré-rempli au POS)</label>
          <input className="field" type="number" step="0.01" placeholder="ex. 100" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </div>
        <button className="btn" onClick={save}>Enregistrer</button>
        {msg && <span className="text-green-400 text-xs">{msg}</span>}
      </div>
    </div>
  );
}

function RefAdmin() {
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
    const category = (impCat || cat).trim();
    if (!category || !impCsv.trim()) return setErr('Catégorie et CSV requis.');
    try {
      const r = await api<{ created: number; updated: number; skipped: number }>('/api/ref/import', {
        method: 'POST',
        body: { category, csv: impCsv },
      });
      setMsg(`${r.created} créé(s), ${r.updated} mis à jour, ${r.skipped} ignoré(s).`);
      setImpCsv('');
      const c = await api<string[]>('/api/ref/categories');
      setCats(c);
      setCat(category);
      reload();
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
        <h2 className="text-base">Admin — Référentiel (base de données)</h2>
        <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={() => setShowImport(!showImport)}>Importer CSV</button>
      </div>
      <p className="text-white/40 text-xs mb-4">
        Les valeurs qui pré-remplissent les formulaires (Collection, POS…).
      </p>

      {showImport && (
        <div className="border border-white/10 rounded p-3 mb-4 space-y-2">
          <div className="text-xs text-white/50">Import d'une liste (colonnes reconnues : <span className="font-mono">code</span> et/ou <span className="font-mono">label</span> ; code = libellé si absent)</div>
          <input className="field" placeholder="Catégorie (ex. ateliers, suppliers, animalTypes…)" value={impCat || cat} onChange={(e) => setImpCat(e.target.value)} />
          <input type="file" accept=".csv,text/csv" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setImpCsv); }} />
          <textarea className="field font-mono text-[11px]" rows={3} placeholder="code;label  (ou label seul)" value={impCsv} onChange={(e) => setImpCsv(e.target.value)} />
          <button className="btn" onClick={runImport}>Importer</button>
        </div>
      )}

      <label className="block text-xs font-semibold mb-1">Catégorie</label>
      <select className="field mb-4" value={cat} onChange={(e) => setCat(e.target.value)}>
        {cats.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c] ?? c} ({c})
          </option>
        ))}
      </select>

      <div className="flex gap-2 items-end mb-3">
        <div className="w-28">
          <label className="block text-xs font-semibold mb-1">Code / ID</label>
          <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AA009" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold mb-1">Libellé</label>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom" />
        </div>
        <button className="btn" onClick={add}>
          Ajouter
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {msg && <p className="text-green-400 text-sm">{msg}</p>}

      <table className="w-full text-sm mt-2">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-1 w-28">Code</th>
            <th className="py-1">Libellé</th>
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
                    <button className="text-azure text-xs mr-3" onClick={() => { setEditId(it.id); setEditLabel(it.label); }}>Modifier</button>
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
        <h2 className="text-base">Gestion des utilisateurs</h2>
        <button className="btn" onClick={openNew}>+ Utilisateur</button>
      </div>
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}

      {adding && (
        <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="field" placeholder="Prénom" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <input className="field" placeholder="Nom" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            <input className="field" type="email" placeholder="Email" value={f.email} disabled={!!editingId} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className="field" type="password" placeholder={editingId ? 'Nouveau mot de passe (option)' : 'Mot de passe'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'ADMIN' | 'SELLER' })}>
            <option value="SELLER">Vendeur</option>
            <option value="ADMIN">Administrateur</option>
          </select>
          <div>
            <div className="text-[11px] text-white/40 mb-1">Accès par module</div>
            <div className="flex flex-wrap gap-2">
              {MODULES.map(([code, label]) => (
                <label key={code} className={'text-xs px-2 py-1 rounded border cursor-pointer ' + (f.permissions.includes(code) ? 'border-azure text-azure' : 'border-white/20 text-white/50')}>
                  <input type="checkbox" className="hidden" checked={f.permissions.includes(code)} onChange={() => togglePerm(code)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={save}>{editingId ? 'Enregistrer' : 'Créer'}</button>
            <button className="text-white/50 text-sm px-3" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </div>
      )}

      {users.map((u) => (
        <div key={u.id} className="flex items-center justify-between py-2 border-b border-white/10">
          <div>
            <div className="font-semibold text-sm">{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email} {!u.active && <span className="text-red-400 text-[11px]">(inactif)</span>}</div>
            <div className="text-white/50 text-[11px]">
              {u.role === 'ADMIN' ? 'Admin' : 'Vendeur'} · accès : [{u.permissions.length ? u.permissions.join(', ') : 'aucun'}]
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-azure text-xs" onClick={() => openEdit(u)}>Modifier</button>
            <button className="text-red-400/70 text-xs" onClick={() => remove(u.id)}>✕</button>
          </div>
        </div>
      ))}
      {users.length === 0 && <p className="text-white/40 text-sm py-2">Aucun utilisateur.</p>}
    </div>
  );
}
