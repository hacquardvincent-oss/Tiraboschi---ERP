import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { createSale, markSalePaid, syncSale } from '../services/sales';
import { calculateTax } from '../services/shopify';
import {
  createPaymentLink,
  createTerminalConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPayment,
  refundSale,
  cancelSale,
} from '../services/payments';

export const salesRouter = Router();
salesRouter.use(requireAuth);

// Calcul de la taxe réelle via Shopify (par juridiction) pour une adresse client
salesRouter.post('/tax-quote', async (req, res) => {
  const b = req.body ?? {};
  const items: { title?: string; priceCents?: number; qty?: number }[] = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'items requis.' });
  if (!b.address?.countryCode) return res.status(400).json({ error: 'Adresse (pays) requise.' });
  try {
    const quote = await calculateTax({
      currency: b.currency ?? 'USD',
      lineItems: items.map((i) => ({
        title: i.title ?? 'Article',
        unitPrice: ((i.priceCents ?? 0) / 100).toFixed(2),
        quantity: i.qty ?? 1,
      })),
      address: {
        countryCode: b.address.countryCode,
        provinceCode: b.address.provinceCode,
        zip: b.address.zip,
        city: b.address.city,
        address1: b.address.address1,
      },
    });
    res.json(quote);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

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
      customer: b.customer,
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

salesRouter.post('/:id/refund', async (req, res) => {
  try {
    res.json(await refundSale(req.params.id));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

salesRouter.post('/:id/cancel', async (req, res) => {
  try {
    res.json(await cancelSale(req.params.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
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
