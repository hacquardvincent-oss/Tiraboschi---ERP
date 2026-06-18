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
interface RefItem {
  code: string;
  label: string;
}

/**
 * Configurateur de vente guidé : Modèle → Matière → Option → Coloris.
 * Chaque coloris est une déclinaison réelle (produit) ajoutée au panier.
 */
export function Configurator({ currency, onAdd }: { currency: 'EUR' | 'USD'; onAdd: (p: ConfigProduct) => void }) {
  const [products, setProducts] = useState<ConfigProduct[]>([]);
  const [labels, setLabels] = useState<Record<string, Map<string, string>>>({});
  const [model, setModel] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);

  useEffect(() => {
    api<ConfigProduct[]>('/api/products?q=').then(setProducts).catch(() => setProducts([]));
    Promise.all(
      (['models', 'materials', 'options', 'colors'] as const).map((c) =>
        api<RefItem[]>('/api/ref/' + c).then((r) => [c, new Map(r.map((x) => [x.code, x.label]))] as const).catch(() => [c, new Map()] as const),
      ),
    ).then((entries) => setLabels(Object.fromEntries(entries)));
  }, []);

  const lab = (cat: string, code?: string | null) => (code ? labels[cat]?.get(code) ?? code : '—');
  const fmt = (p: ConfigProduct) => {
    const v = parseFloat((currency === 'EUR' ? p.priceHtEur : p.priceHtUsd) ?? '0') || 0;
    return v.toFixed(2) + (currency === 'EUR' ? ' €' : ' $');
  };

  const distinct = (key: keyof ConfigProduct, filter: (p: ConfigProduct) => boolean) => {
    const seen = new Set<string>();
    for (const p of products) {
      if (!filter(p)) continue;
      const v = (p[key] as string | null) ?? '';
      if (v) seen.add(v);
    }
    return [...seen];
  };

  const models = useMemo(() => distinct('modelCode', () => true), [products]);
  const materials = useMemo(() => distinct('materialCode', (p) => p.modelCode === model), [products, model]);
  const options = useMemo(() => distinct('optionCode', (p) => p.modelCode === model && p.materialCode === material), [products, model, material]);
  const colors = useMemo(
    () => products.filter((p) => p.modelCode === model && p.materialCode === material && p.optionCode === option),
    [products, model, material, option],
  );

  const Chip = ({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button
      className={'px-3 py-2 rounded border text-sm ' + (on ? 'border-gold text-gold' : 'border-white/20 text-white/70 hover:border-white/40')}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className="mt-2 border border-white/10 rounded p-3 space-y-3">
      {/* Fil d'Ariane */}
      <div className="text-[11px] text-white/40 flex flex-wrap gap-1">
        <button className={model ? 'text-azure' : 'text-gold'} onClick={() => { setModel(null); setMaterial(null); setOption(null); }}>Modèle</button>
        {model && <>· <button className={material ? 'text-azure' : 'text-gold'} onClick={() => { setMaterial(null); setOption(null); }}>{lab('models', model)}</button></>}
        {material && <>· <button className={option ? 'text-azure' : 'text-gold'} onClick={() => setOption(null)}>{lab('materials', material)}</button></>}
        {option && <>· <span className="text-gold">{option}</span></>}
      </div>

      {!model && (
        <div className="flex flex-wrap gap-2">
          {models.map((m) => <Chip key={m} onClick={() => setModel(m)}>{lab('models', m)}</Chip>)}
          {models.length === 0 && <span className="text-white/40 text-xs">Aucun produit. Importe le catalogue.</span>}
        </div>
      )}
      {model && !material && (
        <div className="flex flex-wrap gap-2">
          {materials.map((m) => <Chip key={m} onClick={() => setMaterial(m)}>{lab('materials', m)}</Chip>)}
        </div>
      )}
      {model && material && !option && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => <Chip key={o} onClick={() => setOption(o)}>Option {o}</Chip>)}
        </div>
      )}
      {model && material && option && (
        <div className="space-y-1">
          {colors.map((p) => (
            <button key={p.id} className="w-full flex items-center gap-3 text-left px-2 py-2 rounded hover:bg-white/5" onClick={() => onAdd(p)}>
              <Thumb src={p.imageUrl} alt={p.name} size={36} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm">{lab('colors', p.colorCode)}</span>
                <span className="font-mono text-azure text-[11px]">{p.sku}</span>
              </span>
              <span className="text-sm">{fmt(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
