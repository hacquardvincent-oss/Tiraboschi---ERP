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

// ─── RÉCUPÉRATION DE COMMANDES (réconciliation Stripe ↔ Shopify) ────────────────

export interface RecoveryLineItem {
  title: string;
  sku?: string;
  quantity: number;
  /** Prix unitaire dans la devise de la commande, en unités (ex. "680.00"). */
  price: string;
  taxable?: boolean;
}

export interface RecoveryTaxLine {
  title: string;
  /** Taux décimal optionnel (ex. 0.04 pour 4%). */
  rate?: number;
  /** Montant de taxe en unités (ex. "27.20"). */
  price: string;
}

export interface RecoveryOrderInput {
  currency: string;
  email?: string;
  customer?: { firstName?: string; lastName?: string };
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    city?: string;
    provinceCode?: string;
    zip?: string;
    countryCode?: string;
  };
  lineItems: RecoveryLineItem[];
  taxLines?: RecoveryTaxLine[];
  /** Identifiant Stripe (pi_… ou cs_…) pour la traçabilité. */
  stripeId?: string;
  /** Date d'encaissement réelle (ISO). */
  processedAt?: string;
  tags?: string[];
  note?: string;
}

interface OrderCreateResult {
  orderCreate: {
    order: {
      id: string;
      name: string;
      displayFinancialStatus: string;
      totalPriceSet: {
        shopMoney: { amount: string; currencyCode: string };
        presentmentMoney: { amount: string; currencyCode: string };
      };
    } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}

/**
 * Recrée une commande encaissée mais absente de Shopify, en collant aux montants
 * réellement perçus (article + lignes de taxe exactes). Statut payé, sans reçu client.
 */
export async function createRecoveryOrder(input: RecoveryOrderInput): Promise<OrderCreateResult> {
  const currency = input.currency.toUpperCase();
  const money = (amount: string) => ({ shopMoney: { amount, currencyCode: currency } });

  const order: Record<string, unknown> = {
    currency,
    financialStatus: 'PAID',
    taxesIncluded: false,
    tags: input.tags ?? ['POS', 'Récupération'],
    lineItems: input.lineItems.map((li) => ({
      title: li.title,
      ...(li.sku ? { sku: li.sku } : {}),
      quantity: li.quantity,
      taxable: li.taxable ?? true,
      priceSet: money(li.price),
    })),
    taxLines: (input.taxLines ?? []).map((t) => ({
      title: t.title,
      ...(t.rate !== undefined ? { rate: t.rate } : {}),
      priceSet: money(t.price),
    })),
    customAttributes: input.stripeId ? [{ key: 'Stripe', value: input.stripeId }] : [],
  };
  if (input.note) order.note = input.note;
  if (input.processedAt) order.processedAt = input.processedAt;
  if (input.email) order.email = input.email;
  if (input.email || input.customer) {
    order.customer = {
      toUpsert: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.customer?.firstName ? { firstName: input.customer.firstName } : {}),
        ...(input.customer?.lastName ? { lastName: input.customer.lastName } : {}),
      },
    };
  }
  if (input.shippingAddress) order.shippingAddress = input.shippingAddress;

  const mutation = `
    mutation RecoverOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order {
          id
          name
          displayFinancialStatus
          totalPriceSet {
            shopMoney { amount currencyCode }
            presentmentMoney { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }`;
  return shopifyGraphQL<OrderCreateResult>(mutation, {
    order,
    options: { sendReceipt: false },
  });
}

interface RecentOrdersResult {
  orders: {
    nodes: {
      name: string;
      createdAt: string;
      displayFinancialStatus: string;
      totalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
      customer: { displayName: string } | null;
      tags: string[];
    }[];
  };
}

/** Liste les commandes Shopify depuis une date (réconciliation). */
export async function listRecentOrders(sinceISODate: string, first = 50): Promise<RecentOrdersResult> {
  const query = `
    query RecentOrders($q: String!, $first: Int!) {
      orders(first: $first, query: $q, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name
          createdAt
          displayFinancialStatus
          totalPriceSet { presentmentMoney { amount currencyCode } }
          customer { displayName }
          tags
        }
      }
    }`;
  return shopifyGraphQL<RecentOrdersResult>(query, {
    q: `created_at:>=${sinceISODate}`,
    first,
  });
}
