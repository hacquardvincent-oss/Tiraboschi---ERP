import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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
interface PieceReceipt {
  id: string;
  reference: string;
  quantity: number;
  receivedAt: string;
  productionOrder?: { variantSku: string; workshop?: { name: string } | null } | null;
}

type Tab = 'dashboard' | 'materials' | 'production' | 'pieces';

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
  const [err, setErr] = useState('');

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-base mb-3">OPS — Production & stock</h2>
        <div className="flex gap-2 flex-wrap text-sm">
          {(
            [
              ['dashboard', 'Tableau de bord'],
              ['materials', 'Stock matières'],
              ['production', 'Production'],
              ['pieces', 'Stock pièces'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={'px-3 py-1 rounded border ' + (tab === k ? 'border-azure text-azure' : 'border-white/20 text-white/60')}
              onClick={() => {
                setErr('');
                setTab(k);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {tab === 'dashboard' && <DashboardTab onErr={setErr} />}
      {tab === 'materials' && <MaterialsTab onErr={setErr} />}
      {tab === 'production' && <ProductionTab onErr={setErr} />}
      {tab === 'pieces' && <PiecesTab onErr={setErr} />}
    </div>
  );
}

function DashboardTab({ onErr }: { onErr: (s: string) => void }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/api/erp/summary').then(setS).catch((e) => onErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s) return <p className="text-white/40 text-sm">Chargement…</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Alertes matières" value={String(s.alerts.length)} alert={s.alerts.length > 0} />
        <Kpi label="Prods en cours" value={String(s.productionCount)} />
        <Kpi label="Pièces reçues" value={String(s.piecesTotal)} />
      </div>
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Alertes stock</div>
        {s.alerts.length === 0 && <p className="text-white/40 text-sm">Aucune alerte.</p>}
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
  const [s, setS] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'' | 'in' | 'out'>('');
  const [mv, setMv] = useState({ materialId: '', quantity: '', note: '' });

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
          <button className="btn flex-1" onClick={() => setMode(mode === 'in' ? '' : 'in')}>+ Réception</button>
          <button className="btn flex-1" onClick={() => setMode(mode === 'out' ? '' : 'out')}>Sortie exceptionnelle</button>
        </div>
        {mode && (
          <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
            <div className="text-xs uppercase tracking-editorial text-white/50">
              {mode === 'in' ? 'Réception de matière' : 'Sortie exceptionnelle'}
            </div>
            <select className="field" value={mv.materialId} onChange={(e) => setMv({ ...mv, materialId: e.target.value })}>
              <option value="">— Matière —</option>
              {(s?.materials ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input className="field w-32" type="number" placeholder="Quantité" value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
              <input className="field flex-1" placeholder="Note (motif)" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} />
            </div>
            <button className="btn w-full" onClick={submit}>Valider</button>
          </div>
        )}
        <input className="field mb-3" placeholder="Rechercher (code, nom, catégorie)…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            {materials.length === 0 && <tr><td colSpan={4} className="py-3 text-white/40">Aucune matière.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Mouvements récents</div>
        {movements.length === 0 && <p className="text-white/40 text-sm">Aucun mouvement.</p>}
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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-editorial text-white/50">Ordres de production</div>
        <button className="btn" onClick={() => setAdding(!adding)}>+ Ordre</button>
      </div>
      {adding && (
        <div className="border border-white/10 rounded p-3 mb-3 space-y-2">
          <select className="field" value={f.workshopId} onChange={(e) => setF({ ...f, workshopId: e.target.value })}>
            <option value="">— Atelier —</option>
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input className="field" placeholder="SKU variante" value={f.variantSku} onChange={(e) => setF({ ...f, variantSku: e.target.value })} />
          <div className="flex gap-2">
            <input className="field w-24" type="number" placeholder="Qté" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            <input className="field flex-1" placeholder="Réf. commande client (option)" value={f.clientOrderRef} onChange={(e) => setF({ ...f, clientOrderRef: e.target.value })} />
          </div>
          <button className="btn w-full" onClick={create}>Créer l'ordre</button>
        </div>
      )}
      {orders.length === 0 && <p className="text-white/40 text-sm">Aucun ordre de production.</p>}
      {orders.map((o) => (
        <div key={o.id} className="flex items-center justify-between py-1.5 text-sm border-b border-white/10">
          <div>
            <div className="font-mono text-xs text-azure">{o.reference}</div>
            <div className="text-white/50 text-xs">{o.workshop?.name ?? '—'} · {o.variantSku} ×{o.quantity}</div>
          </div>
          <select className="field w-44" value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
            {PROD_STATUS.map((st) => <option key={st} value={st}>{PROD_STATUS_FR[st]}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function PiecesTab({ onErr }: { onErr: (s: string) => void }) {
  const [pieces, setPieces] = useState<PieceReceipt[]>([]);
  useEffect(() => {
    api<PieceReceipt[]>('/api/erp/finished-pieces').then(setPieces).catch((e) => onErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Réceptions de pièces finies</div>
      {pieces.length === 0 && <p className="text-white/40 text-sm">Aucune réception de pièces.</p>}
      {pieces.map((p) => (
        <div key={p.id} className="flex justify-between py-1.5 text-sm border-b border-white/10">
          <div>
            <div className="font-mono text-xs text-azure">{p.reference}</div>
            <div className="text-white/50 text-xs">{p.productionOrder?.variantSku ?? '—'} · {p.productionOrder?.workshop?.name ?? '—'}</div>
          </div>
          <div className="text-right">
            <div>×{p.quantity}</div>
            <div className="text-white/40 text-[11px]">{new Date(p.receivedAt).toLocaleDateString('fr-FR')}</div>
          </div>
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
