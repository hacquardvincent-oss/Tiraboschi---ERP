# CADRAGE_V2.md — Tiraboschi POS / ERP — Version 2

> Document de cadrage de la refonte V2.
> Date : 2026-06-03 — Auteur : Vincent Hacquard (hacquard.vincent@gmail.com)
> Statut : **Cadrage validé — en attente d'accès au code V1 pour démarrer**

---

## 0. TL;DR

La V1 (`tpe-stripe710`, développée par Antigravity) est **fonctionnellement riche mais
techniquement fragile** : données effacées à chaque déploiement, sécurité quasi
inexistante, code monolithique non maintenable.

La **V2 est une refonte complète** (clean rebuild) qui :
1. **conserve tout le fonctionnel qui marche** (POS, Stripe, Shopify, taxes, SKU) ;
2. **règle les 3 dettes critiques** dès les fondations (persistance, sécurité, architecture) ;
3. **repart sur une stack moderne typée** pour permettre une reprise et une évolution sereines.

Décisions actées : **Refonte complète** · **Stack TypeScript (Node/Express + React/Vite)** ·
**MongoDB Atlas** · **Render** · code V1 à ajouter au scope de session pour migration de la logique métier.

---

## 1. Pourquoi une V2

### Ce que fait l'application (à préserver)
App tout-en-un pour la maroquinerie de luxe Tiraboschi (boutiques FR, ventes US/international) :

- **POS / Caisse** — wizard 5 étapes (Modèle → Matière → Option → Couleur → Validation),
  Stripe Terminal S710, taxes FR/EU/US, mode DDP expédié, liens de paiement WhatsApp/Instagram.
- **ERP / PLM** — catalogue, fiches techniques, SKU engine, BOM (nomenclature matières).
- **Stock / MRP** — matières (peaux, bijoux), mouvements, alertes rupture.
- **CRM** — clients via Shopify, conformité RGPD.
- **Ventes / Reporting** — historique, KPIs jour/semaine/mois.
- **Admin** — utilisateurs, config ERP, import/export Excel.

### Les 3 dettes critiques de la V1 (motivent la refonte)

| # | Dette | Symptôme | Score audit |
|---|---|---|---|
| 🔴 1 | **Persistance** | Fichiers JSON dans `/data/` effacés à chaque redeploy Render (FS éphémère) → perte de ventes, stock, users en prod | — |
| 🔴 2 | **Sécurité** | Mots de passe en clair (code + JSON), PIN, pas de hash/JWT, CORS/webhook fragiles | Auth 20% |
| 🔴 3 | **Architecture** | `server.js` 1395 lignes + `app.js` 2800 lignes monolithiques, non typés | Archi 40% |

### Bugs ponctuels hérités (à ne pas reproduire)
- Syntax error `server.js:118` (`async function await`)
- Auth Shopify via `client_credentials` (flow inexistant) → doit être `X-Shopify-Access-Token`
- Double-comptage KPIs (ventes locales + Shopify)
- `writeProductsDB` synchrone appelée avec `await`

---

## 2. Vision V2

> **Même produit, socle fiable.** On ne jette pas le fonctionnel éprouvé ;
> on le réimplémente sur des fondations saines, typées et testées.

Principes directeurs :
1. **Données persistantes par défaut** — plus jamais de perte au déploiement.
2. **Sécurité native** — secrets hors code, mots de passe hachés, sessions JWT.
3. **Code lisible et modulaire** — un nouveau venu (humain ou IA) comprend en < 1h.
4. **Tests sur les zones à risque** — taxes, SKU, paiements, stock.
5. **Mobile-first** — c'est un POS de boutique, utilisé sur tablette/téléphone.

---

## 3. Stack technique cible

| Couche | Choix V2 | Justification |
|---|---|---|
| Langage | **TypeScript** (back + front) | Domaine complexe (SKU, BOM, taxes, devises) → typage = filet de sécurité |
| Backend | **Node 20 + Express** | Continuité V1, écosystème connu |
| ODM / DB | **Mongoose + MongoDB Atlas** | Schémas explicites, persistance garantie |
| Validation | **Zod** | Validation des entrées API + inférence de types |
| Auth | **bcrypt + JWT + express-rate-limit** | Règle la dette sécurité |
| Frontend | **React 18 + Vite** | Composants → fin du monolithe ; build/HMR instantané |
| État serveur | **TanStack Query** | Cache, retry, sync Stripe/Shopify propres |
| UI | **Tailwind CSS** | Touch targets ≥44px, responsive rapide |
| Mobile | **PWA (`vite-plugin-pwa`)** | Installable sur tablette + cache hors-ligne |
| Tests | **Vitest + Playwright** | Unitaire (taxes/SKU) + e2e (wizard POS) |
| Qualité | **ESLint + Prettier** | Cohérence de code |
| Infra | **Render + MongoDB Atlas** | On garde l'existant qui fonctionne |

> Alternative plus légère envisagée : **Svelte/SvelteKit** (moins de boilerplate).
> React retenu par défaut pour la facilité de reprise et l'écosystème.

### Modèle de données MongoDB (collections cibles)
`variants` · `stock` (matières) · `sales` · `users` · `config` · `collections` · `serials` (numéros de série pièce — nouveau)

### Arborescence cible (proposition)
```
tiraboschi-erp/
├── api/                      # Backend Express + TS
│   ├── src/
│   │   ├── routes/           # pos, payments, shopify, stock, crm, admin, auth
│   │   ├── services/         # logique métier (tax, sku, shopifyClient, stripe)
│   │   ├── models/           # schémas Mongoose
│   │   ├── middleware/       # auth JWT, rateLimit, validation Zod
│   │   └── server.ts
│   └── tests/
├── web/                      # Frontend React + Vite + TS
│   ├── src/
│   │   ├── modules/          # pos/ erp/ stock/ crm/ ventes/ admin/
│   │   ├── components/       # UI partagée
│   │   ├── lib/              # api client, i18n, auth
│   │   └── main.tsx
│   └── tests/
├── .env.example
└── README.md
```

---

## 4. Périmètre V2

### Dans le périmètre (refonte du fonctionnel V1)
- POS wizard 5 étapes + Stripe Terminal S710
- Liens de paiement Stripe Checkout + page `/pay/:id` (workaround WebView WhatsApp/Instagram)
- Calcul taxes FR/EU/US (Draft Orders Shopify pour DDP US)
- SKU engine (nouveau format `OL-25H-CU001-CH-NR`)
- Catalogue, fiches techniques, BOM
- Stock matières + mouvements + alertes
- CRM via Shopify + RGPD
- Historique ventes + KPIs (source de vérité unique : Shopify → fin du double-comptage)
- Admin users + config + import/export Excel
- Auth multi-utilisateurs (bcrypt + JWT, remplace le PIN clair)
- i18n FR/EN

### Nouveautés V2 (au-delà de la V1)
- Numéro de série unique par pièce (traçabilité luxe, SAV, anti-contrefaçon)
- Auto-décrémentation stock à la vente (vente → décrément BOM)
- PDF facture automatique après paiement
- Dashboard analytics (graphiques, filtres vendeur/événement)
- PWA installable + mode hors-ligne POS

### Hors périmètre (pour l'instant)
- Migration de l'historique de données V1 (à décider : reseed propre vs import)
- Trunk shows, passeport produit QR, RMA complet → backlog long terme

---

## 5. Roadmap par phases

### Phase 0 — Fondations (bloquant, avant tout le reste)
- [ ] Ajouter `tpe-stripe710` au scope de session (accès code V1)
- [ ] Scaffolding repo V2 (api + web, TS, lint, CI)
- [ ] `.env.example` complet + secrets hors code
- [ ] Connexion MongoDB Atlas + schémas Mongoose
- [ ] Auth bcrypt + JWT + rate-limit

### Phase 1 — Cœur métier POS (valeur immédiate)
- [ ] SKU engine (nouveau format) + tests
- [ ] Calcul taxes FR/EU/US + tests
- [ ] Wizard POS 5 étapes
- [ ] Stripe Terminal S710 (connection token, PaymentIntent create/capture)
- [ ] Liens de paiement + `/pay/:id` + webhook
- [ ] Sync commande Shopify à la vente

### Phase 2 — ERP / Stock
- [ ] Catalogue + fiches techniques + BOM
- [ ] Stock matières + mouvements + alertes
- [ ] Auto-décrémentation stock à la vente
- [ ] Import/Export Excel (UI)

### Phase 3 — CRM / Reporting / Admin
- [ ] CRM Shopify + RGPD
- [ ] Historique ventes + KPIs (source unique Shopify)
- [ ] Dashboard analytics
- [ ] Admin users + config

### Phase 4 — Mobile & traçabilité luxe
- [ ] PWA + mode hors-ligne
- [ ] Numéro de série par pièce + statuts + localisation
- [ ] PDF facture + passeport produit

---

## 6. Intégrations (référence technique)

### Stripe Terminal
`POST /api/connection_token` · `POST /api/create_payment_intent` (capture manuelle) ·
`POST /api/capture_payment_intent` · Lecteur S710 (BT/USB) · EUR + USD.

### Stripe Checkout (liens de paiement)
`POST /api/create_payment_link` → URL · `GET /pay/:id` → redirect browser (fix WebView) ·
`POST /api/webhook` → `checkout.session.completed` → commande Shopify.

### Shopify Admin API v2024-01
Store `axp150-71.myshopify.com` · Auth **`X-Shopify-Access-Token`** (corrige le `client_credentials` V1) ·
Produits, clients, commandes, inventaire, Draft Orders (taxes US/EU), sync ventes POS.

### MongoDB Atlas
Cluster `6a04e0894406869d3a1f4544` · DB `tiraboschi_pos` · **source de vérité des données métier en V2**.

---

## 7. Utilisateurs

| ID | Nom | Rôle | Accès |
|---|---|---|---|
| USR-1 | Vincent Hacquard | Admin | Tout |
| USR-2 | Laurène Mauro | Admin | Tout |
| USR-CHIARA | Chiara | Vendeur | Caisse + Ventes |
| USR-PATTI | Patti | Vendeur | Caisse + Ventes |

> En V2 : mots de passe hachés (bcrypt), jamais en clair dans le code ni le repo.

---

## 8. Conventions

### Commits
`fix:` · `feat:` · `refactor:` · `security:` · `data:` · `ux:` · `chore:` · `test:`

### Branches
`main` (prod, déploiement Render auto) ← `develop` (travail) ← `feature/*`

---

## 9. Décisions actées

| Date | Décision | Justification |
|---|---|---|
| 2026-06-03 | Refonte complète (clean rebuild) | Dette technique V1 trop lourde pour refactoring |
| 2026-06-03 | TypeScript back + front | Domaine ERP complexe → typage = sécurité |
| 2026-06-03 | React + Vite (abandon Vanilla JS) | Le monolithe `app.js` était le vrai problème, pas le build step |
| 2026-06-03 | MongoDB Atlas = source de vérité | Fin des données éphémères Render |
| 2026-06-03 | Shopify = source unique des KPIs | Élimine le double-comptage |
| 2026-06-03 | Tailwind + PWA | POS tactile mobile-first |

---

## 10. Prochaine étape

1. **Ajouter `tpe-stripe710` au scope de session** (réglage des dépôts autorisés, côté Claude Code on the web).
2. Une fois fait : je lis le code V1 pour extraire la logique métier exacte
   (taxes, SKU engine, workaround `/pay/:id`, sync Shopify) et je démarre le **scaffolding Phase 0**.
