/* J1 — Migration des données du POS (JSON sur disque éphémère Render)
   vers LA base unique de l'écosystème.

   Usage :
     node scripts/migrate_json_to_mongo.js --dry-run          # compte, ne touche rien
     MONGO_URI=... node scripts/migrate_json_to_mongo.js      # migre vers Atlas
     node scripts/migrate_json_to_mongo.js --data-mode=memoire  # validation locale du mapping

   Règles :
   - IDEMPOTENT : relançable — les documents sont upsertés par identifiant naturel ;
   - AUCUNE suppression : les JSON source ne sont jamais modifiés ;
   - un rapport lisible en sortie (à coller dans le journal de migration).
   Source par défaut : ../legacy-v1/data (la copie de référence du dépôt).
   En prod : pointer --source vers le data/ du POS déployé, APRÈS backup. */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirStore } from '../src/data/store.js';

const ici = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2)
  .map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

const SOURCE = resolve(ici, args.source ?? '../../legacy-v1/data');
const DRY = !!args['dry-run'];

function lire(nom) {
  const p = resolve(SOURCE, nom);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const produits = lire('products_db.json');
if (!produits) { console.error(`Introuvable : ${SOURCE}/products_db.json`); process.exit(1); }
const utilisateurs = lire('users_db.json');   // absent de legacy-v1 : toléré

const plan = [
  ['pos_variants', (produits.variants ?? []).map(v => ({ _id: v.sku, ...v }))],
  ['pos_materials', (produits.materials ?? []).map(m => ({ _id: m.id, ...m }))],
  ['pos_stock', (produits.stock ?? []).map(s => ({ _id: s.id, ...s }))],
  ['pos_config', Object.entries(produits.config ?? {}).map(([k, v]) => ({ _id: k, valeurs: v }))],
  ['pos_users', (utilisateurs?.users ?? []).map(u => ({ _id: u.id, ...u }))],
];

console.log(`Migration POS → base écosystème`);
console.log(`  source : ${SOURCE}`);
console.log(`  cible  : ${DRY ? 'AUCUNE (dry-run)' : (args['data-mode'] ?? process.env.DATA_MODE ?? (process.env.MONGO_URI ? 'mongo' : 'memoire'))}`);
for (const [col, docs] of plan) console.log(`  ${col.padEnd(14)} ${String(docs.length).padStart(4)} documents`);

if (utilisateurs === null)
  console.log('  ⚠ users_db.json absent de la source — pos_users non migrée (normal sur legacy-v1)');

if (DRY) { console.log('\nDry-run : rien n\'a été écrit.'); process.exit(0); }

const store = await ouvrirStore({
  mode: args['data-mode'] ?? process.env.DATA_MODE ?? (process.env.MONGO_URI ? 'mongo' : 'memoire'),
});
let ecrits = 0, inchanges = 0;
for (const [col, docs] of plan) {
  for (const doc of docs) {
    const existant = await store.col(col).trouverUn({ _id: doc._id });
    if (existant) { await store.col(col).majUn({ _id: doc._id }, doc); inchanges++; }
    else { await store.col(col).insererUn(doc); ecrits++; }
  }
}
console.log(`\nTerminé : ${ecrits} créés, ${inchanges} mis à jour (upsert). Relançable sans risque.`);
console.log(`Rappel prod : 1) BACKUP des JSON du POS déployé d'abord ; 2) pointer --source dessus ;`);
console.log(`3) basculer server.js sur read/write Mongo ; 4) redéployer Render et VÉRIFIER la survie des données.`);
await store.fermer();
