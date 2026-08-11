/* Seed du Référentiel — le pont configurateur ↔ ERP/PLM.
   Source : les matières/nuances du configurateur (site) + codes ERP.
   ⚠ Les codes matière CU0xx sont PROVISOIRES (décision D5 du dossier
   d'architecture : atelier de correspondance avec l'inventaire réel).
   Exporté pour que les tests sèment la même réalité que la prod. */

import { ouvrirStore } from '../src/data/store.js';

export const MODELES = [
  { _id: 'colette', nom: 'Colette', code_erp: 'CO', base: 3200, ordre: 1 },
  { _id: 'olympe', nom: 'Olympe', code_erp: 'OL', base: 2900, ordre: 2 },
  { _id: 'rafael', nom: 'Rafaël', code_erp: 'RA', base: 1900, ordre: 3 },
];

export const MATIERES = [
  { _id: 'graine', nom: 'Grainé', code_erp: 'CU001', supplement: 0, visibilite: 'public', ordre: 1 },
  { _id: 'caviar', nom: 'Caviar', code_erp: 'CU014', supplement: 180, visibilite: 'public', ordre: 2 },
  { _id: 'lisse', nom: 'Box lisse', code_erp: 'CU002', supplement: 320, visibilite: 'public', ordre: 3 },
  { _id: 'daim', nom: 'Daim', code_erp: 'CU003', supplement: 240, visibilite: 'public', ordre: 4 },
  { _id: 'alligator', nom: 'Alligator', code_erp: 'CU031', supplement: 3800, visibilite: 'societe:2', cites: true, ordre: 5 },
  { _id: 'galuchat', nom: 'Galuchat', code_erp: 'CU027', supplement: 3100, visibilite: 'societe:3', cites: true, ordre: 6 },
];

export const FERRURES = [
  { _id: 'laiton', nom: 'Laiton naturel', code_erp: 'LA', supplement: 0, ordre: 1 },
  { _id: 'vieilli', nom: 'Laiton vieilli', code_erp: 'VI', supplement: 120, ordre: 2 },
  { _id: 'palladium', nom: 'Argent palladié', code_erp: 'PD', supplement: 340, ordre: 3 },
  { _id: 'or24', nom: 'Or jaune 24 carats', code_erp: 'OR', supplement: 1800, ordre: 4 },
];

/* Les 52 nuances du configurateur, ordre chromatique, codes 2 lettres uniques. */
const N = (id, nom, code, hex) => ({ _id: id, nom, code_erp: code, hex, visibilite: 'public' });
export const NUANCES = [
  N('noir-absolu', 'Noir Absolu', 'NA', '#0d0d0d'), N('noir', 'Noir', 'NR', '#161616'),
  N('anthracite', 'Anthracite', 'AN', '#2b2b2e'), N('ardoise', 'Ardoise', 'AR', '#3a3d42'),
  N('graphite', 'Graphite', 'GH', '#4a4d52'), N('etain', 'Étain', 'ET', '#6b6e73'),
  N('gris-perle', 'Gris Perle', 'GP', '#9a9da2'), N('tourterelle', 'Gris Tourterelle', 'TT', '#b3b0a8'),
  N('argile', 'Argile', 'AG', '#c7c2b8'), N('craie', 'Craie', 'CR', '#efe9dd'),
  N('blanc-casse', 'Blanc Cassé', 'BC', '#f4f0e6'), N('ivoire', 'Ivoire', 'IV', '#e6dcc8'),
  N('ecru', 'Écru', 'EU', '#ddd2ba'), N('sable', 'Sable', 'SA', '#d2c3a4'),
  N('lin', 'Lin', 'LN', '#c9bda3'), N('parchemin', 'Parchemin', 'PC', '#c2b394'),
  N('miel', 'Miel', 'MI', '#c08b3e'), N('camel-clair', 'Camel Clair', 'CL', '#c9a06a'),
  N('camel', 'Camel', 'CA', '#b8874a'), N('fauve', 'Fauve', 'FV', '#a8703a'),
  N('caramel', 'Caramel', 'CM', '#a86a30'), N('whisky', 'Whisky', 'WH', '#96602c'),
  N('cognac', 'Cognac', 'CG', '#8f5424'), N('havane', 'Havane', 'HA', '#7d4a24'),
  N('noisette', 'Noisette', 'NS', '#6f4c31'), N('tabac', 'Tabac', 'TB', '#6b4526'),
  N('ecorce', 'Écorce', 'EO', '#5a4030'), N('chocolat', 'Chocolat', 'CH', '#4e3324'),
  N('moka', 'Moka', 'MK', '#3d2a1f'), N('ebene', 'Ébène', 'EB', '#2e211a'),
  N('brique', 'Brique', 'BQ', '#9c4530'), N('terracotta', 'Terracotta', 'TC', '#b05a3c'),
  N('cardinal', 'Rouge Cardinal', 'RC', '#a01f28'), N('rouge-profond', 'Rouge Profond', 'RP', '#7d1c22'),
  N('grenat', 'Grenat', 'GR', '#6d2530'), N('bordeaux', 'Bordeaux', 'BX', '#5e1f2c'),
  N('vieux-rose', 'Vieux Rose', 'VR', '#bf8a86'), N('rose-poudre', 'Rose Poudré', 'RO', '#d8b3ad'),
  N('prune', 'Prune', 'PR', '#5b3348'), N('aubergine', 'Aubergine', 'AU', '#452a3c'),
  N('amethyste', 'Améthyste', 'AM', '#6b4a72'), N('bleu-nuit', 'Bleu Nuit', 'BN', '#1c2438'),
  N('marine', 'Marine', 'MA', '#243352'), N('prusse', 'Bleu de Prusse', 'BP', '#28455e'),
  N('bleu-ardoise', 'Bleu Ardoise', 'BA', '#41607d'), N('celadon', 'Céladon', 'CE', '#7d9aa6'),
  N('sauge', 'Sauge', 'SG', '#93a087'), N('kaki', 'Kaki', 'KK', '#5d6146'),
  N('olive', 'Olive', 'OV', '#71703f'), N('sapin', 'Sapin', 'SP', '#2b4a38'),
  N('vert-empire', 'Vert Empire', 'VE', '#1e3a30'), N('bouteille', 'Vert Bouteille', 'BT', '#24523c'),
].map((n, i) => ({ ...n, ordre: i + 1 }));

export async function semerReferentiel(store) {
  for (const [col, docs] of [
    ['ref_modeles', MODELES], ['ref_matieres', MATIERES],
    ['ref_ferrures', FERRURES], ['ref_nuances', NUANCES],
  ]) {
    for (const doc of docs) {
      const existant = await store.col(col).trouverUn({ _id: doc._id });
      if (existant) await store.col(col).majUn({ _id: doc._id }, doc);
      else await store.col(col).insererUn(doc);
    }
  }
  const codes = NUANCES.map(n => n.code_erp);
  if (new Set(codes).size !== codes.length) throw new Error('codes nuance non uniques !');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = await ouvrirStore();
  await semerReferentiel(store);
  console.log(`Référentiel semé : ${MODELES.length} modèles · ${MATIERES.length} matières · ${NUANCES.length} nuances · ${FERRURES.length} ferrures (mode ${store.mode})`);
  console.log('⚠ Codes matière PROVISOIRES — décision D5 : correspondance avec l\'inventaire réel à acter.');
  await store.fermer();
}
