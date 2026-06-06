import { Router } from 'express';
import { getShopInfo } from '../services/shopify';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tiraboschi-erp-api',
    time: new Date().toISOString(),
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
