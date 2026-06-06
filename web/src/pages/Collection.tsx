import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RefSelect } from '../components/RefSelect';

interface Product {
  id: string;
  sku: string;
  name: string;
  priceHtEur?: string | null;
  priceHtUsd?: string | null;
}

const EMPTY = {
  name: '',
  modelCode: '',
  yearCode: '',
  seasonCode: '',
  materialCode: '',
  optionCode: '',
  colorCode: '',
  sizeCode: '',
  animalCode: '',
  skinTypeCode: '',
  liningCode: '',
  atelierCode: '',
  supplierCode: '',
  jewelry: '',
  packaging: '',
  priceHtEur: '',
  priceHtUsd: '',
  costMaterial: '',
  costMaking: '',
};
type Form = typeof EMPTY;

function liveSku(f: Form): string {
  const opt = (f.optionCode || '00').padStart(2, '0');
  return `${(f.modelCode || 'AA000').toUpperCase()}${f.yearCode || '25'}${(f.seasonCode || 'H').toUpperCase()}-${(f.materialCode || 'CU000').toUpperCase()}${opt}-${f.colorCode || '000'}`;
}

export function Collection() {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = (query = '') =>
    api<Product[]>('/api/products' + (query ? '?q=' + encodeURIComponent(query) : ''))
      .then(setProducts)
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    if (view === 'list') load(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });
  const setInput = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!form.name) {
      setErr('Le nom du produit est requis.');
      return;
    }
    setSaving(true);
    try {
      const { jewelry, ...rest } = form;
      await api('/api/products', {
        method: 'POST',
        body: { ...rest, jewelryCodes: jewelry ? [jewelry] : [] },
      });
      setForm(EMPTY);
      setView('list');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (view === 'form') {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base">Nouvelle fiche technique</h2>
          <button className="text-white/50 text-sm" onClick={() => setView('list')}>
            ← Catalogue
          </button>
        </div>

        <div className="text-center mb-4">
          <div className="text-xs text-white/40">SKU généré</div>
          <div className="text-xl font-semibold tracking-wider text-azure break-all">{liveSku(form)}</div>
        </div>

        <Section title="Identité">
          <F label="Nom produit *">
            <input className="field" value={form.name} onChange={setInput('name')} />
          </F>
          <F label="Modèle"><RefSelect category="models" value={form.modelCode} onChange={set('modelCode')} /></F>
          <F label="Année"><RefSelect category="years" value={form.yearCode} onChange={set('yearCode')} /></F>
          <F label="Saison"><RefSelect category="seasons" value={form.seasonCode} onChange={set('seasonCode')} /></F>
          <F label="Matière (ID)">
            <input className="field" value={form.materialCode} onChange={setInput('materialCode')} placeholder="CU002 / CE001" />
          </F>
          <F label="Option"><RefSelect category="options" value={form.optionCode} onChange={set('optionCode')} /></F>
          <F label="Couleur"><RefSelect category="colors" value={form.colorCode} onChange={set('colorCode')} /></F>
          <F label="Taille"><RefSelect category="sizes" value={form.sizeCode} onChange={set('sizeCode')} /></F>
        </Section>

        <Section title="Nomenclature (BOM)">
          <F label="Animal"><RefSelect category="animalTypes" value={form.animalCode} onChange={set('animalCode')} /></F>
          <F label="Type de peau"><RefSelect category="skinTypes" value={form.skinTypeCode} onChange={set('skinTypeCode')} /></F>
          <F label="Doublure"><RefSelect category="linings" value={form.liningCode} onChange={set('liningCode')} /></F>
          <F label="Bijouterie"><RefSelect category="jewelry" value={form.jewelry} onChange={set('jewelry')} /></F>
          <F label="Atelier"><RefSelect category="ateliers" value={form.atelierCode} onChange={set('atelierCode')} /></F>
          <F label="Fournisseur"><RefSelect category="suppliers" value={form.supplierCode} onChange={set('supplierCode')} /></F>
          <F label="Packaging">
            <input className="field" value={form.packaging} onChange={setInput('packaging')} />
          </F>
        </Section>

        <Section title="Finance">
          <F label="Prix HT € (EUR)"><input className="field" type="number" step="0.01" value={form.priceHtEur} onChange={setInput('priceHtEur')} /></F>
          <F label="Prix HT $ (USD)"><input className="field" type="number" step="0.01" value={form.priceHtUsd} onChange={setInput('priceHtUsd')} /></F>
          <F label="Coût matière"><input className="field" type="number" step="0.01" value={form.costMaterial} onChange={setInput('costMaterial')} /></F>
          <F label="Coût façon"><input className="field" type="number" step="0.01" value={form.costMaking} onChange={setInput('costMaking')} /></F>
        </Section>

        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        <button className="btn w-full mt-4" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer la fiche'}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base">Collection — Catalogue</h2>
        <button className="btn" onClick={() => setView('form')}>
          + Nouvelle fiche
        </button>
      </div>
      <input
        className="field mb-3"
        placeholder="Rechercher (SKU ou nom)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          load(e.target.value);
        }}
      />
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-1">SKU</th>
            <th className="py-1">Produit</th>
            <th className="py-1">€ HT</th>
            <th className="py-1">$ HT</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-white/10">
              <td className="py-1.5 font-mono text-azure">{p.sku}</td>
              <td className="py-1.5">{p.name}</td>
              <td className="py-1.5">{p.priceHtEur ?? '—'}</td>
              <td className="py-1.5">{p.priceHtUsd ?? '—'}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-white/40">
                Aucune fiche. Crée-en une avec « + Nouvelle fiche ».
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}
