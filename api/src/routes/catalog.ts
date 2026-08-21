import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { computeCatalog, computeCart } from '../services/atp';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

// Catalogue + disponibilité (vue équipe de vente)
catalogRouter.get('/', async (_req, res) => {
  try {
    res.json(await computeCatalog());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Disponibilité d'un panier (POS) : { items: [{ id, qty }] }
catalogRouter.post('/availability', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  try {
    res.json(await computeCart(items));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
