import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Tabs, Thumb } from '../components/ui';
import { useToast } from '../toast';
import { useI18n } from '../i18n';

interface Supplier {
  id: string;
  name: string;
}
interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  unitCost: string | null;
  currency: string;
  reorderThreshold: string | null;
  supplier?: Supplier | null;
  stock: number;
  lowStock: boolean;
}
interface Summary {
  materials: Material[];
  alerts: Material[];
  productionCount: number;
  piecesTotal: number;
}
interface Movement {
  id: string;
  type: string;
  quantity: string;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  material?: { code: string; name: string } | null;
}
interface Workshop {
  id: string;
  name: string;
}
interface ProductionOrder {
  id: string;
  reference: string;
  variantSku: string;
  quantity: number;
  status: string;
  clientOrderRef?: string | null;
  workshop?: { name: string } | null;
}
interface PickingLine {
  materialId: string;
  code: string;
  name: string;
  role: string;
  unit: string;
  perPiece: number;
  need: number;
  stock: number;
  short: boolean;
}
interface FulfillTask {
  id: string;
  shopifyOrderRef: string;
  status: 'TO_PREPARE' | 'READY' | 'SHIPPED';
  serial?: { serial: string; variantSku: string } | null;
}
const FULFILL_NEXT: Record<string, string> = { TO_PREPARE: 'READY', READY: 'SHIPPED' };
const FULFILL_FR: Record<string, string> = { TO_PREPARE: 'À préparer', READY: 'Prête', SHIPPED: 'Expédiée' };

type Tab = 'dashboard' | 'materials' | 'production' | 'planning' | 'pieces' | 'workshops';

interface PlanGroup {
  workshopId: string;
  workshop: { id: string; name: string; moq: number | null };
  totalQty: number;
  reached: boolean;
  orders: { id: string; reference: string; variantSku: string; quantity: number; clientOrderRef: string | null }[];
}
interface ReorderSuggestion {
  id: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  threshold: number;
  supplier: string | null;
  suggestedQty: number;
}
interface POLine {
  id: string;
  quantity: string;
  unitCost: string;
  material: { code: string; name: string; unit: string };
}
interface PurchaseOrder {
  id: string;
  reference: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  supplier?: { name: string } | null;
  lines: POLine[];
}
const PO_STATUS_FR: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  PARTIALLY_RECEIVED: 'Partiel',
  RECEIVED: 'Reçu',
  CANCELLED: 'Annulé',
};

interface Capability {
  modelCode: string;
  leadTimeDays: number | null;
}
interface WorkshopFull {
  id: string;
  name: string;
  location?: string | null;
  leadTimeDays?: number | null;
  capacityPerMonth?: number | null;
  moq?: number | null;
  transitDays?: number | null;
  shippingCost?: string | null;
  capabilities: Capability[];
}
interface RefModel {
  code: string;
  label: string;
}

const PROD_STATUS = ['REQUESTED', 'MATERIALS_IN_TRANSIT', 'IN_PRODUCTION', 'QC', 'RECEIVED', 'CANCELLED'];
const PROD_STATUS_FR: Record<string, string> = {
  REQUESTED: 'Demandé',
  MATERIALS_IN_TRANSIT: 'Matières en transit',
  IN_PRODUCTION: 'En production',
  QC: 'Contrôle qualité',
  RECEIVED: 'Reçu',
  CANCELLED: 'Annulé',
};

export function Inventaire() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const toast = useToast();
  // Canal de message unifié (toast) : tonalité déduite du contenu.
  const notify = (m: string) => toast(m, /erreur|introuvable|requis|échec|invalide|impossible/i.test(m) ? 'error' : 'info');

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-base mb-3">OPS — Production &amp; stock</h2>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            ['dashboard', 'Tableau de bord'],
            ['materials', 'Stock matières'],
            ['production', 'Production'],
            ['planning', 'Planification'],
            ['pieces', 'Stock pièces'],
            ['workshops', 'Ateliers'],
          ] as [Tab, string][]}
        />
      </div>

      {tab === 'dashboard' && <DashboardTab onErr={notify} />}
      {tab === 'materials' && <MaterialsTab onErr={notify} />}
      {tab === 'production' && <ProductionTab onErr={notify} />}
      {tab === 'planning' && <PlanningTab onErr={notify} />}
      {tab === 'pieces' && <PiecesTab onErr={notify} />}
      {tab === 'workshops' && <WorkshopsTab onErr={notify} />}
    </div>
  );
}

function DashboardTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/api/erp/summary').then(setS).catch((e) => onErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s) return <p className="text-white/40 text-sm">{t('common.loading')}</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('Alertes matières')} value={String(s.alerts.length)} alert={s.alerts.length > 0} />
        <Kpi label={t('Prods en cours')} value={String(s.productionCount)} />
        <Kpi label={t('Pièces reçues')} value={String(s.piecesTotal)} />
      </div>
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Alertes stock')}</div>
        {s.alerts.length === 0 && <p className="text-white/40 text-sm">{t('Aucune alerte.')}</p>}
        {s.alerts.map((m) => (
          <div key={m.id} className="flex justify-between py-1 text-sm border-b border-white/10">
            <span>{m.code} — {m.name}</span>
            <span className="text-red-400">{m.stock} {m.unit}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function MaterialsTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [s, setS] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'' | 'in' | 'out'>('');
  const [mv, setMv] = useState({ materialId: '', quantity: '', note: '' });
  const [showImport, setShowImport] = useState(false);
  const [impCsv, setImpCsv] = useState('');
  const [impMsg, setImpMsg] = useState('');

  async function runImport() {
    if (!impCsv.trim()) return setImpMsg('Choisis un fichier ou colle le CSV.');
    setImpMsg('');
    try {
      const r = await api<{ created: number; updated: number; skipped: number }>('/api/erp/materials/import', { method: 'POST', body: { csv: impCsv } });
      setImpMsg(`${r.created} créée(s), ${r.updated} mise(s) à jour, ${r.skipped} ignorée(s).`);
      setImpCsv('');
      reload();
    } catch (e) {
      setImpMsg((e as Error).message);
    }
  }

  const reload = () => {
    api<Summary>('/api/erp/summary').then(setS).catch((e) => onErr((e as Error).message));
    api<Movement[]>('/api/erp/stock-movements').then(setMovements).catch(() => {});
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!mv.materialId || !mv.quantity) return onErr('Matière et quantité requises.');
    try {
      await api('/api/erp/stock-movements', {
        method: 'POST',
        body: {
          materialId: mv.materialId,
          type: mode === 'in' ? 'RECEIPT_IN' : 'EXCEPTIONAL_OUT',
          quantity: Number(mv.quantity),
          note: mv.note || undefined,
        },
      });
      setMode('');
      setMv({ materialId: '', quantity: '', note: '' });
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  const materials = (s?.materials ?? []).filter((m) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (m.code + ' ' + m.name + ' ' + m.category).toLowerCase().includes(t);
  });

  return (
    <>
      <div className="card">
        <div className="flex gap-2 mb-3">
          <button className="btn flex-1" onClick={() => setMode(mode === 'in' ? '' : 'in')}>{t('+ Réception')}</button>
          <button className="btn flex-1" onClick={() => setMode(mode === 'out' ? '' : 'out')}>{t('Sortie exceptionnelle')}</button>
          <button className="px-3 py-1 rounded border border-white/20 text-white/70 text-sm" onClick={() => setShowImport(!showImport)}>{t('Importer CSV')}</button>
        </div>
        {showImport && (
          <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
            <div className="text-xs text-white/50">Import inventaire matières (Peaux/Bijoux). Reconnu : ID Matière, Animal, Type, Couleur, Catégorie, Coût d'achat, Fournisseur, 1er comptage/Recomptage.</div>
            <input type="file" accept=".csv,text/csv" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setImpCsv); }} />
            <textarea className="field font-mono text-[11px]" rows={3} placeholder="…ou colle le CSV ici" value={impCsv} onChange={(e) => setImpCsv(e.target.value)} />
            <div className="flex items-center gap-3">
              <button className="btn" onClick={runImport}>{t('Importer')}</button>
              {impMsg && <span className="text-xs text-white/70">{impMsg}</span>}
            </div>
          </div>
        )}
        {mode && (
          <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
            <div className="text-xs uppercase tracking-editorial text-white/50">
              {mode === 'in' ? t('Réception de matière') : t('Sortie exceptionnelle')}
            </div>
            <select className="field" value={mv.materialId} onChange={(e) => setMv({ ...mv, materialId: e.target.value })}>
              <option value="">{t('— Matière —')}</option>
              {(s?.materials ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input className="field w-32" type="number" placeholder={t('Quantité')} value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
              <input className="field flex-1" placeholder={t('Note (motif)')} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} />
            </div>
            <button className="btn w-full" onClick={submit}>{t('Valider')}</button>
          </div>
        )}
        <input className="field mb-3" placeholder={t('Rechercher (code, nom, catégorie)…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr><th className="py-1">Code</th><th className="py-1">Nom</th><th className="py-1">Stock</th><th className="py-1">Fournisseur</th></tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-t border-white/10">
                <td className="py-1.5 font-mono text-xs">{m.code}</td>
                <td className="py-1.5">{m.name}</td>
                <td className={'py-1.5 ' + (m.lowStock ? 'text-red-400' : '')}>{m.stock} {m.unit}</td>
                <td className="py-1.5">{m.supplier?.name ?? '—'}</td>
              </tr>
            ))}
            {materials.length === 0 && <tr><td colSpan={4} className="py-3 text-white/40">{t('Aucune matière.')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Mouvements récents')}</div>
        {movements.length === 0 && <p className="text-white/40 text-sm">{t('Aucun mouvement.')}</p>}
        {movements.slice(0, 30).map((m) => (
          <div key={m.id} className="flex justify-between py-1 text-sm border-b border-white/10">
            <span>{m.material?.code ?? '—'} <span className="text-white/40 text-xs">{m.type}</span></span>
            <span className={Number(m.quantity) < 0 ? 'text-red-400' : 'text-green-400'}>{m.quantity}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductionTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ workshopId: '', variantSku: '', quantity: '1', clientOrderRef: '' });

  const reload = () => api<ProductionOrder[]>('/api/erp/production-orders').then(setOrders).catch((e) => onErr((e as Error).message));
  useEffect(() => {
    reload();
    api<Workshop[]>('/api/erp/workshops').then(setWorkshops).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!f.workshopId || !f.variantSku) return onErr('Atelier et SKU requis.');
    try {
      await api('/api/erp/production-orders', { method: 'POST', body: { ...f, quantity: Number(f.quantity) } });
      setAdding(false);
      setF({ workshopId: '', variantSku: '', quantity: '1', clientOrderRef: '' });
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function setStatus(id: string, status: string) {
    try {
      await api('/api/erp/production-orders/' + id, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState<PickingLine[] | null>(null);
  const [tasks, setTasks] = useState<FulfillTask[]>([]);

  const reloadTasks = () => api<FulfillTask[]>('/api/erp/fulfillment-tasks').then(setTasks).catch(() => {});
  useEffect(() => {
    reloadTasks();
  }, []);

  async function toggle(id: string) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setPicking(null);
    try {
      const d = await api<{ lines: PickingLine[] }>(`/api/erp/production-orders/${id}/picking`);
      setPicking(d.lines);
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function issue(id: string) {
    try {
      await api(`/api/erp/production-orders/${id}/issue-materials`, { method: 'POST', body: {} });
      reload();
      const d = await api<{ lines: PickingLine[] }>(`/api/erp/production-orders/${id}/picking`);
      setPicking(d.lines);
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function receive(id: string) {
    try {
      const r = await api<{ serials: number }>(`/api/erp/production-orders/${id}/receive`, { method: 'POST', body: {} });
      onErr(`${r.serials} pièce(s) réceptionnée(s) avec n° de série.`);
      reload();
      reloadTasks();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function advanceTask(t: FulfillTask) {
    const next = FULFILL_NEXT[t.status];
    if (!next) return;
    try {
      await api('/api/erp/fulfillment-tasks/' + t.id, { method: 'PATCH', body: { status: next } });
      reloadTasks();
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-editorial text-white/50">{t('Ordres de production')}</div>
          <button className="btn" onClick={() => setAdding(!adding)}>{t('+ Ordre')}</button>
        </div>
        {adding && (
          <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
            <select className="field" value={f.workshopId} onChange={(e) => setF({ ...f, workshopId: e.target.value })}>
              <option value="">— {t('Atelier')} —</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input className="field" placeholder={t('SKU variante')} value={f.variantSku} onChange={(e) => setF({ ...f, variantSku: e.target.value })} />
            <div className="flex gap-2">
              <input className="field w-24" type="number" placeholder={t('Quantité')} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
              <input className="field flex-1" placeholder={t('Réf. commande client (option)')} value={f.clientOrderRef} onChange={(e) => setF({ ...f, clientOrderRef: e.target.value })} />
            </div>
            <button className="btn w-full" onClick={create}>{t("Créer l'ordre")}</button>
          </div>
        )}
        {orders.length === 0 && <p className="text-white/40 text-sm">{t('Aucun ordre de production.')}</p>}
        {orders.map((o) => (
          <div key={o.id} className="py-1.5 border-b border-white/10">
            <div className="flex items-center justify-between text-sm">
              <button className="text-left" onClick={() => toggle(o.id)}>
                <div className="font-mono text-xs text-azure">{o.reference} {openId === o.id ? '▾' : '▸'}</div>
                <div className="text-white/50 text-xs">{o.workshop?.name ?? '—'} · {o.variantSku} ×{o.quantity}{o.clientOrderRef ? ' · ' + o.clientOrderRef : ''}</div>
              </button>
              <select className="field w-40" value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                {PROD_STATUS.map((st) => <option key={st} value={st}>{PROD_STATUS_FR[st]}</option>)}
              </select>
            </div>
            {openId === o.id && (
              <div className="mt-2 ml-1 border-l border-white/10 pl-3">
                <div className="text-[11px] uppercase tracking-editorial text-white/40 mb-1">Liste de prélèvement matières</div>
                {!picking && <p className="text-white/30 text-xs">Calcul…</p>}
                {picking && picking.length === 0 && <p className="text-white/30 text-xs">Aucune nomenclature chiffrée pour ce SKU.</p>}
                {picking?.map((l) => (
                  <div key={l.materialId} className="flex justify-between text-xs py-0.5">
                    <span>{l.code} — {l.name} <span className="text-white/30">({l.role})</span></span>
                    <span className={l.short ? 'text-red-400' : 'text-white/60'}>{l.need} {l.unit} (stock {l.stock})</span>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <button className="btn flex-1" onClick={() => issue(o.id)}>Sortir matières → atelier</button>
                  <button className="btn flex-1" onClick={() => receive(o.id)}>Réceptionner (n° série)</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Commandes à préparer</div>
        {tasks.filter((t) => t.status !== 'SHIPPED').length === 0 && <p className="text-white/40 text-sm">Rien à préparer.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between py-1.5 text-sm border-b border-white/10">
            <div>
              <div className="text-xs">{t.shopifyOrderRef}</div>
              <div className="text-white/50 text-[11px]">{t.serial ? 'N° ' + t.serial.serial : 'en attente pièce'} · {FULFILL_FR[t.status]}</div>
            </div>
            {FULFILL_NEXT[t.status] && (
              <button className="text-azure text-xs" onClick={() => advanceTask(t)}>
                → {FULFILL_FR[FULFILL_NEXT[t.status]]}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function PlanningTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [plan, setPlan] = useState<PlanGroup[]>([]);
  const [reorder, setReorder] = useState<ReorderSuggestion[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);

  const reload = () => {
    api<PlanGroup[]>('/api/erp/planning').then(setPlan).catch((e) => onErr((e as Error).message));
    api<ReorderSuggestion[]>('/api/erp/reorder-suggestions').then(setReorder).catch(() => {});
    api<PurchaseOrder[]>('/api/erp/purchase-orders').then(setPos).catch(() => {});
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function launch(workshopId: string) {
    try {
      const r = await api<{ launched: number }>(`/api/erp/planning/${workshopId}/launch`, { method: 'POST', body: {} });
      onErr(`Lot lancé : ${r.launched} ordre(s) → matières sorties.`);
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  async function genPOs() {
    try {
      const r = await api<{ created: number }>('/api/erp/purchase-orders/from-suggestions', { method: 'POST', body: {} });
      onErr(r.created > 0 ? `${r.created} bon(s) de commande créé(s).` : 'Aucun nouveau BC (déjà ouverts ou pas de fournisseur).');
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function setPoStatus(id: string, status: string) {
    try {
      await api('/api/erp/purchase-orders/' + id, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  async function receivePo(id: string) {
    try {
      await api(`/api/erp/purchase-orders/${id}/receive`, { method: 'POST', body: {} });
      onErr('Réceptionné → matières entrées en stock.');
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  const poTotal = (po: PurchaseOrder) =>
    po.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);

  return (
    <>
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Regroupement par atelier (MOQ)')}</div>
        {plan.length === 0 && <p className="text-white/40 text-sm">Aucun ordre en attente de lancement.</p>}
        {plan.map((g) => (
          <div key={g.workshopId} className="border-b border-white/10 py-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="font-semibold">{g.workshop.name}</div>
                <div className="text-white/50 text-xs">
                  {g.totalQty} pièce(s) en attente · MOQ {g.workshop.moq ?? '—'}
                  {g.workshop.moq != null && !g.reached && (
                    <span className="text-amber-400"> · manque {g.workshop.moq - g.totalQty}</span>
                  )}
                </div>
              </div>
              <button
                className={'px-3 py-1 rounded border text-xs ' + (g.reached ? 'border-azure text-azure' : 'border-white/20 text-white/40')}
                onClick={() => launch(g.workshopId)}
                title={g.reached ? 'Lancer le lot' : 'MOQ non atteint — lancement forcé possible'}
              >
                {g.reached ? 'Lancer le lot' : 'Forcer le lancement'}
              </button>
            </div>
            <div className="ml-1 mt-1">
              {g.orders.map((o) => (
                <div key={o.id} className="text-[11px] text-white/40">{o.reference} · {o.variantSku} ×{o.quantity}{o.clientOrderRef ? ' · ' + o.clientOrderRef : ''}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Suggestions de réapprovisionnement')}</div>
        {reorder.length === 0 && <p className="text-white/40 text-sm">Aucune matière sous le seuil.</p>}
        {reorder.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-1.5 text-sm border-b border-white/10">
            <div>
              <div>{r.code} — {r.name}</div>
              <div className="text-white/50 text-[11px]">Stock {r.stock} / seuil {r.threshold} {r.unit} · {r.supplier ?? 'fournisseur ?'}</div>
            </div>
            <span className="text-azure text-xs">commander ~{r.suggestedQty} {r.unit}</span>
          </div>
        ))}
        {reorder.length > 0 && (
          <button className="btn w-full mt-3" onClick={genPOs}>{t('Générer les bons de commande')}</button>
        )}
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Bons de commande fournisseur')}</div>
        {pos.length === 0 && <p className="text-white/40 text-sm">{t('Aucun bon de commande.')}</p>}
        {pos.map((po) => (
          <div key={po.id} className="border-b border-white/10 py-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="font-mono text-xs text-azure">{po.reference}</div>
                <div className="text-white/50 text-xs">{po.supplier?.name ?? '—'} · {po.lines.length} ligne(s) · {poTotal(po).toFixed(2)} €</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{PO_STATUS_FR[po.status]}</span>
                {po.status === 'DRAFT' && <button className="text-azure text-xs" onClick={() => setPoStatus(po.id, 'SENT')}>{t('Envoyer')}</button>}
                {(po.status === 'DRAFT' || po.status === 'SENT') && <button className="text-green-300 text-xs" onClick={() => receivePo(po.id)}>{t('Réceptionner')}</button>}
              </div>
            </div>
            <div className="ml-1 mt-1">
              {po.lines.map((l) => (
                <div key={l.id} className="text-[11px] text-white/40">{l.material.code} — {l.material.name} · {Number(l.quantity)} {l.material.unit} × {Number(l.unitCost).toFixed(2)} €</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface FinStock {
  sku: string;
  count: number;
  name: string;
  imageUrl: string | null;
}
interface SerialItem {
  id: string;
  serial: string;
  variantSku: string;
  status: string;
  location: string | null;
}

function PiecesTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [stock, setStock] = useState<FinStock[]>([]);
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [serials, setSerials] = useState<SerialItem[]>([]);

  const reload = () => api<FinStock[]>('/api/erp/finished-stock').then(setStock).catch((e) => onErr((e as Error).message));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(sku: string) {
    if (openSku === sku) return setOpenSku(null);
    setOpenSku(sku);
    api<SerialItem[]>('/api/erp/serials?sku=' + encodeURIComponent(sku))
      .then((all) => setSerials(all.filter((s) => s.status === 'AVAILABLE')))
      .catch((e) => onErr((e as Error).message));
  }
  async function exceptionalOut(id: string) {
    if (!confirm('Sortie exceptionnelle de cette pièce (casse / perte / échantillon) ?')) return;
    try {
      await api('/api/erp/serials/' + id, { method: 'PATCH', body: { status: 'RETURNED', location: 'sortie exceptionnelle' } });
      setSerials((s) => s.filter((x) => x.id !== id));
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }
  const passportUrl = (serial: string) => `${location.origin}/passport/${encodeURIComponent(serial)}`;
  const qr = (serial: string) => `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(passportUrl(serial))}`;

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{t('Stock pièces (entrepôt)')}</div>
      {stock.length === 0 && <p className="text-white/40 text-sm">{t('Aucune pièce en stock.')}</p>}
      {stock.map((g) => (
        <div key={g.sku} className="border-b border-white/10">
          <button className="w-full flex items-center gap-3 py-2 text-sm text-left" onClick={() => toggle(g.sku)}>
            <Thumb src={g.imageUrl} alt={g.name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{g.name}</div>
              <div className="font-mono text-azure text-[11px]">{g.sku}</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/15 text-gold">{g.count} {t('pièce(s)')}</span>
            <span className="text-white/40 text-xs">{openSku === g.sku ? '▾' : '▸'}</span>
          </button>
          {openSku === g.sku && (
            <div className="pb-2 pl-2 space-y-2">
              {serials.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-xs border border-white/10 rounded p-2">
                  <img src={qr(s.serial)} alt="QR" width={56} height={56} className="rounded bg-white p-0.5 shrink-0" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-white/80 break-all">{s.serial}</div>
                    <a className="text-azure" href={passportUrl(s.serial)} target="_blank" rel="noreferrer">{t('Passeport')} ↗</a>
                  </div>
                  <button className="text-red-400/70" onClick={() => exceptionalOut(s.id)}>{t('Sortie')}</button>
                </div>
              ))}
              {serials.length === 0 && <p className="text-white/40 text-xs">{t('Aucun n° de série disponible.')}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const EMPTY_WS = { name: '', location: '', leadTimeDays: '', capacityPerMonth: '', moq: '', transitDays: '', shippingCost: '' };

function WorkshopsTab({ onErr }: { onErr: (s: string) => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<WorkshopFull[]>([]);
  const [models, setModels] = useState<RefModel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ ...EMPTY_WS });
  const [caps, setCaps] = useState<Set<string>>(new Set());

  const reload = () => api<WorkshopFull[]>('/api/erp/workshops').then(setList).catch((e) => onErr((e as Error).message));
  useEffect(() => {
    reload();
    api<RefModel[]>('/api/ref/models').then(setModels).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditingId(null);
    setF({ ...EMPTY_WS });
    setCaps(new Set());
    setAdding(true);
  }
  function openEdit(w: WorkshopFull) {
    setEditingId(w.id);
    setF({
      name: w.name,
      location: w.location ?? '',
      leadTimeDays: w.leadTimeDays?.toString() ?? '',
      capacityPerMonth: w.capacityPerMonth?.toString() ?? '',
      moq: w.moq?.toString() ?? '',
      transitDays: w.transitDays?.toString() ?? '',
      shippingCost: w.shippingCost ?? '',
    });
    setCaps(new Set(w.capabilities.map((c) => c.modelCode)));
    setAdding(true);
  }
  function toggleCap(code: string) {
    setCaps((s) => {
      const n = new Set(s);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  async function save() {
    if (!f.name) return onErr('Nom requis.');
    try {
      const saved = editingId
        ? await api<{ id: string }>('/api/erp/workshops/' + editingId, { method: 'PUT', body: f })
        : await api<{ id: string }>('/api/erp/workshops', { method: 'POST', body: f });
      await api('/api/erp/workshops/' + saved.id + '/capabilities', {
        method: 'PUT',
        body: { capabilities: [...caps].map((modelCode) => ({ modelCode })) },
      });
      setAdding(false);
      setEditingId(null);
      reload();
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-editorial text-white/50">{t('Ateliers')}</div>
        <button className="btn" onClick={openNew}>{t('+ Atelier')}</button>
      </div>

      {adding && (
        <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="field" placeholder={t("Nom de l'atelier")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className="field" placeholder={t('Localisation')} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            <input className="field" type="number" placeholder={t('Délai fabrication (j)')} value={f.leadTimeDays} onChange={(e) => setF({ ...f, leadTimeDays: e.target.value })} />
            <input className="field" type="number" placeholder={t('Capacité (pièces/mois)')} value={f.capacityPerMonth} onChange={(e) => setF({ ...f, capacityPerMonth: e.target.value })} />
            <input className="field" type="number" placeholder={t('MOQ (min par lancement)')} value={f.moq} onChange={(e) => setF({ ...f, moq: e.target.value })} />
            <input className="field" type="number" placeholder={t('Transit entrepôt↔atelier (j)')} value={f.transitDays} onChange={(e) => setF({ ...f, transitDays: e.target.value })} />
            <input className="field" type="number" step="0.01" placeholder={t('Frais de port')} value={f.shippingCost} onChange={(e) => setF({ ...f, shippingCost: e.target.value })} />
          </div>
          <div>
            <div className="text-[11px] text-white/40 mb-1">{t('Modèles que cet atelier sait produire')}</div>
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <label key={m.code} className={'text-xs px-2 py-1 rounded border cursor-pointer ' + (caps.has(m.code) ? 'border-azure text-azure' : 'border-white/20 text-white/50')}>
                  <input type="checkbox" className="hidden" checked={caps.has(m.code)} onChange={() => toggleCap(m.code)} />
                  {m.label} ({m.code})
                </label>
              ))}
              {models.length === 0 && <span className="text-white/30 text-xs">Aucun modèle au référentiel (Admin).</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={save}>{editingId ? t('Enregistrer') : t('Créer')}</button>
            <button className="text-white/50 text-sm px-3" onClick={() => setAdding(false)}>{t('Annuler')}</button>
          </div>
        </div>
      )}

      {list.length === 0 && <p className="text-white/40 text-sm">{t('Aucun atelier.')}</p>}
      {list.map((w) => (
        <div key={w.id} className="flex items-center justify-between py-1.5 text-sm border-b border-white/10">
          <div>
            <div className="font-semibold">{w.name} {w.location && <span className="text-white/40 text-xs">· {w.location}</span>}</div>
            <div className="text-white/50 text-xs">
              {w.leadTimeDays != null ? `${w.leadTimeDays} j` : 'délai —'} · MOQ {w.moq ?? '—'} · {w.capabilities.length} modèle(s)
            </div>
          </div>
          <button className="text-azure text-xs" onClick={() => openEdit(w)}>{t('Modifier')}</button>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="card">
      <div className="text-white/50 text-[11px] uppercase tracking-editorial">{label}</div>
      <div className={'text-xl font-semibold mt-1 ' + (alert ? 'text-red-400' : 'text-azure')}>{value}</div>
    </div>
  );
}
