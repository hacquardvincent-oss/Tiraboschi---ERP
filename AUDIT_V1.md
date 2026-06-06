# AUDIT_V1.md — Audit indépendant du code V1 (en vue de la refonte V2)

> Audit réalisé par lecture directe du code figé dans `legacy-v1/` (snapshot commit `683baba`).
> Date : 2026-06-06 — Auteur de l'audit : reprise de lead V2.
> Méthode : vérification dans le code source (pas seulement les docs hérités). Chaque constat est
> sourcé par fichier:ligne. Cet audit **complète et corrige** `HANDOFF_V2_SCOPING.md`.

---

## 0. Synthèse — note de reprise

| Axe | Note | Commentaire |
|---|---|---|
| **Fonctionnel** | 🟢 7/10 | Beaucoup de valeur livrée : POS, Stripe Terminal, liens de paiement, taxes US réelles, sync Shopify. Ça marche en prod. |
| **Sécurité** | 🔴 1/10 | **API entièrement ouverte, mots de passe en clair exposés publiquement, backdoor en dur.** Le point le plus grave, sous-estimé jusqu'ici. |
| **Fiabilité données** | 🔴 2/10 | Disque éphémère + écritures non atomiques + migrations rejouées au boot. Perte/corruption structurelle. |
| **Maintenabilité** | 🔴 3/10 | 2 monolithes (server 1395 l. / app 2817 l.), patchés par scripts de remplacement de chaînes → 86 hotfix, corruptions à répétition. |
| **Intégrations** | 🟡 6/10 | Stripe solide ; Shopify malin (Draft Orders) mais figé `2024-01`, sans pagination, auth non-standard. |

**Verdict** : le fonctionnel mérite d'être préservé, mais le socle (sécurité + données + archi) est
non récupérable par patchs. La **refonte V2 est justifiée**, à condition de réimplémenter fidèlement
la logique métier éprouvée (taxes, SKU, `/pay/:id`, payloads Shopify — tous extraits dans
`legacy-v1/EXTRACTS.md`).

---

## 1. Ce qui fonctionne (à préserver fidèlement)

Vérifié dans `legacy-v1/server.js` (41 routes) :
- **Stripe Terminal S710** — `connection_token`, `locations`, `readers`, PaymentIntent create/capture. 🟢
- **Liens de paiement + page `/pay/:id`** — workaround in-app browser WhatsApp/Instagram, double
  confirmation webhook + polling avec **idempotence** (`status !== 'paid'`). 🟢 (logique soignée)
- **Calcul taxes US réel** — via **Draft Orders Shopify** + table `zipToState` (50 états) + bypass
  Shopify Markets. Approche maligne, fonctionnelle (`server.js` l.752-927). 🟢
- **Webhook Stripe signé** — `constructEvent` + `express.raw()` avant `express.json()`. 🟢 (déjà corrigé)
- **SKU engine** — `generateSKU()` format `[MODEL][YY][S]-[MAT][OPT]-[COLOR]`. 🟡 (sans incrément)
- **i18n FR/EN**, wizard POS, sync commande à la vente. 🟢

---

## 2. Ce qui ne va pas — par gravité (vérifié dans le code)

### 🔴 CRITIQUE-1 — Aucune authentification côté serveur ; l'API est ouverte
**Le constat le plus grave**, vérifié ligne par ligne :
- `GET /api/users` (`server.js:1274`) renvoie `db.users` **brut** → **mots de passe en clair exposés
  publiquement**, sans aucun contrôle d'accès.
- **0 middleware d'authentification** dans tout `server.js` (aucun `req.user`, `Authorization`,
  `verifyToken`). → **toutes les routes** (`/api/sales`, `/api/users` CRUD, `/api/stock_movement`,
  paiements…) sont appelables par quiconque connaît l'URL.
- L'« auth » est **100% cosmétique côté navigateur** (`public/auth.js`) : `login()` télécharge toute
  la liste users (avec mots de passe) et compare en JS ; le contrôle de permissions se limite à
  masquer des boutons en CSS (`display:none`).
- **Backdoor codé en dur** livré dans le JS public : `admin_secours` / `admin` (`auth.js:17`).
- Mots de passe par défaut en clair dans le code source (`server.js:41-44` : `admin`, `1234`).

> Impact : exfiltration triviale des comptes, manipulation de toutes les données, contournement total
> des rôles. À traiter en **priorité absolue** V2 (auth serveur réelle + hash + autorisation par route).

### 🔴 CRITIQUE-2 — Persistance non fiable
- **Disque éphémère Render** : `data/*.json` réécrits localement → **perdus à chaque redéploiement**.
- **Écritures non atomiques** : `writeProductsDB()` = `fs.writeFileSync` du **fichier entier**, sans
  verrou (`server.js:74`), appelé **13×** (dont 10 en `await` sur une fonction synchrone — incohérent).
  Deux ventes simultanées en Trunk Show → écritures qui s'écrasent → **corruption** (cause vérifiée des
  scripts `restore_db.js`/`replace_db*.js`).
- **`prestart` rejoue des migrations à chaque boot** : `replace_db_v3.js` + `import_inventaire.js`
  (`package.json:7`) tournent à chaque `npm start` → risque d'écrasement de données vivantes.

### 🔴 MAJEUR-3 — MongoDB est du code mort
`getMongoDB()` est défini (`server.js:17`) mais **jamais appelé** (vérifié : 1 seule occurrence). Le
client se connecte… jamais. Donne une fausse impression de robustesse. → 0 coût pour l'abandonner (on
part sur Postgres en V2, cf. cadrage).

### 🔴 MAJEUR-4 — Architecture monolithique non maintenable
- `server.js` 1395 l. + `public/app.js` 2817 l., variables globales, duplication (ex. bloc `catch`
  de fallback Shopify ~60 l. recopié, `renderPosStep5`).
- Historique : **86 scripts de hotfix** appliqués par **remplacement de chaînes** → corruptions
  d'encodage récurrentes (`fix_app_js_corruption*`, `restore_app*`). Certains bugs repris **5-6 fois**
  (récap POS, alertes stock) sans jamais se stabiliser. (Source : `HISTORY_PROBLEMS.md`, recoupé.)

### 🟡 MOYEN-5 — Intégration Shopify : dette
- API **figée `2024-01`** (`server.js:113`) + **REST sans pagination cursor** (`limit=250`) →
  troncature silencieuse quand la base grossit.
- Auth via `grant_type=client_credentials` sur `/admin/oauth/access_token` (`server.js:124-132`) —
  flow **non documenté** par Shopify pour l'Admin API ; fragile si le renouvellement échoue.

### 🟡 MOYEN-6 — Specs ≠ code, et angles morts métier
- Les `SPECIFICATIONS_FONCTIONNELLES.md` décrivent TVA 20% / Sales Tax 8% / duties 9% / port 30€-100$.
  **Le code a divergé** : taxes US via Draft Orders, duties « incluses » (0 calculé), port = config
  unique (défaut 100). **Le code fait foi.** (cf. `EXTRACTS.md` §1.)
- **SKU sans incrément séquentiel** `-01/-02` (promis aux specs, jamais implémenté) → risque de
  collision de SKU. `idOption` est un code numérique muet, non sémantique.
- Suffixe `-DDP` ajouté **côté frontend**, pas dans le moteur SKU → logique métier éparpillée.

---

## 3. Ce que je ferai mieux en V2 (problème → solution)

| Problème V1 | Solution V2 |
|---|---|
| API ouverte, auth cosmétique, `/api/users` fuite | **Auth serveur** : bcrypt + JWT, middleware d'autorisation **par route et par rôle**, `/api/users` sans champ password, suppression du backdoor |
| Données éphémères + corruption concurrente | **PostgreSQL + Prisma** : persistance réelle + **transactions** (écritures concurrentes sûres) + migrations versionnées (jamais au boot) |
| Mongo code mort | Supprimé ; une seule base, réellement utilisée |
| Monolithes patchés par scripts | **TypeScript modulaire** (routes/services/models), revue par diff git, **plus jamais** de patch par remplacement de chaînes |
| Logique métier éparpillée/dupliquée | Services dédiés **testés** : `taxService`, `skuService` (avec incrément + `-DDP` intégré), `shopifyClient`, `stripeService` |
| Shopify figé/REST/sans pagination | Client **GraphQL** version récente, **pagination cursor**, encapsulé dans un service de sync |
| Specs ≠ code | Specs réécrites depuis le **comportement réel vérifié** (base : `EXTRACTS.md`) |
| Bugs récurrents (récap, alertes) | **Tests** (Vitest/Playwright) sur les zones historiquement instables |

---

## 4. Comment je reprends le lead (méthode de travail)

1. **`legacy-v1/` = référence en lecture seule.** On ne l'exécute pas, on ne le déploie pas ; il sert à
   extraire la logique métier exacte (déjà curée dans `EXTRACTS.md`).
2. **Reconstruction par modules typés**, pas de patch de chaînes. Chaque module = code + tests + revue diff.
3. **Sécurité et persistance d'abord** (Phase 0), avant toute nouvelle feature.
4. **Fidélité métier** : les formules de taxes, le flux `/pay/:id`, les payloads Shopify sont
   réimplémentés à l'identique du comportement prod vérifié, puis améliorés (incrément SKU, etc.).
5. **Branches + PR** : `main` intouchable, travail sur branche, revue avant merge.
6. **Traçabilité des décisions** dans `CADRAGE_V2.md` (journal des décisions actées).

---

## 5. Optimisation du repo (proposition)

État actuel : doc V2 (`CADRAGE_V2.md`, `HANDOFF_V2_SCOPING.md`) + **docs hérités partiellement
périmés** (`CLAUDE.md`, `CONTEXT.md` — listent des bugs déjà corrigés, mauvais domaine Shopify, « Mongo
décidé ») + `legacy-v1/` + `README.md` quasi vide.

Cible proposée :
```
Tiraboschi---ERP/
├── README.md                 ← point d'entrée / index des docs (réécrit)
├── CADRAGE_V2.md             ← cadrage vivant V2 (décisions actées)  ⭐
├── AUDIT_V1.md               ← CE FICHIER (audit indépendant vérifié)
├── docs/
│   ├── HANDOFF_V2_SCOPING.md ← audit de session précédente (référence)
│   └── archive/              ← CLAUDE.md + CONTEXT.md hérités (périmés, conservés pour historique)
└── legacy-v1/                ← snapshot V1 lecture seule (code + data + extraits métier)

# puis, au scaffolding Phase 0 :
├── api/   (Express + TS + Prisma)
└── web/   (React + Vite + TS)
```
> Les fichiers hérités `CLAUDE.md`/`CONTEXT.md` sont **trompeurs** (ils décrivent des bugs résolus et
> des décisions abandonnées). Recommandation : les **archiver** dans `docs/archive/` plutôt que les
> garder à la racine, et faire de `CADRAGE_V2.md` + `AUDIT_V1.md` la source d'autorité.

---

## 6. Prochaine étape
1. Valider l'archivage des docs hérités (réorg repo ci-dessus).
2. Démarrer le **scaffolding Phase 0** (api/web TS, Prisma/Postgres, **auth serveur réelle**, CI).
3. Réimplémenter le cœur métier POS en s'appuyant sur `legacy-v1/EXTRACTS.md`.
