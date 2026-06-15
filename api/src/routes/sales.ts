import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { createSale, markSalePaid, syncSale } from '../services/sales';
import {
  createPaymentLink,
  createTerminalConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPayment,
} from '../services/payments';

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

// ─── Encaissement Stripe (3b.2 lien / 3b.3 TPE S710) ─────────────────────────

/** 3b.2 — Génère le lien de paiement Stripe Checkout (hébergé). */
salesRouter.post('/:id/payment-link', async (req, res) => {
  try {
    res.json(await createPaymentLink(req.params.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** 3b.3 — Jeton de connexion Terminal (S710) pour le marché demandé. */
salesRouter.post('/terminal/connection-token', async (req, res) => {
  try {
    res.json(await createTerminalConnectionToken(req.body?.market === 'US' ? 'US' : 'FR'));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** 3b.3 — Crée le PaymentIntent card_present (capture manuelle) à encaisser sur le TPE. */
salesRouter.post('/:id/terminal/intent', async (req, res) => {
  try {
    res.json(await createTerminalPaymentIntent(req.params.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** 3b.3 — Capture le paiement TPE après présentation de la carte. */
salesRouter.post('/:id/terminal/capture', async (req, res) => {
  try {
    await captureTerminalPayment(req.params.id);
    res.json(await prisma.sale.findUnique({ where: { id: req.params.id } }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
