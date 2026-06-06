import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';

export const erpRouter = Router();
erpRouter.use(requireAuth);

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

// ─── Ateliers de production ───────────────────────────────────────────────────
erpRouter.get('/workshops', async (_req, res) => {
  res.json(await prisma.workshop.findMany({ orderBy: { name: 'asc' } }));
});
erpRouter.post('/workshops', async (req, res) => {
  const { name, contactEmail, contactPhone, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name requis.' });
  try {
    res.status(201).json(await prisma.workshop.create({ data: { name, contactEmail, contactPhone, notes } }));
  } catch (e) { fail(res, e); }
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
