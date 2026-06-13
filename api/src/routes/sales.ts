import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { createSale, markSalePaid, syncSale } from '../services/sales';

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get('/', async (_req, res) => {
  res.json(await prisma.sale.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
});

salesRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'items requis.' });
  }
  try {
    const sale = await createSale({
      market: b.market === 'US' ? 'US' : 'FR',
      currency: b.currency ?? (b.market === 'US' ? 'USD' : 'EUR'),
      customerEmail: b.customerEmail,
      customerName: b.customerName,
      items: b.items,
      taxLines: b.taxLines,
      shippingCents: b.shippingCents,
      createdById: req.user?.sub,
    });
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Marquer payé (intérim : encaissement externe ; remplacé par Stripe en 3b.2/3b.3). */
salesRouter.post('/:id/pay', async (req, res) => {
  try {
    res.json(await markSalePaid(req.params.id, req.body ?? {}));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Forcer une re-synchronisation Shopify (vente en échec). */
salesRouter.post('/:id/sync', async (req, res) => {
  await syncSale(req.params.id);
  res.json(await prisma.sale.findUnique({ where: { id: req.params.id } }));
});
