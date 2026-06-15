import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  const rows = await prisma.setting.findMany();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

settingsRouter.get('/:key', async (req, res) => {
  const s = await prisma.setting.findUnique({ where: { key: req.params.key } });
  res.json({ key: req.params.key, value: s?.value ?? null });
});

settingsRouter.put('/:key', requireRole('ADMIN'), async (req, res) => {
  const value = String((req.body ?? {}).value ?? '');
  try {
    const s = await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    });
    res.json(s);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
