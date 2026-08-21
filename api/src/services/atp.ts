import { prisma } from '../db/prisma';

// Délais forfaitaires par défaut (jours) si non renseignés sur l'atelier (étape B).
const DEFAULT_LEAD = 30; // fabrication
const DEFAULT_QC = 2; // contrôle qualité
const DEFAULT_CLIENT_TRANSIT = 5; // expédition client
const DEFAULT_REAPPRO = 21; // réappro matière manquante (affiné en étape D)

export interface MaterialShort {
  code: string;
  name: string;
  need: number;
  stock: number;
  unit: string;
}
export interface Availability {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  inStock: number; // pièces finies disponibles
  buildableNow: number; // nb fabriquable avec le stock matière courant
  path: 'stock' | 'production' | 'blocked';
  readyDate: string | null; // ISO yyyy-mm-dd
  leadDays: number;
  workshop: { id: string; name: string } | null;
  materialShort: MaterialShort[];
  note?: string;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface BomLineLite {
  materialId: string;
  quantity: unknown;
  unit: string;
  material: { code: string; name: string };
}
interface ProductLite {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  modelCode: string | null;
  bomLines: BomLineLite[];
}
interface WorkshopLite {
  id: string;
  name: string;
  leadTimeDays: number | null;
  transitDays: number | null;
  capLead: number | null;
}

interface AtpContext {
  materialStock: Map<string, number>; // materialId → stock courant
  serialAvail: Map<string, number>; // variantSku → pièces AVAILABLE
  workshopsByModel: Map<string, WorkshopLite[]>; // modelCode → ateliers capables
}

/** Charge en une passe les agrégats nécessaires au calcul (stock matières, pièces, ateliers). */
async function buildContext(): Promise<AtpContext> {
  const [matSums, serials, caps] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } }),
    prisma.serial.groupBy({ by: ['variantSku'], where: { status: 'AVAILABLE' }, _count: { _all: true } }),
    prisma.workshopCapability.findMany({ include: { workshop: true } }),
  ]);
  const materialStock = new Map(matSums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));
  const serialAvail = new Map(serials.map((s) => [s.variantSku, s._count._all]));
  const workshopsByModel = new Map<string, WorkshopLite[]>();
  for (const c of caps) {
    const arr = workshopsByModel.get(c.modelCode) ?? [];
    arr.push({
      id: c.workshop.id,
      name: c.workshop.name,
      leadTimeDays: c.workshop.leadTimeDays,
      transitDays: c.workshop.transitDays,
      capLead: c.leadTimeDays,
    });
    workshopsByModel.set(c.modelCode, arr);
  }
  return { materialStock, serialAvail, workshopsByModel };
}

/** Calcul pur de disponibilité pour un produit + quantité, à partir du contexte agrégé. */
function availabilityFor(p: ProductLite, qty: number, ctx: AtpContext): Availability {
  const inStock = ctx.serialAvail.get(p.sku) ?? 0;

  // Contrainte matière (nomenclature chiffrée)
  const materialShort: MaterialShort[] = [];
  let buildableNow = Number.POSITIVE_INFINITY;
  for (const l of p.bomLines) {
    const per = Number(l.quantity) || 0;
    if (per <= 0) continue;
    const stock = ctx.materialStock.get(l.materialId) ?? 0;
    buildableNow = Math.min(buildableNow, Math.floor(stock / per));
    if (stock < per * qty) {
      materialShort.push({ code: l.material.code, name: l.material.name, need: per * qty, stock, unit: l.unit });
    }
  }
  if (!Number.isFinite(buildableNow)) buildableNow = qty; // pas de BOM chiffrée → non bloquant

  // Atelier compétent le plus rapide
  const workshops = (p.modelCode && ctx.workshopsByModel.get(p.modelCode)) || [];
  const leadOf = (w: WorkshopLite) => w.capLead ?? w.leadTimeDays ?? DEFAULT_LEAD;
  const best = workshops.slice().sort((a, b) => leadOf(a) - leadOf(b))[0] ?? null;

  const today = new Date();
  // Chemin stock
  if (inStock >= qty) {
    return {
      productId: p.id, sku: p.sku, name: p.name, imageUrl: p.imageUrl, qty,
      inStock, buildableNow, path: 'stock',
      readyDate: iso(addDays(today, DEFAULT_CLIENT_TRANSIT)),
      leadDays: DEFAULT_CLIENT_TRANSIT, workshop: null, materialShort: [],
      note: 'Pièce(s) en stock',
    };
  }

  // Chemin production
  if (!best) {
    return {
      productId: p.id, sku: p.sku, name: p.name, imageUrl: p.imageUrl, qty,
      inStock, buildableNow, path: 'blocked', readyDate: null, leadDays: 0,
      workshop: null, materialShort,
      note: p.modelCode ? 'Aucun atelier ne sait produire ce modèle' : 'Modèle non renseigné',
    };
  }
  const lead = leadOf(best);
  const transit = best.transitDays ?? 0;
  const dateMaterials = materialShort.length ? addDays(today, DEFAULT_REAPPRO) : today;
  const totalDays =
    (materialShort.length ? DEFAULT_REAPPRO : 0) + transit + lead + DEFAULT_QC + transit + DEFAULT_CLIENT_TRANSIT;
  const readyDate = iso(
    addDays(dateMaterials, transit + lead + DEFAULT_QC + transit + DEFAULT_CLIENT_TRANSIT),
  );
  return {
    productId: p.id, sku: p.sku, name: p.name, imageUrl: p.imageUrl, qty,
    inStock, buildableNow, path: 'production', readyDate, leadDays: totalDays,
    workshop: { id: best.id, name: best.name }, materialShort,
    note: materialShort.length ? 'Sur commande (réappro matière requise)' : 'Sur commande',
  };
}

const productInclude = {
  bomLines: { include: { material: { select: { code: true, name: true } } } },
} as const;

export async function computeAvailability(productId: string, qty = 1): Promise<Availability | null> {
  const p = await prisma.product.findUnique({ where: { id: productId }, include: productInclude });
  if (!p) return null;
  const ctx = await buildContext();
  return availabilityFor(p as unknown as ProductLite, qty, ctx);
}

/** Catalogue complet avec disponibilité (vue équipe de vente). */
export async function computeCatalog(): Promise<Availability[]> {
  const [products, ctx] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: 'asc' }, take: 500, include: productInclude }),
    buildContext(),
  ]);
  return products.map((p) => availabilityFor(p as unknown as ProductLite, 1, ctx));
}

/** Disponibilité d'un panier (POS) : par ligne + date globale (la plus tardive). */
export async function computeCart(items: { id: string; qty: number }[]): Promise<{ lines: Availability[]; readyDate: string | null }> {
  if (items.length === 0) return { lines: [], readyDate: null };
  const [products, ctx] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: items.map((i) => i.id) } }, include: productInclude }),
    buildContext(),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: Availability[] = [];
  for (const it of items) {
    const p = byId.get(it.id);
    if (p) lines.push(availabilityFor(p as unknown as ProductLite, it.qty || 1, ctx));
  }
  const dates = lines.map((l) => l.readyDate).filter((d): d is string => !!d);
  const readyDate = dates.length === lines.length && dates.length > 0 ? dates.sort().slice(-1)[0] : null;
  return { lines, readyDate };
}
