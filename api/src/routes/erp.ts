import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assembleSku, deriveYearId, deriveSeasonId } from '../services/sku';

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

// ─── Synthèse OPS (dashboard + stock courant par matière + alertes) ───────────
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
