import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { importRefCsv, importRefMultiCsv, importRefFullCsv, exportRefCsv } from '../services/import';
import { nextRefCode } from '../services/sku';

export const refRouter = Router();
refRouter.use(requireAuth);

// Détection de conflits de coloris : un même libellé porté par plusieurs codes (ou l'inverse)
refRouter.get('/color-conflicts', async (_req, res) => {
  const colors = await prisma.refItem.findMany({ where: { category: 'colors' } });
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const byLabel = new Map<string, { label: string; codes: string[] }>();
  const byCode = new Map<string, string[]>();
  for (const c of colors) {
    const key = norm(c.label);
    const g = byLabel.get(key) ?? { label: c.label, codes: [] };
    g.codes.push(c.code);
    byLabel.set(key, g);
    byCode.set(c.code, [...(byCode.get(c.code) ?? []), c.label]);
  }
  res.json({
    labelConflicts: [...byLabel.values()].filter((g) => g.codes.length > 1),
    codeConflicts: [...byCode.entries()].filter(([, labels]) => labels.length > 1).map(([code, labels]) => ({ code, labels })),
    total: colors.length,
  });
});

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

// Import multi-catégories (1 colonne = 1 catégorie) — Admin
refRouter.post('/import-multi', requireRole('ADMIN'), async (req, res) => {
  const { csv } = req.body ?? {};
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'csv requis.' });
  try {
    res.json(await importRefMultiCsv(csv));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Import « base complète » : un seul CSV pour tout le référentiel (category;code;label) — Admin
refRouter.post('/import-full', requireRole('ADMIN'), async (req, res) => {
  const { csv } = req.body ?? {};
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'csv requis.' });
  try {
    res.json(await importRefFullCsv(csv));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Export de toute la base en CSV normalisé (miroir de l'import « base complète »)
refRouter.get('/export', async (_req, res) => {
  const csv = await exportRefCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="referentiel.csv"');
  res.send(csv);
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

/** Prochain code calculé pour une catégorie (générateur d'ID : couleurs ###, modèles AA###…). */
refRouter.get('/:category/next-code', async (req, res) => {
  const items = await prisma.refItem.findMany({
    where: { category: req.params.category },
    select: { code: true },
  });
  const prefix = req.query.prefix != null ? String(req.query.prefix) : undefined;
  res.json({ code: nextRefCode(items.map((i) => i.code), prefix) });
});

/** Items d'une catégorie (alimente les listes déroulantes des formulaires). Tri par code (ID). */
refRouter.get('/:category', async (req, res) => {
  const items = await prisma.refItem.findMany({
    where: { category: req.params.category },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
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
