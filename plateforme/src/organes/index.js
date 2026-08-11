/* Organes — les services externes. Ils EXÉCUTENT, ils ne décident pas.
   Deux modes :
   - simulation (défaut) : chaque sortie est ENREGISTRÉE dans la collection
     `organes_sorties` au lieu de partir — les tests et le back-office la lisent ;
   - reel : appels HTTP réels (Shopify Admin, Stripe, Klaviyo, Meta).
   Un seul point d'entrée par organe ; personne d'autre ne fait de fetch. */

const MODE = () => process.env.ORGANES_MODE ?? 'simulation';

async function sortir(store, organe, action, contenu) {
  await store.col('organes_sorties').insererUn({
    organe, action, contenu, mode: MODE(), at: new Date().toISOString(),
  });
}

export const shopify = {
  /* La commande n'est créée QUE par le worker commerce, sur acompte.encaisse. */
  async creerCommande(store, { devis, cliente }) {
    if (MODE() === 'reel') {
      // TODO C-réel : POST /admin/api/orders.json — financial_status: partially_paid,
      // tags: sur-mesure, line_items: [{ sku: devis.sku_prevu, price: devis.total }]
      throw new Error('shopify reel : brancher SHOPIFY_ACCESS_TOKEN (décision C0)');
    }
    const ref = `#SH-${4200 + Math.floor(Math.random() * 800)}`;
    await sortir(store, 'shopify', 'commande_creee',
      { ref, devis: devis.id, sku: devis.sku_prevu, total: devis.total, statut: 'partially_paid', tag: 'sur-mesure' });
    return { ref };
  },
  async projeterStatut(store, cliente) {
    await sortir(store, 'shopify', 'metafield_statut',
      { customer: cliente.shopify_customer_id ?? cliente._id, statut: cliente.societe?.statut ?? 0 });
  },
};

export const stripe = {
  /* Réutilise en mode réel la machinerie du POS : create_payment_link + /pay/:id. */
  async lienAcompte(store, { devis }) {
    if (MODE() === 'reel') throw new Error('stripe reel : réutiliser POST /api/create_payment_link du POS');
    const url = `/pay/sim_${devis.token}`;
    await sortir(store, 'stripe', 'lien_acompte', { devis: devis.id, montant: devis.acompte, url });
    return { url };
  },
};

export const klaviyo = {
  async envoyer(store, { modele, cliente, donnees }) {
    if (MODE() === 'reel') throw new Error('klaviyo reel : brancher KLAVIYO_API_KEY');
    await sortir(store, 'klaviyo', 'email', { modele, cliente: cliente._id, donnees });
  },
};

export const whatsapp = {
  async template(store, { modele, cliente, donnees }) {
    if (MODE() === 'reel') throw new Error('whatsapp reel : brancher WHATSAPP_TOKEN + templates Meta approuvés');
    await sortir(store, 'whatsapp', 'template', { modele, vers: cliente.identite?.tel_whatsapp ?? cliente._id, donnees });
  },
};
