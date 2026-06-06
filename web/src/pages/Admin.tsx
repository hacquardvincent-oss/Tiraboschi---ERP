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
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [items, setItems] = useState<RefItem[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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
      <h2 className="text-base mb-1">Admin — Référentiel (base de données)</h2>
      <p className="text-white/40 text-xs mb-4">
        Les valeurs qui pré-remplissent les formulaires (Collection, POS…).
      </p>

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
              <td className="py-1.5">{it.label}</td>
              <td className="py-1.5 text-right">
                <button className="text-red-400/70 hover:text-red-400" onClick={() => remove(it.id)} title="Supprimer">
                  ✕
                </button>
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
