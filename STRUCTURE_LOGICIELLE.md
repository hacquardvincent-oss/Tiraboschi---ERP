# Écosystème Tiraboschi — Structure logicielle
> Version 1.0 — 2026-08-11 · Complète `ARCHITECTURE_ECOSYSTEME.md` (le « quoi ») par le « comment c'est rangé »
> Philosophie héritée des décisions actées : Node/Express, vanilla JS, **aucun build step**, MongoDB Atlas

---

## 1 · Cartographie des dépôts

| Dépôt | Contenu | Devenir |
|---|---|---|
| `tpe-stripe710` | POS/ERP en production | **Devient la Plateforme** — il grossit par modules (devis, CRM, SRM) au lieu qu'on crée une deuxième app. Renommage cosmétique possible plus tard (`tiraboschi-plateforme`) |
| `tiraboschi.com` | Thème Shopify + prototypes | Reste le dépôt de l'expérience cliente (thème, configurateur intégré en `page.atelier`) |
| `Tiraboschi---ERP` | Documents de pilotage | Contexte, architecture, structure (ce fichier), maquettes de validation |
| `plm-tiraboschi` *(futur)* | Fork du PLM VB | Créé au jalon J5 — étanche, ne partage que les contrats |

Un seul backend applicatif. Le thème est du Liquid/JS servi par Shopify ; le PLM est ailleurs et plus tard. **On n'ajoute pas de dépôt tant qu'un module peut vivre dans la Plateforme.**

---

## 2 · Arborescence cible de la Plateforme

Évolution du `tpe-stripe710` actuel (`server.js` 1 395 lignes, `public/app.js` 2 817 lignes) vers une structure par **modules métier**, sans framework ni bundler — des ES modules natifs, servis tels quels.

```
tiraboschi-plateforme/
│
├── app.js                        ← bootstrap mince : env, mongo, montage des routes, workers
├── package.json                  ← prestart NETTOYÉ (plus aucune migration au boot)
├── .env.example
│
├── src/
│   ├── domaine/                  ← LOGIQUE MÉTIER PURE — aucun import d'organe, aucun HTTP
│   │   ├── devis.js              ← machine à états, versionnage, règles d'envoi
│   │   ├── society.js            ← statuts, règles de passage, privilèges, garde-fous
│   │   ├── referentiel.js        ← matières/nuances/modèles, filtrage par visibilité
│   │   ├── sku.js                ← generateSKU canonique MODEL-YYS-MAT-OPT-COLOR (repris du POS)
│   │   ├── triggers.js           ← évaluation des règles `triggers` (données → actions)
│   │   ├── production.js         ← ordre de production, pièces, numéros de série TS-AAAA-NNNNN
│   │   └── taxes.js              ← façade du calcul (délègue à l'organe shopify en interne)
│   │
│   ├── api/                      ← ROUTES HTTP — validation, auth, appel du domaine. Rien d'autre
│   │   ├── pos.routes.js         ← routes actuelles du POS (ventes, stock, erp, admin) déplacées
│   │   ├── devis.routes.js       ← /api/devis/* + pages publiques /devis/:token
│   │   ├── referentiel.routes.js ← GET /api/referentiel (filtré par cliente)
│   │   ├── crm.routes.js         ← clients, timeline, statuts, rdv, tâches
│   │   ├── srm.routes.js         ← fournisseurs, commandes matière, lots CITES
│   │   ├── paiement.routes.js    ← connection_token, payment_intent, payment_link, /pay/:id (existant)
│   │   └── hooks.routes.js       ← webhooks entrants : stripe, whatsapp, shopify
│   │
│   ├── organes/                  ← ADAPTATEURS SORTANTS — un fichier par service externe
│   │   ├── shopify.js            ← commandes, clients, metafields, draft-order-calculateur (silencieux)
│   │   ├── stripe.js             ← Terminal + Checkout (repris de l'existant, inchangé)
│   │   ├── klaviyo.js            ← ordres d'envoi email (événement → flow/template)
│   │   ├── whatsapp.js           ← Cloud API Meta : templates sortants, fenêtre 24 h
│   │   └── pdf.js                ← devis/factures à la charte (puppeteer, déjà en dépendance)
│   │
│   ├── data/                     ← ACCÈS BASE
│   │   ├── mongo.js              ← client unique, transactions
│   │   ├── collections.js        ← noms + index (unique SKU, unique token devis, etc.)
│   │   └── journal.js            ← append d'événements (outbox, même transaction que la donnée)
│   │
│   └── workers/                  ← CONSOMMATEURS du journal (poll, idempotents)
│       ├── crm.worker.js         ← projections timeline, évaluation triggers, création de tâches
│       ├── notifications.worker.js ← exécute les actions d'envoi décidées (klaviyo/whatsapp)
│       ├── commerce.worker.js    ← acompte.encaisse → commande Shopify → production.lancee
│       └── stock.worker.js       ← production.lancee → décrément BOM → matiere.seuil_atteint
│
├── public/                       ← BACK-OFFICE (SPA vanilla existante, découpée par modules)
│   ├── index.html
│   ├── app.js                    ← coquille : navigation, auth, i18n (maigrit à chaque extraction)
│   ├── modules/
│   │   ├── pos.js                ← wizard de vente actuel (extrait d'app.js, comportement gelé)
│   │   ├── devis.js              ← liste, détail, versions, envoi, suivi
│   │   ├── crm.js                ← fiches clientes, timeline, tâches, rdv, statuts
│   │   ├── srm.js                ← fournisseurs, commandes, CITES
│   │   └── stock.js / erp.js / admin.js
│   ├── auth.js · stripe-tpe.js · style.css   (existants)
│   │
│   └── client/                   ← PAGES PUBLIQUES CLIENTES (charte maison, pas Blue Sole)
│       ├── devis.html            ← rendu /devis/:token (l'univers du certificat de l'atelier)
│       └── pay.html              ← page /pay/:id existante (contournement WebView)
│
├── scripts/  (migrations figées / seeds / utils — inchangé)
└── tests/
    ├── domaine/                  ← tests unitaires purs (machine à états devis, society, sku)
    ├── api/                      ← tests d'intégration routes (supertest)
    └── recette/                  ← scénarios bout-en-bout type maquette (voir §5)
```

---

## 3 · Les trois règles de dépendance

Tout tient en trois interdits, vérifiables en revue de code :

1. **`domaine/` n'importe rien** d'`organes/`, d'`api/` ni de `data/` — il reçoit et rend
   des objets. C'est ce qui rend la logique testable sans Mongo ni Stripe.
2. **Les modules ne s'appellent pas entre eux.** Le module devis ne parle jamais au CRM :
   il écrit `devis.accepte` dans le journal, le `crm.worker` le consomme. Toute
   communication inter-modules passe par le journal — c'est le contrat anti-silo.
3. **Un organe n'est appelé que par un worker ou une route**, jamais par le domaine, et
   chaque organe est bouchonnable (`ORGANES_MODE=simulation` en dev : les envois
   s'affichent dans les logs au lieu de partir).

Sens des flèches : `api → domaine → data(+journal)` puis `workers → domaine → organes`.

---

## 4 · Plan de découpage de l'existant (sans big-bang)

| Étape | Geste | Risque |
|---|---|---|
| 1 | Créer `src/` et déplacer les routes de `server.js` par blocs (paiement, shopify, pos) **sans en changer une ligne** — `app.js` ne fait plus que monter | quasi nul (déplacement) |
| 2 | Extraire `generateSKU` et le calcul taxes vers `domaine/` avec tests unitaires avant/après | nul (fonctions pures) |
| 3 | Brancher `data/mongo.js` + `journal.js` — migration C1 (les `pos_*` remplacent les JSON) | le vrai chantier, déjà cadré Sprint 1 |
| 4 | Nouveaux modules (devis, crm, srm) créés **directement** dans la structure cible | — |
| 5 | `public/app.js` : extraire `modules/pos.js` en dernier (comportement gelé, recette avant/après) | à faire hors période de trunk show |

Le POS en production ne s'arrête jamais : chaque étape est déployable seule.

---

## 5 · Valider les modules entre eux : la maquette fonctionnelle

Une **maquette interactive autonome** accompagne ce document :
`maquette-ecosysteme.html` (aucune installation — s'ouvre dans un navigateur).

Elle simule la Plateforme complète en mémoire, avec le **journal d'événements visible en
permanence**, pour jouer les parcours à deux rôles et vérifier les enchaînements avant
d'écrire le vrai backend :

- **Atelier (cliente)** — mini-configurateur avec gating The Society réel : changer de
  cliente change les matières visibles ;
- **Back-office (conseiller)** — corbeille des devis, versions (v2 silencieuse — la
  preuve qu'aucun email ne part), envoi email/WhatsApp au choix ;
- **Espace cliente** — la page `/devis/:token` : consultation, demande d'ajustement,
  validation, acompte Stripe simulé ;
- **CRM** — timelines alimentées uniquement par le journal, tâches créées par les
  triggers (dont la relance J+7, testable avec le bouton « +7 jours ») ;
- **Organes** — quatre cartes (Shopify, Stripe, Klaviyo, WhatsApp) qui n'affichent que
  ce que l'écosystème leur délègue : on voit la commande Shopify n'apparaître **qu'à
  l'encaissement**, jamais avant.

Chaque scénario validé dans la maquette devient un test de `tests/recette/` du vrai
backend — la maquette est la spécification exécutable du comportement inter-modules.

---

## 6 · Environnements et configuration

| Env | Base | Organes | Usage |
|---|---|---|---|
| `dev` | Atlas db `tiraboschi_dev` | simulation (logs) | développement local |
| `staging` | Atlas db `tiraboschi_staging` | Stripe test, Shopify dev store, WhatsApp sandbox | recette |
| `prod` | Atlas db `tiraboschi` | réels | Render, déployé depuis `main` |

Variables ajoutées à l'existant : `SHOPIFY_ACCESS_TOKEN` (remplace le flow
client_credentials), `KLAVIYO_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
`ORGANES_MODE`, `JWT_SECRET`.

---

*Structure v1.0 — les écarts constatés en développement sont reportés ici, pas subis.*
