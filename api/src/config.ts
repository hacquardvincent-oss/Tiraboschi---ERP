import 'dotenv/config';

function normalizeDomain(value?: string): string | undefined {
  return value?.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export interface StripeAccount {
  label: string;
  key: string;
}

/** Comptes Stripe à surveiller (FR + US TIRABOSCHI LLC). Clés restreintes en lecture. */
function loadStripeAccounts(): StripeAccount[] {
  const accounts: StripeAccount[] = [];
  if (process.env.STRIPE_API_KEY_FR) accounts.push({ label: 'FR', key: process.env.STRIPE_API_KEY_FR });
  if (process.env.STRIPE_API_KEY_US) accounts.push({ label: 'US', key: process.env.STRIPE_API_KEY_US });
  // Fallback compte unique
  if (accounts.length === 0 && process.env.STRIPE_API_KEY) {
    accounts.push({ label: 'default', key: process.env.STRIPE_API_KEY });
  }
  return accounts;
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  shopify: {
    domain: normalizeDomain(process.env.SHOPIFY_STORE_DOMAIN),
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-04',
  },
  stripeAccounts: loadStripeAccounts(),
};

export type AppConfig = typeof config;
