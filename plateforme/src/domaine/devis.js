/* Devis — la machine à états du parcours sur-mesure.
   Fonctions PURES : elles reçoivent des objets, rendent { devis, evenements }.
   La persistance et l'émission réelle sont l'affaire de la couche API.

   Invariants gravés ici (et vérifiés par tests/domaine.test.js) :
   - créer ou versionner N'ÉMET JAMAIS de message vers la cliente ;
   - seule l'action `envoyer` produit un événement notifiable ;
   - la commande Shopify n'est pas de notre ressort : elle naît chez le
     worker commerce sur `acompte.encaisse`, jamais avant. */

import { randomBytes } from 'node:crypto';
import { genererSKU } from './sku.js';

export const ETATS = ['brouillon', 'envoye', 'consulte', 'a_retravailler',
  'accepte', 'acompte_encaisse', 'en_production', 'livree', 'expire', 'annule'];

const TRANSITIONS = {
  brouillon:        ['envoye', 'annule'],
  envoye:           ['consulte', 'expire', 'annule'],
  consulte:         ['accepte', 'a_retravailler', 'expire', 'annule'],
  a_retravailler:   ['envoye', 'annule'],          // repasse par un envoi explicite
  accepte:          ['acompte_encaisse', 'annule'],
  acompte_encaisse: ['en_production'],
  en_production:    ['livree'],
  livree: [], expire: ['envoye'], annule: [],       // un devis expiré peut être renvoyé
};

export function transitionValide(depuis, vers) {
  return (TRANSITIONS[depuis] ?? []).includes(vers);
}

const ACOMPTE_PCT = Number(process.env.ACOMPTE_PCT ?? 30);
const EXPIRATION_JOURS = Number(process.env.DEVIS_EXPIRATION_JOURS ?? 30);

export function creerDevis({ numero, cliente, conseiller, spec, chiffrage, quand = new Date() }) {
  const id = `DEV-${quand.getFullYear()}-${String(numero).padStart(4, '0')}`;
  const version = { n: 1, cree_le: quand.toISOString(), par: conseiller ?? 'configurateur', spec, chiffrage };
  const devis = {
    id, cliente, conseiller: conseiller ?? null,
    etat: 'brouillon',
    token: randomBytes(9).toString('base64url'),
    expire_le: new Date(quand.getTime() + EXPIRATION_JOURS * 864e5).toISOString(),
    version_courante: 1, versions: [version],
    total: chiffrage.total,
    acompte: Math.round(chiffrage.total * ACOMPTE_PCT / 100),
    sku_prevu: skuDe(spec, chiffrage),
    commande_shopify: null, serie: null,
    hist: [{ at: quand.toISOString(), t: 'v1 créée depuis le configurateur' }],
  };
  return { devis, evenements: [ev('devis.cree', id, { cliente, total: chiffrage.total }, true)] };
}

export function nouvelleVersion(devis, { spec, chiffrage, par, note, quand = new Date() }) {
  const n = devis.version_courante + 1;
  const d = {
    ...devis,
    etat: ['brouillon', 'a_retravailler'].includes(devis.etat) ? devis.etat : 'brouillon',
    version_courante: n,
    versions: [...devis.versions, { n, cree_le: quand.toISOString(), par, spec, chiffrage, note }],
    total: chiffrage.total,
    acompte: Math.round(chiffrage.total * ACOMPTE_PCT / 100),
    sku_prevu: skuDe(spec, chiffrage),
    hist: [...devis.hist, { at: quand.toISOString(), t: `v${n} — ${note ?? 'correction'} (aucun message émis)` }],
  };
  return { devis: d, evenements: [ev('devis.version', d.id, { v: n }, true)] };
}

export function envoyer(devis, { canal, par, quand = new Date() }) {
  exiger(devis, 'envoye');
  if (!['email', 'whatsapp'].includes(canal)) throw metier('canal_inconnu');
  const d = maj(devis, 'envoye', quand, `v${devis.version_courante} envoyée par ${canal}`);
  return { devis: d, evenements: [ev('devis.envoye', d.id, { canal, v: d.version_courante })] };
}

export function consulter(devis, { quand = new Date() } = {}) {
  if (devis.etat !== 'envoye') return { devis, evenements: [] };   // relire n'est pas un fait nouveau
  const d = maj(devis, 'consulte', quand, 'consulté par la cliente');
  d.consulte_le = quand.toISOString();
  return { devis: d, evenements: [ev('devis.consulte', d.id, {})] };
}

export function demanderAjustement(devis, { message, quand = new Date() } = {}) {
  exiger(devis, 'a_retravailler');
  const d = maj(devis, 'a_retravailler', quand, `ajustement demandé${message ? ` — « ${message} »` : ''}`);
  return { devis: d, evenements: [ev('devis.ajustement_demande', d.id, { message })] };
}

export function accepter(devis, { quand = new Date() } = {}) {
  exiger(devis, 'accepte');
  if (new Date(devis.expire_le) < quand) throw metier('devis_expire');
  const d = maj(devis, 'accepte', quand, `v${devis.version_courante} acceptée par la cliente`);
  return { devis: d, evenements: [ev('devis.accepte', d.id, { montant: d.total, acompte: d.acompte })] };
}

export function encaisserAcompte(devis, { reference, quand = new Date() } = {}) {
  exiger(devis, 'acompte_encaisse');
  const d = maj(devis, 'acompte_encaisse', quand, `acompte encaissé (${reference ?? 'stripe'})`);
  return { devis: d, evenements: [ev('acompte.encaisse', d.id, { montant: d.acompte, reference })] };
}

function skuDe(spec, chiffrage) {
  return genererSKU({
    modele: chiffrage.codes.modele, matiere: chiffrage.codes.matiere,
    nuance: chiffrage.codes.nuance, option: chiffrage.codes.ferrure,
  });
}
function maj(devis, etat, quand, trace) {
  return { ...devis, etat, hist: [...devis.hist, { at: quand.toISOString(), t: trace }] };
}
function exiger(devis, vers) {
  if (!transitionValide(devis.etat, vers)) throw metier('transition_interdite', `${devis.etat} → ${vers}`);
}
function metier(code, detail) {
  const e = new Error(`${code}${detail ? ` : ${detail}` : ''}`); e.metier = code; return e;
}
function ev(type, sujet, donnees, muet = false) { return { type, sujet, donnees, muet }; }
