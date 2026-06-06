# HANDOFF — Tiraboschi POS / ERP — Cadrage Intégration V2

> **But de ce fichier** : transmettre l'intégralité du contexte projet à une nouvelle session
> (« pos/erp integration V2 scoping »). À charger **en premier** dans la nouvelle discussion.
>
> **Statut de l'audit** : état du code **vérifié dans le repo le 2026-06-03** (lecture directe de
> `server.js`, `public/`, `data/`). ⚠️ Cet audit **corrige plusieurs affirmations périmées** des
> anciens fichiers `AUDIT.md` / `STATUS.md` (datés 2026-05-31) qui décrivent un état pré-correctifs.
>
> **Contrainte absolue** : le projet est **en production**. Rien n'a été modifié dans l'app lors de
> cet audit. `main` = prod (déployée par Render). Toute évolution V2 se fait sur branche dédiée.

---

## 0. TL;DR pour la nouvelle session

- App **monolithique tout-en-un** (POS + ERP/PLM + Stock/MRP + CRM + Ventes + Admin) pour la
  maroquinerie de luxe **Tiraboschi**, orientée **Trunk Shows** (ventes événementielles).
- **Backend** : un seul `server.js` (1395 lignes, Express, 41 routes). **Frontend** : SPA Vanilla JS
  dans un seul `public/app.js` (2817 lignes). **Pas de build step.**
- **Données** : **fichiers JSON plats** (`data/products_db.json`, `data/users_db.json`). MongoDB est
  importé mais **jamais réellement utilisé** (code mort — voir §6).
- **Intégrations** : Stripe Terminal S710, Stripe Checkout (liens de paiement), Shopify Admin API
  v2024-01.
- Projet initialement développé via **Antigravity (Gemini)** — d'où ~80 scripts hotfix `fix*.js` /
  `patch*.js` désormais **archivés** dans `scripts/migrations/` (la racine a été nettoyée, commit
  `c9038d6`).
- **Le vrai sujet de stabilité V2** : la persistance JSON sur un disque **éphémère Render** → risque
  de perte de données au redéploiement. C'est LE point structurant du scoping V2.

---

## 1. Identité & déploiement

| | |
|---|---|
| **Nom** | Tiraboschi POS / ERP |
| **Repo** | `hacquardvincent-oss/tpe-stripe710` |
| **Branche prod** | `main` (déployée automatiquement par **Render**) |
| **Hébergement** | Render (l'env principal s'appelle `tiraboschi-pos.onrender.com`) |
| **Boutique** | `tiraboschi-paris.myshopify.com` |
| **Outil de dev initial** | Antigravity (Gemini) — voir `SPECIFICATIONS ET RECETTE/README.md` |
| **PIN par défaut** | `1234` (cf. README) |

---

## 2. Stack technique réelle

| Couche | Techno | Fichier |
|---|---|---|
| Backend | Node.js + Express 4 | `server.js` (1395 l.) |
| Frontend | SPA Vanilla JS (aucun framework, aucun bundler) | `public/app.js` (2817 l.) |
| HTML | Page unique | `public/index.html` (1171 l.) |
| CSS | Design system « The Blue Sole » (noir + accent bleu azur #00D4FF) | `public/style.css` (1058 l.) |
| Auth client | PIN plaintext | `public/auth.js` (83 l.) |
| SDK terminal | Stripe Terminal | `public/stripe-tpe.js` (556 l.) |
| Base de données | **Fichiers JSON plats** | `data/*.json` |
| Paiement | Stripe Terminal S710 + Stripe Checkout | — |
| E-commerce | Shopify Admin API **v2024-01** | — |
| i18n | Dictionnaire FR/EN embarqué dans `app.js` | — |

**Dépendances (`package.json`)** : `express`, `stripe@15`, `cors`, `dotenv`, `axios`, `mongodb@7`
(inutilisé), `mammoth`, `puppeteer`, `xlsx`.

⚠️ **`prestart` agressif** : `package.json` lance au démarrage
`node scripts/migrations/replace_db_v3.js && node scripts/migrations/import_inventaire.js`.
**Ces scripts de migration s'exécutent à CHAQUE `npm start`** (donc à chaque déploiement Render).
À auditer en priorité pour V2 : un script de migration ne devrait pas tourner en boucle au boot prod.

---

## 3. Modules fonctionnels (cf. `SPECIFICATIONS_FONCTIONNELLES.md`)

1. **POS / Caisse** — wizard de vente (Modèle → Couleur → Options → Mode d'achat), Terminal S710,
   bascule devise EUR/USD, calcul taxes :
   - *Sur Place* : TVA 20% (EUR) ou Sales Tax ~8% (USD).
   - *Expédié DDP* : frais de port forfaitaires (30€ / 100$) + duties 9% (USA), suffixe SKU `-DDP`.
   - Article hors-catalogue à la volée, panier TTC/douanes comprises.
2. **ERP / PLM** — catalogue visuel groupé par modèle, fiches techniques, **SKU Engine**, BOM
   (nomenclature matières).
3. **Stock / MRP** — réception fournisseur (bon de réception interne), mouvements entrée/sortie,
   alertes rupture, étiquettes QR Code matières.
4. **CRM** — clients via Shopify, RGPD (opt-in email/SMS).
5. **Ventes** — historique, KPI jour/semaine/mois, liens de paiement Stripe.
6. **Admin** — utilisateurs/permissions, config ERP, import/export Excel.

### SKU Engine
Format actuel implémenté (`generateSKU`, `server.js`) :
`[MODEL][YY][S]-[MAT][OPT]-[COLOR]` → ex. `OL25H-CU001-002-NR`, `AA00826E-BI00100-017`.
- ⚠️ L'incrémentation séquentielle promise dans les specs (`-01`, `-02` sur doublon) **n'est pas
  implémentée**.
- `idOption` est un code numérique muet (`00`, `002`) — pas sémantique.
- Le suffixe `-DDP` est ajouté côté frontend, pas dans le moteur.

---

## 4. Routes API (41 routes, toutes dans `server.js`)

**Stripe / Terminal** : `POST /api/create_payment_intent`, `POST /api/capture_payment_intent`,
`POST /api/connection_token`, `POST /api/locations`, `GET /api/readers`.

**Stripe Checkout (liens)** : `POST /api/create_payment_link`,
`GET /api/check_payment_link/:session_id`, `POST /api/webhook`, `GET /pay/:session_id`
(page intermédiaire — workaround WhatsApp/Instagram in-app browser → redirige vers Safari/Chrome).

**Shopify** : `GET /api/shopify/products`, `/customers` (GET+POST), `/inventory`, `/all_products`,
`/reports`, `/product_by_sku/:sku`, `POST /api/shopify/calculate_taxes` (via Draft Orders),
`GET /api/shopify/orders`.

**Ventes** : `GET /api/sales`, `POST /api/sales` (enregistre en JSON **ET** pousse une commande
Shopify taguée `POS, Vendeur:xxx`), `POST /api/refund_order`.

**ERP / Stock** : `/api/erp/collection`, `/materials` (GET+POST+update), `POST /stock_movement`,
`GET /movements`, `/production_orders` (GET+POST), `/variant` (POST+DELETE),
`POST /api/erp_receive_materials`, `/config` (GET+POST), `POST /api/erp/import_csv`,
`POST /api/erp/sync_shopify`, `GET /api/health`.

**Admin** : `GET/POST/PUT/DELETE /api/users`.

---

## 5. Intégrations — état réel vérifié

### Stripe Terminal S710 — 🟢 solide
Connection token, locations, readers, PaymentIntent create/capture. Fonctionnel.

### Stripe Checkout (liens de paiement) — 🟢 très bien
Création de lien + page intermédiaire `/pay/:id` (contourne les navigateurs in-app
WhatsApp/Instagram). **Webhook signé** (voir §6).

### Shopify Admin API — 🟡 correct, points d'attention
- **Version figée à `2024-01`** (ancienne) → à faire monter pour V2 (GraphQL / nouvelles features).
- Auth via **OAuth `grant_type=client_credentials`** sur `/admin/oauth/access_token`, token mis en
  cache avec expiry (`getShopifyHeaders`). Décision documentée : Shopify aurait déprécié les tokens
  statiques `shpat_` → ce flow a été **volontairement conservé**. **À reconfirmer avec la doc
  Shopify** : le `client_credentials` grant pour l'Admin API n'est pas un flow OAuth standard
  documenté — fragilité potentielle si le token ne se renouvelle pas correctement.
- Toutes les requêtes en `limit=250` **sans pagination cursor** → troncature silencieuse quand la
  base clients/produits grossit.
- Création de commande Shopify à **chaque vente POS** (source de vérité du reporting).
- Calcul des taxes US via **Draft Orders** (approche maligne, fonctionne).

---

## 6. ⚠️ Correctifs de l'audit précédent (les anciens docs sont partiellement FAUX)

Les fichiers `AUDIT.md` / `CONTEXT.md` / `STATUS.md` (2026-05-31) listent des bugs « critiques » qui
**sont en réalité déjà corrigés** dans le code actuel. Vérifié ligne par ligne le 2026-06-03 :

| Sujet | Ancien audit dit | **Réalité actuelle du code** |
|---|---|---|
| Webhook Stripe non signé | 🔴 critique | ✅ **CORRIGÉ** — `stripe.webhooks.constructEvent` + `express.raw()` déclaré avant `express.json()` (l. 92/313) |
| `MONGO_URI` hardcodée | 🔴 critique | ✅ **CORRIGÉ** — lue depuis `process.env.MONGO_URI` (l. 14) |
| CORS ouvert | 🟡 | ✅ **CORRIGÉ** — whitelist via `ALLOWED_ORIGINS` (l. 25-34) |
| Double-comptage KPI | 🔴 majeur | ✅ **CORRIGÉ** — `/api/shopify/reports` ne compte plus que Shopify (l. 658+, commentaire explicite) |

**Ce qui reste réellement à risque (vérifié) :**

| # | Problème | Localisation | Gravité |
|---|---|---|---|
| 1 | **Persistance JSON sur disque Render éphémère** — `products_db.json` (variants, stock, ventes) réécrit sur le FS local. Au redéploiement Render, le disque est réinitialisé → **perte des données écrites depuis le dernier commit**. C'est LA faille structurante. | `readProductsDB`/`writeProductsDB` | 🔴 CRITIQUE |
| 2 | **MongoDB = code mort** — `getMongoDB()` est défini mais **jamais appelé** nulle part. Le client `new MongoClient` est instancié au boot mais ne se connecte jamais. Donne une fausse impression de robustesse ; à supprimer OU à brancher réellement. | `server.js` l. 14-22 | 🔴 majeur |
| 3 | **Mots de passe en clair** — users par défaut hardcodés dans `readUsersDB` (`"admin"`, `"1234"`) et stockés en plaintext dans `users_db.json`. Pas de hash, pas de JWT, pas de rate limiting sur le login. | `server.js` l. 41-45 | 🔴 majeur |
| 4 | **Écritures JSON non atomiques** — `fs.writeFileSync` sans verrou. Deux ventes simultanées (2 vendeurs en Trunk Show) → écritures qui se chevauchent → corruption. Cause probable des anciens scripts `restore*.js`. | `writeProductsDB` | 🔴 majeur |
| 5 | **`prestart` rejoue des migrations à chaque boot** — `replace_db_v3.js` + `import_inventaire.js` tournent à chaque `npm start`. | `package.json` | 🟠 à auditer |
| 6 | **Pagination Shopify absente** (`limit=250`) | routes `/shopify/*` | 🟡 |
| 7 | **`app.js` monolithique** (2817 l.), variables globales, duplication (fallback `renderPosStep5`) | `public/app.js` | 🟡 dette |
| 8 | **Auth Shopify `client_credentials`** à reconfirmer | `getShopifyHeaders` | 🟡 |

---

## 7. Modèle de données réel (`data/products_db.json`)

```
variants[285]   ← déclinaisons produits (source POS/PLM). Ex de clés :
                  sku, name, idModel, idYear, idSeason, idMaterialPrimary,
                  idOption, idColor, price, stock, posModel/Material/Option/Color
materials[47]   ← matières premières
stock[4]        ← niveaux de stock matières
config{...}     ← dictionnaires ERP : models, years, seasons, options, optionTypes,
                  colors, sizes, globalMaterials, animalTypes, skinTypes, linings,
                  materialDetails, suppliers, jewelry, origins, hsCodes, ateliers
sales[]         ← ajouté dynamiquement (ventes locales, doublées dans Shopify)
```

Autres fichiers `data/` : `users_db.json` (4 users), `erp_db.json` (183 KB, base ERP legacy),
`erp_db_backup_05052026.json`, `erp_config_formatted.json`,
`Calcul taxes et duties shopify checkout.png` (doc de référence taxes).

**Utilisateurs** : USR-1 Vincent Hacquard (admin), USR-2 Laurène Mauro (admin),
USR-CHIARA Chiara (caisse+ventes), USR-PATTI Patti (caisse+ventes).

---

## 8. Organisation du repo (après nettoyage Antigravity)

```
tpe-stripe710/
├── server.js                       ← backend complet (41 routes)
├── package.json / package-lock.json
├── .env.example                    ← template des variables (bien documenté)
├── .gitignore                      ← ignore .env, node_modules, *.csv, *.zip, *.txt …
├── cleanup_repo.js                 ← script de nettoyage (déjà utilisé)
├── logo.png
├── SPECIFICATIONS_FONCTIONNELLES.md
├── public/                         ← frontend (index.html, app.js, style.css, auth.js, stripe-tpe.js)
├── data/                           ← bases JSON (voir §7)
├── docs/                           ← sku_mapping.md, sku_mapping_output.md
├── tests/                          ← 6 scripts de test fonctionnel (test_tax, test_sku_price, …)
├── scripts/
│   ├── migrations/  (86 fichiers)  ← ⚠️ ARCHIVE des hotfix fix*/patch*/restore*/update* — NE PLUS TOUCHER
│   │                                  (sauf replace_db_v3.js + import_inventaire.js appelés par prestart !)
│   ├── seeds/       (2)            ← seed_erp.js, init_materials.js
│   └── utils/       (15)           ← read_excel, sync_prices, generate_export, fetch_customer …
├── projet-tiraboschi-pos/          ← docs de pilotage (CONTEXT/AUDIT/STATUS/ROADMAP — partiellement périmés)
│   └── HANDOFF_V2_SCOPING.md       ← CE FICHIER
└── SPECIFICATIONS ET RECETTE/      ← CDC .docx, inventaires .xlsx, recettes, pictos, logos
```

> **Note historique** : `~80` scripts `fix*.js`/`patch*.js` ont été archivés dans
> `scripts/migrations/` (commit `c9038d6`). Ils ont déjà été exécutés sur les données ; ils n'ont
> plus qu'une valeur d'historique. **Exception** : `replace_db_v3.js` et `import_inventaire.js` sont
> encore appelés vivants par le `prestart` (cf. §2 / §6-5).

---

## 9. Écarts specs ↔ implémenté (pour le périmètre V2)

| Fonctionnalité specs/brief | Statut réel |
|---|---|
| Génération PDF facture | ❌ absent (prévu V2) |
| Auto-décrémentation stock à la vente (webhook → MRP) | ❌ absent (prévu V2) |
| Sync **bi-directionnelle** Shopify (push PLM → Shopify via GraphQL) | ⚠️ partiel — push *commandes* ✅, push *produits/fiches* ❌ |
| Auth JWT + permissions strictes | ❌ absent (PIN plaintext) |
| Incrémentation séquentielle SKU (`-01`/`-02`) | ❌ absent |
| Numéro de série unique par pièce (standard luxury) | ❌ absent |
| Import/Export Excel **dans l'UI** | ⚠️ scripts présents, non exposés |
| Commissions vendeurs | ⚠️ champ `commission` présent, aucun calcul/UI |
| Mode hors-ligne POS (Service Worker) | ❌ absent |
| Gestion multi-événements / Trunk Shows (lieu/date/vendeur) | ❌ absent (tag `Vendeur:` seulement) |
| Suivi RMA / retours | ⚠️ refund Stripe + cancel Shopify ✅, pas de suivi RMA |
| QR Code étiquettes matières | ⚠️ script `sync_chaine.js`, non intégré UI |

---

## 10. Questions de cadrage à trancher pour la V2

Ces décisions conditionnent tout le reste — à clarifier en début de session V2 :

1. **Persistance** : on migre vers une vraie BDD persistante ? Trois options sur la table —
   (a) **MongoDB Atlas** (déjà payé/branché en façade), (b) **SQLite + disque persistant Render**,
   (c) **Postgres Render**. → impacte directement le risque n°1 (perte de données).
2. **Shopify comme source de vérité** : on garde Shopify comme master du catalogue/stock, ou l'ERP
   local devient le master avec push vers Shopify ? (détermine le sens de la sync bi-directionnelle).
3. **Montée de version Shopify API** (2024-01 → récente) + passage GraphQL : in/out scope V2 ?
4. **Sécurité auth** : JWT + hash bcrypt → V2 ou plus tard ? (bloquant si l'app s'ouvre à plus
   d'utilisateurs).
5. **Périmètre luxe** : numéro de série par pièce + traçabilité/QC → V2 ou V3 ?
6. **Refactor `app.js`** : on découpe en modules ES6 maintenant ou on gèle tant que ça tourne ?
7. **Trunk Shows** : besoin d'un objet « événement » (lieu, date, vendeurs, rapport) en V2 ?

---

## 11. Démarrer en local (lecture seule, sans toucher la prod)

```bash
npm install
cp .env.example .env      # puis remplir les valeurs (voir variables ci-dessous)
npm start                 # ⚠️ exécute aussi le prestart (replace_db_v3 + import_inventaire)
# → http://localhost:3000  (PIN par défaut : 1234)
```

**Variables d'environnement requises** (`.env.example`) :
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`,
`SHOPIFY_CLIENT_SECRET`, `PORT`, `ALLOWED_ORIGINS`, `MONGO_URI`.

---

## 12. Règles de travail (à respecter en V2)

- **`main` = prod intouchable** (Render déploie depuis `main`). Jamais de push direct.
- Travailler sur branche dédiée (ex. `feature/v2-...`), valider, puis merge contrôlé.
- **Ne pas relancer** les scripts `scripts/migrations/*` sur les données de prod.
- Avant toute migration de persistance : **backup** des `data/*.json` actuels (ce sont peut-être les
  seules données vivantes si Render a déjà recyclé le disque).
- Toute clé/secret reste dans `.env` (jamais dans le code ni le repo).

---

*Fichier généré le 2026-06-03 par audit en lecture seule du repo `tpe-stripe710`. Aucune
modification apportée au code applicatif.*
