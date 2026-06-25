import { prisma } from '../db/prisma';
import { createRecoveryOrder, markShopifyOrderPaid } from './shopify';
import { orchestrateSale } from './fulfillment';

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

export interface SaleCustomer {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneExt?: string; // indicatif (+33 / +1…)
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  province?: string; // état / province (code ou nom)
  country?: string; // FR | US
  acceptsEmail?: boolean;
  acceptsSms?: boolean;
  note?: string;
}

export type PaymentPlan = 'FULL' | 'DEPOSIT_50';

export interface CreateSaleInput {
  market: 'FR' | 'US';
  currency: string;
  customerEmail?: string;
  customerName?: string;
  customer?: SaleCustomer;
  items: SaleItem[];
  taxLines?: SaleTaxLine[];
  shippingCents?: number;
  paymentPlan?: PaymentPlan;
  createdById?: string;
}

/** Acompte/solde selon le plan : 50/50 (acompte = moitié arrondie) ou FULL (acompte = total). */
export function splitPayment(totalCents: number, plan: PaymentPlan): { depositCents: number; balanceCents: number } {
  if (plan === 'DEPOSIT_50') {
    const depositCents = Math.round(totalCents / 2);
    return { depositCents, balanceCents: totalCents - depositCents };
  }
  return { depositCents: totalCents, balanceCents: 0 };
}

const cents = (n: number) => Math.round(n);
const toAmount = (c: number) => (c / 100).toFixed(2);

function fullName(c?: SaleCustomer): string | undefined {
  if (!c) return undefined;
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return n || undefined;
}

export async function createSale(input: CreateSaleInput) {
  const subtotalCents = input.items.reduce((s, i) => s + cents(i.priceCents) * i.qty, 0);
  const taxCents = (input.taxLines ?? []).reduce((s, t) => s + cents(t.amountCents), 0);
  const shippingCents = cents(input.shippingCents ?? 0);
  const totalCents = subtotalCents + taxCents + shippingCents;
  const plan: PaymentPlan = input.paymentPlan === 'DEPOSIT_50' ? 'DEPOSIT_50' : 'FULL';
  const { depositCents, balanceCents } = splitPayment(totalCents, plan);
  return prisma.sale.create({
    data: {
      reference: 'SALE-' + Date.now(),
      market: input.market,
      currency: input.currency,
      customerEmail: input.customerEmail ?? input.customer?.email,
      customerName: input.customerName ?? fullName(input.customer),
      customer: (input.customer ?? undefined) as unknown as object | undefined,
      items: input.items as unknown as object,
      taxLines: (input.taxLines ?? []) as unknown as object,
      subtotalCents,
      taxCents,
      shippingCents,
      totalCents,
      paymentPlan: plan,
      depositCents,
      balanceCents,
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
    data: { status: 'PAID', paidAt: existing?.paidAt ?? new Date(), balancePaidAt: existing?.balancePaidAt ?? new Date(), ...payment },
  });
  await syncSale(saleId).catch(() => {});
  await orchestrateSale(saleId).catch(() => {});
  return prisma.sale.findUnique({ where: { id: saleId } });
}

/**
 * Acompte (50/50) encaissé : la vente passe « en attente du solde », la commande Shopify
 * est créée en « partiellement payée » (montant acompte) et la PRODUCTION démarre.
 */
export async function markDepositPaid(
  saleId: string,
  payment: { stripeAccount?: string; depositSessionId?: string } = {},
) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return null;
  if (sale.depositPaidAt) return sale; // idempotent
  await prisma.sale.update({
    where: { id: saleId },
    data: { status: 'AWAITING_BALANCE', depositPaidAt: new Date(), ...payment },
  });
  await syncSale(saleId).catch(() => {}); // crée la commande Shopify partiellement payée
  await orchestrateSale(saleId).catch(() => {}); // lance la production dès l'acompte
  return prisma.sale.findUnique({ where: { id: saleId } });
}

/** Solde encaissé : la vente passe « payée » et la commande Shopify est marquée payée. */
export async function markBalancePaid(
  saleId: string,
  payment: { stripeAccount?: string; balanceSessionId?: string } = {},
) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return null;
  if (sale.status === 'PAID') return sale; // idempotent
  await prisma.sale.update({
    where: { id: saleId },
    data: { status: 'PAID', balancePaidAt: new Date(), paidAt: sale.paidAt ?? new Date(), ...payment },
  });
  if (sale.shopifyOrderId) {
    await markShopifyOrderPaid(sale.shopifyOrderId).catch(() => {});
  } else {
    await syncSale(saleId).catch(() => {});
  }
  await orchestrateSale(saleId).catch(() => {}); // idempotent (déjà fait à l'acompte)
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
  if (!sale || (sale.status !== 'PAID' && sale.status !== 'AWAITING_BALANCE')) return;
  // Acompte payé (50/50) → commande Shopify « partiellement payée » du montant de l'acompte.
  const partial = sale.status === 'AWAITING_BALANCE';
  if (sale.shopifyOrderId) {
    if (sale.syncStatus !== 'SYNCED') {
      await prisma.sale.update({ where: { id: saleId }, data: { syncStatus: 'SYNCED' } });
    }
    return; // déjà créée → idempotent
  }
  const items = (sale.items as unknown as SaleItem[]) ?? [];
  const taxLines = (sale.taxLines as unknown as SaleTaxLine[]) ?? [];
  const cust = (sale.customer as unknown as SaleCustomer | null) ?? undefined;
  const split = splitName(sale.customerName);
  const firstName = cust?.firstName ?? split.firstName;
  const lastName = cust?.lastName ?? split.lastName;
  const phone = cust?.phone ? `${cust.phoneExt ?? ''}${cust.phone}`.trim() : undefined;
  const shippingAddress = cust?.address1
    ? {
        firstName,
        lastName,
        address1: cust.address1,
        address2: cust.address2 || undefined,
        city: cust.city || undefined,
        province: cust.province || undefined,
        zip: cust.zip || undefined,
        countryCode: cust.country || undefined,
        phone,
      }
    : undefined;
  try {
    const res = await createRecoveryOrder({
      currency: sale.currency,
      email: sale.customerEmail ?? undefined,
      customer: firstName || lastName ? { firstName, lastName } : undefined,
      shippingAddress,
      lineItems: items.map((i) => ({
        title: i.title,
        sku: i.sku,
        quantity: i.qty,
        price: toAmount(i.priceCents),
      })),
      taxLines: taxLines.map((t) => ({ title: t.title, rate: t.rate, price: toAmount(t.amountCents) })),
      stripeId: sale.stripePaymentIntentId ?? sale.depositSessionId ?? sale.stripeSessionId ?? undefined,
      processedAt: (sale.depositPaidAt ?? sale.paidAt ?? new Date()).toISOString(),
      tags: partial ? ['POS', sale.market, 'Acompte 50%'] : ['POS', sale.market],
      note: `Vente POS ${sale.reference}${partial ? ` — acompte ${toAmount(sale.depositCents)} ${sale.currency}, solde ${toAmount(sale.balanceCents)} ${sale.currency} à la réception` : ''}`,
      ...(partial ? { financialStatus: 'PARTIALLY_PAID' as const, paidAmount: toAmount(sale.depositCents) } : {}),
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
      status: { in: ['PAID', 'AWAITING_BALANCE'] },
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
