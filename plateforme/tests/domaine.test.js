/* Tests unitaires du domaine — fonctions pures, aucun store, aucun réseau. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Devis from '../src/domaine/devis.js';
import { genererSKU, genererSerie } from '../src/domaine/sku.js';
import { visiblePour } from '../src/domaine/referentiel.js';

const chiffrage = {
  libelles: { modele: 'Colette', matiere: 'Caviar', nuance: 'Marine', ferrure: 'Or jaune 24 carats' },
  codes: { modele: 'CO', matiere: 'CU014', nuance: 'MA', ferrure: 'OR' },
  lignes: [], total: 5180, devise: 'EUR',
};
const neuf = () => Devis.creerDevis({
  numero: 1, cliente: 'cli_1', spec: { modele: 'colette', matiere: 'caviar', nuance: 'marine', ferrure: 'or24' },
  chiffrage, quand: new Date('2026-08-11T10:00:00Z'),
}).devis;

test('SKU canonique MODEL-YYS-MAT-OPT-COLOR', () => {
  assert.equal(genererSKU({ modele: 'CO', matiere: 'CU014', nuance: 'MA', option: 'OR' }), 'CO-26H-CU014-OR-MA');
  assert.equal(genererSerie(214, 2026), 'TS-2026-00214');
  assert.throws(() => genererSKU({ modele: 'CO' }), /composant manquant/);
});

test('création : brouillon, acompte 30 %, événement MUET (aucune notification)', () => {
  const { devis, evenements } = Devis.creerDevis({ numero: 41, cliente: 'cli_1', spec: {}, chiffrage });
  assert.equal(devis.etat, 'brouillon');
  assert.equal(devis.id, `DEV-${new Date().getFullYear()}-0041`);
  assert.equal(devis.acompte, Math.round(5180 * .3));
  assert.equal(devis.sku_prevu, 'CO-26H-CU014-OR-MA');
  assert.equal(evenements.length, 1);
  assert.equal(evenements[0].muet, true);   // créer n'écrit JAMAIS à la cliente
});

test('versionner est silencieux et revient en brouillon', () => {
  let d = neuf();
  d = Devis.envoyer(d, { canal: 'email' }).devis;
  const { devis, evenements } = Devis.nouvelleVersion(d, { spec: {}, chiffrage, par: 'USR-2', note: 'ferrures' });
  assert.equal(devis.version_courante, 2);
  assert.equal(devis.etat, 'brouillon');            // il faudra ré-ENVOYER explicitement
  assert.ok(evenements.every(e => e.muet));         // aucun message
});

test('la machine à états refuse les raccourcis', () => {
  const d = neuf();
  assert.throws(() => Devis.accepter(d), /transition_interdite/);          // brouillon → accepté : non
  assert.throws(() => Devis.encaisserAcompte(d), /transition_interdite/);  // brouillon → encaissé : non
  assert.throws(() => Devis.envoyer(d, { canal: 'pigeon' }), /canal_inconnu/);
});

test('parcours nominal : envoyé → consulté → accepté → encaissé', () => {
  let d = neuf();
  d = Devis.envoyer(d, { canal: 'whatsapp' }).devis;
  assert.equal(d.etat, 'envoye');
  d = Devis.consulter(d).devis;
  assert.equal(d.etat, 'consulte');
  assert.deepEqual(Devis.consulter(d).evenements, []);   // relire ≠ nouvel événement
  d = Devis.accepter(d).devis;
  const { devis, evenements } = Devis.encaisserAcompte(d, { reference: 'pi_123' });
  assert.equal(devis.etat, 'acompte_encaisse');
  assert.equal(evenements[0].type, 'acompte.encaisse');
});

test('un devis expiré ne peut plus être accepté', () => {
  let d = neuf();
  d = Devis.envoyer(d, { canal: 'email' }).devis;
  d = Devis.consulter(d).devis;
  assert.throws(() => Devis.accepter(d, { quand: new Date('2026-12-01') }), /devis_expire/);
});

test('gating The Society : visiblePour', () => {
  assert.ok(visiblePour({ visibilite: 'public' }, 0));
  assert.ok(!visiblePour({ visibilite: 'societe:2' }, 0));
  assert.ok(!visiblePour({ visibilite: 'societe:3' }, 2));
  assert.ok(visiblePour({ visibilite: 'societe:3' }, 3));
});
