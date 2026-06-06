import { config } from '../config';

/**
 * Service Shopify (V2).
 *
 * Authentification via le flux `client_credentials` de l'app personnalisée :
 * client_id + client_secret -> POST /admin/oauth/access_token -> token court (mis en cache).
 * Reprend le mécanisme V1 (getShopifyHeaders) mais avec une version d'API récente et GraphQL.
 */

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const { domain, clientId, clientSecret } = config.shopify;
  if (!domain || !clientId || !clientSecret) {
    throw new Error(
      'Configuration Shopify manquante (SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET).',
    );
  }
  // Renouvelle si absent ou expirant dans moins d'1 minute.
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Échec d'obtention du token Shopify (${response.status}) : ${detail}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(
    `https://${config.shopify.domain}/admin/api/${config.shopify.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = (await response.json()) as { data?: T; errors?: unknown };
  if (!response.ok || json.errors) {
    throw new Error(`Erreur Shopify GraphQL : ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

export interface ShopInfo {
  shop: {
    name: string;
    myshopifyDomain: string;
    currencyCode: string;
    plan: { displayName: string };
  };
}

export async function getShopInfo(): Promise<ShopInfo> {
  return shopifyGraphQL<ShopInfo>(
    `{ shop { name myshopifyDomain currencyCode plan { displayName } } }`,
  );
}
