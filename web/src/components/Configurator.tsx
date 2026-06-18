import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Thumb } from './ui';

export interface ConfigProduct {
  id: string;
  sku: string;
  name: string;
  priceHtEur?: string | null;
  priceHtUsd?: string | null;
  imageUrl?: string | null;
  modelCode?: string | null;
  materialCode?: string | null;
  optionCode?: string | null;
  colorCode?: string | null;
}
interface RefItem { code: string; label: string }

const modelName = (p: ConfigProduct) => (p.name?.split(/[–—-]/)[0] ?? '').trim() || p.modelCode || '(modèle)';

/**
 * Configurateur de vente par listes déroulantes : Modèle → Matière → Option → Coloris.
 * Le sélecteur de modèle reste toujours accessible (on enchaîne plusieurs modèles sans repartir de zéro).
 */
export function Configurator({ currency, onAdd }: { currency: 'EUR' | 'USD'; onAdd: (p: ConfigProduct) => void }) {
  const [products, setProducts] = useState<ConfigProduct[]>([]);
  const [labels, setLabels] = useState<Record<string, Map<string, string>>>({});
  const [model, setModel] = useState('');
  const [material, setMaterial] = useState('');
  const [option, setOption] = useState('');
  const [color, setColor] = useState('');

  useEffect(() => {
    api<ConfigProduct[]>('/api/products?q=').then(setProducts).catch(() => setProducts([]));
    Promise.all(
      (['materials', 'options', 'colors'] as const).map((c) =>
        api<RefItem[]>('/api/ref/' + c).then((r) => [c, new Map(r.map((x) => [x.code, x.label]))] as const).catch(() => [c, new Map()] as const),
      ),
    ).then((e) => setLabels(Object.fromEntries(e)));
  }, []);

  const lab = (cat: string, code: string, prefix = '') => labels[cat]?.get(code) ?? (prefix ? prefix + ' ' + code : code);
  const price = (p: ConfigProduct) => parseFloat((currency === 'EUR' ? p.priceHtEur : p.priceHtUsd) ?? '0') || 0;
  const fmt = (p: ConfigProduct) => price(p).toFixed(2) + (currency === 'EUR' ? ' €' : ' $');
  const uniq = (arr: (string | null | undefined)[]) => [...new Set(arr.filter((x): x is string => !!x))];

  const models = useMemo(() => uniq(products.map(modelName)).sort(), [products]);
  const ofModel = useMemo(() => products.filter((p) => modelName(p) === model), [products, model]);
  const materials = useMemo(() => uniq(ofModel.map((p) => p.materialCode)), [ofModel]);
  const ofMaterial = useMemo(() => ofModel.filter((p) => p.materialCode === material), [ofModel, material]);
  const options = useMemo(() => uniq(ofMaterial.map((p) => p.optionCode)), [ofMaterial]);
  const ofOption = useMemo(() => ofMaterial.filter((p) => p.optionCode === option), [ofMaterial, option]);
  const selected = ofOption.find((p) => p.colorCode === color) ?? null;

  return (
    <div className="mt-2 space-y-2">
      <select className="field" value={model} onChange={(e) => { setModel(e.target.value); setMaterial(''); setOption(''); setColor(''); }}>
        <option value="">— Modèle —</option>
        {models.map((m) => <option key={m} value={m}>{m}</option>)}
        {models.length === 0 && <option disabled>Aucun produit — importe le catalogue</option>}
      </select>
      {model && (
        <select className="field" value={material} onChange={(e) => { setMaterial(e.target.value); setOption(''); setColor(''); }}>
          <option value="">— Matière —</option>
          {materials.map((c) => <option key={c} value={c}>{lab('materials', c)}</option>)}
        </select>
      )}
      {model && material && (
        <select className="field" value={option} onChange={(e) => { setOption(e.target.value); setColor(''); }}>
          <option value="">— Option —</option>
          {options.map((c) => <option key={c} value={c}>{lab('options', c, 'Option')}</option>)}
        </select>
      )}
      {model && material && option && (
        <select className="field" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">— Coloris —</option>
          {ofOption.map((p) => <option key={p.id} value={p.colorCode ?? ''}>{lab('colors', p.colorCode ?? '')}</option>)}
        </select>
      )}
      {selected && (
        <button className="btn w-full flex items-center gap-3 justify-center" onClick={() => { onAdd(selected); setColor(''); }}>
          <Thumb src={selected.imageUrl} alt={selected.name} size={28} />
          + {selected.name} · {fmt(selected)}
        </button>
      )}
    </div>
  );
}
