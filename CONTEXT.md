# CONTEXT.md — Tiraboschi POS / ERP
> Document de contexte complet — à charger dans chaque nouvelle session Claude Code
> Dernière mise à jour : **2026-06-03** (audit Cowork)
> Auteur du projet : Vincent Hacquard — hacquard.vincent@gmail.com

---

## 1. Présentation du projet

### Qui est Tiraboschi ?
Maroquinerie de luxe française (fondée en 1904), avec des boutiques en France et des ventes à l'international (US, Europe). Produits : sacs, petite maroquinerie, accessoires cuir haut de gamme. Chaque pièce est fabriquée à la main, en édition limitée.

### Pourquoi cette application ?
L'application remplace une caisse classique + un ERP artisanal (Excel) par un outil sur mesure capable de gérer :
- la vente en boutique (terminal S710) et à distance (lien WhatsApp/Instagram)
- les taxes françaises, européennes et américaines en temps réel
- la traçabilité des matières premières jusqu'au produit fini
- la synchronisation avec Shopify pour les commandes et la gestion clients

### Utilisateurs finaux
| ID | Nom | Rôle | Accès |
|---|---|---|---|
| USR-1 | Vincent Hacquard | Admin | Tout |
| USR-2 | Laurène Mauro | Admin | Tout |
| USR-CHIARA | Chiara | Vendeur | Caisse + Ventes |
| USR-PATTI | Patti | Vendeur | Caisse + Ventes |

---

## 2. Architecture technique

### Stack

| Couche | Techno | Notes |
|---|---|---|
| Backend | Node.js 20 + Express 4 | `server.js` (1395 lignes) — monolithique |
| Frontend | Vanilla JS SPA | `public/app.js` (~2800 lignes) — monolithique |
| Base de données | JSON flat-files | `data/products_db.json`, `data/users_db.json` |
| Paiement terminal | Stripe Terminal S710 | `public/stripe-tpe.js` |
| Paiement à distance | Stripe Checkout | Page `/pay/:id` + webhook |
| E-commerce | Shopify Admin API v2024-01 | Produits, clients, commandes, taxes |
| Auth | PIN numérique en clair | À remplacer par bcrypt + JWT |
| MongoDB | Atlas (connecté, inutilisé) | Sprint 1 : migration complète vers Mongo |
| Déploiement | Render | Auto-déploie depuis `main` |

### Liens essentiels
- **GitHub** : https://github.com/hacquardvincent-oss/tpe-stripe710
- **Render** : https://dashboard.render.com/web/srv-d7s56777f7vs73ddhumg
- **MongoDB Atlas** : https://cloud.mongodb.com/v2/6a04e0894406869d3a1f4544
- **Shopify Admin** : https://axp150-71.myshopify.com/admin
- **Branche de travail** : `develop` (ne jamais pousser directement sur `main`)

### Carte des fichiers clés

```
stripe-terminal-app/
│
├── server.js                        ← BACKEND : toutes les routes API (1395 lignes)
├── package.json                     ← Dépendances npm
├── .env                             ← Secrets (voir section 4)
├── .gitignore                       ← Doit exclure .env et node_modules
├── cleanup_repo.js                  ← Script de nettoyage repo (pas encore lancé)
├── CLAUDE.md                        ← Instructions courtes pour Claude Code
├── CONTEXT.md                       ← CE FICHIER — contexte complet
├── SPECIFICATIONS_FONCTIONNELLES.md ← Brief fonctionnel complet du projet
│
├── public/
│   ├── index.html                   ← Structure HTML (SPA, page unique)
│   ├── app.js                       ← FRONTEND : toute la logique UI (~2800 lignes)
│   ├── auth.js                      ← Auth côté client (PIN, session)
│   ├── stripe-tpe.js                ← SDK Stripe Terminal JS
│   └── logo.png
│
├── data/
│   ├── products_db.json             ← SOURCE DE VÉRITÉ : variants, stock, ventes, collections, config
│   ├── users_db.json                ← Utilisateurs et mots de passe (en clair !)
│   ├── erp_db.json                  ← Données ERP legacy (référence pour migration MongoDB)
│   └── erp_db_backup_05052026.json  ← Backup à conserver
│
├── scripts/
│   ├── migrations/                  ← ~80 scripts hotfix déjà exécutés (ne plus toucher)
│   ├── seeds/
│   │   ├── seed_erp.js              ← Init config ERP de base
│   │   └── init_materials.js        ← Init matières de base
│   └── utils/
│       ├── generate_export.js       ← Export données (à exposer en UI Sprint 3)
│       ├── sync_prices.js           ← Sync prix
│       ├── clean_db.js              ← Nettoyage données dupliquées
│       └── ...
│
├── tests/
│   ├── test_tax.js                  ← Tests calcul taxes
│   ├── test_shopify.js              ← Tests intégration Shopify
│   ├── test_sku_price.js            ← Tests SKU engine
│   └── test_app.js                  ← Tests généraux
│
├── docs/
│   ├── sku_mapping.md               ← Référence format SKU
│   └── sku_mapping_output.md
│
├── SPECIFICATIONS ET RECETTE/       ← Documentation fonctionnelle (cahier des charges)
│
└── projet-tiraboschi-pos/           ← Documentation session IA précédente (référence)
    ├── CONTEXT.md                   ← Contexte (version du 2026-05-31)
    ├── STATUS.md                    ← Backlog détaillé (version du 2026-05-31)
    ├── AUDIT.md                     ← Audit technique complet
    ├── AUDIT_FICHIERS.md            ← Plan de nettoyage fichiers
    ├── ROADMAP.md                   ← Roadmap sprint par sprint
    └── specs/
        └── analyse-ux-sku-inventaire.md
```

> ⚠️ **À supprimer** : `temp_docx_extract/` et `temp_extract/` — résidus d'un outil IA externe.

---

## 3. Ce que fait l'application (modules)

### 3.1 POS / Caisse
Wizard en 5 étapes : **Modèle → Matière → Option → Couleur → Validation**

- Calcul du prix selon la destination : Sur Place (FR/EU) ou Expédié DDP (US/international)
- Bascule EUR ↔ USD en temps réel
- Paiement via **Stripe Terminal S710** (présentation carte physique)
- Génération d'un **lien de paiement Stripe** (WhatsApp, Instagram, email)
- Page intermédiaire `/pay/:id` → redirect Safari/Chrome (workaround WebView)
- Création automatique de la commande dans Shopify à chaque vente
- Refund/annulation commande (Stripe + Shopify)
- Fallback prix ERP si Shopify injoignable

### 3.2 ERP / PLM (gestion produits)
- **SKU Engine** : génération automatique `[MODEL][YY][S]-[MAT][OPT]-[COLOR]`
  - Exemple : `OL25H-CU001-NR`
  - Format cible (non encore implémenté) : `OL-25H-CU001-CH-NR`
- Catalogue visuel groupé par modèle/collection
- Fiches techniques avec **BOM** (nomenclature matières — quantités par pièce)
- Générateur de bon de réception fournisseur

### 3.3 Stock / MRP (matières premières)
- Gestion matières : peaux, bijoux, tissus, packaging
- Mouvements entrée/sortie avec historique
- Réversion de mouvements
- Alertes rupture stock (seuil configurable)
- Vue pièces finies par déclinaison coloris

### 3.4 CRM
- Base clients synchronisée depuis Shopify
- Conformité RGPD
- Création client depuis la caisse (nouveau client)

### 3.5 Ventes / Reporting
- Historique des ventes (POS + liens de paiement)
- KPIs : ventes jour / semaine / mois
- Source de vérité : Shopify (⚠️ double-comptage actuel — voir Bug 6)

### 3.6 Admin
- Gestion utilisateurs (CRUD)
- Configuration ERP (taux de change, taxes, paramètres)
- Import/Export Excel (scripts présents, pas encore dans l'UI)

---

## 4. Variables d'environnement

### `.env` actuel (au 2026-06-03)

```env
STRIPE_SECRET_KEY=rk_live_51TACeE...    ✅ présent (clé live !)
STRIPE_PUBLISHABLE_KEY=pk_live_...      ✅ présent
PORT=3000                               ✅ présent
SHOPIFY_CLIENT_ID=656326ec...           ✅ présent
SHOPIFY_CLIENT_SECRET=shpss_e46b0f...  ✅ présent
SHOPIFY_STORE_DOMAIN=axp150-71.myshopify.com  ✅ présent
```

### Variables MANQUANTES — à ajouter avant de démarrer

```env
MONGO_URI=mongodb+srv://...            ❌ MANQUANT → MongoClient undefined au boot
STRIPE_WEBHOOK_SECRET=whsec_...        ❌ MANQUANT → tous les webhooks rejetés
ALLOWED_ORIGINS=https://...            ❌ MANQUANT → seul localhost:3000 autorisé
```

### Template `.env.example` (à créer à la racine)

```env
STRIPE_SECRET_KEY=rk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=3000
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_STORE_DOMAIN=axp150-71.myshopify.com
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/tiraboschi_pos
ALLOWED_ORIGINS=https://tiraboschi-pos.onrender.com,https://tiraboschi-paris.com
```

---

## 5. Bugs actifs — état exact au 2026-06-03

### 🔴 BUG-001 — Syntax error `server.js` ligne 118
```js
// ACTUEL — INVALIDE (le mot "await" ne peut pas être là)
async function await getShopifyHeaders() {

// CORRECT
async function getShopifyHeaders() {
```
**Impact** : Le serveur peut ne pas démarrer du tout selon la version de Node.
**Fix** : Supprimer le mot `await` sur cette ligne.

---

### 🔴 BUG-002 — `MONGO_URI` manquant dans `.env`
**Localisation** : `server.js` lignes 14-23
```js
const mongoClient = new MongoClient(process.env.MONGO_URI); // MONGO_URI = undefined !
```
**Impact** : L'appel `MongoClient(undefined)` lève une exception au démarrage.
**Fix** : Soit ajouter `MONGO_URI` dans `.env`, soit supprimer tout le bloc MongoDB de server.js (si on reste sur JSON en attendant Sprint 1).

---

### 🔴 BUG-003 — Mots de passe en clair dans le code source
**Localisation** : `server.js` lignes 41-44 (dans `readUsersDB()`)
```js
{ id: "USR-1", password: "admin", ... }
{ id: "USR-2", password: "1234", ... }
```
**Impact** : Quiconque lit le code (repo GitHub) voit les mots de passe.
**Fix Sprint 2** : bcrypt + JWT. **Fix immédiat** : sortir ces defaults du code source, les mettre uniquement dans `users_db.json` (qui doit être dans `.gitignore`).

---

### 🟡 BUG-004 — `writeProductsDB` synchrone appelée avec `await`
**Localisation** : `server.js`, multiple endroits (ex : ligne 1386)
```js
await writeProductsDB(db); // writeProductsDB utilise fs.writeFileSync → pas de promise
```
**Impact** : Fonctionne aujourd'hui (await sur non-promise = no-op), mais masquera une vraie async si on refactorise.
**Fix** : Soit rendre `writeProductsDB` async (`fs.writeFile` + promisify), soit supprimer les `await`.

---

### 🟡 BUG-005 — Auth Shopify via `client_credentials` non-standard
**Localisation** : `server.js` lignes 118-145, fonction `getShopifyHeaders()`
```js
body: new URLSearchParams({
    grant_type: 'client_credentials',  // Ce flow n'existe pas dans Shopify standard
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
})
```
**Impact** : L'authentification Shopify peut échouer silencieusement. Toutes les routes `/api/shopify/*` sont à risque.
**Fix** : Remplacer par un token d'accès statique `SHOPIFY_ACCESS_TOKEN` dans `.env`, et utiliser directement :
```js
return { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN, 'Content-Type': 'application/json' };
```

---

### 🟡 BUG-006 — Double-comptage des KPIs ventes
**Localisation** : `server.js`, route `/api/shopify/reports`
**Impact** : Le CA affiché est potentiellement le double du CA réel. Les ventes POS sont pushées vers Shopify ET comptées dans le JSON local.
**Fix** : Utiliser uniquement Shopify comme source de vérité pour le reporting.

---

### 🟡 BUG-007 — Fichiers JSON effacés à chaque redéploiement Render
**Localisation** : `data/products_db.json`, `data/users_db.json`
**Impact** : CRITIQUE en production. Render utilise un filesystem éphémère. Chaque redéploiement efface toutes les données (ventes, stock, variants, users).
**Fix Sprint 1** : Migration complète vers MongoDB Atlas (filesystem persistant).

---

## 6. Ce qui fonctionne — à ne pas casser

Ces fonctionnalités tournent en production. Toute modification doit préserver leur comportement :

| Module | Fonctionnalité | Fichier |
|---|---|---|
| POS | Wizard 5 étapes complet | `public/app.js` |
| Stripe Terminal | Connection token, lecteurs, PaymentIntent create/capture | `server.js`, `public/stripe-tpe.js` |
| Stripe Checkout | Liens de paiement + page `/pay/:id` | `server.js` |
| Taxes | Calcul FR/EU/US via Draft Orders Shopify | `server.js` |
| SKU Engine | `generateSKU()` — format `[MODEL][YY][S]-[MAT][OPT]-[COLOR]` | `server.js` lignes 80-89 |
| Auth | PIN multi-utilisateurs avec permissions par module | `public/auth.js`, `server.js` |
| Shopify Sync | Création commande Shopify à chaque vente POS | `server.js` |
| Webhook | `checkout.session.completed` → sync commande | `server.js` ligne 308 |
| i18n | Dictionnaire FR/EN | `public/app.js` |

---

## 7. Historique des sprints

### ✅ Sprint 0 — Sécurité (réalisé le 2026-05-31, session précédente)

**Fait dans le code :**
- MongoDB URI hardcodée → `process.env.MONGO_URI` ✅
- CORS `app.use(cors())` ouvert → CORS restreint avec `ALLOWED_ORIGINS` ✅
- Webhook sans vérification → `stripe.webhooks.constructEvent` + `express.raw()` ✅
- Structure dossiers créée : `scripts/migrations/`, `seeds/`, `utils/`, `tests/`, `docs/` ✅
- Documentation créée : CONTEXT, STATUS, AUDIT, ROADMAP, AUDIT_FICHIERS ✅
- Script `cleanup_repo.js` rédigé ✅

**Pas encore fait :**
- `cleanup_repo.js` pas encore lancé (à faire) ⬜
- Variables manquantes dans `.env` : MONGO_URI, STRIPE_WEBHOOK_SECRET, ALLOWED_ORIGINS ⬜
- Syntax error ligne 118 non corrigée ⬜
- Shopify auth non corrigée ⬜

---

### 🔴 Sprint 1 — Stabilité des données (À FAIRE — priorité absolue)

**Contexte** : Les fichiers JSON dans `/data/` sont effacés à chaque redéploiement Render. Toutes les données de production sont perdues à chaque deploy. MongoDB Atlas est le seul stockage persistant disponible.

**Tâches :**
- [ ] Ajouter `MONGO_URI` dans `.env` (récupérer l'URI depuis MongoDB Atlas)
- [ ] Créer `scripts/seeds/migrate_json_to_mongo.js` — importe `products_db.json` + `users_db.json` → MongoDB
- [ ] Collections cibles dans MongoDB `tiraboschi_pos` :
  - `variants` ← `products_db.json`.variants
  - `stock` ← `products_db.json`.stock (matières)
  - `sales` ← `products_db.json`.sales
  - `users` ← `users_db.json`.users
  - `config` ← `products_db.json`.config
  - `collections` ← `products_db.json`.collections
- [ ] Remplacer `readProductsDB()` par des appels MongoDB CRUD dans server.js
- [ ] Remplacer `writeProductsDB()` par des appels MongoDB CRUD dans server.js
- [ ] Remplacer `readUsersDB()` / `writeUsersDB()` par des appels MongoDB
- [ ] Supprimer la dépendance aux fichiers JSON locaux pour la data métier
- [ ] Tester : déclencher un redéploiement Render → vérifier que les données survivent
- [ ] Corriger le double-comptage KPIs (route `/api/shopify/reports`)

---

### 🟡 Sprint 2 — Consolidation (après Sprint 1)

- [ ] Hachage bcrypt des mots de passe (`npm install bcrypt`)
- [ ] JWT avec expiry 24h (`npm install jsonwebtoken`)
- [ ] Rate limiting sur `/api/login` : 5 tentatives / 15 min (`npm install express-rate-limit`)
- [ ] Pagination cursor-based Shopify sur `/customers`, `/orders`, `/products`
- [ ] Dédupliquer `renderPosStep5` dans `public/app.js` (~90 lignes dupliquées)
- [ ] Tests Jest sur routes critiques : `POST /api/create_payment_intent`, `POST /api/sales`, `POST /api/stock_movement`

---

### 🟡 Sprint 3-4 — Fonctionnalités manquantes

**UX / Mobile :**
- [ ] Labels bottom nav : `0.55rem` → `0.7rem` (illisibles sur mobile)
- [ ] Touch targets `.small-btn` : `min-height: 44px` (norme iOS/Android)
- [ ] PWA manifest + icône → app installable sur écran d'accueil (indispensable POS mobile)
- [ ] Mode vendeur simplifié 3 onglets pour Chiara/Patti
- [ ] Vérifier `<meta name="viewport">` dans `index.html`

**SKU Engine :**
- [ ] Suffixe séquentiel `-01`/`-02` pour éviter les doublons
- [ ] Codes option sémantiques (`CH`, `ST`, `CR`…) au lieu de numériques (`001`, `002`)
- [ ] Intégrer suffixe `-DDP` dans `generateSKU()` plutôt que dans le frontend
- [ ] Nouveau format : `OL-25H-CU001-CH-NR` avec tiret séparateur MODEL/YEAR
- [ ] Script de mapping ancien → nouveau format (alias Shopify, sans rupture)

**Core features :**
- [ ] Import/Export Excel intégré dans l'UI (scripts dans `scripts/utils/` à exposer)
- [ ] Auto-décrémentation stock à la vente (webhook Stripe → MRP → décrémenter BOM dans MongoDB)
- [ ] Génération PDF facture après paiement confirmé (`pdfkit`)
- [ ] Suivi commissions vendeurs (calcul automatique + rapport par vendeur)

**Matières premières :**
- [ ] Seuils d'alerte configurables par matière (pas seulement à 0)
- [ ] Valorisation stock temps réel (quantité × coût unitaire)
- [ ] Bon de commande fournisseur auto (matières sous seuil → PDF/Excel)
- [ ] Inventaire tournant (comptage physique vs stock théorique)

**Traçabilité luxury :**
- [ ] **Numéro de série unique par pièce** (standard luxury — SAV, anti-contrefaçon, traçabilité)
- [ ] Statuts pièce : En prod → QC → Disponible → Expédiée → Retour
- [ ] Localisation stock : Atelier / Boutique / Stockage / En transit

---

### 🔵 Sprint 5-8 — Évolution long terme

- [ ] Découpage `app.js` en modules ES6 (`pos.js`, `erp.js`, `stock.js`, `crm.js`, `admin.js`)
- [ ] Push PLM → Shopify (créer/MAJ produits depuis fiches techniques ERP)
- [ ] Dashboard analytics avancé (Chart.js, filtres vendeur/événement, export CSV)
- [ ] Gestion Trunk Shows (lieu, date, rapport par événement)
- [ ] Auth JWT avec refresh tokens (remplacer PIN)
- [ ] Mode hors-ligne POS (Service Worker + cache catalogue)
- [ ] Passeport produit PDF (matière + artisan + date + QR Code)
- [ ] Registre SAV par numéro de série
- [ ] Suivi RMA (retours + remboursement Stripe automatique)

---

## 8. Décisions techniques actées

| Date | Décision | Justification |
|---|---|---|
| 2026-05-31 | Migrer vers MongoDB Atlas | JSON effacés à chaque redeploy Render — perte de données en prod |
| 2026-05-31 | Garder Vanilla JS (pas de React) | Performance, simplicité, aucun build step — adapté POS tactile |
| 2026-05-31 | Nouveau format SKU : `OL-25H-CU001-CH-NR` | Lisibilité, unicité garantie, codes option sémantiques |
| 2026-05-31 | Numéro de série unique = priorité P3 | Standard luxury — traçabilité, SAV, anti-contrefaçon |
| 2026-05-31 | Branche `develop` pour tout le travail | `main` = prod intouchable, déploiement Render auto depuis main |
| 2026-06-03 | Conserver Shopify comme source de vérité KPIs | Évite double-comptage et garantit cohérence |

---

## 9. Intégrations — détail technique

### Stripe Terminal
- `POST /api/connection_token` → renvoie un token pour le SDK JS
- `POST /api/create_payment_intent` → crée un PaymentIntent (capture manuelle)
- `POST /api/capture_payment_intent` → capture après présentation carte
- Lecteur S710 (Bluetooth/USB)
- Currencies supportées : EUR, USD

### Stripe Checkout (liens de paiement)
- `POST /api/create_payment_link` → crée une session Checkout Stripe → retourne une URL
- `GET /pay/:id` → page intermédiaire → redirect browser (fix WhatsApp/Instagram WebView)
- `POST /api/webhook` → `checkout.session.completed` → création commande Shopify

### Shopify Admin API v2024-01
- Store : `axp150-71.myshopify.com`
- Auth actuelle : `grant_type=client_credentials` (⚠️ non-standard, à corriger)
- Auth cible : `X-Shopify-Access-Token: process.env.SHOPIFY_ACCESS_TOKEN`
- Opérations : produits, clients, commandes, inventaire, Draft Orders (calcul taxes US/EU), sync ventes POS

### MongoDB Atlas
- Cluster ID : `6a04e0894406869d3a1f4544`
- Database : `tiraboschi_pos`
- État actuel : client connecté dans server.js, **aucune collection utilisée** (tout est en JSON)
- Sprint 1 : migration complète

---

## 10. Conventions de code et de commit

### Commits Git
```
fix:      correction bug
feat:     nouvelle fonctionnalité
refactor: refactoring sans changement de comportement
security: correctif sécurité
data:     migration / gestion données
ux:       amélioration interface utilisateur
chore:    tâche administrative (cleanup, docs, dépendances)
test:     ajout ou modification de tests
```

### Branches Git
```
main        ← PROD (Render déploie automatiquement — ne jamais push direct)
  └── develop           ← branche de travail principale
        ├── feature/sprint-1-mongodb
        ├── feature/sprint-2-auth
        └── feature/sprint-3-ux-sku
```

### Patterns dans le code

**Lecture/écriture DB (à remplacer par MongoDB en Sprint 1) :**
```js
// Lecture
const db = readProductsDB(); // retourne l'objet complet products_db.json

// Écriture
writeProductsDB(db); // écrase le fichier entier (synchrone, pas de verrou)
```

**SKU Engine :**
```js
// server.js lignes 80-89
function generateSKU(variant) {
    const model = (variant.idModel || "AA000").toUpperCase();
    const year  = (variant.idYear || "25");
    const season = (variant.idSeason || "H").toUpperCase();
    const option = String(variant.idOption || "00").padStart(2, "0");
    const mat   = (variant.idMaterialPrimary || "CU000").toUpperCase();
    const color = (variant.idColor || "000");
    return `${model}${year}${season}-${mat}${option}-${color}`;
}
```

---

## 11. Checklist de démarrage (à faire dans l'ordre)

Avant de coder quoi que ce soit :

```bash
# 1. Corriger le syntax error — server.js ligne 118
#    "async function await getShopifyHeaders()" → "async function getShopifyHeaders()"

# 2. Ajouter dans .env :
#    MONGO_URI=mongodb+srv://...
#    STRIPE_WEBHOOK_SECRET=whsec_...
#    ALLOWED_ORIGINS=https://tiraboschi-pos.onrender.com

# 3. Vérifier que le serveur démarre sans erreur
npm start

# 4. Nettoyer le repo
node cleanup_repo.js
rm -rf temp_docx_extract temp_extract

# 5. Committer et pousser
git add -A
git commit -m "chore: cleanup repo + fix syntax error + variables env"
git push origin develop

# 6. Commencer Sprint 1 (migration MongoDB)
```

---

## 12. Scores de qualité (audit 2026-05-31)

| Module | Fonctionnel | Robustesse | Sécurité | Note |
|---|---|---|---|---|
| POS / Caisse | 85% | 60% | 40% | 🟡 Bon mais fragile |
| Stripe Terminal | 90% | 80% | 60% | 🟢 Solide |
| Stripe Checkout | 95% | 80% | 50% | 🟢 Très bien |
| Shopify Sync | 75% | 65% | 70% | 🟡 Correct |
| ERP / PLM | 70% | 60% | 60% | 🟡 Fonctionnel |
| Stock / MRP | 75% | 55% | 60% | 🟡 Fonctionnel |
| CRM | 65% | 70% | 60% | 🟡 Basique |
| Dashboard / KPIs | 50% | 50% | 70% | 🔴 Données fausses |
| Auth / Sécurité | 40% | 50% | 20% | 🔴 À refaire |
| Architecture code | 40% | 40% | — | 🔴 Dette technique |

---

## 13. Fonctionnalités manquantes vs brief initial

| Feature attendue | État | Notes |
|---|---|---|
| PDF facture automatique | ❌ Absent | Scripts `generate_export.js` présents, pas dans l'UI |
| Import/Export Excel UI | ⚠️ Partiel | Scripts dans `scripts/utils/`, à exposer |
| Auto-décrémentation stock | ❌ Absent | Sprint 3 (webhook → MRP) |
| Commissions vendeurs | ⚠️ Partiel | Champ `commission` dans users, pas de calcul |
| QR Code étiquettes | ⚠️ Partiel | Script `sync_chaine.js` non intégré |
| Sync bidirectionelle Shopify | ⚠️ Partiel | Push commandes ✅, push nouveaux produits PLM ❌ |
| Mode hors-ligne POS | ❌ Absent | Service Worker (Sprint 5+) |
| Auth JWT | ❌ Absent | PIN basique seulement |
| Numéro de série par pièce | ❌ Absent | Standard luxury — Sprint 3 |
| Dashboard analytics avancé | ⚠️ Basique | KPI J/S/M OK, pas de graphiques ni filtres |
| Gestion Trunk Shows | ❌ Absent | Sprint 5+ |
| RMA / Retours complets | ⚠️ Partiel | Refund ✅, suivi RMA ❌ |
