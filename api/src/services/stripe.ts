import Stripe from 'stripe';
import { config, type StripeAccount } from '../config';

export interface StripePayment {
  account: string;
  id: string;
  amount: number;
  currency: string;
  createdISO: string;
  email: string | null;
  description: string | null;
}

/** Liste les PaymentIntents réussis d'un compte Stripe depuis une date (auto-pagination). */
async function listSucceededForAccount(
  account: StripeAccount,
  sinceUnix: number,
): Promise<StripePayment[]> {
  const stripe = new Stripe(account.key);
  const out: StripePayment[] = [];
  for await (const pi of stripe.paymentIntents.list({ created: { gte: sinceUnix }, limit: 100 })) {
    if (pi.status !== 'succeeded') continue;
    out.push({
      account: account.label,
      id: pi.id,
      amount: pi.amount / 100,
      currency: pi.currency.toUpperCase(),
      createdISO: new Date(pi.created * 1000).toISOString(),
      email: pi.receipt_email ?? null,
      description: pi.description ?? null,
    });
  }
  return out;
}

/** Paiements réussis de TOUS les comptes configurés depuis `sinceISO`. */
export async function listSucceededPayments(sinceISO: string): Promise<StripePayment[]> {
  if (config.stripeAccounts.length === 0) {
    throw new Error('Aucun compte Stripe configuré (STRIPE_API_KEY_FR / STRIPE_API_KEY_US).');
  }
  const sinceUnix = Math.floor(new Date(sinceISO).getTime() / 1000);
  const results = await Promise.all(
    config.stripeAccounts.map((acc) => listSucceededForAccount(acc, sinceUnix)),
  );
  return results.flat();
}
