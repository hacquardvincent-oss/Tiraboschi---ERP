import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

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
 * Sélection catalogue par VIGNETTES (façon V1) : grille de modèles → clic → déclinaisons.
 * Fil d'Ariane + bouton retour pour naviguer rapidement. Clic sur une déclinaison = ajout au panier.
 */
export function Configurator({ currency, onAdd }: { currency: 'EUR' | 'USD'; onAdd: (p: ConfigProduct) => void }) {
  const { t } = useI18n();
  const [products, setProducts] = useState<ConfigProduct[]>([]);
  const [labels, setLabels] = useState<Record<string, Map<string, string>>>({});
  const [model, setModel] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<ConfigProduct[]>('/api/products?q=').then(setProducts).catch(() => setProducts([]));
    Promise.all(
      (['materials', 'options', 'colors'] as const).map((c) =>
        api<RefItem[]>('/api/ref/' + c).then((r) => [c, new Map(r.map((x) => [x.code, x.label]))] as const).catch(() => [c, new Map()] as const),
      ),
    ).then((e) => setLabels(Object.fromEntries(e)));
  }, []);

  const lab = (cat: string, code?: string | null, prefix = '') =>
    code ? labels[cat]?.get(code) ?? (prefix ? prefix + ' ' + code : code) : '';
  const price = (p: ConfigProduct) => parseFloat((currency === 'EUR' ? p.priceHtEur : p.priceHtUsd) ?? '0') || 0;
  const fmt = (p: ConfigProduct) => price(p).toFixed(0) + (currency === 'EUR' ? ' €' : ' $');

  // Modèles (avec image représentative + nombre de déclinaisons).
  const models = useMemo(() => {
    const map = new Map<string, { name: string; image: string | null; count: number }>();
    for (const p of products) {
      const m = modelName(p);
      const g = map.get(m) ?? { name: m, image: null, count: 0 };
      g.count += 1;
      if (!g.image && p.imageUrl) g.image = p.imageUrl;
      map.set(m, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const variants = useMemo(
    () => (model ? products.filter((p) => modelName(p) === model) : []),
    [products, model],
  );

  // Filtre texte (sur le niveau courant).
  const ql = q.trim().toLowerCase();
  const shownModels = ql ? models.filter((m) => m.name.toLowerCase().includes(ql)) : models;
  const variantLabel = (p: ConfigProduct) =>
    [lab('materials', p.materialCode), lab('colors', p.colorCode), p.optionCode && p.optionCode !== '00' ? lab('options', p.optionCode, 'Opt.') : '']
      .filter(Boolean)
      .join(' · ') || p.name;
  const shownVariants = ql
    ? variants.filter((p) => (p.sku + ' ' + p.name + ' ' + variantLabel(p)).toLowerCase().includes(ql))
    : variants;

  return (
    <div className="mt-2">
      {/* Fil d'Ariane + recherche */}
      <div className="flex items-center gap-2 mb-2 text-sm">
        {model ? (
          <button className="flex items-center gap-1 text-azure" onClick={() => { setModel(null); setQ(''); }}>
            ← <span className="text-white/50">{t('Catalogue')}</span>
          </button>
        ) : (
          <span className="text-white/50 text-xs uppercase tracking-editorial">{t('Catalogue')}</span>
        )}
        {model && <span className="text-white/30">/</span>}
        {model && <span className="font-semibold truncate">{model}</span>}
      </div>
      <input
        className="field mb-3"
        placeholder={model ? t('Filtrer les déclinaisons…') : t('Filtrer les modèles…')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Niveau 0 : modèles */}
      {!model && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {shownModels.map((m) => (
            <button
              key={m.name}
              className="text-left rounded border border-white/10 overflow-hidden hover:border-gold/50 transition-colors group"
              onClick={() => { setModel(m.name); setQ(''); }}
            >
              <div className="aspect-square bg-white/5 overflow-hidden">
                {m.image ? (
                  <img src={m.image} alt={m.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gold/30 text-2xl">◇</div>
                )}
              </div>
              <div className="p-2">
                <div className="text-sm truncate font-medium">{m.name}</div>
                <div className="text-[11px] text-white/40">{m.count} {t('décl.')}</div>
              </div>
            </button>
          ))}
          {shownModels.length === 0 && (
            <p className="col-span-full py-4 text-white/40 text-sm">{t('Aucun modèle — importe le catalogue.')}</p>
          )}
        </div>
      )}

      {/* Niveau 1 : déclinaisons du modèle */}
      {model && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {shownVariants.map((p) => (
            <button
              key={p.id}
              className="text-left rounded border border-white/10 overflow-hidden hover:border-gold/50 transition-colors group"
              onClick={() => onAdd(p)}
              title={t('Ajouter au panier')}
            >
              <div className="aspect-square bg-white/5 overflow-hidden relative">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gold/30 text-2xl">◇</div>
                )}
                <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-ink/80 text-gold opacity-0 group-hover:opacity-100 transition-opacity">+ {t('Ajouter')}</span>
              </div>
              <div className="p-2">
                <div className="text-xs truncate">{variantLabel(p)}</div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-white/30 text-[10px]">{p.sku}</span>
                  <span className="text-sm text-gold">{fmt(p)}</span>
                </div>
              </div>
            </button>
          ))}
          {shownVariants.length === 0 && (
            <p className="col-span-full py-4 text-white/40 text-sm">{t('Aucune déclinaison.')}</p>
          )}
        </div>
      )}
    </div>
  );
}
