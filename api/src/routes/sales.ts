import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { createSale, markSalePaid, markBalancePaid, syncSale } from '../services/sales';
import { calculateTax, createDraftOrder } from '../services/shopify';
import { generateSaleDocument } from '../services/invoice';
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

// Commande brouillon Shopify (« mise de côté »)
salesRouter.post('/draft', async (req, res) => {
  const b = req.body ?? {};
  const items: { title?: string; sku?: string; priceCents?: number; qty?: number }[] = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'Panier vide.' });
  const c = b.customer ?? {};
  try {
    const draft = await createDraftOrder({
      email: b.customerEmail ?? c.email ?? undefined,
      customer: c.firstName || c.lastName ? { firstName: c.firstName, lastName: c.lastName } : undefined,
      shippingAddress: c.address1
        ? { firstName: c.firstName, lastName: c.lastName, address1: c.address1, address2: c.address2 || undefined, city: c.city || undefined, province: c.province || undefined, zip: c.zip || undefined, countryCode: c.country || undefined, phone: c.phone ? `${c.phoneExt ?? ''}${c.phone}` : undefined }
        : undefined,
      lineItems: items.map((i) => ({ title: i.title ?? 'Article', sku: i.sku || undefined, price: ((i.priceCents ?? 0) / 100).toFixed(2), quantity: i.qty ?? 1 })),
      note: `Brouillon POS${b.market ? ' ' + b.market : ''}`,
      tags: ['POS', 'brouillon'],
    });
    res.json(draft);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

salesRouter.get('/', async (_req, res) => {
  res.json(await prisma.sale.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
});

/** Alertes paiement : ventes en attente d'acompte (PENDING) ou de solde (AWAITING_BALANCE). */
salesRouter.get('/alerts', async (_req, res) => {
  const sales = await prisma.sale.findMany({
    where: { status: { in: ['PENDING', 'AWAITING_BALANCE'] } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const now = Date.now();
  res.json(
    sales.map((s) => ({
      id: s.id,
      reference: s.reference,
      customerName: s.customerName,
      currency: s.currency,
      status: s.status,
      totalCents: s.totalCents,
      depositCents: s.depositCents,
      balanceCents: s.balanceCents,
      dueCents: s.status === 'AWAITING_BALANCE' ? s.balanceCents : s.depositCents,
      kind: s.status === 'AWAITING_BALANCE' ? 'balance' : s.paymentPlan === 'DEPOSIT_50' ? 'deposit' : 'full',
      ageDays: Math.floor((now - new Date(s.createdAt).getTime()) / 86400000),
      createdAt: s.createdAt,
    })),
  );
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
      paymentPlan: b.paymentPlan === 'DEPOSIT_50' ? 'DEPOSIT_50' : 'FULL',
      createdById: req.user?.sub,
    });
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Marquer payé (intérim : encaissement externe). Sur une vente en attente de solde → marque le solde. */
salesRouter.post('/:id/pay', async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (sale?.status === 'AWAITING_BALANCE') return res.json(await markBalancePaid(req.params.id, {}));
    res.json(await markSalePaid(req.params.id, req.body ?? {}));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Devis ou facture PDF de la vente (aperçu/téléchargement). ?type=quote|invoice */
salesRouter.get('/:id/document', async (req, res) => {
  const type = req.query.type === 'invoice' ? 'INVOICE' : 'QUOTE';
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale) return res.status(404).json({ error: 'Vente introuvable.' });
    const pdf = await generateSaleDocument(sale, type);
    await prisma.sale.update({ where: { id: sale.id }, data: { documentType: type } });
    const fileLabel = type === 'INVOICE' ? 'facture' : 'devis';
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${fileLabel}-${sale.reference}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Forcer une re-synchronisation Shopify (vente en échec). */
salesRouter.post('/:id/sync', async (req, res) => {
  await syncSale(req.params.id);
  res.json(await prisma.sale.findUnique({ where: { id: req.params.id } }));
});

salesRouter.post('/:id/refund', requireRole('ADMIN'), async (req, res) => {
  try {
    res.json(await refundSale(req.params.id));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

salesRouter.post('/:id/cancel', requireRole('ADMIN'), async (req, res) => {
  try {
    res.json(await cancelSale(req.params.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ─── Encaissement Stripe (3b.2 lien / 3b.3 TPE S710) ─────────────────────────

/** 3b.2 — Génère le lien de paiement Stripe Checkout (hébergé). `leg` = full | deposit | balance. */
salesRouter.post('/:id/payment-link', async (req, res) => {
  try {
    const leg = ['full', 'deposit', 'balance'].includes(req.body?.leg) ? req.body.leg : undefined;
    res.json(await createPaymentLink(req.params.id, leg));
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
