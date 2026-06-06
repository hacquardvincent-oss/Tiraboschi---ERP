import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { searchCustomers, getCustomerDetail, createCustomer } from '../services/shopify';

export const crmRouter = Router();
crmRouter.use(requireAuth);

/** Recherche clients (?q=) — vide => liste vide (cf. SCREENS_SPEC §4). */
crmRouter.get('/search', async (req, res) => {
  const q = (req.query.q ? String(req.query.q) : '').trim();
  if (!q) return res.json({ customers: { nodes: [] } });
  try {
    res.json(await searchCustomers(q));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Détail client + historique commandes (?id=gid://shopify/Customer/...). */
crmRouter.get('/customer', async (req, res) => {
  const id = req.query.id ? String(req.query.id) : '';
  if (!id) return res.status(400).json({ error: 'id requis.' });
  try {
    res.json(await getCustomerDetail(id));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Création client (nom/email/téléphone/note ; adresse = étape suivante). */
crmRouter.post('/customer', async (req, res) => {
  const { firstName, lastName, email, phone, note } = req.body ?? {};
  if (!email && !lastName) return res.status(400).json({ error: 'Email ou nom requis.' });
  try {
    res.status(201).json(await createCustomer({ firstName, lastName, email, phone, note }));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
