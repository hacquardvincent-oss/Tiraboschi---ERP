import { prisma } from '../db/prisma';
import { createRecoveryOrder } from './shopify';

export interface SaleItem {
  title: string;
  sku?: string;
  priceCents: number;
  qty: number;
}
export interface SaleTaxLine {
  title: string;
  rate?: number;
  amountCents: number;
}

export interface CreateSaleInput {
  market: 'FR' | 'US';
  currency: string;
  customerEmail?: string;
  customerName?: string;
  items: SaleItem[];
  taxLines?: SaleTaxLine[];
  shippingCents?: number;
  createdById?: string;
}

const cents = (n: number) => Math.round(n);
const toAmount = (c: number) => (c / 100).toFixed(2);

export async function createSale(input: CreateSaleInput) {
  const subtotalCents = input.items.reduce((s, i) => s + cents(i.priceCents) * i.qty, 0);
  const taxCents = (input.taxLines ?? []).reduce((s, t) => s + cents(t.amountCents), 0);
  const shippingCents = cents(input.shippingCents ?? 0);
  const totalCents = subtotalCents + taxCents + shippingCents;
  return prisma.sale.create({
    data: {
      reference: 'SALE-' + Date.now(),
      market: input.market,
      currency: input.currency,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      items: input.items as unknown as object,
      taxLines: (input.taxLines ?? []) as unknown as object,
      subtotalCents,
      taxCents,
      shippingCents,
      totalCents,
      createdById: input.createdById,
    },
  });
}

/** Marque une vente payée puis tente une synchro immédiate (le worker reprend si échec). */
export async function markSalePaid(
  saleId: string,
  payment: { stripeAccount?: string; stripePaymentIntentId?: string; stripeSessionId?: string } = {},
) {
  const existing = await prisma.sale.findUnique({ where: { id: saleId } });
  await prisma.sale.update({
    where: { id: saleId },
    data: { status: 'PAID', paidAt: existing?.paidAt ?? new Date(), ...payment },
  });
  await syncSale(saleId).catch(() => {});
  return prisma.sale.findUnique({ where: { id: saleId } });
}

function splitName(name?: string | null): { firstName?: string; lastName?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
}

/** Crée la commande Shopify pour une vente payée (idempotent + statut). */
export async function syncSale(saleId: string): Promise<void> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale || sale.status !== 'PAID') return;
  if (sale.shopifyOrderId) {
    if (sale.syncStatus !== 'SYNCED') {
      await prisma.sale.update({ where: { id: saleId }, data: { syncStatus: 'SYNCED' } });
    }
    return; // déjà créée → idempotent
  }
  const items = (sale.items as unknown as SaleItem[]) ?? [];
  const taxLines = (sale.taxLines as unknown as SaleTaxLine[]) ?? [];
  const name = splitName(sale.customerName);
  try {
    const res = await createRecoveryOrder({
      currency: sale.currency,
      email: sale.customerEmail ?? undefined,
      customer: name.firstName || name.lastName ? name : undefined,
      lineItems: items.map((i) => ({
        title: i.title,
        sku: i.sku,
        quantity: i.qty,
        price: toAmount(i.priceCents),
      })),
      taxLines: taxLines.map((t) => ({ title: t.title, rate: t.rate, price: toAmount(t.amountCents) })),
      stripeId: sale.stripePaymentIntentId ?? sale.stripeSessionId ?? undefined,
      processedAt: (sale.paidAt ?? new Date()).toISOString(),
      tags: ['POS', sale.market],
      note: `Vente POS ${sale.reference}${sale.stripeSessionId ? ' (lien de paiement)' : ''}`,
    });
    const errs = res.orderCreate.userErrors;
    if (errs.length > 0) throw new Error(errs.map((e) => e.message).join(', '));
    const order = res.orderCreate.order;
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        syncStatus: 'SYNCED',
        shopifyOrderId: order?.id,
        shopifyOrderName: order?.name,
        syncError: null,
      },
    });
  } catch (e) {
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        syncStatus: 'FAILED',
        syncAttempts: { increment: 1 },
        syncError: (e as Error).message,
      },
    });
  }
}

/** Worker : rejoue les ventes payées non encore synchronisées (retries bornés). */
export async function processPendingSales(): Promise<void> {
  const pending = await prisma.sale.findMany({
    where: {
      status: 'PAID',
      shopifyOrderId: null,
      syncStatus: { in: ['PENDING', 'FAILED'] },
      syncAttempts: { lt: 6 },
    },
    select: { id: true },
    take: 50,
  });
  for (const s of pending) await syncSale(s.id);
  if (pending.length > 0) console.log(`[sync] ${pending.length} vente(s) traitée(s).`);
}
