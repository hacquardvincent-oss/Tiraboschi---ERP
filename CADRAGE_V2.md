# CADRAGE_V2.md — Tiraboschi POS / ERP — Version 2

> Document de cadrage de la refonte V2.
> Date : 2026-06-03 — Auteur : Vincent Hacquard (hacquard.vincent@gmail.com)
> Statut : **Cadrage validé — décisions d'architecture tranchées (voir §9)**
>
> ⚠️ **Source d'autorité** : `HANDOFF_V2_SCOPING.md` (audit en lecture directe du code V1 le
> 2026-06-03) prime sur les anciens `CONTEXT.md` / `CLAUDE.md` (2026-05-31), partiellement périmés.

---

## 0. TL;DR

La V1 (`tpe-stripe710`, développée via Antigravity/Gemini) est **fonctionnellement riche et
plusieurs correctifs sécurité sont déjà en place**, mais elle reste **structurellement fragile** :
données sur disque éphémère, écritures non atomiques, code monolithique, MongoDB en code mort.

La **V2 est une refonte complète** (clean rebuild) qui :
1. **conserve tout le fonctionnel éprouvé** (POS, Stripe Terminal/Checkout, Shopify, taxes, SKU) ;
2. **règle les risques structurels réels** dès les fondations (persistance fiable + atomique,
   sécurité auth, architecture modulaire typée) ;
3. **intègre nativement le métier événementiel (Trunk Shows)**, cœur du business.

Décisions actées : **Refonte complète** · **Stack TypeScript (Node/Express + React/Vite)** · **Render** ·
**PostgreSQL + Prisma** · **Shopify API montée de version + GraphQL** · **n° de série/traçabilité dès V2** ·
**source de vérité par paliers** (à date : catalogue Shopify + inventaire depuis Drive ; cible : l'app devient master).

---

## 1. Pourquoi une V2

### Ce que fait l'application (à préserver)
App tout-en-un pour la maroquinerie de luxe **Tiraboschi**, orientée **ventes événementielles
(Trunk Shows)**, boutiques FR + ventes US/international :

- **POS / Caisse** — wizard de vente (Modèle → Couleur → Options → Mode d'achat), Stripe Terminal
  S710, bascule devise EUR/USD, taxes : *Sur Place* (TVA 20% EUR / Sales Tax ~8% USD) et *Expédié
  DDP* (port forfaitaire 30€/100$ + duties 9% USA, suffixe SKU `-DDP`), article hors-catalogue à la volée.
- **ERP / PLM** — catalogue visuel par modèle, fiches techniques, SKU engine, BOM (nomenclature matières).
- **Stock / MRP** — réception fournisseur, mouvements entrée/sortie, alertes rupture, étiquettes QR.
- **CRM** — clients via Shopify, RGPD (opt-in email/SMS).
- **Ventes / Reporting** — historique, KPIs jour/semaine/mois, liens de paiement.
- **Admin** — utilisateurs/permissions, config ERP, import/export Excel.

Volumétrie réelle (audit) : **285 variants, 47 matières**, 4 utilisateurs, **41 routes API**.
Design system « **The Blue Sole** » (noir + accent bleu azur `#00D4FF`).

### Bugs « critiques » des anciens docs → DÉJÀ corrigés (vérifié dans le code)
Ne pas les retraiter — ils sont réglés en V1 :
- ✅ Webhook Stripe signé (`stripe.webhooks.constructEvent` + `express.raw()`)
- ✅ `MONGO_URI` lue depuis l'env (plus de hardcode)
- ✅ CORS restreint via whitelist `ALLOWED_ORIGINS`
- ✅ Double-comptage KPI corrigé (`/api/shopify/reports` = Shopify uniquement)

### Les risques structurels RÉELS (vérifiés) — motivent la refonte
| # | Risque | Gravité |
|---|---|---|
| 🔴 1 | **Sécurité : API entièrement ouverte** — 0 middleware d'auth serveur ; `GET /api/users` expose les mots de passe en clair ; auth 100% cosmétique côté navigateur ; backdoor `admin_secours`/`admin` en dur (cf. `AUDIT_V1.md`) | Bloquant |
| 🔴 2 | **Persistance sur disque éphémère Render** — `data/*.json` réécrits localement ; redeploy → perte des données depuis le dernier commit | Bloquant |
| 🔴 3 | **Écritures JSON non atomiques** — `fs.writeFileSync` sans verrou ; 2 ventes simultanées (Trunk Show) → corruption (cause vérifiée des scripts `restore*.js`) | Bloquant |
| 🔴 4 | **MongoDB = code mort** — `getMongoDB()` défini mais jamais appelé → **0 coût de migration pour changer de base** | Majeur |
| 🟠 5 | **`prestart` rejoue des migrations à chaque boot** (`replace_db_v3.js` + `import_inventaire.js`) | À auditer |
| 🟡 6 | **Architecture** — `server.js` 1395 l. + `app.js` 2817 l. monolithiques, non typés, duplication | Dette |
| 🟡 7 | **Pagination Shopify absente** (`limit=250`) → troncature silencieuse quand la base grossit | Dette |
| 🟡 8 | **Auth Shopify `client_credentials`** (flow non-standard, conservé volontairement) → à reconfirmer | Surveiller |

---

## 2. Vision V2

> **Même produit, socle fiable et transactionnel.** On réimplémente le fonctionnel éprouvé sur des
> fondations saines, typées, testées — avec une base de données qui garantit persistance ET intégrité
> en écritures concurrentes (indispensable en Trunk Show multi-vendeurs).

Principes directeurs :
1. **Données persistantes + transactionnelles** — fin de l'éphémère ET de la corruption concurrente.
2. **Sécurité native** — secrets hors code, mots de passe hachés, sessions JWT, rate-limit.
3. **Code lisible et modulaire typé** — un nouveau venu comprend en < 1h.
4. **Tests sur les zones à risque** — taxes, SKU, paiements, mouvements de stock.
5. **Mobile-first + événementiel** — POS de boutique ET de Trunk Show, sur tablette.

---

## 3. Stack technique cible

| Couche | Choix V2 | Justification |
|---|---|---|
| Langage | **TypeScript** (back + front) | Domaine complexe (SKU, BOM, taxes, devises) → typage = filet |
| Backend | **Node 20 + Express** | Continuité V1, écosystème connu |
| **Base de données** | **PostgreSQL + Prisma** ✅ | Domaine relationnel (BOM, ledger stock, ventes, séries) + transactions = intégrité concurrente. Mongo étant du code mort, aucun coût à abandonner |
| Validation | **Zod** | Validation entrées API + inférence de types |
| Auth | **bcrypt + JWT + express-rate-limit** | Règle la dette sécurité |
| Frontend | **React 18 + Vite** | Composants → fin du monolithe ; build/HMR instantané |
| État serveur | **TanStack Query** | Cache, retry, sync Stripe/Shopify propres |
| UI | **Tailwind CSS** | Reprise du DS « The Blue Sole », touch targets ≥44px |
| Mobile | **PWA (`vite-plugin-pwa`)** | Installable tablette + cache hors-ligne (Trunk Show) |
| Tests | **Vitest + Playwright** | Unitaire (taxes/SKU) + e2e (wizard POS) |
| Qualité | **ESLint + Prettier** | Cohérence de code |
| Infra | **Render + base managée persistante** | On garde Render qui fonctionne |

> **Pourquoi Postgres et pas Mongo** : Mongo était **du code mort** en V1 → pas de sunk cost. Le
> domaine ERP est **relationnel** (BOM, mouvements de stock = ledger, ventes, numéros de série) et
> exige des **transactions** (Trunk Show concurrent) — Postgres + Prisma (typé, pairé avec TypeScript)
> est le meilleur socle. Base managée persistante (Render Postgres ou Neon).

### Modèle de données cible (entités)
`products`/`variants` · `materials` + `stock_movements` (ledger) · `boms` (variant ↔ matières) ·
`sales` · `serials` (numéro de série pièce — nouveau) · `users` · `events` (Trunk Shows — nouveau) ·
`config` (dictionnaires ERP : models, years, seasons, options, colors, suppliers, hsCodes, ateliers…).

### Arborescence cible (proposition)
```
tiraboschi-erp/
├── api/                      # Backend Express + TS
│   ├── src/
│   │   ├── routes/           # pos, payments, shopify, stock, crm, admin, auth, events
│   │   ├── services/         # logique métier (tax, sku, shopifyClient, stripe)
│   │   ├── db/               # Prisma schema + migrations
│   │   ├── middleware/       # auth JWT, rateLimit, validation Zod
│   │   └── server.ts
│   └── tests/
├── web/                      # Frontend React + Vite + TS
│   ├── src/
│   │   ├── modules/          # pos/ erp/ stock/ crm/ ventes/ admin/ events/
│   │   ├── components/       # UI partagée (DS The Blue Sole)
│   │   ├── lib/              # api client, i18n FR/EN, auth
│   │   └── main.tsx
│   └── tests/
├── legacy-v1/                # (optionnel) snapshot V1 en référence lecture seule
├── .env.example
└── README.md
```

---

## 4. Périmètre V2

### Source de vérité — stratégie par paliers (décision actée)
La V2 doit être **conçue dès le départ pour que l'app devienne, à terme, le master** — mais en
livrant par paliers pour ne pas tout bloquer :

| Palier | Catalogue / produits | Inventaire (matières + pièces) | Master |
|---|---|---|---|
| **V2 — démarrage** | importé de **Shopify** | importé d'un **inventaire sur Google Drive** (one-shot + resync) | Shopify (lecture) |
| **V2 — cible** | **créés dans l'app** (PLM) → push Shopify | **gérés dans l'app** (matières & pièces) → push Shopify | **l'app** |

→ Conséquence d'architecture : la couche Shopify est encapsulée dans un **service de sync
bidirectionnel** (un sens d'abord : Shopify→app ; l'autre sens activable sans refonte). Le modèle de
données local est la **référence canonique** dès le départ, Shopify n'est qu'une projection.
Une **intégration Google Drive** (MCP disponible) sert d'import initial de l'inventaire.

### Dans le périmètre (refonte du fonctionnel V1)
POS wizard + Stripe Terminal S710 · liens Checkout + page `/pay/:id` (workaround WebView) ·
taxes FR/EU/US (Draft Orders Shopify pour DDP) · SKU engine (avec incrément séquentiel `-01/-02`
**manquant en V1**) · catalogue/fiches/BOM · stock + mouvements + alertes · CRM Shopify + RGPD ·
historique ventes + KPIs (source unique Shopify) · admin users/config · import/export Excel ·
auth bcrypt + JWT · i18n FR/EN.

### Nouveautés V2
- **Événements / Trunk Shows** (lieu, date, vendeurs, rapport par événement) — cœur métier
- **Numéro de série unique par pièce + statuts/traçabilité** (standard luxe) — acté en V2
- **Montée de version Shopify API** (2024-01 → récente) + **passage GraphQL** — acté en V2
- **Import inventaire depuis Google Drive** (matières + pièces) — palier de démarrage
- Auto-décrémentation stock à la vente (vente → décrément BOM)
- PDF facture automatique après paiement
- Dashboard analytics (graphiques, filtres vendeur/événement)
- PWA installable + mode hors-ligne POS
- Sync Shopify encapsulée dans un service bidirectionnel (sens app→Shopify activable au palier cible)

### Hors périmètre / backlog
- Passeport produit QR, suivi RMA complet, commissions vendeurs avancées

### Migration des données V1
- **Backup impératif** des `data/*.json` actuels + de l'inventaire Drive avant tout.
- Scripts d'import **one-shot** (JSON V1 + Drive → Postgres), jamais en `prestart` récurrent.

---

## 5. Suivi de projet & roadmap

### État au 2026-06-06 (avancement réel)
**Fait :**
- ✅ Cadrage + audit V1 (`AUDIT_V1.md`, docs d'autorité, repo réorganisé, `legacy-v1/` figé)
- ✅ **Backend V2** scaffolding (Express + TS) **déployé sur Render** (`api/`, health checks)
- ✅ **App perso Shopify** (flux `client_credentials`, scopes `write_orders`) — domaine corrigé `axp150-71.myshopify.com`
- ✅ **Outil de récupération** (page `/recovery`, `orderCreate` exact) → **commande #1057 récupérée** (taxe US réelle, 732,71 $)
- ✅ **Watchdog réconciliation** Stripe ↔ Shopify (multi-comptes FR/US, page `/reconciliation`, check périodique → alerte logs)

**À finaliser pour clore la stabilisation sync (reporté) :**
- [ ] Renseigner les clés Stripe `STRIPE_API_KEY_FR` / `_US` (lecture) dans Render → watchdog *live*
- [ ] Alerte **réelle** (email/Slack) au lieu des logs
- [ ] **Auth JWT** + rate-limit (remplacer la garde provisoire `RECOVERY_KEY`)

> Provisoires à retirer en V2 : pages `/recovery` et `/reconciliation` gardées par `RECOVERY_KEY`.

### Priorités suivantes (ordre voulu)

**P1 — Finaliser la stabilisation des enregistrements de commande Shopify** *(plus tard)*
- [ ] Watchdog : alerte email/Slack + planification fiable
- [ ] **Écriture fiable** : pattern **outbox** (vente → file de sync, en transaction) + **idempotence** (clé PaymentIntent) + **retries** + **statut de sync par vente** (fin de l'échec silencieux) — se branche avec le POS V2
- [ ] Auth JWT

**P2 — Reprise des anomalies fonctionnelles (dette V1)**
- [ ] **Bugs d'affichage** : récap POS, alertes stock, noms de couleurs, groupement catalogue (cf. `legacy-v1/HISTORY_PROBLEMS.md`)
- [ ] **Code mort** : MongoDB, fallbacks dupliqués, scripts hotfix — éliminés à la refonte
- [ ] **Appels inutiles** : `prestart` rejouant des migrations, pagination Shopify absente, `await` sur fonctions sync
- [ ] **Bug conversion EUR/USD** au POS (cf. `AUDIT_V1.md` §2 — surfacturation constatée)

**P3 — Expérience client**
- [ ] **POS V2 (caisse)** : wizard, Stripe Terminal S710, liens de paiement + `/pay/:id` (réimplémentation propre)
- [ ] UX mobile (touch targets ≥44px, navigation), **PWA** installable + hors-ligne
- [ ] PDF facture, reçus, parcours de paiement soigné

**P4 — Brique ERP (chantier majeur) : Approvisionnement → Production → Préparation**

*Fait de l'app le master de l'inventaire (matières ET pièces). Modèle relationnel Postgres adapté.*

Référentiels :
- [ ] **Matières** : codification / **ID matières**, fiche matière, coût unitaire
- [ ] **Fournisseurs matières** & **Ateliers de production** (référentiels + conditions)

Approvisionnement & inventaire matières :
- [ ] **Bon de commande** fournisseur (PO)
- [ ] **Bon de réception** matières → **arrivée entrepôt** (entrée en stock)
- [ ] **Pilotage inventaire** matières : niveaux, seuils d'alerte, **valorisation comptable des achats** (qté × coût)
- [ ] **Mouvements de stock** (ledger transactionnel) :
  - entrée entrepôt
  - **sortie de stock exceptionnelle** (casse, perte, échantillon)
  - **sortie de stock vers ateliers** + **matières en transit** vers l'atelier
  - retours / réintégrations

Production :
- [ ] **Ordre de production** vers les ateliers, **déclenché par les commandes clients** (MRP léger : commande → besoin pièce → OP → consommation BOM)
- [ ] Suivi des matières consommées / en transit atelier
- [ ] **Bon de réception des pièces produites** (entrée pièces finies + **n° de série** par pièce)

Préparation / fulfillment :
- [ ] **Suivi des commandes à préparer** (pièce disponible → commande prête → expédition)

**P5 — Métier événementiel & analytics** (rappel)
- [ ] Objet **Trunk Show** (lieu, date, vendeurs, rapport par événement)
- [ ] CRM Shopify + RGPD · KPIs (source unique Shopify) · dashboard analytics
- [ ] Bascule **app → Shopify** (création produits PLM + push inventaires) — palier master

### Entités ERP cibles (Prisma) — pour la P4
`Material` (ID matière) · `Supplier` · `Workshop` (atelier) · `PurchaseOrder` + `PurchaseOrderLine` ·
`GoodsReceipt` (matières) · `StockMovement` (ledger : entrée/sortie exceptionnelle/sortie atelier/transit/retour) ·
`ProductionOrder` (lié `Order`/commande client + `BOM`) · `FinishedPieceReceipt` (+ `Serial`) ·
`FulfillmentTask` (commandes à préparer).

---

## 6. Intégrations (référence)

### Stripe Terminal S710 — 🟢 solide en V1
`connection_token`, `locations`, `readers`, PaymentIntent create/capture. EUR + USD.

### Stripe Checkout (liens) — 🟢 très bien en V1
`create_payment_link` + `/pay/:id` (contourne WebView WhatsApp/Instagram) + webhook **signé**.

### Shopify Admin API — 🟡 v2024-01 → **à moderniser en V2**
Store `axp150-71.myshopify.com` · Auth via `client_credentials` (à reconfirmer/sécuriser) ·
Commandes/clients/inventaire/Draft Orders (taxes US) · **manque pagination cursor** (`limit=250`).
**V2 actée** : montée de version récente + **GraphQL** + pagination cursor, encapsulé dans un service de sync.
**Auth V2** : app personnalisée Shopify dédiée avec **token offline `write_orders`** (remplace le `client_credentials` V1, fragile).
**Fiabilité de la sync (exigence, suite à incident prod du 04/06/2026)** : la création de commande à la vente
ne doit **jamais** échouer en silence. → **outbox persistante + retries automatiques + statut de sync visible
par vente** (« non synchronisée » au lieu d'un `console.error` avalé) + **écran/outil de réconciliation**
Stripe ↔ Shopify. Incident V1 : token Shopify HS depuis ~le 28/05 → toutes les ventes encaissées non
poussées dans Shopify, sans alerte.

### Google Drive — import inventaire
Inventaire matières + pièces stocké sur Drive → import one-shot + resync en V2 (intégration MCP disponible).

---

## 7. Utilisateurs
USR-1 Vincent Hacquard (admin) · USR-2 Laurène Mauro (admin) · USR-CHIARA Chiara (caisse+ventes) ·
USR-PATTI Patti (caisse+ventes). **V2 : mots de passe hachés (bcrypt), jamais en clair.**

---

## 8. Conventions
**Commits** : `fix:` `feat:` `refactor:` `security:` `data:` `ux:` `chore:` `test:`
**Branches** : `main` (prod Render, intouchable) ← `develop` ← `feature/*`. Jamais de push direct sur `main`.

---

## 9. Décisions actées
| Date | Décision | Justification |
|---|---|---|
| 2026-06-03 | Refonte complète (clean rebuild) | Dette V1 trop lourde pour refactoring |
| 2026-06-03 | TypeScript back + front | Domaine ERP complexe → typage = sécurité |
| 2026-06-03 | React + Vite (abandon Vanilla JS) | Le monolithe `app.js` était le vrai problème |
| 2026-06-03 | Tailwind + PWA, reprise DS « The Blue Sole » | POS tactile mobile-first / événementiel |
| 2026-06-03 | **PostgreSQL + Prisma** | Domaine relationnel + transactions ; Mongo = code mort (0 sunk cost) |
| 2026-06-03 | Shopify = source unique KPIs | Déjà en place en V1, à conserver |
| 2026-06-03 | Trunk Shows = objet de 1ʳᵉ classe | Cœur métier événementiel |
| 2026-06-03 | **Source de vérité par paliers** | Démarrage : catalogue Shopify + inventaire Drive ; cible : l'app master (modèle local canonique dès le départ) |
| 2026-06-03 | **Shopify API montée de version + GraphQL en V2** | Éviter la dette ; sync encapsulée dans un service |
| 2026-06-03 | **N° de série / traçabilité pièce dès la V2** | Standard luxe (SAV, anti-contrefaçon) |

> Toutes les décisions de cadrage structurantes sont tranchées. Les arbitrages restants seront pris
> à l'implémentation (ex. Render Postgres vs Neon, schéma de sync Drive).

---

## 10. Prochaine étape
1. Récupérer le code V1 en référence (snapshot `legacy-v1/` dans ce repo — voir reco précédente),
   pour extraire la logique métier exacte (formules taxes, `generateSKU`, payloads Shopify, `/pay/:id`).
2. Localiser l'inventaire sur Google Drive (je peux le lire via MCP) pour cadrer le script d'import.
3. Démarrer le **scaffolding Phase 0**.
