/* Routes HTTP — validation, chargement, appel du domaine, persistance,
   émission au journal. AUCUNE logique métier ici, aucun appel d'organe. */

import express from 'express';
import { referentielPour, chiffrer } from '../domaine/referentiel.js';
import * as Devis from '../domaine/devis.js';
import { emettre, traiterJournal, timeline } from '../data/journal.js';
import { WORKERS } from '../workers/index.js';
import { pageDevis } from './page-devis.js';

export function monterRoutes(app, store, { traiterApresEcriture = true } = {}) {
  const api = express.Router();
  api.use(express.json());

  /* après chaque écriture métier : faire tourner les workers.
     En prod on peut préférer l'interval ; ici, immédiat = lisible et testable. */
  async function persister(devis, evenements) {
    const existant = await store.col('devis').trouverUn({ id: devis.id });
    if (existant) await store.col('devis').majUn({ id: devis.id }, devis);
    else await store.col('devis').insererUn(devis);
    for (const e of evenements) await emettre(store, e.type, e.sujet, e.donnees, { muet: e.muet });
    if (traiterApresEcriture) await traiterJournal(store, WORKERS, {});
    return store.col('devis').trouverUn({ id: devis.id });
  }
  const attraper = fn => (req, res) => fn(req, res).catch(err => {
    if (err.metier) return res.status(422).json({ erreur: err.metier, detail: err.message });
    console.error(err);
    res.status(500).json({ erreur: 'interne' });
  });

  /* ── Référentiel (consommé par le configurateur, déjà filtré) ── */
  api.get('/referentiel', attraper(async (req, res) => {
    const cliente = req.query.cliente
      ? await store.col('clients').trouverUn({ _id: req.query.cliente }) : null;
    res.json(await referentielPour(store, cliente));
  }));

  /* ── Devis ── */
  api.post('/devis', attraper(async (req, res) => {
    const { cliente: cid, spec, conseiller } = req.body;
    const cliente = await store.col('clients').trouverUn({ _id: cid });
    if (!cliente) return res.status(404).json({ erreur: 'cliente_inconnue' });
    const chiffrage = await chiffrer(store, spec, cliente);
    const numero = await store.col('devis').compter({}) + 1;
    const { devis, evenements } = Devis.creerDevis({ numero, cliente: cid, conseiller, spec, chiffrage });
    res.status(201).json(await persister(devis, evenements));
  }));

  api.get('/devis', attraper(async (req, res) => {
    res.json(await store.col('devis').trouver(req.query.etat ? { etat: req.query.etat } : {}));
  }));
  api.get('/devis/:id', attraper(async (req, res) => {
    const d = await store.col('devis').trouverUn({ id: req.params.id });
    d ? res.json(d) : res.status(404).json({ erreur: 'inconnu' });
  }));

  api.post('/devis/:id/versions', attraper(async (req, res) => {
    const d = await store.col('devis').trouverUn({ id: req.params.id });
    if (!d) return res.status(404).json({ erreur: 'inconnu' });
    const cliente = await store.col('clients').trouverUn({ _id: d.cliente });
    const spec = { ...d.versions.at(-1).spec, ...req.body.spec };
    const chiffrage = await chiffrer(store, spec, cliente);
    const { devis, evenements } = Devis.nouvelleVersion(d, { spec, chiffrage, par: req.body.par, note: req.body.note });
    res.json(await persister(devis, evenements));
  }));

  api.post('/devis/:id/envoyer', attraper(async (req, res) => {
    const d = await store.col('devis').trouverUn({ id: req.params.id });
    if (!d) return res.status(404).json({ erreur: 'inconnu' });
    const { devis, evenements } = Devis.envoyer(d, { canal: req.body.canal, par: req.body.par });
    res.json(await persister(devis, evenements));
  }));

  /* ── CRM ── */
  api.get('/clients/:id/timeline', attraper(async (req, res) => {
    res.json(await timeline(store, req.params.id));
  }));
  api.get('/taches', attraper(async (_req, res) => {
    res.json(await store.col('taches').trouver({ faite: false }));
  }));
  api.post('/clients/:id/statut', attraper(async (req, res) => {
    const c = await store.col('clients').majUn({ _id: req.params.id },
      { 'societe.statut': req.body.statut });
    if (!c) return res.status(404).json({ erreur: 'inconnue' });
    await emettre(store, 'client.statut_change', req.params.id, { vers: req.body.statut });
    await traiterJournal(store, WORKERS, {});
    res.json(c);
  }));

  /* ── Sorties d'organes (lues par le back-office et la recette) ── */
  api.get('/organes', attraper(async (_req, res) => {
    res.json(await store.col('organes_sorties').trouver({}));
  }));

  /* ── Webhook paiement (en réel : la route Stripe signée existante du POS) ── */
  api.post('/hooks/paiement', attraper(async (req, res) => {
    const d = await store.col('devis').trouverUn({ token: req.body.token });
    if (!d) return res.status(404).json({ erreur: 'inconnu' });
    const { devis, evenements } = Devis.encaisserAcompte(d, { reference: req.body.reference });
    res.json(await persister(devis, evenements));
  }));

  app.use('/api', api);

  /* ── Pages publiques clientes (charte maison) ── */
  app.get('/devis/:token', async (req, res) => {
    const d = await store.col('devis').trouverUn({ token: req.params.token });
    if (!d) return res.status(404).send('Devis introuvable.');
    if (d.etat === 'envoye') {
      const { devis, evenements } = Devis.consulter(d);
      await store.col('devis').majUn({ id: d.id }, devis);
      for (const e of evenements) await emettre(store, e.type, e.sujet, e.donnees);
      await traiterJournal(store, WORKERS, {});
    }
    res.send(pageDevis(await store.col('devis').trouverUn({ token: req.params.token })));
  });

  app.post('/devis/:token/:action', express.urlencoded({ extended: false }), async (req, res) => {
    const d = await store.col('devis').trouverUn({ token: req.params.token });
    if (!d) return res.status(404).send('Devis introuvable.');
    try {
      const r = req.params.action === 'accepter' ? Devis.accepter(d)
        : req.params.action === 'retravailler' ? Devis.demanderAjustement(d, { message: req.body.message })
        : null;
      if (!r) return res.status(400).send('Action inconnue.');
      await store.col('devis').majUn({ id: d.id }, r.devis);
      for (const e of r.evenements) await emettre(store, e.type, e.sujet, e.donnees, { muet: e.muet });
      await traiterJournal(store, WORKERS, {});
    } catch (err) { if (!err.metier) throw err; }
    res.redirect(`/devis/${req.params.token}`);
  });
}
