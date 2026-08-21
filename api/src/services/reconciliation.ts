import { listSucceededPayments, type StripePayment } from './stripe';
import { getOrdersWithRefs } from './shopify';

export interface ReconciliationGap extends StripePayment {
  reason: 'no_match';
}

export interface ReconciliationReport {
  since: string;
  stripePayments: number;
  shopifyOrders: number;
  matched: number;
  missing: ReconciliationGap[];
  generatedAt: string;
}

/** Extrait les identifiants Stripe (pi_… / cs_…) d'une chaîne. */
function extractStripeIds(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.match(/\b(pi|cs|ch)_[A-Za-z0-9]+/g) ?? [];
}

/**
 * Compare les paiements Stripe réussis aux commandes Shopify depuis `sinceISO`.
 * Un paiement est "synchronisé" si une commande référence son id (note/attributs)
 * ou, à défaut, si une commande a le même montant présentement (±0,01) à ±2 jours.
 */
export async function reconcile(sinceISO: string): Promise<ReconciliationReport> {
  const [payments, ordersResult] = await Promise.all([
    listSucceededPayments(sinceISO),
    getOrdersWithRefs(sinceISO),
  ]);
  const orders = ordersResult.orders.nodes;

  // Index des ids Stripe présents dans les commandes
  const referencedIds = new Set<string>();
  for (const o of orders) {
    extractStripeIds(o.note).forEach((id) => referencedIds.add(id));
    for (const attr of o.customAttributes) {
      extractStripeIds(attr.value).forEach((id) => referencedIds.add(id));
    }
  }

  // Pour le repli par montant : (montant présentement -> liste de dates)
  const ordersByAmount = new Map<string, number[]>();
  for (const o of orders) {
    const key = `${parseFloat(o.totalPriceSet.presentmentMoney.amount).toFixed(2)}_${o.totalPriceSet.presentmentMoney.currencyCode}`;
    const list = ordersByAmount.get(key) ?? [];
    list.push(new Date(o.createdAt).getTime());
    ordersByAmount.set(key, list);
  }

  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  const missing: ReconciliationGap[] = [];
  let matched = 0;

  for (const p of payments) {
    const idMatch = referencedIds.has(p.id);
    let amountMatch = false;
    if (!idMatch) {
      const key = `${p.amount.toFixed(2)}_${p.currency}`;
      const dates = ordersByAmount.get(key) ?? [];
      const t = new Date(p.createdISO).getTime();
      amountMatch = dates.some((d) => Math.abs(d - t) <= twoDaysMs);
    }
    if (idMatch || amountMatch) {
      matched += 1;
    } else {
      missing.push({ ...p, reason: 'no_match' });
    }
  }

  return {
    since: sinceISO,
    stripePayments: payments.length,
    shopifyOrders: orders.length,
    matched,
    missing,
    generatedAt: new Date().toISOString(),
  };
}
