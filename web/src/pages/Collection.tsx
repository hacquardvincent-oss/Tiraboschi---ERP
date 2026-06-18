import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RefSelect } from '../components/RefSelect';
import { Tabs, Thumb } from '../components/ui';
import { useToast } from '../toast';
import { useI18n } from '../i18n';

type ProductStatus = 'DRAFT' | 'IN_REVIEW' | 'VALIDATED';
interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  status: ProductStatus;
  modelCode?: string | null;
  materialCode?: string | null;
  optionCode?: string | null;
  colorCode?: string | null;
  priceHtUsd?: string | null;
  imageUrl?: string | null;
}

interface BomMaterial {
  role: string;
  animal: string;
  type: string;
  color: string;
  qty: string;
  supplier: string;
  details: string;
}
interface BomJewelry {
  details: string;
  qty: string;
  supplier: string;
}
interface Bom {
  options: string[];
  materials: BomMaterial[];
  jewelry: BomJewelry[];
  techSheet?: string; // fiche technique descriptive importée (référence)
}

interface MaterialOpt {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitCost: string | null;
  currency: string;
}
interface BomLineForm {
  materialId: string;
  role: string;
  quantity: string;
  unit: string;
}
const BOM_ROLES = ['principale', 'secondaire', 'tertiaire', 'doublure', 'bijouterie'];

interface Avail {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  inStock: number;
  buildableNow: number;
  path: 'stock' | 'production' | 'blocked';
  readyDate: string | null;
  leadDays: number;
  workshop: { id: string; name: string } | null;
  materialShort: { code: string; name: string; need: number; stock: number; unit: string }[];
  note?: string;
}
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const EMPTY = {
  name: '',
  status: 'DRAFT' as ProductStatus,
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
  dutiesShippingUsd: '',
  finalPriceDdp: '',
  hsCode: '',
  countryOrigin: '',
};
type Form = typeof EMPTY;

const emptyBom = (): Bom => ({ options: [], materials: [], jewelry: [] });

function liveSku(f: Form): string {
  const opt = (f.optionCode || '00').padStart(2, '0');
  return `${(f.modelCode || 'AA000').toUpperCase()}${f.yearCode || '25'}${(f.seasonCode || 'H').toUpperCase()}-${(f.materialCode || 'CU000').toUpperCase()}${opt}-${f.colorCode || '000'}`;
}

export function Collection() {
  const toast = useToast();
  const { t } = useI18n();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [bom, setBom] = useState<Bom>(emptyBom());
  const [materials, setMaterials] = useState<MaterialOpt[]>([]);
  const [bomLines, setBomLines] = useState<BomLineForm[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [newImg, setNewImg] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [validatedBy, setValidatedBy] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [shopifyId, setShopifyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [listMode, setListMode] = useState<'edit' | 'avail' | 'check'>('edit');
  const [gridView, setGridView] = useState(true);
  const [check, setCheck] = useState<{ total: number; incomplete: number; items: { id: string; sku: string; name: string; status: string; missing: string[] }[] } | null>(null);
  const [catalog, setCatalog] = useState<Avail[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  async function importImages() {
    setImporting(true);
    try {
      const r = await api<{ images: number; prices: number; currency: string }>('/api/products/import-images', { method: 'POST', body: {} });
      toast(`Shopify : ${r.images} visuel(s), ${r.prices} prix (${r.currency}) importés.`, r.images || r.prices ? 'success' : 'info');
      load(q);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  }

  const [importKind, setImportKind] = useState<'catalog' | 'tech'>('catalog');
  async function runImport() {
    if (!csvText.trim()) return setImportMsg('Colle un CSV ou choisis un fichier.');
    setImporting(true);
    setImportMsg('');
    try {
      const url = importKind === 'catalog' ? '/api/products/import' : '/api/products/tech-sheets-import';
      const r = await api<{ created: number; updated: number; skipped: number; errors: string[] }>(url, {
        method: 'POST',
        body: { csv: csvText },
      });
      const summary = `${r.created} créé(s), ${r.updated} mis à jour, ${r.skipped} ignoré(s)${r.errors.length ? `, ${r.errors.length} erreur(s)` : ''}.`;
      setImportMsg(summary);
      toast(summary, r.errors.length ? 'info' : 'success');
      setCsvText('');
      load(q);
    } catch (e) {
      setImportMsg((e as Error).message);
      toast((e as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  }

  const load = (query = '') =>
    api<Product[]>('/api/products' + (query ? '?q=' + encodeURIComponent(query) : ''))
      .then(setProducts)
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    if (view === 'list') load(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    api<MaterialOpt[]>('/api/erp/materials').then(setMaterials).catch(() => setMaterials([]));
  }, []);

  useEffect(() => {
    if (view === 'list' && listMode === 'avail') {
      setCatalog(null);
      api<Avail[]>('/api/catalog').then(setCatalog).catch((e) => setErr((e as Error).message));
    }
    if (view === 'list' && listMode === 'check') {
      setCheck(null);
      api<typeof check>('/api/products/incomplete').then(setCheck).catch((e) => setErr((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, listMode]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v } as Form));
  const setInput =
    (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value } as Form));

  function newSheet() {
    setForm(EMPTY);
    setBom(emptyBom());
    setBomLines([]);
    setImages([]);
    setNewImg('');
    setComments([]);
    setNewComment('');
    setValidatedBy(null);
    setValidatedAt(null);
    setEditingId(null);
    setShopifyId(null);
    setErr('');
    setInfo('');
    setView('form');
  }

  async function edit(id: string) {
    setErr('');
    setInfo('');
    try {
      const p = await api<Record<string, unknown>>('/api/products/' + id);
      const next = { ...EMPTY } as Record<string, unknown>;
      (Object.keys(EMPTY) as (keyof Form)[]).forEach((k) => {
        const v = p[k];
        if (v !== null && v !== undefined) next[k] = k === 'status' ? v : String(v);
      });
      if (Array.isArray(p.jewelryCodes)) next.jewelry = (p.jewelryCodes as string[])[0] ?? '';
      setForm(next as Form);
      const b = p.bom as Bom | null;
      setBom(b ? { options: b.options ?? [], materials: b.materials ?? [], jewelry: b.jewelry ?? [], techSheet: b.techSheet } : emptyBom());
      const lines = Array.isArray(p.bomLines)
        ? (p.bomLines as Record<string, unknown>[]).map((l) => ({
            materialId: String(l.materialId),
            role: String(l.role ?? 'principale'),
            quantity: String(l.quantity ?? ''),
            unit: String(l.unit ?? 'piece'),
          }))
        : [];
      setBomLines(lines);
      const imgs = Array.isArray(p.images) ? (p.images as { url: string }[]).map((i) => i.url) : [];
      setImages(imgs.length ? imgs : (p.imageUrl ? [String(p.imageUrl)] : []));
      setNewImg('');
      setComments(Array.isArray(p.comments) ? (p.comments as Comment[]) : []);
      setNewComment('');
      setValidatedBy((p.validatedBy as string | null) ?? null);
      setValidatedAt((p.validatedAt as string | null) ?? null);
      setEditingId(id);
      setShopifyId((p.shopifyProductId as string | null) ?? null);
      setView('form');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function body() {
    const { jewelry, ...rest } = form;
    return { ...rest, jewelryCodes: jewelry ? [jewelry] : [], bom };
  }

  async function save() {
    setErr('');
    setInfo('');
    if (!form.name) return setErr('Le nom du produit est requis.');
    setSaving(true);
    try {
      const saved = editingId
        ? await api<{ id: string }>('/api/products/' + editingId, { method: 'PUT', body: body() })
        : await api<{ id: string }>('/api/products', { method: 'POST', body: body() });
      await api('/api/products/' + saved.id + '/bom', { method: 'PUT', body: { lines: bomLines } });
      await api('/api/products/' + saved.id + '/images', { method: 'PUT', body: { urls: images } });
      setEditingId(saved.id);
      // Recharge la traçabilité de validation (horodatée côté serveur).
      const fresh = await api<{ validatedBy: string | null; validatedAt: string | null }>('/api/products/' + saved.id);
      setValidatedBy(fresh.validatedBy ?? null);
      setValidatedAt(fresh.validatedAt ?? null);
      setInfo('Fiche enregistrée.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addImage() {
    const u = newImg.trim();
    if (!u) return;
    setImages((arr) => (arr.includes(u) ? arr : [...arr, u]));
    setNewImg('');
  }
  function removeImage(i: number) {
    setImages((arr) => arr.filter((_, j) => j !== i));
  }
  function makeCover(i: number) {
    setImages((arr) => (i <= 0 ? arr : [arr[i], ...arr.filter((_, j) => j !== i)]));
  }

  async function addComment() {
    const txt = newComment.trim();
    if (!txt) return;
    if (!editingId) return setErr('Enregistre la fiche avant de commenter.');
    try {
      const c = await api<Comment>('/api/products/' + editingId + '/comments', { method: 'POST', body: { body: txt } });
      setComments((cs) => [c, ...cs]);
      setNewComment('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function syncShopify() {
    if (!editingId) return setErr('Enregistre la fiche avant de synchroniser.');
    setErr('');
    setInfo('');
    setSaving(true);
    try {
      const res = await api<{ shopify: { name: string } }>(`/api/products/${editingId}/sync-shopify`, { method: 'POST', body: {} });
      setShopifyId('synced');
      setInfo(`Synchronisé avec Shopify : ${res.shopify.name}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    if (!confirm('Supprimer cette fiche ?')) return;
    try {
      await api('/api/products/' + editingId, { method: 'DELETE' });
      setView('list');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (view === 'form') return renderForm();

  // ─── Vue liste : arborescence Modèle → Matière → Option → déclinaisons ───────
  const filtered = products.filter((p) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return p.sku.toLowerCase().includes(t) || p.name.toLowerCase().includes(t);
  });
  // Nom de modèle = 1er segment du nom produit ("Jane – Cuir Caviar – Noir" → "Jane")
  const modelName = (p: Product) => (p.name?.split(/[–—-]/)[0] ?? '').trim() || p.modelCode || '(sans modèle)';
  const tree: Record<string, Record<string, Record<string, Product[]>>> = {};
  for (const p of filtered) {
    const m = modelName(p);
    const mat = p.materialCode || '—';
    const opt = p.optionCode || '—';
    ((tree[m] ??= {})[mat] ??= {})[opt] ??= [];
    tree[m][mat][opt].push(p);
  }
  const validated = products.filter((p) => p.status === 'VALIDATED').length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base">Collection</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={importImages} disabled={importing}>{t('Sync Shopify')}</button>
          <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={() => setShowImport(!showImport)}>{t('Importer CSV')}</button>
          <button className="btn" onClick={newSheet}>{t('+ Nouveau modèle')}</button>
        </div>
      </div>
      <div className="text-xs text-white/40 mb-3">{validated} modèle(s) validé(s) · {products.length} déclinaison(s)</div>

      {showImport && (
        <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
          <div className="flex gap-2 text-xs">
            <button className={'px-2 py-1 rounded border ' + (importKind === 'catalog' ? 'border-azure text-azure' : 'border-white/20 text-white/50')} onClick={() => setImportKind('catalog')}>Catalogue</button>
            <button className={'px-2 py-1 rounded border ' + (importKind === 'tech' ? 'border-azure text-azure' : 'border-white/20 text-white/50')} onClick={() => setImportKind('tech')}>Fiches techniques</button>
          </div>
          <div className="text-xs text-white/50">
            {importKind === 'catalog'
              ? 'Import collection (formats app_base / Import Shopify ; upsert par SKU)'
              : 'Import fiches techniques (FICHES, feuille RESUME) → texte de référence par modèle'}
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) f.text().then(setCsvText);
            }}
          />
          <textarea className="field font-mono text-[11px]" rows={4} placeholder="…ou colle le CSV ici (Modèle;Matière;Option;Couleur;Nom;SKU;Prix HT $)" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          <div className="flex items-center gap-3">
            <button className="btn" onClick={runImport} disabled={importing}>{importing ? 'Import…' : 'Importer'}</button>
            {importMsg && <span className="text-xs text-white/70">{importMsg}</span>}
          </div>
        </div>
      )}

      <div className="mb-3">
        <Tabs active={listMode} onChange={setListMode} tabs={[['edit', 'Édition'], ['avail', 'Catalogue & délais'], ['check', 'Contrôle']] as ['edit' | 'avail' | 'check', string][]} />
      </div>

      {listMode === 'edit' && (
        <div className="flex items-center gap-2 mb-3">
          <input
            className="field flex-1"
            placeholder={t('Rechercher (SKU ou nom)…')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              load(e.target.value);
            }}
          />
          <div className="flex gap-1 shrink-0">
            <button className={'px-3 rounded border text-sm ' + (gridView ? 'border-gold text-gold' : 'border-white/20 text-white/50')} style={{ minHeight: 44 }} title={t('Vignettes')} onClick={() => setGridView(true)}>▦</button>
            <button className={'px-3 rounded border text-sm ' + (!gridView ? 'border-gold text-gold' : 'border-white/20 text-white/50')} style={{ minHeight: 44 }} title={t('Liste')} onClick={() => setGridView(false)}>≣</button>
          </div>
        </div>
      )}
      {err && <p className="text-red-400 text-sm">{err}</p>}

      {listMode === 'avail' && <CatalogAvail catalog={catalog} />}

      {listMode === 'check' && (
        <div>
          {!check && <p className="text-white/40 text-sm">{t('common.loading')}</p>}
          {check && (
            <>
              <div className="text-xs text-white/50 mb-3">
                {check.incomplete} / {check.total} {t('fiche(s) à compléter')}
              </div>
              {check.items.map((it) => (
                <button key={it.id} className="w-full text-left flex items-start justify-between gap-2 py-2 border-b border-white/10" onClick={() => edit(it.id)}>
                  <div className="min-w-0">
                    <div className="font-mono text-azure text-xs">{it.sku}</div>
                    <div className="text-sm truncate">{it.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {it.missing.map((m) => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">{m}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-azure text-xs shrink-0">{t('Modifier')}</span>
                </button>
              ))}
              {check.items.length === 0 && <p className="text-green-400/80 text-sm">{t('Toutes les fiches sont complètes ✓')}</p>}
            </>
          )}
        </div>
      )}

      {listMode === 'edit' && Object.keys(tree).length === 0 && (
        <p className="py-3 text-white/40 text-sm">Aucune fiche. Crée-en une avec « + Nouveau modèle ».</p>
      )}

      {/* Galerie de vignettes (PLM) : tuiles image groupées par modèle, clic → fiche */}
      {listMode === 'edit' && gridView && Object.entries(tree).map(([model, mats]) => {
        const decls = Object.values(mats).flatMap((o) => Object.values(o)).flat();
        return (
          <div key={model} className="mb-5">
            <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{model} <span className="text-white/30">· {decls.length}</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {decls.map((p) => <ProductTile key={p.id} p={p} onClick={() => edit(p.id)} />)}
            </div>
          </div>
        );
      })}

      {listMode === 'edit' && !gridView && Object.entries(tree).map(([model, mats]) => {
        const isCollapsed = collapsed[model];
        const count = Object.values(mats).flatMap((o) => Object.values(o)).flat().length;
        return (
          <div key={model} className="border border-white/10 rounded mb-2">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5"
              onClick={() => setCollapsed((c) => ({ ...c, [model]: !c[model] }))}
            >
              <span className="font-semibold">{model}</span>
              <span className="text-white/40 text-xs">{count} décl. {isCollapsed ? '▸' : '▾'}</span>
            </button>
            {!isCollapsed && (
              <div className="px-3 pb-2">
                {Object.entries(mats).map(([mat, opts]) => (
                  <div key={mat} className="mt-1">
                    <div className="text-xs uppercase tracking-editorial text-white/40 mt-2">Matière {mat}</div>
                    {Object.entries(opts).map(([opt, decls]) => (
                      <div key={opt} className="ml-2">
                        <div className="text-[11px] text-white/30 mt-1">Option {opt}</div>
                        {decls.map((p) => (
                          <div key={p.id} className="flex items-center justify-between py-1 text-sm border-b border-white/5">
                            <div className="flex items-center gap-2 min-w-0">
                              <Thumb src={p.imageUrl} alt={p.name} size={48} />
                              <div className="min-w-0">
                                <div className="truncate">{p.name}</div>
                                <div className="font-mono text-white/30 text-[11px]">{p.sku}</div>
                              </div>
                              <StatusBadge status={p.status} />
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-white/60">{p.priceHtUsd ? '$' + p.priceHtUsd : '—'}</span>
                              <button className="text-azure text-xs" onClick={() => edit(p.id)}>{t('Modifier')}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  function renderForm() {
    const bomTotal = bomLines.reduce((s, l) => {
      const mat = materials.find((m) => m.id === l.materialId);
      return s + (mat?.unitCost && l.quantity ? Number(mat.unitCost) * Number(l.quantity) : 0);
    }, 0);
    // PRI (prix de revient) & marge — coût matière = saisie manuelle, sinon nomenclature valorisée.
    const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
    const costMat = num(form.costMaterial) || bomTotal;
    const pri = costMat + num(form.costMaking);
    const priceEur = num(form.priceHtEur);
    const margeEur = priceEur - pri;
    const margePct = priceEur > 0 ? (margeEur / priceEur) * 100 : 0;
    return (
      <div className="card animate-fadeup">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base">{editingId ? t('Fiche technique') : t('Nouvelle fiche technique')}</h2>
          <button className="text-white/50 text-sm" onClick={() => setView('list')}>{t('← Catalogue')}</button>
        </div>

        <div className="text-center mb-4">
          <div className="text-xs text-white/40">{t('SKU généré')}</div>
          <div className="text-xl font-semibold tracking-wider text-azure break-all">{liveSku(form)}</div>
        </div>

        <Section title="1. Identification">
          <F label={t('Nom produit *')}><input className="field" value={form.name} onChange={setInput('name')} /></F>
          <F label="Modèle"><RefSelect category="models" value={form.modelCode} onChange={set('modelCode')} /></F>
          <F label="Matière (ID)"><input className="field" value={form.materialCode} onChange={setInput('materialCode')} placeholder="CU002 / CE001" /></F>
          <F label="Couleur"><RefSelect category="colors" value={form.colorCode} onChange={set('colorCode')} /></F>
          <F label="Taille"><RefSelect category="sizes" value={form.sizeCode} onChange={set('sizeCode')} /></F>
          <F label="Année"><RefSelect category="years" value={form.yearCode} onChange={set('yearCode')} /></F>
          <F label="Saison"><RefSelect category="seasons" value={form.seasonCode} onChange={set('seasonCode')} /></F>
        </Section>

        <Section title="Médias (galerie)">
          <div className="col-span-2">
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {images.map((url, i) => (
                  <div key={url + i} className="relative group rounded overflow-hidden border border-white/10">
                    <div className="aspect-square bg-white/5">
                      <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    {i === 0 && <span className="absolute top-1 left-1 text-[9px] px-1 rounded bg-gold/80 text-ink font-medium">Couverture</span>}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      {i > 0 ? (
                        <button type="button" className="text-[10px] text-azure px-1 py-0.5" onClick={() => makeCover(i)} title="Définir comme couverture">★</button>
                      ) : <span />}
                      <button type="button" className="text-[10px] text-red-300 px-1 py-0.5" onClick={() => removeImage(i)} title="Retirer">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input className="field flex-1" placeholder="URL d'image (CDN Shopify, Drive…)" value={newImg} onChange={(e) => setNewImg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImage(); } }} />
              <button type="button" className="px-3 rounded border border-white/20 text-white/70 text-sm" onClick={addImage}>+ Ajouter</button>
            </div>
            <p className="text-[11px] text-white/30 mt-1">La 1ʳᵉ image sert de couverture (vignette catalogue). Les visuels Shopify sont repris automatiquement.</p>
          </div>
        </Section>

        <Section title="2. Options fonctionnelles">
          <div className="col-span-2 space-y-2">
            {bom.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input className="field flex-1" value={o} placeholder="ex. Avec pochon" onChange={(e) => setBom((b) => ({ ...b, options: b.options.map((x, j) => (j === i ? e.target.value : x)) }))} />
                <button className="text-red-400/70" onClick={() => setBom((b) => ({ ...b, options: b.options.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <button className="text-azure text-sm" onClick={() => setBom((b) => ({ ...b, options: [...b.options, ''] }))}>+ Ajouter une option</button>
          </div>
        </Section>

        <Section title="3. Fabrication">
          <F label="Atelier"><RefSelect category="ateliers" value={form.atelierCode} onChange={set('atelierCode')} /></F>
          <F label="Option (code SKU)"><RefSelect category="options" value={form.optionCode} onChange={set('optionCode')} /></F>
        </Section>

        <Section title="4. Nomenclature (matières)">
          <F label="Animal (principal)"><RefSelect category="animalTypes" value={form.animalCode} onChange={set('animalCode')} /></F>
          <F label="Type de peau"><RefSelect category="skinTypes" value={form.skinTypeCode} onChange={set('skinTypeCode')} /></F>
          <F label="Doublure"><RefSelect category="linings" value={form.liningCode} onChange={set('liningCode')} /></F>
          <F label="Fournisseur"><RefSelect category="suppliers" value={form.supplierCode} onChange={set('supplierCode')} /></F>
          <div className="col-span-2">
            <div className="text-[11px] text-white/40 mb-1">Nomenclature chiffrée (matières du stock) — consommation valorisée</div>
            <div className="space-y-2">
              {bomLines.map((l, i) => {
                const mat = materials.find((m) => m.id === l.materialId);
                const cost = mat?.unitCost && l.quantity ? Number(mat.unitCost) * Number(l.quantity) : null;
                return (
                  <div key={i} className="border border-white/10 rounded p-2 grid grid-cols-2 gap-2">
                    <select className="field" value={l.role} onChange={(e) => updLine(i, { role: e.target.value })}>
                      {BOM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select
                      className="field"
                      value={l.materialId}
                      onChange={(e) => {
                        const m = materials.find((x) => x.id === e.target.value);
                        updLine(i, { materialId: e.target.value, unit: l.unit && l.unit !== 'piece' ? l.unit : m?.unit ?? 'piece' });
                      }}
                    >
                      <option value="">— Matière (stock) —</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                    </select>
                    <input className="field" type="number" step="0.001" placeholder="Quantité" value={l.quantity} onChange={(e) => updLine(i, { quantity: e.target.value })} />
                    <div className="flex gap-2 items-center">
                      <input className="field w-20" placeholder="unité" value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} />
                      <span className="flex-1 text-right text-xs text-white/40">{cost != null ? cost.toFixed(2) + ' ' + (mat?.currency ?? '') : ''}</span>
                      <button className="text-red-400/70" onClick={() => setBomLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  </div>
                );
              })}
              <button className="text-azure text-sm" onClick={() => setBomLines((ls) => [...ls, { materialId: '', role: 'principale', quantity: '', unit: 'piece' }])}>+ Ajouter une matière (stock)</button>
              {materials.length === 0 && <p className="text-white/30 text-xs">Aucune matière en stock — ajoute-les dans OPS → Stock matières.</p>}
              {bomTotal > 0 && <div className="text-right text-xs text-white/60">Coût matières estimé : {bomTotal.toFixed(2)} €</div>}
            </div>
          </div>
          {bom.techSheet && (
            <div className="col-span-2 mt-2">
              <div className="text-[11px] text-white/40 mb-1">Fiche technique (référence importée)</div>
              <pre className="text-[11px] text-white/60 whitespace-pre-wrap bg-white/5 rounded p-2 max-h-40 overflow-auto">{bom.techSheet}</pre>
            </div>
          )}
        </Section>

        <Section title="5. Bijouterie">
          <F label="Bijouterie (réf.)"><RefSelect category="jewelry" value={form.jewelry} onChange={set('jewelry')} /></F>
          <div className="col-span-2 space-y-2">
            {bom.jewelry.map((j, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 border border-white/10 rounded p-2">
                <input className="field col-span-2" placeholder="Détail" value={j.details} onChange={(e) => updJew(i, { details: e.target.value })} />
                <input className="field" placeholder="Quantité" value={j.qty} onChange={(e) => updJew(i, { qty: e.target.value })} />
                <div className="flex gap-2">
                  <input className="field flex-1" placeholder="Fournisseur" value={j.supplier} onChange={(e) => updJew(i, { supplier: e.target.value })} />
                  <button className="text-red-400/70" onClick={() => setBom((b) => ({ ...b, jewelry: b.jewelry.filter((_, k) => k !== i) }))}>✕</button>
                </div>
              </div>
            ))}
            <button className="text-azure text-sm" onClick={() => setBom((b) => ({ ...b, jewelry: [...b.jewelry, { details: '', qty: '', supplier: '' }] }))}>+ Ajouter une bijouterie</button>
          </div>
        </Section>

        <Section title="6. Prix & coûts">
          <F label="Prix HT € (EUR)"><input className="field" type="number" step="0.01" value={form.priceHtEur} onChange={setInput('priceHtEur')} /></F>
          <F label="Prix HT $ (USD)"><input className="field" type="number" step="0.01" value={form.priceHtUsd} onChange={setInput('priceHtUsd')} /></F>
          <F label="Coût matière"><input className="field" type="number" step="0.01" value={form.costMaterial} onChange={setInput('costMaterial')} /></F>
          <F label="Coût façon"><input className="field" type="number" step="0.01" value={form.costMaking} onChange={setInput('costMaking')} /></F>
          <F label="Duties + shipping $"><input className="field" type="number" step="0.01" value={form.dutiesShippingUsd} onChange={setInput('dutiesShippingUsd')} /></F>
          <F label="Prix final DDP"><input className="field" type="number" step="0.01" value={form.finalPriceDdp} onChange={setInput('finalPriceDdp')} /></F>
          <div className="col-span-2 rounded bg-white/5 p-2 text-xs flex flex-wrap gap-x-6 gap-y-1 items-center">
            <span className="text-white/50">PRI (coût de revient) : <b className="text-white/80">{pri.toFixed(2)} €</b></span>
            <span className="text-white/50">Marge : <b className={margeEur >= 0 ? 'text-green-300' : 'text-red-300'}>{margeEur.toFixed(2)} €</b></span>
            <span className="text-white/50">Taux de marge : <b className={margePct >= 0 ? 'text-green-300' : 'text-red-300'}>{margePct.toFixed(1)} %</b></span>
            {!form.costMaterial && bomTotal > 0 && <span className="text-white/30">(coût matière = nomenclature valorisée)</span>}
          </div>
        </Section>

        <Section title="7. Logistique & douanes">
          <F label="Code HS"><RefSelect category="hsCodes" value={form.hsCode} onChange={set('hsCode')} /></F>
          <F label="Pays d'origine"><RefSelect category="origins" value={form.countryOrigin} onChange={set('countryOrigin')} /></F>
          <F label="Packaging"><input className="field" value={form.packaging} onChange={setInput('packaging')} /></F>
        </Section>

        <Section title="8. Workflow & validation">
          <F label="Statut">
            <select className="field" value={form.status} onChange={(e) => set('status')(e.target.value)}>
              <option value="DRAFT">{t('Brouillon')}</option>
              <option value="IN_REVIEW">{t('En revue')}</option>
              <option value="VALIDATED">{t('Validé')}</option>
            </select>
          </F>
          <div className="flex items-end">
            {form.status === 'VALIDATED' && validatedBy ? (
              <p className="text-[11px] text-green-300/80">{t('Validé par')} {validatedBy}{validatedAt ? ' · ' + fmtDate(validatedAt) : ''}</p>
            ) : (
              <p className="text-[11px] text-white/30">{t('Brouillon → En revue → Validé')}</p>
            )}
          </div>
        </Section>

        <Section title="Commentaires">
          <div className="col-span-2">
            <div className="flex gap-2 mb-3">
              <input className="field flex-1" placeholder={t('Ajouter un commentaire…')} value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }} />
              <button type="button" className="px-3 rounded border border-white/20 text-white/70 text-sm" onClick={addComment} disabled={!editingId}>{t('Envoyer')}</button>
            </div>
            {!editingId && <p className="text-[11px] text-white/30">{t('Enregistre la fiche pour activer les commentaires.')}</p>}
            {comments.map((c) => (
              <div key={c.id} className="py-2 border-b border-white/10">
                <div className="flex justify-between text-[11px] text-white/40">
                  <span className="text-azure">{c.author}</span>
                  <span>{fmtDate(c.createdAt)}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
            {editingId && comments.length === 0 && <p className="text-[11px] text-white/30">{t('Aucun commentaire.')}</p>}
          </div>
        </Section>

        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        {info && <p className="text-green-400 text-sm mt-2">{info}</p>}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button className="btn" onClick={save} disabled={saving}>{saving ? '…' : t('Sauvegarder la fiche')}</button>
          <button className="btn" onClick={syncShopify} disabled={saving || !editingId} title={editingId ? '' : 'Enregistre d’abord'}>
            {shopifyId ? t('Re-sync Shopify') : t('Sync Shopify')}
          </button>
        </div>
        {editingId && (
          <button className="text-red-400 text-sm mt-3" onClick={remove}>{t('Supprimer la fiche')}</button>
        )}
      </div>
    );
  }

  function updLine(i: number, patch: Partial<BomLineForm>) {
    setBomLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function updJew(i: number, patch: Partial<BomJewelry>) {
    setBom((b) => ({ ...b, jewelry: b.jewelry.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  }
}

function CatalogAvail({ catalog }: { catalog: Avail[] | null }) {
  if (!catalog) return <p className="text-white/40 text-sm">Calcul des disponibilités…</p>;
  if (catalog.length === 0) return <p className="text-white/40 text-sm">Aucun produit au catalogue.</p>;
  return (
    <div className="space-y-1">
      {catalog.map((a) => {
        const color = a.path === 'stock' ? 'text-green-300' : a.path === 'production' ? 'text-azure' : 'text-red-400';
        const label =
          a.path === 'stock'
            ? `En stock (${a.inStock}) · livrable ~${fmtDate(a.readyDate)}`
            : a.path === 'production'
            ? `Sur commande · ~${a.leadDays} j → ~${fmtDate(a.readyDate)}${a.workshop ? ' · ' + a.workshop.name : ''}`
            : `⚠ ${a.note ?? 'indisponible'}`;
        return (
          <div key={a.productId} className="py-1.5 border-b border-white/10">
            <div className="flex items-center justify-between text-sm gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Thumb src={a.imageUrl} alt={a.name} size={56} />
                <div className="min-w-0">
                  <div className="font-mono text-azure text-xs">{a.sku}</div>
                  <div className="truncate">{a.name}</div>
                </div>
              </div>
              <span className={'text-xs text-right shrink-0 ' + color}>{label}</span>
            </div>
            {a.materialShort.length > 0 && (
              <div className="text-[11px] text-amber-400/80">
                Matière à réappro : {a.materialShort.map((m) => `${m.code} (${m.stock}/${m.need} ${m.unit})`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Tuile de vignette PLM : image carrée + zoom au survol, SKU, statut, prix.
function ProductTile({ p, onClick }: { p: Product; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded border border-white/10 overflow-hidden hover:border-gold/50 transition-colors"
    >
      <div className="aspect-square bg-white/5 overflow-hidden">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gold/30 text-2xl">◇</div>
        )}
      </div>
      <div className="p-2">
        <div className="text-sm truncate font-medium">{p.name}</div>
        <div className="font-mono text-white/30 text-[10px] truncate">{p.sku}</div>
        <div className="flex items-center justify-between mt-1">
          <StatusBadge status={p.status} />
          <span className="text-white/60 text-xs">{p.priceHtUsd ? '$' + p.priceHtUsd : '—'}</span>
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const { t } = useI18n();
  if (status === 'VALIDATED')
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">{t('Validé')}</span>;
  if (status === 'IN_REVIEW')
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-azure/20 text-azure">{t('En revue')}</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{t('Brouillon')}</span>;
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
