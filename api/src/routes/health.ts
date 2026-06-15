import { Router } from 'express';
import { getShopInfo } from '../services/shopify';
import { config } from '../config';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tiraboschi-erp-api',
    time: new Date().toISOString(),
  });
});

// Connectivité pour les badges du header (config encaissement)
healthRouter.get('/health/connectivity', (_req, res) => {
  const markets = Object.keys(config.stripeWrite);
  res.json({
    stripe: markets.length > 0,
    terminal: markets.some((m) => !!config.stripeWrite[m].terminalLocation),
  });
});

/**
 * Vérifie la connexion Shopify de bout en bout :
 * client_credentials -> token -> requête GraphQL `shop`.
 * Si ça répond, les identifiants et le flux d'auth sont valides.
 */
healthRouter.get('/shopify/health', async (_req, res) => {
  try {
    const data = await getShopInfo();
    res.json({ status: 'ok', shop: data.shop });
  } catch (err) {
    res.status(502).json({ status: 'error', message: (err as Error).message });
  }
});
