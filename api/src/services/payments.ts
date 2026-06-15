import Stripe from 'stripe';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { markSalePaid } from './sales';
import type { SaleItem, SaleTaxLine } from './sales';

/**
 * Service d'encaissement Stripe (V2) — brique 3b.2 (lien de paiement) + 3b.3 (TPE S710).
 *
 * Principe anti-perte : l'encaissement n'écrit JAMAIS directement la commande Shopify.
 * Stripe confirme le paiement → webhook signé → markSalePaid → l'outbox crée la commande
 * Shopify (idempotent + retries). Si le webhook se perd, le watchdog rattrape.
 */

const clients = new Map<string, Stripe.Stripe>();

/** Client Stripe « write » pour un marché (FR | US). Mémoïsé. */
function stripeFor(market: string): Stripe.Stripe {
  const acc = config.stripeWrite[market];
  if (!acc) {
    throw new Error(
      `Aucun compte Stripe « write » pour le marché ${market} (définir STRIPE_SECRET_KEY_${market}).`,
    );
  }
  let c = clients.get(market);
  if (!c) {
    c = new Stripe(acc.secretKey);
    clients.set(market, c);
  }
  return c;
}

function marketOf(sale: { market: string }): string {
  return config.stripeWrite[sale.market] ? sale.market : 'FR';
}

interface CheckoutLine {
  quantity: number;
  price_data: {
    currency: string;
    unit_amount: number;
    product_data: { name: string; metadata?: Record<string, string> };
  };
}

/** Construit les line_items Checkout depuis la vente (articles + taxe + port), montants exacts. */
function checkoutLineItems(
  sale: { currency: string; items: unknown; taxLines: unknown; shippingCents: number },
): CheckoutLine[] {
  const currency = sale.currency.toLowerCase();
  const items = (sale.items as unknown as SaleItem[]) ?? [];
  const taxLines = (sale.taxLines as unknown as SaleTaxLine[]) ?? [];
  const lines: CheckoutLine[] = items.map((i) => ({
    quantity: i.qty,
    price_data: {
      currency,
      unit_amount: Math.round(i.priceCents),
      product_data: { name: i.title, ...(i.sku ? { metadata: { sku: i.sku } } : {}) },
    },
  }));
  const taxTotal = taxLines.reduce((s, t) => s + Math.round(t.amountCents), 0);
  if (taxTotal > 0) {
    lines.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: taxTotal,
        product_data: { name: taxLines.map((t) => t.title).join(' + ') || 'Taxe' },
      },
    });
  }
  if (sale.shippingCents > 0) {
    lines.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Math.round(sale.shippingCents),
        product_data: { name: 'Frais de port (DDP)' },
      },
    });
  }
  return lines;
}

/** 3b.2 — Crée (ou réutilise) un lien de paiement Stripe Checkout hébergé pour la vente. */
export async function createPaymentLink(saleId: string): Promise<{ url: string }> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new Error('Vente introuvable.');
  if (sale.status === 'PAID') throw new Error('Vente déjà payée.');
  const market = marketOf(sale);
  const stripe = stripeFor(market);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: checkoutLineItems(sale),
    ...(sale.customerEmail ? { customer_email: sale.customerEmail } : {}),
    metadata: { saleId: sale.id, reference: sale.reference },
    payment_intent_data: { metadata: { saleId: sale.id, reference: sale.reference } },
    success_url: `${config.publicUrl}/?paid=${sale.id}`,
    cancel_url: `${config.publicUrl}/?cancelled=${sale.id}`,
  });

  await prisma.sale.update({
    where: { id: sale.id },
    data: { stripeAccount: market, stripeSessionId: session.id, paymentUrl: session.url ?? undefined },
  });
  if (!session.url) throw new Error('Stripe n’a pas renvoyé d’URL de paiement.');
  return { url: session.url };
}

/** 3b.3 — Jeton de connexion Terminal (le front S710 s'y connecte) + infos compte. */
export async function createTerminalConnectionToken(
  market: string,
): Promise<{ secret: string; publishableKey?: string; location?: string }> {
  const acc = config.stripeWrite[market] ?? config.stripeWrite.FR;
  if (!acc) throw new Error(`Aucun compte Stripe « write » (marché ${market}).`);
  const stripe = stripeFor(acc.market);
  const token = await stripe.terminal.connectionTokens.create(
    acc.terminalLocation ? { location: acc.terminalLocation } : {},
  );
  return { secret: token.secret, publishableKey: acc.publishableKey, location: acc.terminalLocation };
}

/** 3b.3 — PaymentIntent card_present (capture manuelle) pour encaisser sur le TPE S710. */
export async function createTerminalPaymentIntent(
  saleId: string,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new Error('Vente introuvable.');
  if (sale.status === 'PAID') throw new Error('Vente déjà payée.');
  const market = marketOf(sale);
  const stripe = stripeFor(market);

  const pi = await stripe.paymentIntents.create({
    amount: sale.totalCents,
    currency: sale.currency.toLowerCase(),
    payment_method_types: ['card_present'],
    capture_method: 'manual',
    metadata: { saleId: sale.id, reference: sale.reference },
    ...(sale.customerEmail ? { receipt_email: sale.customerEmail } : {}),
  });

  await prisma.sale.update({
    where: { id: sale.id },
    data: { stripeAccount: market, stripePaymentIntentId: pi.id },
  });
  if (!pi.client_secret) throw new Error('Stripe n’a pas renvoyé de client_secret.');
  return { clientSecret: pi.client_secret, paymentIntentId: pi.id };
}

/** 3b.3 — Capture le PaymentIntent une fois la carte présentée par le lecteur. */
export async function captureTerminalPayment(saleId: string): Promise<void> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale?.stripePaymentIntentId) throw new Error('Aucun paiement TPE en cours pour cette vente.');
  const stripe = stripeFor(marketOf(sale));
  const pi = await stripe.paymentIntents.capture(sale.stripePaymentIntentId);
  if (pi.status === 'succeeded') {
    await markSalePaid(sale.id, {
      stripeAccount: marketOf(sale),
      stripePaymentIntentId: pi.id,
    });
  }
}

/**
 * Webhook signé Stripe (un endpoint par compte → secret distinct). Marque la vente payée
 * sur `checkout.session.completed` (lien) et `payment_intent.succeeded` (TPE).
 */
export async function handleStripeWebhook(
  market: string,
  rawBody: Buffer,
  signature: string,
): Promise<void> {
  const acc = config.stripeWrite[market];
  if (!acc) throw new Error(`Compte Stripe inconnu pour le webhook (marché ${market}).`);
  if (!acc.webhookSecret) throw new Error(`STRIPE_WEBHOOK_SECRET_${market} manquant.`);
  const stripe = stripeFor(acc.market);
  const event = stripe.webhooks.constructEvent(rawBody, signature, acc.webhookSecret);

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as {
      id: string;
      payment_status: string;
      payment_intent: string | { id: string } | null;
      metadata: Record<string, string> | null;
    };
    if (s.payment_status === 'paid') {
      await payByMetadata(s.metadata?.saleId, market, {
        stripeSessionId: s.id,
        stripePaymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : undefined,
      });
    }
  } else if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as { id: string; metadata: Record<string, string> | null };
    await payByMetadata(pi.metadata?.saleId, market, { stripePaymentIntentId: pi.id });
  }
}

async function payByMetadata(
  saleId: string | undefined,
  market: string,
  payment: { stripeSessionId?: string; stripePaymentIntentId?: string },
): Promise<void> {
  if (!saleId) return;
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale || (sale.status === 'PAID' && sale.shopifyOrderId)) return; // idempotent
  await markSalePaid(saleId, { stripeAccount: market, ...payment });
}
