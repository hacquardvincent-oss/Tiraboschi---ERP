import 'dotenv/config';

function normalizeDomain(value?: string): string | undefined {
  return value?.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/\/$/, '');
  return /^https?:\/\//.test(v) ? v : `https://${v}`;
}

export interface StripeAccount {
  label: string;
  key: string;
}

/** Compte Stripe « write » (encaissement) : clé secrète + secret webhook + Terminal. */
export interface StripeWriteAccount {
  /** Marché : FR | US. */
  market: string;
  /** Clé secrète (write) — pour Checkout, PaymentIntents, Terminal. */
  secretKey: string;
  /** Secret de signature du webhook (whsec_…). */
  webhookSecret?: string;
  /** Clé publique (front Terminal). */
  publishableKey?: string;
  /** Location Terminal (tml_…) pour rattacher le lecteur S710. */
  terminalLocation?: string;
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

/** Comptes Stripe « write » par marché (encaissement réel : lien + TPE). */
function loadStripeWriteAccounts(): Record<string, StripeWriteAccount> {
  const out: Record<string, StripeWriteAccount> = {};
  const add = (market: string, secretKey?: string) => {
    if (!secretKey) return;
    out[market] = {
      market,
      secretKey,
      webhookSecret: process.env[`STRIPE_WEBHOOK_SECRET_${market}`],
      publishableKey: process.env[`STRIPE_PUBLISHABLE_KEY_${market}`],
      terminalLocation: process.env[`STRIPE_TERMINAL_LOCATION_${market}`],
    };
  };
  add('FR', process.env.STRIPE_SECRET_KEY_FR);
  add('US', process.env.STRIPE_SECRET_KEY_US);
  // Fallback compte unique → sert les deux marchés.
  if (Object.keys(out).length === 0 && process.env.STRIPE_SECRET_KEY) {
    const single: StripeWriteAccount = {
      market: 'default',
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      terminalLocation: process.env.STRIPE_TERMINAL_LOCATION,
    };
    out.FR = single;
    out.US = single;
  }
  return out;
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** URL publique de l'app (success/cancel des liens de paiement). */
  publicUrl: normalizeUrl(process.env.PUBLIC_URL) ?? 'https://tiraboschi-ops-v2.onrender.com',
  shopify: {
    domain: normalizeDomain(process.env.SHOPIFY_STORE_DOMAIN),
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-04',
  },
  stripeAccounts: loadStripeAccounts(),
  stripeWrite: loadStripeWriteAccounts(),
};

export type AppConfig = typeof config;
