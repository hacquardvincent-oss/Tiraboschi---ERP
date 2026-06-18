import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assembleSku, deriveYearId, deriveSeasonId } from '../services/sku';
import { pickingList, issueMaterials, receiveFinishedPieces } from '../services/fulfillment';
import { createPOsFromSuggestions, receivePO } from '../services/purchasing';
import { importMaterialsCsv } from '../services/import';
import { openInventorySession, inventorySessionDetail, closeInventorySession } from '../services/inventory';

export const erpRouter = Router();
erpRouter.use(requireAuth);

// ─── SKU : prévisualisation (règles du CDC) ─────────────────────────────────────
erpRouter.post('/sku/preview', (req, res) => {
  const b = req.body ?? {};
  try {
    const yearId = b.yearId || deriveYearId(b.year ?? '');
    const seasonId = b.seasonId || deriveSeasonId(b.season ?? '');
    const sku = assembleSku({
      modelId: b.modelId ?? '',
      yearId,
      seasonId,
      materialId: b.materialId ?? '',
      optionId: b.optionId ?? '00',
      colorId: b.colorId ?? '000',
    });
    res.json({ sku, yearId, seasonId });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

function fail(res: import('express').Response, err: unknown) {
  res.status(400).json({ error: (err as Error).message });
}

// ─── Fournisseurs matières ──────────────────────────────────────────────────
erpRouter.get('/suppliers', async (_req, res) => {
  res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }));
});
erpRouter.post('/suppliers', async (req, res) => {
  const { name, contactEmail, contactPhone, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name requis.' });
  try {
    res.status(201).json(await prisma.supplier.create({ data: { name, contactEmail, contactPhone, notes } }));
  } catch (e) { fail(res, e); }
});

// ─── Ateliers de production (capacité, délai, MOQ, compétences) ───────────────
const intOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : Math.trunc(Number(v)));

function workshopData(b: Record<string, unknown>) {
  return {
    name: b.name as string,
    contactEmail: (b.contactEmail as string) ?? null,
    contactPhone: (b.contactPhone as string) ?? null,
    notes: (b.notes as string) ?? null,
    location: (b.location as string) ?? null,
    leadTimeDays: intOrNull(b.leadTimeDays),
    capacityPerMonth: intOrNull(b.capacityPerMonth),
    moq: intOrNull(b.moq),
    transitDays: intOrNull(b.transitDays),
    shippingCost: b.shippingCost === '' || b.shippingCost === undefined ? null : b.shippingCost,
  };
}

erpRouter.get('/workshops', async (_req, res) => {
  res.json(
    await prisma.workshop.findMany({ orderBy: { name: 'asc' }, include: { capabilities: true } }),
  );
});
erpRouter.post('/workshops', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name requis.' });
  try {
    res.status(201).json(await prisma.workshop.create({ data: workshopData(b) as never }));
  } catch (e) { fail(res, e); }
});
erpRouter.put('/workshops/:id', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name requis.' });
  try {
    res.json(await prisma.workshop.update({ where: { id: req.params.id }, data: workshopData(b) as never }));
  } catch (e) { fail(res, e); }
});

// Matrice de compétences : modèles qu'un atelier sait produire
erpRouter.put('/workshops/:id/capabilities', async (req, res) => {
  const body = req.body ?? {};
  const lines: { modelCode: string; leadTimeDays?: number | null }[] = Array.isArray(body.capabilities)
    ? body.capabilities
    : [];
  try {
    await prisma.$transaction([
      prisma.workshopCapability.deleteMany({ where: { workshopId: req.params.id } }),
      prisma.workshopCapability.createMany({
        data: lines
          .filter((l) => l.modelCode)
          .map((l) => ({ workshopId: req.params.id, modelCode: l.modelCode, leadTimeDays: intOrNull(l.leadTimeDays) })),
      }),
    ]);
    res.json(await prisma.workshopCapability.findMany({ where: { workshopId: req.params.id } }));
  } catch (e) { fail(res, e); }
});

// Ateliers capables de produire un modèle donné (pour le moteur ATP / lancement OP)
erpRouter.get('/workshops/by-model/:modelCode', async (req, res) => {
  const caps = await prisma.workshopCapability.findMany({
    where: { modelCode: req.params.modelCode },
    include: { workshop: true },
  });
  res.json(caps.map((c) => ({ ...c.workshop, capabilityLeadTimeDays: c.leadTimeDays })));
});

// ─── Matières (ID matière) ────────────────────────────────────────────────────
erpRouter.get('/materials', async (_req, res) => {
  res.json(await prisma.material.findMany({ orderBy: { code: 'asc' }, include: { supplier: true } }));
});
erpRouter.post('/materials', async (req, res) => {
  const { code, name, category, unit, unitCost, currency, reorderThreshold, supplierId } = req.body ?? {};
  if (!code || !name) return res.status(400).json({ error: 'code et name requis.' });
  try {
    res.status(201).json(
      await prisma.material.create({
        data: { code, name, category, unit, unitCost, currency, reorderThreshold, supplierId },
      }),
    );
  } catch (e) { fail(res, e); }
});

// Import CSV des matières (inventaire Peaux/Bijoux) → Material + stock initial
erpRouter.post('/materials/import', async (req, res) => {
  const csv = (req.body ?? {}).csv;
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'csv requis.' });
  try {
    res.json(await importMaterialsCsv(csv));
  } catch (e) { fail(res, e); }
});

// Niveau de stock courant d'une matière (somme du ledger)
erpRouter.get('/materials/:id/stock', async (req, res) => {
  try {
    const agg = await prisma.stockMovement.aggregate({
      where: { materialId: req.params.id },
      _sum: { quantity: true },
    });
    res.json({ materialId: req.params.id, stock: agg._sum.quantity?.toString() ?? '0' });
  } catch (e) { fail(res, e); }
});

// ─── Mouvements de stock (ledger) ─────────────────────────────────────────────
const POSITIVE = new Set(['RECEIPT_IN', 'RETURN']);
const NEGATIVE = new Set(['EXCEPTIONAL_OUT', 'ISSUE_TO_WORKSHOP', 'IN_TRANSIT_TO_WORKSHOP']);

erpRouter.get('/stock-movements', async (req, res) => {
  const materialId = req.query.materialId ? String(req.query.materialId) : undefined;
  res.json(
    await prisma.stockMovement.findMany({
      where: materialId ? { materialId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { material: true, workshop: true },
    }),
  );
});

erpRouter.post('/stock-movements', async (req, res) => {
  const { materialId, type, quantity, workshopId, reference, note } = req.body ?? {};
  if (!materialId || !type || quantity === undefined) {
    return res.status(400).json({ error: 'materialId, type et quantity requis.' });
  }
  // Signe imposé par le type (ADJUSTMENT accepte le signe fourni).
  const abs = Math.abs(Number(quantity));
  let signed = Number(quantity);
  if (POSITIVE.has(type)) signed = abs;
  else if (NEGATIVE.has(type)) signed = -abs;
  try {
    const mv = await prisma.stockMovement.create({
      data: {
        materialId,
        type,
        quantity: signed,
        workshopId: workshopId ?? null,
        reference,
        note,
        createdById: req.user?.sub,
      },
    });
    res.status(201).json(mv);
  } catch (e) { fail(res, e); }
});

// ─── Synthèse OPS (dashboard + stock courant par matière + alertes) ────────────
erpRouter.get('/summary', async (_req, res) => {
  try {
    const [materials, sums, productionCount, piecesAgg] = await Promise.all([
      prisma.material.findMany({ orderBy: { code: 'asc' }, include: { supplier: true } }),
      prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } }),
      prisma.productionOrder.count({
        where: { status: { in: ['REQUESTED', 'MATERIALS_IN_TRANSIT', 'IN_PRODUCTION', 'QC'] } },
      }),
      prisma.finishedPieceReceipt.aggregate({ _sum: { quantity: true } }),
    ]);
    const stockByMat = new Map(sums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));
    const withStock = materials.map((m) => {
      const stock = stockByMat.get(m.id) ?? 0;
      const threshold = m.reorderThreshold != null ? Number(m.reorderThreshold) : null;
      return { ...m, stock, lowStock: stock <= 0 || (threshold != null && stock <= threshold) };
    });
    res.json({
      materials: withStock,
      alerts: withStock.filter((m) => m.lowStock),
      productionCount,
      piecesTotal: Number(piecesAgg._sum.quantity ?? 0),
    });
  } catch (e) { fail(res, e); }
});

// Tableau de bord de pilotage (matières, ruptures, production, ateliers, envoi client)
erpRouter.get('/dashboard', async (_req, res) => {
  try {
    const [materials, sums, prodByStatus, fulfillByStatus, piecesAvailable, workshops] = await Promise.all([
      prisma.material.findMany(),
      prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } }),
      prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.fulfillmentTask.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.serial.count({ where: { status: 'AVAILABLE' } }),
      prisma.workshop.count(),
    ]);
    const stockByMat = new Map(sums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));
    let materialsValue = 0;
    const lowStock: { code: string; name: string; stock: number; unit: string }[] = [];
    for (const m of materials) {
      const stock = stockByMat.get(m.id) ?? 0;
      if (m.unitCost != null && stock > 0) materialsValue += stock * Number(m.unitCost);
      const threshold = m.reorderThreshold != null ? Number(m.reorderThreshold) : null;
      if (stock <= 0 || (threshold != null && stock <= threshold)) lowStock.push({ code: m.code, name: m.name, stock, unit: m.unit });
    }
    const countOf = (rows: { status: string; _count: { _all: number } }[], st: string) => rows.find((r) => r.status === st)?._count._all ?? 0;
    res.json({
      materials: { total: materials.length, value: Math.round(materialsValue), lowStock: lowStock.length, ruptures: lowStock.filter((m) => m.stock <= 0).length, lowStockList: lowStock.slice(0, 20) },
      production: {
        requested: countOf(prodByStatus, 'REQUESTED'),
        transit: countOf(prodByStatus, 'MATERIALS_IN_TRANSIT'),
        inProduction: countOf(prodByStatus, 'IN_PRODUCTION'),
        qc: countOf(prodByStatus, 'QC'),
        received: countOf(prodByStatus, 'RECEIVED'),
      },
      fulfillment: {
        toPrepare: countOf(fulfillByStatus, 'TO_PREPARE'),
        ready: countOf(fulfillByStatus, 'READY'),
        shipped: countOf(fulfillByStatus, 'SHIPPED'),
      },
      piecesAvailable,
      workshops,
    });
  } catch (e) { fail(res, e); }
});

// ─── Ordres de production ─────────────────────────────────────────────────────
erpRouter.get('/production-orders', async (_req, res) => {
  res.json(
    await prisma.productionOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { workshop: true },
    }),
  );
});

erpRouter.post('/production-orders', async (req, res) => {
  const { workshopId, variantSku, quantity, clientOrderRef, status } = req.body ?? {};
  if (!workshopId || !variantSku) return res.status(400).json({ error: 'workshopId et variantSku requis.' });
  try {
    res.status(201).json(
      await prisma.productionOrder.create({
        data: {
          reference: 'OP-' + Date.now(),
          workshopId,
          variantSku,
          quantity: Number(quantity) || 1,
          clientOrderRef: clientOrderRef || null,
          status: status || 'REQUESTED',
        },
      }),
    );
  } catch (e) { fail(res, e); }
});

erpRouter.patch('/production-orders/:id', async (req, res) => {
  const { status } = req.body ?? {};
  try {
    res.json(await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status } }));
  } catch (e) { fail(res, e); }
});

// Liste de prélèvement matières (nomenclature × quantité) d'un OP
erpRouter.get('/production-orders/:id/picking', async (req, res) => {
  const data = await pickingList(req.params.id);
  if (!data) return res.status(404).json({ error: 'Ordre introuvable.' });
  res.json(data);
});

// Sortie des matières vers l'atelier (consommation BOM) → MATERIALS_IN_TRANSIT
erpRouter.post('/production-orders/:id/issue-materials', async (req, res) => {
  try {
    await issueMaterials(req.params.id, req.user?.sub);
    res.json(await prisma.productionOrder.findUnique({ where: { id: req.params.id }, include: { workshop: true } }));
  } catch (e) { fail(res, e); }
});

// Réception des pièces produites (bon de réception + n° de série) → RECEIVED
erpRouter.post('/production-orders/:id/receive', async (req, res) => {
  try {
    const result = await receiveFinishedPieces(req.params.id, Number(req.body?.quantity) || undefined);
    res.json(result);
  } catch (e) { fail(res, e); }
});

// ─── Commandes à préparer (fulfillment) ───────────────────────────────────────
erpRouter.get('/fulfillment-tasks', async (_req, res) => {
  res.json(
    await prisma.fulfillmentTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { serial: true },
    }),
  );
});

erpRouter.patch('/fulfillment-tasks/:id', async (req, res) => {
  const { status } = req.body ?? {};
  try {
    const task = await prisma.fulfillmentTask.update({ where: { id: req.params.id }, data: { status } });
    // À l'expédition : la pièce sort du stock (statut SHIPPED)
    if (status === 'SHIPPED' && task.serialId) {
      await prisma.serial.update({ where: { id: task.serialId }, data: { status: 'SHIPPED', location: 'client' } });
    }
    res.json(task);
  } catch (e) { fail(res, e); }
});

// ─── Planification MOQ (regroupement de la demande par atelier) ───────────────
interface PlanGroup {
  workshopId: string;
  workshop: { id: string; name: string; moq: number | null };
  totalQty: number;
  orders: { id: string; reference: string; variantSku: string; quantity: number; clientOrderRef: string | null }[];
}
erpRouter.get('/planning', async (_req, res) => {
  const orders = await prisma.productionOrder.findMany({ where: { status: 'REQUESTED' }, include: { workshop: true } });
  const groups = new Map<string, PlanGroup>();
  for (const o of orders) {
    const g = groups.get(o.workshopId) ?? {
      workshopId: o.workshopId,
      workshop: { id: o.workshop.id, name: o.workshop.name, moq: o.workshop.moq },
      totalQty: 0,
      orders: [],
    };
    g.totalQty += o.quantity;
    g.orders.push({ id: o.id, reference: o.reference, variantSku: o.variantSku, quantity: o.quantity, clientOrderRef: o.clientOrderRef });
    groups.set(o.workshopId, g);
  }
  res.json(
    [...groups.values()].map((g) => ({
      ...g,
      reached: g.workshop.moq == null || g.totalQty >= g.workshop.moq,
    })),
  );
});

// Lance un lot : sort les matières pour tous les OP en attente d'un atelier
erpRouter.post('/planning/:workshopId/launch', async (req, res) => {
  try {
    const orders = await prisma.productionOrder.findMany({ where: { workshopId: req.params.workshopId, status: 'REQUESTED' } });
    for (const o of orders) await issueMaterials(o.id, req.user?.sub).catch(() => {});
    res.json({ launched: orders.length });
  } catch (e) { fail(res, e); }
});

// ─── Suggestions de réapprovisionnement (stock sous le seuil) ─────────────────
erpRouter.get('/reorder-suggestions', async (_req, res) => {
  const [materials, sums] = await Promise.all([
    prisma.material.findMany({ include: { supplier: true } }),
    prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } }),
  ]);
  const stockByMat = new Map(sums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));
  const sugg = materials
    .map((m) => {
      const stock = stockByMat.get(m.id) ?? 0;
      const threshold = m.reorderThreshold != null ? Number(m.reorderThreshold) : null;
      if (threshold == null || stock > threshold) return null;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        stock,
        threshold,
        supplier: m.supplier?.name ?? null,
        suggestedQty: Math.max(threshold * 2 - stock, threshold),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  res.json(sugg);
});

// ─── Bons de commande fournisseur (achats matières) ──────────────────────────
erpRouter.get('/purchase-orders', async (_req, res) => {
  res.json(
    await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { supplier: true, lines: { include: { material: true } } },
    }),
  );
});

// Création manuelle : { supplierId, lines:[{ materialId, quantity, unitCost }], status? }
erpRouter.post('/purchase-orders', async (req, res) => {
  const b = req.body ?? {};
  const lines: { materialId?: string; quantity?: unknown; unitCost?: unknown }[] = Array.isArray(b.lines) ? b.lines : [];
  if (!b.supplierId) return res.status(400).json({ error: 'supplierId requis.' });
  try {
    res.status(201).json(
      await prisma.purchaseOrder.create({
        data: {
          reference: 'PO-' + Date.now(),
          supplierId: b.supplierId,
          status: b.status === 'SENT' ? 'SENT' : 'DRAFT',
          lines: {
            create: lines
              .filter((l) => l.materialId && l.quantity)
              .map((l) => ({ materialId: l.materialId as string, quantity: l.quantity as never, unitCost: (l.unitCost ?? 0) as never })),
          },
        },
        include: { supplier: true, lines: { include: { material: true } } },
      }),
    );
  } catch (e) { fail(res, e); }
});

// Génération auto depuis les matières sous le seuil (regroupées par fournisseur)
erpRouter.post('/purchase-orders/from-suggestions', async (_req, res) => {
  try {
    const created = await createPOsFromSuggestions();
    res.json({ created: created.length, purchaseOrders: created });
  } catch (e) { fail(res, e); }
});

erpRouter.patch('/purchase-orders/:id', async (req, res) => {
  const { status } = req.body ?? {};
  try {
    res.json(await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status, orderedAt: status === 'SENT' ? new Date() : undefined } }));
  } catch (e) { fail(res, e); }
});

// Réception → bon de réception + entrée en stock (RECEIPT_IN)
erpRouter.post('/purchase-orders/:id/receive', async (req, res) => {
  try {
    const receipt = await receivePO(req.params.id, req.user?.sub);
    res.json(receipt);
  } catch (e) { fail(res, e); }
});

// ─── Inventaire tournant (sessions de comptage) ──────────────────────────────
erpRouter.get('/inventory-sessions', async (_req, res) => {
  res.json(await prisma.inventorySession.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { counts: true } } } }));
});
erpRouter.post('/inventory-sessions', async (req, res) => {
  try {
    const category = req.body?.category || undefined;
    res.status(201).json(await openInventorySession(category, req.user?.sub));
  } catch (e) { fail(res, e); }
});
erpRouter.get('/inventory-sessions/:id', async (req, res) => {
  const d = await inventorySessionDetail(req.params.id);
  if (!d) return res.status(404).json({ error: 'Session introuvable.' });
  res.json(d);
});
erpRouter.patch('/inventory-counts/:id', async (req, res) => {
  const { counted } = req.body ?? {};
  try {
    res.json(
      await prisma.inventoryCount.update({
        where: { id: req.params.id },
        data: { counted: counted === '' || counted == null ? null : (counted as never) },
      }),
    );
  } catch (e) { fail(res, e); }
});
erpRouter.post('/inventory-sessions/:id/close', async (req, res) => {
  try {
    res.json(await closeInventorySession(req.params.id, req.user?.sub));
  } catch (e) { fail(res, e); }
});

// ─── Stock pièces finies par déclinaison (n° de série AVAILABLE) ──────────────
erpRouter.get('/finished-stock', async (_req, res) => {
  try {
    const groups = await prisma.serial.groupBy({ by: ['variantSku'], where: { status: 'AVAILABLE' }, _count: { _all: true } });
    const products = await prisma.product.findMany({
      where: { sku: { in: groups.map((g) => g.variantSku) } },
      select: { sku: true, name: true, imageUrl: true },
    });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    res.json(
      groups
        .map((g) => ({
          sku: g.variantSku,
          count: g._count._all,
          name: bySku.get(g.variantSku)?.name ?? g.variantSku,
          imageUrl: bySku.get(g.variantSku)?.imageUrl ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  } catch (e) { fail(res, e); }
});

// Liste des n° de série (optionnellement filtrés par SKU)
erpRouter.get('/serials', async (req, res) => {
  const sku = req.query.sku ? String(req.query.sku) : undefined;
  res.json(
    await prisma.serial.findMany({
      where: sku ? { variantSku: sku } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  );
});

// Mise à jour d'un n° de série (statut / localisation) — ex. sortie exceptionnelle
erpRouter.patch('/serials/:id', async (req, res) => {
  const { status, location } = req.body ?? {};
  try {
    res.json(
      await prisma.serial.update({
        where: { id: req.params.id },
        data: { ...(status ? { status } : {}), ...(location !== undefined ? { location } : {}) },
      }),
    );
  } catch (e) { fail(res, e); }
});

// ─── Stock pièces finies (réceptions) ─────────────────────────────────────────
erpRouter.get('/finished-pieces', async (_req, res) => {
  res.json(
    await prisma.finishedPieceReceipt.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: { productionOrder: { include: { workshop: true } } },
    }),
  );
});
