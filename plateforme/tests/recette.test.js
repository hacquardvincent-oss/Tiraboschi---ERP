/* Recette bout-en-bout — les scénarios validés dans la maquette, exécutés
   contre la VRAIE Plateforme (HTTP réel, store mémoire, organes simulés).
   Chaque assertion correspond à un invariant du dossier d'architecture. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { creerApp } from '../app.js';
import { semerReferentiel } from '../scripts/seed_referentiel.js';
import { evaluerTriggersDifferes } from '../src/workers/index.js';

let base, store, serveur;
const api = (chemin, options) => fetch(base + chemin, options).then(async r => ({ status: r.status, corps: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }));
const post = (chemin, corps) => api(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
const sorties = async organe => (await api('/api/organes')).corps.filter(s => s.organe === organe);

before(async () => {
  ({ app: serveur, store } = await creerApp({ mode: 'memoire' }));
  await semerReferentiel(store);
  await store.col('clients').insererUn({ _id: 'cli_claire', identite: { nom: 'Claire Fontaine' }, societe: { statut: 0 } });
  await store.col('clients').insererUn({ _id: 'cli_helene', identite: { nom: 'Hélène Vasseur', tel_whatsapp: '+33600000000' }, societe: { statut: 3 } });
  await new Promise(ok => { serveur = serveur.listen(0, ok); });
  base = `http://localhost:${serveur.address().port}`;
});
after(() => serveur.close());

test('le référentiel expose les ajustements par modèle, avec photos d\'état', async () => {
  const ref = (await api('/api/referentiel')).corps;
  const olympe = ref.modeles.find(m => m._id === 'olympe');
  const pochon = olympe.ajustements.find(a => a.k === 'pochon');
  assert.equal(pochon.options.length, 2);
  assert.ok(pochon.options.find(o => o.id === 'avec').photo, 'l\'état « avec pochon » a sa photo');
  assert.equal(pochon.options.find(o => o.id === 'sans').photo, null, '« sans pochon » : cliché à fournir');
  const page = await api('/referentiel.html');
  assert.equal(page.status, 200);
  assert.match(page.corps, /Référentiel/);
});

test('référentiel filtré : Claire ne voit pas les exotiques, Hélène si', async () => {
  const claire = (await api('/api/referentiel?cliente=cli_claire')).corps;
  const helene = (await api('/api/referentiel?cliente=cli_helene')).corps;
  assert.deepEqual(claire.matieres.map(m => m._id).sort(), ['caviar', 'daim', 'graine', 'lisse']);
  assert.equal(helene.matieres.length, 6);
  assert.equal(claire.nuances.length, 52);
});

test('une spec sous voile est REFUSÉE au chiffrage (pas seulement cachée)', async () => {
  const r = await post('/api/devis', { cliente: 'cli_claire', spec: { modele: 'colette', matiere: 'alligator', nuance: 'noir' } });
  assert.equal(r.status, 422);
  assert.equal(r.corps.erreur, 'matiere_indisponible');
});

let devis;
test('parcours complet — les organes ne bougent QUE quand ils doivent', async () => {
  // création (Hélène, alligator marine, or 24)
  const r = await post('/api/devis', { cliente: 'cli_helene', conseiller: 'USR-2', spec: { modele: 'colette', matiere: 'alligator', nuance: 'marine', ferrure: 'or24' } });
  assert.equal(r.status, 201);
  devis = r.corps;
  assert.equal(devis.etat, 'brouillon');
  assert.equal(devis.sku_prevu, 'CO-26H-CU031-OR-MA');
  assert.equal(devis.total, 3200 + 3800 + 1800);
  assert.equal((await api('/api/organes')).corps.length, 0);          // création : RIEN ne part

  // v2 silencieuse
  const v2 = await post(`/api/devis/${devis.id}/versions`, { spec: { ferrure: 'palladium' }, par: 'USR-2', note: 'ferrures palladium' });
  assert.equal(v2.corps.version_courante, 2);
  assert.equal(v2.corps.total, 3200 + 3800 + 340);
  assert.equal((await api('/api/organes')).corps.length, 0);          // versionner : toujours RIEN

  // envoi WhatsApp → un seul template, aucun email
  await post(`/api/devis/${devis.id}/envoyer`, { canal: 'whatsapp', par: 'USR-2' });
  assert.equal((await sorties('whatsapp')).length, 1);
  assert.equal((await sorties('klaviyo')).length, 0);
  assert.equal((await sorties('shopify')).length, 0);                 // et surtout : pas de commande

  // la cliente consulte la page publique (charte maison)
  const page = await api(`/devis/${devis.token}`);
  assert.equal(page.status, 200);
  assert.match(page.corps, /Votre <em>Colette<\/em>/);
  assert.match(page.corps, /version 2/);
  assert.equal((await api(`/api/devis/${devis.id}`)).corps.etat, 'consulte');

  // acceptation → lien Stripe, TOUJOURS pas de commande Shopify
  await api(`/devis/${devis.token}/accepter`, { method: 'POST', redirect: 'manual' });
  assert.equal((await sorties('stripe')).length, 1);
  assert.equal((await sorties('shopify')).length, 0);

  // encaissement (webhook) → LA commande naît ici, avec pièce + n° série
  await post('/api/hooks/paiement', { token: devis.token, reference: 'pi_sim_1' });
  const commandes = await sorties('shopify');
  assert.equal(commandes.length, 1);
  assert.equal(commandes[0].contenu.statut, 'partially_paid');
  const final = (await api(`/api/devis/${devis.id}`)).corps;
  assert.equal(final.etat, 'en_production');
  assert.match(final.serie, /^TS-\d{4}-\d{5}$/);
  const piece = await store.col('pieces').trouverUn({ serie: final.serie });
  assert.equal(piece.sku, final.sku_prevu);
});

test('rejouer le webhook ne crée PAS de seconde commande (idempotence)', async () => {
  await post('/api/hooks/paiement', { token: devis.token, reference: 'pi_sim_1_replay' });
  assert.equal((await sorties('shopify')).filter(s => s.action === 'commande_creee').length, 1);
});

test('timeline CRM = journal filtré ; demande d\'ajustement → tâche conseiller', async () => {
  const tl = (await api('/api/clients/cli_helene/timeline')).corps;
  const types = tl.map(e => e.type);
  for (const t of ['devis.cree', 'devis.envoye', 'devis.consulte', 'devis.accepte', 'acompte.encaisse', 'production.lancee'])
    assert.ok(types.includes(t), `timeline doit contenir ${t}`);

  const r = await post('/api/devis', { cliente: 'cli_claire', spec: { modele: 'rafael', matiere: 'graine', nuance: 'noir' } });
  await post(`/api/devis/${r.corps.id}/envoyer`, { canal: 'email' });
  assert.equal((await sorties('klaviyo')).length, 1);                 // canal email cette fois
  await api(`/devis/${r.corps.token}`);                               // consulte
  await api(`/devis/${r.corps.token}/retravailler`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'message=anse+plus+courte' });
  const taches = (await api('/api/taches')).corps;
  assert.ok(taches.some(t => t.txt.includes('ajustement demandé')));
});

test('trigger différé : consulté sans suite ≥ 7 j → tâche de relance, jamais d\'email', async () => {
  const r = await post('/api/devis', { cliente: 'cli_claire', spec: { modele: 'olympe', matiere: 'caviar', nuance: 'cognac' } });
  await post(`/api/devis/${r.corps.id}/envoyer`, { canal: 'email' });
  await api(`/devis/${r.corps.token}`);                               // consulte aujourd'hui
  const emailsAvant = (await sorties('klaviyo')).length;
  await evaluerTriggersDifferes(store, { maintenant: new Date(Date.now() + 8 * 864e5) });
  const taches = (await api('/api/taches')).corps;
  assert.ok(taches.some(t => t.txt.includes('Relance discrète')));
  assert.equal((await sorties('klaviyo')).length, emailsAvant);       // relance = tâche, PAS un email
});

test('changement de statut → projection metafield Shopify + tâche d\'annonce personnelle', async () => {
  await post('/api/clients/cli_claire/statut', { statut: 1 });
  const proj = (await sorties('shopify')).filter(s => s.action === 'metafield_statut');
  assert.equal(proj.length, 1);
  assert.equal(proj[0].contenu.statut, 1);
});
