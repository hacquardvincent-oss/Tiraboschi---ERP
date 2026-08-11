# Plateforme Tiraboschi — v0.2

Le cerveau de l'écosystème (voir `../ARCHITECTURE_ECOSYSTEME.md` et
`../STRUCTURE_LOGICIELLE.md`). Cette version livre **J1** (couche données +
migration du POS) et **J2** (pipeline devis de bout en bout), organes en mode
simulation.

## Démarrer

```bash
npm install
npm test                      # 14 tests — domaine pur + recette HTTP bout-en-bout
npm run seed:referentiel      # 3 modèles · 6 matières · 52 nuances · 4 ferrures
npm start                     # http://localhost:3100 (DATA_MODE=memoire par défaut)
```

## J1 — migration des données du POS

```bash
node scripts/migrate_json_to_mongo.js --dry-run     # compte, ne touche rien
MONGO_URI='mongodb+srv://…' node scripts/migrate_json_to_mongo.js
```

Idempotent (upsert), source par défaut `../legacy-v1/data`. **En production** :
sauvegarder d'abord les JSON du POS déployé (peut-être les seules données
vivantes), pointer `--source` dessus, puis basculer `server.js` du POS sur la
lecture/écriture Mongo et vérifier la survie des données après un redeploy Render.

## J2 — pipeline devis

`POST /api/devis` (spec du configurateur) → back-office (versions **silencieuses**,
`/envoyer` email|whatsapp) → page cliente `/devis/:token` (consultation, ajustement,
validation) → lien d'acompte (organe stripe) → webhook `/api/hooks/paiement` →
**la commande Shopify naît ici seulement**, avec pièce et numéro de série
`TS-AAAA-NNNNN` → timeline CRM (= le journal filtré) → triggers différés
(relance J+7 = tâche conseiller, jamais un email).

## Modes

| Variable | Valeurs | Défaut |
|---|---|---|
| `DATA_MODE` | `memoire` · `mongo` | `memoire` (mongo si `MONGO_URI` posée pour la migration) |
| `ORGANES_MODE` | `simulation` · `reel` | `simulation` — chaque sortie est enregistrée dans `organes_sorties` au lieu de partir |
| `ACOMPTE_PCT`, `DEVIS_EXPIRATION_JOURS` | | 30 · 30 |

Le mode `reel` des organes est volontairement **bloquant** tant que les
décisions C0 ne sont pas actées (token Shopify, clés Klaviyo, WhatsApp Meta) —
chaque adaptateur dit exactement ce qui lui manque.

## Ce que les tests verrouillent

- créer ou versionner un devis n'émet **jamais** de message (organes vides) ;
- une matière sous voile The Society est **refusée** au chiffrage, pas seulement cachée ;
- la commande Shopify n'existe **qu'après** l'encaissement — et rejouer le webhook
  n'en crée pas de seconde ;
- la timeline CRM est le journal filtré ; l'ajustement demandé et la relance J+7
  créent des **tâches conseiller**, pas des emails ;
- le changement de statut projette le metafield Shopify.
