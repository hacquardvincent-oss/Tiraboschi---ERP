// Chargeur + pilote du TPE Stripe Terminal S710 (brique 3b.3).
// On injecte le SDK officiel depuis js.stripe.com (même mécanisme que @stripe/terminal-js),
// ce qui évite une dépendance npm supplémentaire au build.

import { api } from './api';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    StripeTerminal?: any;
  }
}

const SDK_URL = 'https://js.stripe.com/terminal/v1/';
let sdkPromise: Promise<any> | null = null;

function loadSdk(): Promise<any> {
  if (window.StripeTerminal) return Promise.resolve(window.StripeTerminal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    const onload = () => (window.StripeTerminal ? resolve(window.StripeTerminal) : reject(new Error('SDK Terminal indisponible.')));
    if (existing) {
      existing.addEventListener('load', onload);
      existing.addEventListener('error', () => reject(new Error('Échec de chargement du SDK Terminal.')));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = onload;
    s.onerror = () => reject(new Error('Échec de chargement du SDK Terminal.'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

let terminal: any = null;
let connectedReaderLabel: string | null = null;

/** Crée l'objet Terminal (jeton de connexion fourni par le backend selon le marché). */
async function getTerminal(market: 'FR' | 'US'): Promise<any> {
  const StripeTerminal = await loadSdk();
  if (terminal) return terminal;
  terminal = StripeTerminal.create({
    onFetchConnectionToken: async () => {
      const res = await api<{ secret: string }>('/api/pos/sales/terminal/connection-token', {
        method: 'POST',
        body: { market },
      });
      return res.secret;
    },
    onUnexpectedReaderDisconnect: () => {
      connectedReaderLabel = null;
    },
  });
  return terminal;
}

/** Découvre et connecte le lecteur S710 (le 1er du compte/location). */
export async function connectReader(market: 'FR' | 'US'): Promise<string> {
  const t = await getTerminal(market);
  const tokenInfo = await api<{ location?: string }>('/api/pos/sales/terminal/connection-token', {
    method: 'POST',
    body: { market },
  });
  const config: any = { simulated: false };
  if (tokenInfo.location) config.location = tokenInfo.location;
  const result = await t.discoverReaders(config);
  if (result.error) throw new Error(result.error.message);
  if (!result.discoveredReaders?.length) throw new Error('Aucun lecteur S710 détecté. Vérifie qu’il est allumé et enregistré.');
  const reader = result.discoveredReaders[0];
  const conn = await t.connectReader(reader);
  if (conn.error) throw new Error(conn.error.message);
  connectedReaderLabel = conn.reader?.label ?? reader.label ?? 'S710';
  return connectedReaderLabel as string;
}

export function isReaderConnected(): boolean {
  return !!connectedReaderLabel;
}

/**
 * Encaisse une vente sur le TPE : crée le PaymentIntent (backend), présente la carte,
 * traite le paiement, puis demande la capture côté serveur (→ markSalePaid → Shopify).
 */
export async function chargeOnReader(
  saleId: string,
  market: 'FR' | 'US',
  onStatus?: (msg: string) => void,
): Promise<void> {
  const t = await getTerminal(market);
  if (!connectedReaderLabel) {
    onStatus?.('Connexion au lecteur…');
    await connectReader(market);
  }
  onStatus?.('Préparation du paiement…');
  const intent = await api<{ clientSecret: string }>(`/api/pos/sales/${saleId}/terminal/intent`, {
    method: 'POST',
    body: {},
  });
  onStatus?.('Présentez la carte sur le lecteur…');
  const collected = await t.collectPaymentMethod(intent.clientSecret);
  if (collected.error) throw new Error(collected.error.message);
  onStatus?.('Traitement…');
  const processed = await t.processPayment(collected.paymentIntent);
  if (processed.error) throw new Error(processed.error.message);
  onStatus?.('Validation…');
  await api(`/api/pos/sales/${saleId}/terminal/capture`, { method: 'POST', body: {} });
  onStatus?.('Paiement accepté.');
}
