import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getReports } from '../services/shopify';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

/** KPIs Dashboard (CA jour/semaine/mois + dernières ventes + clients). */
reportsRouter.get('/', async (_req, res) => {
  try {
    res.json(await getReports());
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
