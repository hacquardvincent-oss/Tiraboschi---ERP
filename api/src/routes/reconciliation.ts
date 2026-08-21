import { Router } from 'express';
import { reconcile } from '../services/reconciliation';
import { requireRecoveryKey } from '../middleware/recoveryKey';

export const reconciliationRouter = Router();

reconciliationRouter.use(requireRecoveryKey);

/** Réconciliation Stripe ↔ Shopify depuis une date (?since=2026-05-28). */
reconciliationRouter.get('/', async (req, res) => {
  const since = String(req.query.since ?? '2026-05-28');
  try {
    const report = await reconcile(since);
    res.json({ status: 'ok', ...report });
  } catch (err) {
    res.status(502).json({ status: 'error', message: (err as Error).message });
  }
});
