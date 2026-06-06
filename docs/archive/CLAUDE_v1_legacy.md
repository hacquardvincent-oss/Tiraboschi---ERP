# CLAUDE.md — Tiraboschi POS / ERP
> **Charger ce fichier EN PREMIER à chaque nouvelle session Claude Code.**
> Dernière mise à jour : 2026-06-03

---

## Liens essentiels

| Ressource | URL |
|---|---|
| GitHub | https://github.com/hacquardvincent-oss/tpe-stripe710 |
| Branche de travail | `develop` |
| Branche prod | `main` (Render déploie depuis ici — ne jamais pousser directement) |
| Render | https://dashboard.render.com/web/srv-d7s56777f7vs73ddhumg |
| MongoDB Atlas | https://cloud.mongodb.com/v2/6a04e0894406869d3a1f4544 |

---

## Stack technique

| Couche | Techno | Fichier principal |
|---|---|---|
| Backend | Node.js + Express | `server.js` (1395 lignes) |
| Frontend | Vanilla JS SPA | `public/app.js` (~2800 lignes) |
| Base de données active | Fichiers JSON locaux | `data/products_db.json`, `data/users_db.json` |
| Paiement terminal | Stripe Terminal S710 | `public/stripe-tpe.js` |
| Paiement lien | Stripe Checkout | routes `/api/create_payment_link`, `/pay/:id` |
| E-commerce | Shopify Admin API 2024-01 | routes `/api/shopify/*` |
| Auth | PIN en clair (à sécuriser) | `public/auth.js` + `server.js` |
| i18n | Dictionnaire FR/EN embarqué | `public/app.js` |
| MongoDB | Connecté mais **non utilisé** en prod | `server.js` lignes 12-23 |

---

## Ce que fait l'application

App tout-en-un pour la maroquinerie de luxe Tiraboschi (boutiques en France, ventes US/international) :

1. **POS (Caisse)** — Wizard 5 étapes (Modèle → Matière → Option → Couleur → Validation), Stripe Terminal S710, calcul taxes FR/EU/US, mode DDP expédié, liens de paiement WhatsApp/Instagram-friendly
2. **ERP/PLM** — Catalogue produits, fiches techniques, SKU engine, BOM (nomenclature matières)
3. **Stock (MRP)** — Gestion matières (peaux, bijoux), mouvements entrée/sortie, alertes rupture
4. **CRM** — Base clients via Shopify, conformité RGPD
5. **Ventes** — Historique, reporting KPI (jour/semaine/mois), liens de paiement Stripe
6. **Admin** — Gestion utilisateurs, config ERP, import/export Excel

---

## Utilisateurs

| ID | Nom | Rôle | Password actuel (en clair !) |
|---|---|---|---|
| USR-1 | Vincent Hacquard | admin | `admin` |
| USR-2 | Laurène Mauro | admin | `1234` |
| USR-CHIARA | Chiara | user | `1234` |
| USR-PATTI | Patti | user | `1234` |

---

## Fichiers clés — cartographie complète

```
stripe-terminal-app/
├── server.js                    ← Backend principal (toutes les routes API)
├── package.json                 ← Dépendances : express, stripe, mongodb, axios, xlsx, puppeteer, mammoth
├── .env                         ← Variables d'environnement (voir section Variables d'env)
├── cleanup_repo.js              ← Script de réorganisation du repo (à lancer puis supprimer)
├── CLAUDE.md                    ← CE FICHIER
├── SPECIFICATIONS_FONCTIONNELLES.md ← Brief complet du projet
│
├── public/                      ← Frontend SPA
│   ├── index.html               ← Structure HTML unique
│   ├── app.js                   ← Logique frontend (~2800 lignes, monolithique)
│   ├── auth.js                  ← Authentification côté client
│   ├── stripe-tpe.js            ← SDK Stripe Terminal
│   └── logo.png
│
├── data/                        ← Données en production (JSON flat-files)
│   ├── products_db.json         ← FICHIER PRINCIPAL : variants, stock, ventes, config, collections
│   ├── users_db.json            ← Utilisateurs
│   ├── erp_db.json              ← Données ERP legacy (référence pour migration)
│   └── erp_db_backup_05052026.json ← Backup (à conserver)
│
├── scripts/
│   ├── migrations/              ← ~80 scripts fix/patch/restore déjà exécutés (archivé, ne plus toucher)
│   ├── seeds/                   ← seed_erp.js, init_materials.js (initialisation)
│   └── utils/                   ← Outils réutilisables (generate_export, sync_prices, etc.)
│
├── tests/                       ← test_tax.js, test_shopify.js, test_sku_price.js, test_app.js
│
├── docs/                        ← sku_mapping.md, sku_mapping_output.md
│
├── SPECIFICATIONS ET RECETTE/   ← Documentation fonctionnelle (specs, cahier de recette)
│
└── projet-tiraboschi-pos/       ← Documentation de sessions précédentes (CONTEXTE UTILE)
    ├── CONTEXT.md               ← Contexte détaillé (référence)
    ├── STATUS.md                ← Backlog complet et état des sprints
    ├── AUDIT.md                 ← Audit technique complet avec scores par module
    ├── AUDIT_FICHIERS.md        ← Plan de nettoyage des fichiers
    ├── ROADMAP.md               ← Roadmap détaillée sprint par sprint
    └── specs/
        └── analyse-ux-sku-inventaire.md
```

> **Note** : `temp_docx_extract/` et `temp_extract/` sont des résidus d'un outil IA externe — à supprimer.

---

## Variables d'environnement — État actuel

### `.env` actuellement configuré

```env
STRIPE_SECRET_KEY=rk_live_...     ✅ présent
STRIPE_PUBLISHABLE_KEY=pk_live_... ✅ présent
PORT=3000                          ✅ présent
SHOPIFY_CLIENT_ID=...              ✅ présent
SHOPIFY_CLIENT_SECRET=...          ✅ présent
SHOPIFY_STORE_DOMAIN=axp150-71.myshopify.com  ✅ présent
```

### Variables MANQUANTES (le serveur est probablement en erreur sans elles)

```env
MONGO_URI=                   ← MANQUANT → MongoClient crash au démarrage
STRIPE_WEBHOOK_SECRET=       ← MANQUANT → webhooks rejetés
ALLOWED_ORIGINS=             ← MANQUANT → seul localhost:3000 autorisé (défaut)
```

### `.env.example` à créer (si pas encore fait)

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

## Bugs actifs dans le code (à corriger en priorité)

### 🔴 BUG 1 — Syntax error server.js ligne 118
```js
// ACTUEL (syntax error !)
async function await getShopifyHeaders() {

// CORRECT
async function getShopifyHeaders() {
```

### 🔴 BUG 2 — MONGO_URI manquant dans .env
`MongoClient` est instancié ligne 14 avec `process.env.MONGO_URI` qui vaut `undefined`.
Le serveur lance une connexion vers `undefined` → crash ou erreur silencieuse au démarrage.
**Fix** : soit ajouter `MONGO_URI` dans `.env`, soit supprimer le bloc MongoDB (recommandé si on reste sur JSON).

### 🔴 BUG 3 — Mots de passe en clair dans le code
`readUsersDB()` (lignes 41-44) contient les mots de passe hardcodés dans le code source.
Ils apparaissent aussi dans `data/users_db.json`.
**Fix** : Hachage bcrypt (Sprint 2), mais d'ici là au minimum sortir les defaults du code source.

### 🟡 BUG 4 — `writeProductsDB` est synchrone mais appelée avec `await`
`writeProductsDB()` utilise `fs.writeFileSync` (synchrone) mais certains appels font `await writeProductsDB(db)`.
Ça fonctionne mais c'est incohérent — risque de masquer une vraie async future.

### 🟡 BUG 5 — Shopify auth `client_credentials` non-standard
`getShopifyHeaders()` utilise `grant_type=client_credentials` sur l'endpoint OAuth Shopify.
Ce flow n'existe pas dans Shopify standard. Il faut utiliser un token statique `SHOPIFY_ACCESS_TOKEN`.
**Fix** : Remplacer par `'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN`.

### 🟡 BUG 6 — Double-comptage KPIs
La route `/api/shopify/reports` agrège les ventes Shopify + les ventes locales JSON.
Or chaque vente POS est **déjà pushée vers Shopify** → comptage double.
**Fix** : Utiliser uniquement Shopify comme source de vérité.

---

## État des sprints (au 2026-06-03)

### ✅ Sprint 0 — Sécurité (RÉALISÉ dans le code)
- [x] MongoDB URI → `process.env.MONGO_URI` (mais MONGO_URI manquant dans .env !)
- [x] CORS restreint via `ALLOWED_ORIGINS` (mais variable manquante dans .env)
- [x] Webhook Stripe → `stripe.webhooks.constructEvent` + `express.raw()` ajouté
- [x] Structure folders créée : `scripts/migrations/`, `scripts/seeds/`, `scripts/utils/`, `tests/`, `docs/`
- [x] Documentation créée : CONTEXT, STATUS, AUDIT, ROADMAP, AUDIT_FICHIERS
- [ ] **`cleanup_repo.js` à lancer** → `node cleanup_repo.js` (script prêt, pas encore exécuté)
- [ ] MONGO_URI + STRIPE_WEBHOOK_SECRET + ALLOWED_ORIGINS → à ajouter dans `.env`
- [ ] Syntax error ligne 118 → à corriger
- [ ] Shopify auth → à corriger (client_credentials → SHOPIFY_ACCESS_TOKEN)

### 🔴 Sprint 1 — Stabilité données (PROCHAIN)
**Objectif : zéro perte de données au redéploiement Render**

Les fichiers JSON dans `/data/` sont **effacés à chaque redéploiement Render** (système de fichiers éphémère).
MongoDB Atlas persiste indépendamment → c'est la solution.

- [ ] Créer script `scripts/seeds/migrate_json_to_mongo.js` — importer products_db.json et users_db.json dans MongoDB
- [ ] Remplacer `readProductsDB()`/`writeProductsDB()` par des opérations MongoDB dans server.js
- [ ] Remplacer `readUsersDB()`/`writeUsersDB()` par des opérations MongoDB
- [ ] Supprimer la dépendance aux fichiers JSON pour la data métier
- [ ] Tester : redéploiement Render → données persistées ✅
- [ ] Fix KPIs double-comptage (route `/api/shopify/reports`)

### 🟡 Sprint 2 — Consolidation (après Sprint 1)
- [ ] Hachage bcrypt des mots de passe + JWT avec expiry 24h
- [ ] Rate limiting sur `/api/login` (5 tentatives / 15 min) — utiliser `express-rate-limit`
- [ ] Pagination cursor Shopify sur `/customers`, `/orders`, `/products`
- [ ] Dédupliquer `renderPosStep5` dans app.js (~90 lignes en doublon)
- [ ] Tests Jest sur routes critiques : `create_payment_intent`, `POST /api/sales`, `POST /api/stock_movement`

### 🟡 Sprint 3-4 — Fonctionnalités manquantes
- [ ] Import/Export Excel via UI (scripts existants dans `scripts/utils/` à exposer)
- [ ] Auto-décrémentation stock à la vente (webhook Stripe → décrémenter BOM dans MongoDB)
- [ ] PDF facture après paiement (`pdfkit`)
- [ ] Fix UX mobile : labels bottom nav trop petits (`0.55rem` → `0.7rem`), touch targets `.small-btn` → `min-height: 44px`
- [ ] PWA manifest + icône (installable sur écran d'accueil — indispensable POS mobile)
- [ ] Mode vendeur simplifié 3 onglets pour Chiara/Patti
- [ ] Numéro de série unique par pièce (luxury, traçabilité)

### 🔵 Sprint 5-8 — Évolution long terme
- [ ] Découpage app.js en modules ES6 (`pos.js`, `erp.js`, `stock.js`, `crm.js`)
- [ ] Push PLM → Shopify (créer/MAJ produits depuis fiches techniques)
- [ ] Dashboard analytics avancé (Chart.js, filtres vendeur/événement)
- [ ] Gestion Trunk Shows (lieu, date, rapport par événement)
- [ ] Auth JWT avec refresh tokens
- [ ] Mode hors-ligne POS (Service Worker)

---

## Décisions techniques prises

| Date | Décision | Raison |
|---|---|---|
| 2026-05-31 | Migrer vers MongoDB (pas rester sur JSON) | JSON locaux effacés à chaque redeploy Render |
| 2026-05-31 | Garder Vanilla JS (ne pas migrer React) | Performances, simplicité, aucun build step — adapté POS |
| 2026-05-31 | Nouveau format SKU : `OL-25H-CU001-CH-NR` | Lisibilité, unicité, codes option sémantiques |
| 2026-05-31 | Numéro de série par pièce = P3 prioritaire | Standard luxury. Traçabilité, SAV, anti-contrefaçon |
| 2026-05-31 | Branche `develop` = tout le travail | `main` = prod intouchable jusqu'à validation |

---

## Intégrations

### Stripe Terminal
- Endpoint `POST /api/connection_token` → SDK Stripe Terminal JS
- Endpoint `POST /api/create_payment_intent` + `POST /api/capture_payment_intent`
- Lecteur : S710 (bluetooth/USB)
- Currencies : EUR et USD

### Stripe Checkout (liens de paiement)
- Endpoint `POST /api/create_payment_link` → retourne une URL
- Page intermédiaire `/pay/:id` → redirect vers Safari/Chrome (fix WhatsApp/Instagram)
- Webhook `POST /api/webhook` → `checkout.session.completed` → sync commande Shopify

### Shopify Admin API v2024-01
- Domain : `axp150-71.myshopify.com`
- Auth : SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET via `client_credentials` (⚠️ non-standard — à corriger)
- Opérations : produits, clients, commandes, inventaire, Draft Orders (calcul taxes US), sync ventes POS

### MongoDB Atlas
- Cluster : `6a04e0894406869d3a1f4544`
- DB : `tiraboschi_pos`
- État : connecté mais **non utilisé** pour les données métier (Sprint 1 corrige ça)

---

## Workflow git

```
main        ← prod (Render déploie depuis ici — ne jamais pousser directement)
  └── develop  ← branche de travail principale
        └── feature/sprint-1-mongodb
        └── feature/sprint-2-auth
        └── feature/sprint-3-ux-sku
```

### Convention de commits
```
fix:       correction bug
feat:      nouvelle fonctionnalité
refactor:  refactoring sans changement comportement
security:  correctif sécurité
data:      migration données
ux:        amélioration interface
chore:     tâche administrative (cleanup, docs)
test:      ajout/modification tests
```

---

## Ce qui est à faire en PREMIER (résumé exécutif)

Avant de commencer du code, exécuter dans l'ordre :

1. **Corriger le syntax error** dans `server.js` ligne 118 : `async function await` → `async function`
2. **Ajouter les variables manquantes** dans `.env` : `MONGO_URI`, `STRIPE_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`
3. **Vérifier que le serveur démarre** : `npm start` sans erreur
4. **Lancer `node cleanup_repo.js`** → nettoyage repo, puis `git push origin develop`
5. **Supprimer les dossiers résiduels** : `temp_docx_extract/`, `temp_extract/`
6. **Commencer Sprint 1** : migration MongoDB

---

## Modules à NE PAS casser

Ces fonctionnalités fonctionnent en production. Ne pas les régresser :

- **POS Wizard 5 étapes** — flux de vente complet
- **Stripe Terminal S710** — connexion, lecteurs, PaymentIntent
- **Liens de paiement** + page `/pay/:id` — workaround WhatsApp/Instagram
- **Calcul taxes** FR/EU/US (DDP via Draft Orders Shopify)
- **SKU Engine** — `generateSKU()` dans server.js
- **Historique ventes** + KPIs (même si données partiellement fausses)
- **Auth PIN** multi-utilisateurs avec permissions par module

---

## Scores actuels (audit 2026-05-31)

| Module | Fonctionnel | Robustesse | Sécurité |
|---|---|---|---|
| POS / Caisse | 85% | 60% | 40% |
| Stripe Terminal | 90% | 80% | 60% |
| Stripe Checkout | 95% | 80% | 50% |
| Shopify Sync | 75% | 65% | 70% |
| ERP / PLM | 70% | 60% | 60% |
| Stock / MRP | 75% | 55% | 60% |
| CRM | 65% | 70% | 60% |
| Dashboard / KPIs | 50% | 50% | 70% |
| Auth / Sécurité | 40% | 50% | 20% |
| Architecture code | 40% | 40% | — |
