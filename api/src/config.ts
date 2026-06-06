import 'dotenv/config';

function normalizeDomain(value?: string): string | undefined {
  return value?.replace(/^https?:\/\//, '').replace(/\/$/, '');
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
};

export type AppConfig = typeof config;
