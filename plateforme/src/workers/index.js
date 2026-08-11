/* Workers — les consommateurs du journal. C'est ICI que les modules se
   « parlent » : jamais en direct. Chacun est idempotent (le journal marque
   la consommation) et petit. */

import { shopify, stripe, klaviyo, whatsapp } from '../organes/index.js';
import { emettre } from '../data/journal.js';
import { genererSerie } from '../domaine/sku.js';

/* notifications — exécute les envois DÉCIDÉS (jamais implicites) */
export const notificationsWorker = {
  nom: 'notifications',
  types: ['devis.envoye', 'devis.accepte', 'piece.terminee'],
  async traiter({ store }, evt) {
    const devis = await store.col('devis').trouverUn({ id: evt.sujet });
    if (!devis) return;
    const cliente = await store.col('clients').trouverUn({ _id: devis.cliente });
    if (evt.type === 'devis.envoye') {
      const donnees = { devis: devis.id, lien: `/devis/${devis.token}` };
      if (evt.donnees.canal === 'whatsapp') await whatsapp.template(store, { modele: 'devis_pret', cliente, donnees });
      else await klaviyo.envoyer(store, { modele: 'devis_pret', cliente, donnees });
    }
    if (evt.type === 'devis.accepte') {
      const { url } = await stripe.lienAcompte(store, { devis });
      await store.col('devis').majUn({ id: devis.id }, { lien_acompte: url });
    }
    if (evt.type === 'piece.terminee') {
      await klaviyo.envoyer(store, { modele: 'piece_quitte_atelier', cliente,
        donnees: { serie: evt.donnees.serie } });
    }
  },
};

/* commerce — l'invariant central : la commande Shopify naît À l'encaissement */
export const commerceWorker = {
  nom: 'commerce',
  types: ['acompte.encaisse'],
  async traiter({ store }, evt) {
    const devis = await store.col('devis').trouverUn({ id: evt.sujet });
    if (!devis || devis.commande_shopify) return;   // idempotence métier
    const cliente = await store.col('clients').trouverUn({ _id: devis.cliente });
    const { ref } = await shopify.creerCommande(store, { devis, cliente });
    const serie = genererSerie(await store.col('pieces').compter({}) + 1);
    await store.col('pieces').insererUn({
      serie, devis: devis.id, sku: devis.sku_prevu, cliente: devis.cliente,
      etat: 'en_production', nee_le: new Date().toISOString(),
    });
    await store.col('devis').majUn({ id: devis.id },
      { commande_shopify: ref, serie, etat: 'en_production',
        hist: [...devis.hist, { at: new Date().toISOString(), t: `commande ${ref} · pièce ${serie} en production` }] });
    await emettre(store, 'production.lancee', devis.id, { serie }, { muet: true });
  },
};

/* crm — projections et tâches nées des triggers */
export const crmWorker = {
  nom: 'crm',
  types: ['devis.ajustement_demande', 'client.statut_change'],
  async traiter({ store }, evt) {
    if (evt.type === 'devis.ajustement_demande') {
      const devis = await store.col('devis').trouverUn({ id: evt.sujet });
      await tache(store, devis.cliente, `Reprendre le devis ${devis.id} — ajustement demandé`);
    }
    if (evt.type === 'client.statut_change') {
      const cliente = await store.col('clients').trouverUn({ _id: evt.sujet });
      await shopify.projeterStatut(store, cliente);   // le statut est PROJETÉ, jamais maître côté Shopify
      await tache(store, evt.sujet, `Annoncer le passage au cercle ${evt.donnees.vers} (contact personnel du conseiller)`);
    }
  },
};

/* triggers différés — évalués périodiquement (relance discrète J+7 : une TÂCHE,
   jamais un email automatique sur un devis de ce niveau) */
export async function evaluerTriggersDifferes(store, { maintenant = new Date() } = {}) {
  const enAttente = await store.col('devis').trouver({ etat: 'consulte' });
  for (const d of enAttente) {
    if (d.relance_creee || !d.consulte_le) continue;
    const jours = (maintenant - new Date(d.consulte_le)) / 864e5;
    if (jours >= 7) {
      await store.col('devis').majUn({ id: d.id }, { relance_creee: true });
      await emettre(store, 'trigger.relance_devis', d.id, { regle: 'consulté sans suite ≥ 7 j' }, { muet: true, quand: maintenant });
      await tache(store, d.cliente, `Relance discrète du devis ${d.id} — consulté il y a ${Math.floor(jours)} jours, sans suite`);
    }
  }
  const expirables = await store.col('devis').trouver({ etat: { $in: ['envoye', 'consulte'] } });
  for (const d of expirables) {
    if (new Date(d.expire_le) < maintenant) {
      await store.col('devis').majUn({ id: d.id }, { etat: 'expire' });
      await emettre(store, 'devis.expire', d.id, {}, { muet: true, quand: maintenant });
    }
  }
}

async function tache(store, cliente, txt) {
  await store.col('taches').insererUn({ cliente, txt, at: new Date().toISOString(), faite: false });
}

export const WORKERS = [notificationsWorker, commerceWorker, crmWorker];
