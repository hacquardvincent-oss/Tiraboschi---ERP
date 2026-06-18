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
    address2?: string;
    city?: string;
    province?: string;
    provinceCode?: string;
    zip?: string;
    countryCode?: string;
    phone?: string;
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

// ─── REPORTS (Dashboard KPIs) ────────────────────────────────────────────────

export interface DashboardReports {
  currency: string;
  daily: number;
  weekly: number;
  monthly: number;
  orderCount: number;
  crmCount: number | null;
  recent: { name: string; createdAt: string; customer: string | null; amount: number; currency: string; status: string }[];
}

interface ReportsRawResult {
  shop: { currencyCode: string };
  orders: {
    nodes: {
      name: string;
      createdAt: string;
      displayFinancialStatus: string;
      customer: { displayName: string } | null;
      totalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
    }[];
  };
}

/** KPIs Dashboard : CA jour / semaine / mois + dernières ventes (commandes Shopify ~31 j). */
export async function getReports(): Promise<DashboardReports> {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await shopifyGraphQL<ReportsRawResult>(
    `query Reports($q: String!) {
      shop { currencyCode }
      orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name createdAt displayFinancialStatus
          customer { displayName }
          totalPriceSet { presentmentMoney { amount currencyCode } }
        }
      }
    }`,
    { q: `created_at:>=${since}` },
  );

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let daily = 0;
  let weekly = 0;
  let monthly = 0;
  for (const o of data.orders.nodes) {
    if (o.displayFinancialStatus === 'REFUNDED' || o.displayFinancialStatus === 'VOIDED') continue;
    const t = new Date(o.createdAt).getTime();
    const amt = parseFloat(o.totalPriceSet.presentmentMoney.amount) || 0;
    if (t >= startOfDay) daily += amt;
    if (t >= startOfWeek) weekly += amt;
    if (t >= startOfMonth) monthly += amt;
  }

  let crmCount: number | null = null;
  try {
    const c = await shopifyGraphQL<{ customersCount: { count: number } }>(`{ customersCount { count } }`);
    crmCount = c.customersCount.count;
  } catch {
    crmCount = null; // champ indisponible selon la version d'API — non bloquant
  }

  return {
    currency: data.shop.currencyCode,
    daily,
    weekly,
    monthly,
    orderCount: data.orders.nodes.length,
    crmCount,
    recent: data.orders.nodes.slice(0, 5).map((o) => ({
      name: o.name,
      createdAt: o.createdAt,
      customer: o.customer?.displayName ?? null,
      amount: parseFloat(o.totalPriceSet.presentmentMoney.amount) || 0,
      currency: o.totalPriceSet.presentmentMoney.currencyCode,
      status: o.displayFinancialStatus,
    })),
  };
}

// ─── Backfill des visuels produits depuis Shopify (par SKU de variante) ───────
interface ProductsDataResult {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { featuredImage: { url: string } | null; variants: { nodes: { sku: string | null; price: string | null }[] } }[];
  };
}
export interface ShopVariantData {
  url?: string;
  price?: string;
}
/**
 * Construit une map SKU → { image, prix } depuis Shopify, + la devise de la boutique.
 * Le prix de variante est exprimé dans la devise de la boutique (souvent EUR pour Tiraboschi).
 */
export async function fetchVariantDataBySku(): Promise<{ currency: string; map: Map<string, ShopVariantData> }> {
  const shopRes = await shopifyGraphQL<{ shop: { currencyCode: string } }>(`{ shop { currencyCode } }`);
  const currency = shopRes.shop.currencyCode;
  const map = new Map<string, ShopVariantData>();
  let cursor: string | null = null;
  for (let i = 0; i < 30; i++) {
    const query = `query($cursor: String) {
      products(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { featuredImage { url } variants(first: 100) { nodes { sku price } } }
      }
    }`;
    const d: ProductsDataResult = await shopifyGraphQL<ProductsDataResult>(query, { cursor });
    for (const p of d.products.nodes) {
      const url = p.featuredImage?.url;
      for (const v of p.variants.nodes) {
        if (!v.sku) continue;
        const entry = map.get(v.sku) ?? {};
        if (url) entry.url = url;
        if (v.price) entry.price = v.price;
        map.set(v.sku, entry);
      }
    }
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return { currency, map };
}

// ─── Annulation d'une commande Shopify (best-effort) ──────────────────────────
interface OrderCancelResult {
  orderCancel: { userErrors: { message: string }[] } | null;
}
export async function cancelShopifyOrder(orderId: string, restock = true): Promise<void> {
  const mutation = `
    mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
      orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: false) {
        userErrors { message }
      }
    }`;
  const res = await shopifyGraphQL<OrderCancelResult>(mutation, {
    orderId,
    reason: 'OTHER',
    refund: false, // le remboursement monétaire est géré côté Stripe
    restock,
  });
  const errs = res.orderCancel?.userErrors ?? [];
  if (errs.length > 0) throw new Error(errs.map((e) => e.message).join(', '));
}

// ─── POS : calcul de taxe réel via Shopify (draftOrderCalculate) ──────────────

export interface TaxQuoteInput {
  currency: string;
  lineItems: { title: string; unitPrice: string; quantity: number }[];
  address: { countryCode: string; provinceCode?: string; zip?: string; city?: string; address1?: string };
}
export interface TaxQuote {
  totalTaxCents: number;
  currency: string;
  lines: { title: string; rate: number; amountCents: number }[];
}

interface DraftCalcResult {
  draftOrderCalculate: {
    calculatedDraftOrder: {
      totalTaxSet: { shopMoney: { amount: string; currencyCode: string } } | null;
      taxLines: { title: string; rate: number | null; priceSet: { shopMoney: { amount: string } } }[];
    } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}

/**
 * Calcule la taxe réelle (par juridiction) via Shopify pour une adresse de livraison,
 * sans persister de commande. Renvoie le détail des taxes + total.
 * Requiert que la taxe automatique soit configurée côté Shopify pour la destination.
 */
export async function calculateTax(input: TaxQuoteInput): Promise<TaxQuote> {
  const mutation = `
    mutation DraftCalc($input: DraftOrderInput!) {
      draftOrderCalculate(input: $input) {
        calculatedDraftOrder {
          totalTaxSet { shopMoney { amount currencyCode } }
          taxLines { title rate priceSet { shopMoney { amount } } }
        }
        userErrors { field message }
      }
    }`;
  const draftInput = {
    presentmentCurrencyCode: input.currency.toUpperCase(),
    shippingAddress: {
      countryCode: input.address.countryCode,
      provinceCode: input.address.provinceCode || undefined,
      zip: input.address.zip || undefined,
      city: input.address.city || undefined,
      address1: input.address.address1 || undefined,
    },
    lineItems: input.lineItems.map((l) => ({
      title: l.title,
      originalUnitPrice: l.unitPrice,
      quantity: l.quantity,
      requiresShipping: true,
      taxable: true,
    })),
  };
  const res = await shopifyGraphQL<DraftCalcResult>(mutation, { input: draftInput });
  const errs = res.draftOrderCalculate.userErrors;
  if (errs.length > 0) throw new Error(errs.map((e) => e.message).join(', '));
  const calc = res.draftOrderCalculate.calculatedDraftOrder;
  const toCents = (a: string) => Math.round(parseFloat(a) * 100);
  return {
    currency: calc?.totalTaxSet?.shopMoney.currencyCode ?? input.currency.toUpperCase(),
    totalTaxCents: calc?.totalTaxSet ? toCents(calc.totalTaxSet.shopMoney.amount) : 0,
    lines: (calc?.taxLines ?? []).map((t) => ({
      title: t.title,
      rate: t.rate ?? 0,
      amountCents: toCents(t.priceSet.shopMoney.amount),
    })),
  };
}

// ─── POS : commande brouillon (draft order) ───────────────────────────────────
export interface DraftOrderInput {
  email?: string;
  customer?: { firstName?: string; lastName?: string };
  shippingAddress?: RecoveryOrderInput['shippingAddress'];
  lineItems: { title: string; price: string; quantity: number; sku?: string }[];
  note?: string;
  tags?: string[];
}
interface DraftOrderResult {
  draftOrderCreate: {
    draftOrder: { id: string; name: string; invoiceUrl: string | null } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}
/** Crée une commande brouillon Shopify (« mise de côté »), reprenable dans l'admin Shopify. */
export async function createDraftOrder(input: DraftOrderInput): Promise<{ id: string; name: string; invoiceUrl: string | null }> {
  const mutation = `
    mutation DraftCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`;
  const draftInput: Record<string, unknown> = {
    email: input.email,
    note: input.note,
    tags: input.tags,
    shippingAddress: input.shippingAddress,
    lineItems: input.lineItems.map((l) => ({
      title: l.title,
      originalUnitPrice: l.price,
      quantity: l.quantity,
      sku: l.sku,
      requiresShipping: true,
      taxable: true,
    })),
  };
  const res = await shopifyGraphQL<DraftOrderResult>(mutation, { input: draftInput });
  const errs = res.draftOrderCreate.userErrors;
  if (errs.length > 0) throw new Error(errs.map((e) => e.message).join(', '));
  const d = res.draftOrderCreate.draftOrder;
  if (!d) throw new Error('Shopify n’a pas renvoyé le brouillon.');
  return { id: d.id, name: d.name, invoiceUrl: d.invoiceUrl };
}

// ─── PLM : synchronisation produit Shopify ───────────────────────────────────

export interface ProductSyncInput {
  shopifyProductId?: string | null;
  title: string;
  sku: string;
  /** Prix dans la devise boutique (EUR). */
  price?: string;
  status: 'ACTIVE' | 'DRAFT';
  hsCode?: string | null;
  countryOrigin?: string | null;
}

interface ProductSetResult {
  productSet: {
    product: { id: string; title: string; handle: string; status: string } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}

/**
 * Crée ou met à jour le produit Shopify depuis la fiche PLM (mutation déclarative productSet,
 * produit mono-variante). Retourne l'id Shopify pour mémorisation côté app.
 */
export async function syncProductToShopify(input: ProductSyncInput): Promise<{ id: string; name: string }> {
  const variant: Record<string, unknown> = {
    sku: input.sku,
    optionValues: [{ optionName: 'Title', name: 'Default Title' }],
  };
  if (input.price) variant.price = input.price;

  const productInput: Record<string, unknown> = {
    title: input.title,
    status: input.status,
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [variant],
  };
  if (input.shopifyProductId) productInput.id = input.shopifyProductId;

  const mutation = `
    mutation ProductSet($input: ProductSetInput!) {
      productSet(synchronous: true, input: $input) {
        product { id title handle status }
        userErrors { field message }
      }
    }`;
  const res = await shopifyGraphQL<ProductSetResult>(mutation, { input: productInput });
  const errs = res.productSet.userErrors;
  if (errs.length > 0) throw new Error(errs.map((e) => e.message).join(', '));
  const p = res.productSet.product;
  if (!p) throw new Error('Shopify n’a pas renvoyé le produit.');
  return { id: p.id, name: p.title };
}

// ─── CRM (clients Shopify) ──────────────────────────────────────────────────
export async function searchCustomers(q: string): Promise<unknown> {
  return shopifyGraphQL(
    `query($q: String!) {
      customers(first: 25, query: $q) {
        nodes {
          id firstName lastName email phone
          numberOfOrders
          amountSpent { amount currencyCode }
          defaultAddress { city zip province country }
        }
      }
    }`,
    { q },
  );
}

export async function getCustomerDetail(id: string): Promise<unknown> {
  return shopifyGraphQL(
    `query($id: ID!) {
      customer(id: $id) {
        id firstName lastName email phone note tags
        numberOfOrders
        amountSpent { amount currencyCode }
        defaultAddress { address1 address2 city zip province country phone }
        orders(first: 25, sortKey: CREATED_AT, reverse: true) {
          nodes { name createdAt displayFinancialStatus totalPriceSet { presentmentMoney { amount currencyCode } } }
        }
      }
    }`,
    { id },
  );
}

export interface CustomerCreateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  note?: string;
}

export async function createCustomer(input: CustomerCreateInput): Promise<unknown> {
  return shopifyGraphQL(
    `mutation($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id firstName lastName email }
        userErrors { field message }
      }
    }`,
    { input },
  );
}

export async function updateCustomer(input: CustomerCreateInput & { id: string }): Promise<unknown> {
  return shopifyGraphQL(
    `mutation($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer { id firstName lastName email phone note }
        userErrors { field message }
      }
    }`,
    { input },
  );
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

interface OrdersWithRefsResult {
  orders: {
    nodes: {
      name: string;
      createdAt: string;
      note: string | null;
      customAttributes: { key: string; value: string | null }[];
      totalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
    }[];
  };
}

/**
 * Commandes Shopify depuis une date, avec leurs références (note + customAttributes)
 * et leur total présentement — pour la réconciliation Stripe ↔ Shopify.
 */
export async function getOrdersWithRefs(sinceISODate: string, first = 100): Promise<OrdersWithRefsResult> {
  const query = `
    query OrdersWithRefs($q: String!, $first: Int!) {
      orders(first: $first, query: $q, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name
          createdAt
          note
          customAttributes { key value }
          totalPriceSet { presentmentMoney { amount currencyCode } }
        }
      }
    }`;
  return shopifyGraphQL<OrdersWithRefsResult>(query, {
    q: `created_at:>=${sinceISODate}`,
    first,
  });
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
