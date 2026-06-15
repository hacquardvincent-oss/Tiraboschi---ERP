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

export interface CreateSaleInput {
  market: 'FR' | 'US';
  currency: string;
  customerEmail?: string;
  customerName?: string;
  customer?: SaleCustomer;
  items: SaleItem[];
  taxLines?: SaleTaxLine[];
  shippingCents?: number;
  createdById?: string;
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
