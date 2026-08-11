/* Store — l'accès à LA base unique de l'écosystème.
   Deux pilotes derrière la même API minuscule :
   - `memoire`  : Map en RAM — dev et tests, zéro dépendance réseau
   - `mongo`    : MongoDB Atlas, database `tiraboschi` (prod / staging)
   Les modules ne voient jamais le pilote : ils reçoivent `store.col(nom)`. */

import { randomUUID } from 'node:crypto';

const COLLECTIONS = [
  'ref_modeles', 'ref_matieres', 'ref_nuances', 'ref_ferrures',
  'clients', 'devis', 'pieces', 'taches', 'evenements', 'organes_sorties',
  'pos_variants', 'pos_materials', 'pos_stock', 'pos_config', 'pos_users',
];

/* ── pilote mémoire ── */
function colMemoire(nom, table) {
  return {
    nom,
    async insererUn(doc) {
      const d = { _id: doc._id ?? randomUUID(), ...doc };
      table.set(d._id, structuredClone(d));
      return d;
    },
    async majUn(filtre, changements) {
      const d = await this.trouverUn(filtre);
      if (!d) return null;
      // parité avec le $set de Mongo : les clés pointées ciblent le champ imbriqué
      const maj = structuredClone(d);
      for (const [chemin, valeur] of Object.entries(changements)) {
        const parts = chemin.split('.');
        let o = maj;
        for (const part of parts.slice(0, -1)) o = (o[part] ??= {});
        o[parts.at(-1)] = valeur;
      }
      table.set(d._id, structuredClone(maj));
      return maj;
    },
    async trouverUn(filtre) {
      for (const d of table.values())
        if (correspond(d, filtre)) return structuredClone(d);
      return null;
    },
    async trouver(filtre = {}) {
      const r = [];
      for (const d of table.values())
        if (correspond(d, filtre)) r.push(structuredClone(d));
      return r;
    },
    async compter(filtre = {}) { return (await this.trouver(filtre)).length; },
    async vider() { table.clear(); },
  };
}
function correspond(doc, filtre) {
  return Object.entries(filtre).every(([k, v]) => {
    const val = k.split('.').reduce((o, part) => o?.[part], doc);
    if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(val);
    if (v && typeof v === 'object' && '$ne' in v) return val !== v.$ne;
    if (v && typeof v === 'object' && '$exists' in v) return (val !== undefined) === v.$exists;
    return val === v;
  });
}

/* ── pilote mongo ── */
function colMongo(nom, db) {
  const c = db.collection(nom);
  return {
    nom,
    async insererUn(doc) {
      const d = { _id: doc._id ?? randomUUID(), ...doc };
      await c.insertOne(d);
      return d;
    },
    async majUn(filtre, changements) {
      const { _id, ...reste } = changements;   // $set refuse _id (champ immuable)
      const r = await c.findOneAndUpdate(filtre, { $set: reste }, { returnDocument: 'after' });
      return r ?? null;
    },
    async trouverUn(filtre) { return c.findOne(filtre); },
    async trouver(filtre = {}) { return c.find(filtre).toArray(); },
    async compter(filtre = {}) { return c.countDocuments(filtre); },
    async vider() { await c.deleteMany({}); },
  };
}

export async function ouvrirStore({ mode = process.env.DATA_MODE ?? 'memoire', uri = process.env.MONGO_URI } = {}) {
  if (mode === 'mongo') {
    if (!uri) throw new Error('DATA_MODE=mongo exige MONGO_URI');
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGO_DB ?? 'tiraboschi');
    // index vitaux — idempotents
    await db.collection('devis').createIndex({ token: 1 }, { unique: true });
    await db.collection('devis').createIndex({ id: 1 }, { unique: true });
    await db.collection('pieces').createIndex({ serie: 1 }, { unique: true });
    const cols = Object.fromEntries(COLLECTIONS.map(n => [n, colMongo(n, db)]));
    return { mode, col: n => colOuErreur(cols, n), fermer: () => client.close() };
  }
  const tables = new Map(COLLECTIONS.map(n => [n, new Map()]));
  const cols = Object.fromEntries(COLLECTIONS.map(n => [n, colMemoire(n, tables.get(n))]));
  return { mode, col: n => colOuErreur(cols, n), fermer: async () => {} };
}

function colOuErreur(cols, n) {
  if (!cols[n]) throw new Error(`Collection inconnue : ${n} — la déclarer dans store.js`);
  return cols[n];
}
