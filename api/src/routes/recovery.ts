import { Router, type RequestHandler } from 'express';
import { createRecoveryOrder, listRecentOrders } from '../services/shopify';

export const recoveryRouter = Router();

/**
 * Garde simple par clé partagée (en attendant l'auth JWT complète de la V2).
 * La clé est dans la variable d'environnement RECOVERY_KEY (jamais dans le repo).
 */
const requireRecoveryKey: RequestHandler = (req, res, next) => {
  const provided = req.header('x-recovery-key');
  if (!process.env.RECOVERY_KEY || provided !== process.env.RECOVERY_KEY) {
    res.status(401).json({ status: 'error', message: 'Clé de récupération invalide ou absente.' });
    return;
  }
  next();
};

recoveryRouter.use(requireRecoveryKey);

/** Réconciliation : commandes Shopify existantes depuis une date (?since=2026-05-28). */
recoveryRouter.get('/orders', async (req, res) => {
  const since = String(req.query.since ?? '2026-05-28');
  try {
    const data = await listRecentOrders(since);
    res.json({ status: 'ok', since, count: data.orders.nodes.length, orders: data.orders.nodes });
  } catch (err) {
    res.status(502).json({ status: 'error', message: (err as Error).message });
  }
});

/** Recrée une commande encaissée mais manquante (montants + taxes exacts). */
recoveryRouter.post('/order', async (req, res) => {
  try {
    const result = await createRecoveryOrder(req.body);
    if (result.orderCreate.userErrors.length > 0) {
      res.status(422).json({ status: 'error', userErrors: result.orderCreate.userErrors });
      return;
    }
    res.json({ status: 'ok', order: result.orderCreate.order });
  } catch (err) {
    res.status(502).json({ status: 'error', message: (err as Error).message });
  }
});
