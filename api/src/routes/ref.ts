import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { importRefCsv } from '../services/import';

export const refRouter = Router();
refRouter.use(requireAuth);

// Import CSV d'une catégorie de référentiel (Admin)
refRouter.post('/import', requireRole('ADMIN'), async (req, res) => {
  const { category, csv } = req.body ?? {};
  if (!category || typeof csv !== 'string') return res.status(400).json({ error: 'category et csv requis.' });
  try {
    res.json(await importRefCsv(category, csv));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Catégories distinctes du référentiel. */
refRouter.get('/categories', async (_req, res) => {
  const rows = await prisma.refItem.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  res.json(rows.map((r) => r.category));
});

/** Items d'une catégorie (alimente les listes déroulantes des formulaires). */
refRouter.get('/:category', async (req, res) => {
  const items = await prisma.refItem.findMany({
    where: { category: req.params.category },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  res.json(items);
});

// ─── Écriture : Admin seulement ─────────────────────────────────────────────
refRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const { category, code, label, sortOrder } = req.body ?? {};
  if (!category || !code || !label) {
    return res.status(400).json({ error: 'category, code et label requis.' });
  }
  try {
    res.status(201).json(
      await prisma.refItem.create({ data: { category, code, label, sortOrder: sortOrder ?? 0 } }),
    );
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

refRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const { label, code, sortOrder, active } = req.body ?? {};
  try {
    res.json(
      await prisma.refItem.update({
        where: { id: req.params.id },
        data: { label, code, sortOrder, active },
      }),
    );
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

refRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.refItem.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
