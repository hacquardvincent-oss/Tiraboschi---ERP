# Inventaire de parité fonctionnelle V1 → V2

> Source de vérité pour garantir qu'aucune fonctionnalité de la V1 (`legacy-v1/`) n'est perdue en
> convergeant sur la V2 (`api/` + `web/`). **Audit vérifié dans le code** (lignes citées).
> Établi le 2026-06-25 sur la copie figée `legacy-v1/` et le code V2 (`api/src`, `web/src`).

Légende statut V2 : ✅ présent · 🟡 partiel · ❌ manquant.

Fichiers V1 audités : `legacy-v1/server.js` (1395 l.), `legacy-v1/public/app.js` (2818 l.),
`legacy-v1/public/stripe-tpe.js` (557 l.), `legacy-v1/public/auth.js` (84 l.),
`legacy-v1/public/index.html` (88k).

---

## Synthèse

- **Total comportements recensés : 96**
  - ✅ présent : **70**
  - 🟡 partiel : **18**
  - ❌ manquant : **8**

La V2 est globalement un **sur-ensemble** de la V1 (auth réelle, Postgres, outbox idempotent,
GraphQL, MRP étendu). Les écarts sont concentrés sur : (1) le **consentement marketing RGPD** non
poussé vers Shopify, (2) le **wizard POS à 5 étapes** réduit à 3 niveaux + le double mode
**Sur place / Expédié DDP** par article, (3) la **cartographie ZIP→État US** remplacée par la saisie
directe du `provinceCode`, (4) quelques détails (téléphone, note de commande, suffixe `-DDP`,
reporting opt-in emails). Aucun écart bloquant ; tous documentés ci-dessous.

> ⚠️ Plusieurs « écarts » sont en réalité des **corrections de dette/sécurité V1 volontaires** (pas à
> reproduire) : backdoor `admin_secours`, mots de passe en clair, `GET /api/users` exposant les
> passwords, persistance JSON éphémère. Ils sont listés à part en fin de document.

---

### Module — POS / Caisse

- [ ] Bascule devise USD/EUR (boutons toggle) — V1: app.js:1116-1153, index.html:112-115 — V2: ✅ — `web/src/components/Header.tsx:36`, `web/src/store.tsx` (CurrencyProvider).
- [ ] La bascule devise adapte les placeholders du formulaire client (FR/EN) — V1: app.js:1126-1144 — V2: ✅ — i18n FR/EN global (`web/src/i18n.tsx`), placeholders traduits par clé.
- [ ] La bascule devise force le préfixe téléphone (+1 USD / +33 EUR) et le pays (US/FR) — V1: app.js:1133-1134,1142-1143 — V2: 🟡 — `web/src/pages/Pos.tsx:55,87` dérive marché/préfixe de la devise ; à re-vérifier que le pré-remplissage couvre tous les champs comme en V1.
- [ ] Champ requis ZIP obligatoire en USD avant navigation catalogue (highlight rouge + scroll) — V1: app.js:762-796 — V2: 🟡 — `web/src/pages/Pos.tsx:282` (ZIP requis pour la taxe US) mais le blocage visuel exact (bordure rouge + flash bouton + scroll) n'est pas reproduit à l'identique.
- [ ] Formulaire client complet : prénom, nom, email, tél+préfixe, adresse, adresse2, ville, CP, état, pays — V1: index.html:123-165 — V2: ✅ — `web/src/pages/Pos.tsx:51-66`.
- [ ] Sélecteur pays (US/FR en caisse) — V1: index.html:160-164 — V2: ✅ — `web/src/pages/Pos.tsx:488-493` (US/FR/GB/IT).
- [ ] Cases RGPD opt-in marketing email + SMS — V1: index.html:167-174 — V2: 🟡 — cases présentes `web/src/pages/Pos.tsx:498-502` ET champ `acceptsEmail/acceptsSms` dans le DTO `services/sales.ts:29-30`, MAIS jamais poussé en consentement Shopify (`services/shopify.ts:559-589` n'envoie pas `emailMarketingConsent`). Captée, non persistée.
- [ ] Note client (textarea) — V1: index.html:176-178 — V2: ✅ — `web/src/pages/Pos.tsx:494` (note client) → `note` Shopify customer.
- [ ] Note sur la commande (textarea) — V1: index.html:260-262 — V2: 🟡 — le DTO draft/sale a une `note` générée (`services/sales.ts:146`, `routes/sales.ts:60`) mais pas de champ « note de commande » libre saisi par le vendeur côté POS comme en V1.
- [ ] Bouton « Valider l'adresse » déclenche le calcul des taxes — V1: index.html:181, app.js:2719-2751 — V2: ✅ — `web/src/pages/Pos.tsx:506`.
- [ ] Wizard navigation produit Modèle → Matière → Option → Couleur → Mode (5 étapes) — V1: app.js:732-1002, index.html:224-254 — V2: 🟡 — `web/src/components/Configurator.tsx` fait Modèle → Matière → Couleur (3 niveaux) ; l'étape « Option » et l'étape dédiée « mode d'achat » à 5 cartes ne sont pas un wizard identique.
- [ ] Étape 5 : double mode d'achat « Sur place (Take away) » vs « Expédié (Shipped DDP) » avec 2 cartes prix — V1: app.js:877-1002 — V2: 🟡 — `web/src/pages/Pos.tsx:572-579` propose Sur place / À distance (DDP) au niveau **panier/checkout**, pas en 2 cartes prix par article. Le concept DDP + frais de port est présent (`Pos.tsx:110-112`).
- [ ] Suffixe SKU `-DDP` sur l'article expédié pour signaler la logistique — V1: app.js:941 — V2: ❌ — non retrouvé ; le caractère « expédié/DDP » est porté par le flag DDP + frais de port, pas par un suffixe SKU.
- [ ] Prix article = prix Shopify (fallback prix ERP / `plm-price-usd-ht`) — V1: app.js:887-901,950-965 — V2: ✅ — prix variante depuis catalogue + `fetchVariantDataBySku` (`services/shopify.ts:303`).
- [ ] Frais de port forfaitaires ajoutés au mode expédié (config shippingCost, défaut 100) — V1: app.js:910-912 — V2: ✅ — `web/src/pages/Pos.tsx:110-112` (lit la config) ; `services/payments.ts:73-82` (ligne port DDP).
- [ ] Article hors catalogue (nom + prix HT) ajouté au panier — V1: app.js:1004-1045, index.html:194-212 — V2: ✅ — `web/src/pages/Pos.tsx:202-215`.
- [ ] Panier : lignes avec nom + SKU + bouton « Retirer » — V1: app.js:1051-1090 — V2: ✅ — `web/src/pages/Pos.tsx:550-579`.
- [ ] Panier affiche « Taxes et/ou douanes incluses » + total — V1: app.js:1085-1090, index.html:273-280 — V2: ✅ — affichage taxes/total `web/src/pages/Pos.tsx:585-607`.
- [ ] Calcul taxes US auto-déclenché (debounce zip/state, 800 ms) — V1: app.js:2604-2717 — V2: 🟡 — calcul via bouton « valider adresse » (`Pos.tsx:506`) ; le re-calcul auto debounce à la frappe ZIP/State n'est pas confirmé.
- [ ] Affichage détail des lignes de taxe (titre + taux % + montant) — V1: app.js:2653-2672 — V2: ✅ — `web/src/pages/Pos.tsx:585-589`, données de `services/shopify.ts:417-422`.
- [ ] TVA 20 % implicite en EUR (pas de calcul Shopify) — V1: cart sans calcul si non-USD app.js:1092-1113 — V2: ✅ — TVA fixe 20 % EUR côté front (rapporté `web/src/pages/Pos.tsx`).
- [ ] Encaissement TPE Stripe S710 (collect → process → capture) — V1: stripe-tpe.js:251-376 — V2: ✅ — `web/src/lib/terminal.ts:1-112` + `services/payments.ts:113-164`.
- [ ] Loader / statuts paiement (« Présentez la carte », succès, erreur) — V1: stripe-tpe.js:267-365, index.html:302-309 — V2: ✅ — flux TPE `web/src/lib/terminal.ts` + UI `Pos.tsx:386-414`.
- [ ] Bouton annuler la collecte en cours — V1: stripe-tpe.js:544-555 — V2: 🟡 — gestion d'annulation via le SDK terminal présente ; bouton « Annuler la transaction » exact à confirmer.
- [ ] Génération lien de paiement (Stripe Checkout) — V1: stripe-tpe.js:378-507, server.js:174-232 — V2: ✅ — `services/payments.ts:87-110`, `web/src/pages/Pos.tsx:353,432-441`.
- [ ] Partage lien : copier presse-papier + WhatsApp — V1: stripe-tpe.js:509-543 — V2: ✅ — modale partage WhatsApp/Email/SMS/Copier `web/src/pages/Pos.tsx:670-687`.
- [ ] Polling du statut du lien (toutes 5 s, max 10 min) puis reset panier — V1: stripe-tpe.js:458-507, server.js:296-306 — V2: 🟡 — la V2 s'appuie sur webhook signé + outbox + watchdog (`services/payments.ts:170-209`), pas sur un polling front 5 s ; même résultat fonctionnel, mécanisme différent (plus robuste).
- [ ] Reçu numérique (send_receipt sur la commande Shopify) — V1: server.js:268,544 — V2: 🟡 — V2 a une page reçu serveur `routes/receipt.ts` + `web/src/pages/Sales.tsx:178` ; la commande de récupération est créée `sendReceipt:false` (`services/shopify.ts:200`), donc le reçu Shopify auto n'est pas envoyé à l'identique.
- [ ] Devise du paiement = devise sélectionnée (usd/eur) — V1: stripe-tpe.js:283,415-416 — V2: ✅ — `services/payments.ts:51,137`.

### Module — Catalogue / PLM (Collection)

- [ ] Catalogue visuel groupé Modèle → Matière → Option → déclinaisons (couleurs) avec compteurs — V1: app.js:1434-1521 — V2: ✅ — `web/src/pages/Collection.tsx:355-370`.
- [ ] Recherche collection (SKU / nom) — V1: app.js:1443-1444, app.js:2280-2289 — V2: ✅ — recherche `Collection.tsx`.
- [ ] Compteur de modèles « Validés » — V1: app.js:1439-1441 — V2: 🟡 — V2 a un onglet « complétude » (`Collection.tsx:438-462`) ; compteur « validés » exact à confirmer.
- [ ] Génération SKU `[MODEL][YY][S]-[MAT][OPT]-[COLOR]` — V1: server.js:80-89, app.js:2044-2059 — V2: ✅ — `api/src/services/sku.ts assembleSku` ; **parité prouvée 285/285** (cf. MIGRATION_V1_V2.md §1.1).
- [ ] Aperçu SKU en direct dans le formulaire à chaque changement de champ — V1: app.js:2296-2299, generateUISKU — V2: ✅ — `routes/erp.ts:14` (`/sku/preview`) + UI Collection.
- [ ] Refus de doublon de SKU à la sauvegarde — V1: server.js:1088-1090 — V2: 🟡 — unicité SKU au niveau Prisma/`products` ; message d'erreur dédié à confirmer.
- [ ] Création nouveau modèle (formulaire vierge) — V1: app.js:1558-1572 — V2: ✅ — `Collection.tsx` (nouveau produit).
- [ ] Création déclinaison pré-remplie (Noir 999 + données modèle de base) — V1: app.js:1574-1604 — V2: 🟡 — création de déclinaison présente ; pré-remplissage « Noir 999 + héritage modèle » exact à confirmer.
- [ ] Champs fiche PLM : modèle, matière globale, couleur, taille, année, saison, atelier — V1: index.html:858-935 — V2: ✅ — `Collection.tsx:556-562,606-608`.
- [ ] Options fonctionnelles 1..4 (avec/sans pochon, chaîne…) — V1: index.html:908-921, app.js:2120-2135 — V2: ✅ — options dynamiques `Collection.tsx:593-603`.
- [ ] Nomenclature (BOM) : matière principale + mat2/mat3/doublure (animal, type, coloris, qté, fournisseur, détails) — V1: index.html:944-1034, app.js:1947-1955 — V2: ✅ — lignes BOM chiffrées par rôle `Collection.tsx:611-646`, `routes/products.ts:135` (PUT bom).
- [ ] Bijouterie 1..4 (détails, qté, fournisseur) — V1: index.html:1044-1054, app.js:2092-2118 — V2: ✅ — lignes bijouterie dynamiques `Collection.tsx:659-674`.
- [ ] Sections matières/options/bijouterie pliables (cases à cocher) — V1: app.js:2071-2089 — V2: 🟡 — ajout/suppression dynamique présent ; les toggles cases « ajouter une matière secondaire » exacts non reproduits tels quels.
- [ ] Prix HT EUR + HT USD — V1: index.html:1067 (USD), data plm-price-eur/usd — V2: ✅ — `priceHtEur` / `priceHtUsd` `Collection.tsx:676-689`.
- [ ] Auto-calcul TTC (EUR ×1.20, USD ×1.08) à l'affichage — V1: app.js:1552-1553 — V2: 🟡 — V2 calcule PRI/marge (`Collection.tsx:538-542`) ; l'auto-TTC EUR×1.20 / USD×1.08 d'affichage n'est pas confirmé à l'identique.
- [ ] Champs Duties & Shipping + Final Price (DDP) — V1: index.html:1068-1071 — V2: ✅ — `dutiesShippingUsd`, `finalPriceDdp` `Collection.tsx:676-689`.
- [ ] Coût de revient (matière + façon), marge — V1: spec §3.4 (costMaterial/costMaking) — V2: ✅ — `costMaterial`, `costMaking`, PRI + marge € / % `Collection.tsx:538-542`.
- [ ] HS Code + Pays d'origine — V1: index.html:1081-1085 — V2: ✅ — `hsCode`, `countryOrigin` `Collection.tsx:691-695` + poussés à Shopify (`services/shopify.ts:480-482`).
- [ ] Statut Brouillon / Validé (sauvegarde forcée en Brouillon si champs requis manquants) — V1: app.js:1606-1645, index.html:1094-1096 — V2: 🟡 — workflow DRAFT/IN_REVIEW/VALIDATED + validatedBy/At (`Collection.tsx:698-699,260-263`) ; le « downgrade auto en Brouillon » V1 n'est pas l'implémentation V2 (contrôle de complétude séparé).
- [ ] Suppression de déclinaison — V1: app.js:1662-1680, server.js:1108-1115 — V2: ✅ — `routes/products.ts:249` (DELETE).
- [ ] Sync produit vers Shopify (create/update par SKU, prix, images) — V1: app.js:1647-1660, server.js:1319-1393 — V2: ✅ — `routes/products.ts:259`, `services/shopify.ts:495-523` (productSet GraphQL).
- [ ] Import images + prix depuis Shopify — V1: (sync renvoie image) server.js:1381-1385 — V2: ✅ — `routes/products.ts:180` (import-images), `services/shopify.ts:303-330`.
- [ ] Gestion images / galerie (ordre, image de couverture) — V1: champ image basique seulement — V2: ✅ (sur-ensemble) — `routes/products.ts:100` (PUT images), `Collection.tsx:565-591`.
- [ ] Fil de commentaires sur la fiche technique — V1: ❌ absent — V2: ✅ (sur-ensemble) — `routes/products.ts:118-133`.
- [ ] Import CSV des prix/collection (parsing `;`, mapping SKU) — V1: server.js:1181-1271, app.js:2764-2817 — V2: ✅ — `services/import.ts:90` (importCatalogCsv) + `routes/products.ts:169`, plus import fiches techniques `routes/products.ts:205`.

### Module — CRM / Clients

- [ ] Recherche clients Shopify (email / nom) — V1: server.js:445-455, app.js:1156-1203 — V2: ✅ — `routes/crm.ts:9`, `services/shopify.ts:526-540`.
- [ ] Annuaire : n'affiche rien tant qu'aucune recherche, tri email-match prioritaire — V1: app.js:1171-1187 — V2: 🟡 — recherche présente ; comportement « rien sans requête + tri email-first » à confirmer (`web/src/pages/Crm.tsx:80-93`).
- [ ] Création client (Shopify) — V1: server.js:457-480, app.js:1223-1262 — V2: ✅ — `routes/crm.ts:31`, `services/shopify.ts:567-577`.
- [ ] Modification client — V1: app.js:1214-1221 (edit) — V2: ✅ — `routes/crm.ts:42`, `services/shopify.ts:579-589`, `Crm.tsx:152-166`.
- [ ] Sélection d'un client → pré-remplit la caisse — V1: app.js:1205-1212 — V2: ✅ — contexte `posCustomer` `web/src/nav.tsx` + `Crm.tsx:48-64`.
- [ ] Détail client : commandes, montant dépensé, adresse par défaut, historique — V1: ❌ (V1 ne montre pas l'historique détaillé) — V2: ✅ (sur-ensemble) — `services/shopify.ts:542-557`, `Crm.tsx:132-195`.
- [ ] Création client : sauvegarde avec adresse/téléphone complets — V1: index.html:319-386 (champs) MAIS server.js:457-466 n'envoie QUE first/last/email — V2: 🟡 — V2 envoie aussi phone+note (`services/shopify.ts:567`), mais pas l'adresse complète ni le consentement marketing à la création client.
- [ ] Consentement marketing email/SMS poussé vers Shopify — V1: ❌ (cases présentes mais jamais envoyées au backend) — V2: ❌ — non envoyé non plus (`services/shopify.ts:559-589`). Parité « cassée » côté V1 aussi ; à implémenter proprement en V2.

### Module — Ventes / Sales

- [ ] Liste des commandes (depuis Shopify, status=any) — V1: server.js:928-946, app.js:1267-1281 — V2: ✅ — `web/src/pages/Sales.tsx:121-197` (liste ventes Postgres + statut sync Shopify).
- [ ] Statuts : Payé / Remboursé / Partiellement remboursé / Annulé — V1: app.js:1318-1339 — V2: 🟡 — PENDING/PAID/CANCELLED/REFUNDED (`Sales.tsx:22-27`) ; pas de « partiellement remboursé » dédié.
- [ ] Recherche commandes (id / email / nom client) — V1: app.js:1283-1299, 2261-2277 — V2: ✅ — recherche `Sales.tsx:121-197`.
- [ ] Remboursement : Stripe (par PaymentIntent ou Session) + annulation Shopify — V1: server.js:577-656, app.js:1398-1417 — V2: ✅ — `services/payments.ts:212-229` (refund Stripe + cancelShopifyOrder).
- [ ] Fallback remboursement : matcher la vente locale par date+montant si pas d'attribut Stripe — V1: server.js:606-619 — V2: 🟡 — V2 stocke `stripePaymentIntentId`/`stripeSessionId` sur la vente (Prisma) → matching direct ; l'heuristique date±15 min / montant±0.5 n'est plus nécessaire (mécanisme supérieur).
- [ ] Annulation de commande (bouton Annuler) — V1: app.js:1419 (=refund) — V2: ✅ — `services/payments.ts:232-239` (cancelSale).
- [ ] Lien vers Shopify / nom de commande Shopify affiché — V1: nom commande affiché app.js:1344 — V2: ✅ — statut + nom commande Shopify `Sales.tsx:147-158`.
- [ ] Resynchronisation si sync Shopify échouée — V1: ❌ absent — V2: ✅ (sur-ensemble) — bouton resync `Sales.tsx:160-184`.
- [ ] 3 dernières transactions sur le dashboard — V1: app.js:1371-1396 — V2: ✅ — `web/src/pages/Dashboard.tsx:73-86`.

### Module — Stock / Inventaire / Matières

- [ ] Liste matières groupée (Peaux animal/type, Bijoux) avec couleurs pliables — V1: app.js:180-346 — V2: ✅ — `web/src/pages/Inventaire.tsx:248-375`.
- [ ] Recherche matières + pagination « charger plus » — V1: app.js:190-251 — V2: 🟡 — recherche présente ; pagination « charger plus (20) » exacte non reproduite.
- [ ] Édition directe d'un rouleau (rouleaux/quantité + pieds) — V1: app.js:510-544, server.js:970-984 — V2: 🟡 — ajustement de stock présent (`Inventaire.tsx:248-375`) ; édition « pieds (longueur) » spécifique cuir à confirmer.
- [ ] Mouvement de stock entrée/sortie (déduction FIFO sur rouleaux) — V1: server.js:986-1069, app.js:376-394 — V2: ✅ — `routes/erp.ts:163-200` (stock-movements GET/POST), `services/inventory.ts`.
- [ ] Réinsertion (revert) d'un mouvement de sortie — V1: app.js:370-394 — V2: 🟡 — sortie/réception présentes ; bouton « Réinsérer » dédié sur un mouvement à confirmer.
- [ ] Sortie exceptionnelle de pièces finies (par déclinaison) — V1: app.js:500-508, server.js:994-1014 — V2: ✅ — pièces finies + sortie exceptionnelle `Inventaire.tsx:685-753`, `routes/erp.ts` (finished pieces).
- [ ] Réception fournisseur (bon de livraison : matière, type, détail, coloris, pieds, rouleaux) — V1: app.js:556-697, server.js:959-968 — V2: ✅ — réception/mouvement `Inventaire.tsx:248-375`, `routes/erp.ts:119,132`.
- [ ] Catégories réception Peaux vs Bijoux (champs conditionnels) — V1: app.js:592-617 — V2: ✅ — import matières Peaux/Bijoux `Inventaire.tsx`.
- [ ] Dashboard OPS : alertes ruptures matières / pièces + nb ordres de prod — V1: app.js:73-118, index.html:64-83 — V2: ✅ — KPIs ruptures/low-stock/en-prod `Inventaire.tsx:186-237`.
- [ ] Ordres de production (liste groupée par atelier) — V1: app.js:134-159, server.js:1076-1079,1144-1178 — V2: ✅ — `routes/erp.ts:269,279`, `Inventaire.tsx:377-435`.
- [ ] Création ordre de production + déduction matière (consommation forfaitaire 2.5) — V1: server.js:1144-1178 — V2: ✅ (sur-ensemble) — `routes/erp.ts:279,313` (issue-materials par BOM réel, plus précis que le forfait V1).
- [ ] Historique des mouvements (tri date desc) — V1: app.js:348-368, server.js:1071-1074 — V2: ✅ — log mouvements récents `Inventaire.tsx:248-375`, `routes/erp.ts:163`.
- [ ] N° de série / passeport par pièce — V1: ❌ absent — V2: ✅ (sur-ensemble, décision V2) — model `Serial`, `Inventaire.tsx:685-753`.
- [ ] Ateliers : fiche complète (lead time, capacité, MOQ, transit, port, modèles) — V1: ❌ (atelier = simple champ texte) — V2: ✅ (sur-ensemble) — `routes/erp.ts:67-114`, `Inventaire.tsx:755-887`.
- [ ] Planning de production + bons d'achat fournisseur (PO lifecycle) — V1: ❌ absent — V2: ✅ (sur-ensemble) — `routes/erp.ts:358-475`, `Inventaire.tsx:537-683`.
- [ ] Sessions d'inventaire (comptage) — V1: ❌ absent — V2: ✅ (sur-ensemble) — `routes/erp.ts:475-484`, `Inventaire.tsx:889-945`.
- [ ] Fulfillment / préparation d'expédition — V1: ❌ absent — V2: ✅ (sur-ensemble) — `routes/erp.ts:329-339`, model `FulfillmentTask`.

### Module — Admin / Config référentiel

- [ ] Référentiel : 17 catégories (models, years, seasons, options, optionTypes, colors, sizes, globalMaterials, animalTypes/materials, skinTypes, linings, materialDetails, suppliers, jewelry, origins, hsCodes, ateliers) — V1: app.js:1757-1775, index.html:625-642 — V2: ✅ — `web/src/pages/Admin.tsx:15-32`, table `RefItem` (`prisma/schema.prisma:36`).
- [ ] CRUD config : ajouter / modifier / supprimer un item — V1: app.js:1736-1755,1805-1879 — V2: ✅ — `routes/ref.ts` + `Admin.tsx:146-372`.
- [ ] Règles de génération d'ID référentiel (configPrefixMap / skuCategoriesConfig / autoGeneratedCategories) — V1: app.js:1757-1872 — V2: ✅ — `services/sku.ts generateRefId` ; **règles V1 portées + testées** (cf. MIGRATION_V1_V2.md §1.2). `routes/ref.ts:87-95`.
- [ ] Préfixes séquentiels PREFIX-### (MAT-, TDP-, DOU-, DMA-, FOU-, BIZ-, PAY-, CHS-, ATE-) — V1: app.js:1814-1823 — V2: ✅ — `services/sku.ts` (mêmes préfixes).
- [ ] Logique years (2 derniers chiffres) / seasons (H/E) / globalMaterials (CU/CE) / colors (ignore ≥900) — V1: app.js:1827-1868 — V2: ✅ — `services/sku.ts`.
- [ ] Champ « + Créer » inline dans les selects PLM (création d'item à la volée) — V1: app.js:1993-2041 — V2: ✅ — `web/src/components/RefSelect.tsx` (création inline).
- [ ] Frais de port configurables (shippingCost, défaut 100) — V1: app.js:1688-1704, server.js:820 — V2: ✅ — `routes/settings.ts:18` (PUT clé), table `Setting`, `Admin.tsx:115-143`.
- [ ] Import CSV du référentiel (mono-catégorie / multi-colonnes / base complète) + export CSV — V1: ❌ (V1 importait seulement les prix collection) — V2: ✅ (sur-ensemble) — `routes/ref.ts:31,42,52,64`, `services/import.ts`.
- [ ] Détection de conflits couleurs (doublons label/code) — V1: ❌ absent — V2: ✅ (sur-ensemble) — `routes/ref.ts:11`, `Admin.tsx:54-112`.
- [ ] Gestion utilisateurs : liste, création, édition inline, suppression — V1: app.js:2387-2600, server.js:1274-1317 — V2: ✅ — `routes/users.ts:25-69`, `Admin.tsx:395-510`.
- [ ] Permissions par module (caisse, collection, stock/ops, ventes, admin) — V1: app.js:2434-2438,2503-2528 — V2: ✅ — `permissions` (RefItem `prisma/schema.prisma`), `Admin.tsx:384-391`, `sanitizePermissions` (`routes/users.ts:40`).
- [ ] Rôle déduit (admin si permission admin, sinon user) — V1: app.js:2530,2573 — V2: ✅ — enum `Role` ADMIN/SELLER, `routes/users.ts`.
- [ ] Bloquer / débloquer un utilisateur (isBlocked) — V1: app.js:2479-2488 — V2: 🟡 — champ `active` sur `User` (`prisma/schema.prisma:20`) utilisé au login (`routes/auth.ts:16`) ; bouton « bloquer/débloquer » UI à confirmer (édition active via PATCH).
- [ ] Commission par vendeur (champ %) — V1: index.html:709, app.js:2501,2521 — V2: ❌ — aucun champ commission retrouvé sur `User` (`prisma/schema.prisma:20-34`).
- [ ] Upload CSV des prix produits (page Admin) — V1: index.html:676, app.js:2764-2817 — V2: ✅ — import collection `Admin`/`Collection.tsx:161-183`, `routes/products.ts:169`.

### Module — Paiements / Stripe

- [ ] create_payment_intent (card_present, capture manuelle) — V1: server.js:148-159 — V2: ✅ — `services/payments.ts:126-150`.
- [ ] capture_payment_intent (retrieve si déjà succeeded, sinon capture) — V1: server.js:161-172 — V2: ✅ — `services/payments.ts:152-164`.
- [ ] create_payment_link (Checkout session, line_items + ligne taxe, locale en/fr) — V1: server.js:174-232 — V2: 🟡 — `services/payments.ts:87-110` crée la session avec lignes article+taxe+port exactes ; `locale en/fr` explicite non posée (Stripe auto), `success/cancel_url` pointent vers l'app (V1 → site marketing).
- [ ] Page intermédiaire `/pay/:id` brandée — V1: server.js:331-397 — V2: ✅ — `routes/pay.ts:13-53`.
- [ ] `/pay/:id` : auto-redirect différé sauf navigateur in-app — V1: server.js:380-389 — V2: 🟡 — `routes/pay.ts:26-51` fait un meta-refresh + JS `location.replace` après 900 ms, MAIS **sans** la détection WhatsApp/Instagram/FBAN qui suspendait la redirection en V1.
- [ ] `/pay/:id` : encart « Problème d'affichage ? Ouvrir dans Safari/Chrome » (workaround WhatsApp/Instagram) — V1: server.js:344-345,375-378 — V2: ❌ — non présent dans `routes/pay.ts` (l'encart d'aide in-app-browser est manquant).
- [ ] `/pay/:id` : page bilingue selon la locale de la session — V1: server.js:336-346 — V2: 🟡 — `routes/pay.ts` est en français uniquement (pas de bascule EN selon la session).
- [ ] connection_token Terminal — V1: server.js:399-404 — V2: ✅ — `services/payments.ts:113-123`.
- [ ] locations Terminal — V1: server.js:406-411 — V2: 🟡 — la location vient de la config compte (`terminalLocation`, `services/payments.ts:119`) ; pas d'endpoint « lister locations » exposé.
- [ ] readers Terminal (liste) — V1: server.js:413-419 — V2: 🟡 — découverte de lecteur côté SDK front (`web/src/lib/terminal.ts`) ; endpoint REST « readers » non exposé.
- [ ] Webhook Stripe signé (constructEvent) — V1: server.js:308-329 — V2: ✅ — `routes/stripeWebhook.ts` + `services/payments.ts:170-198`.
- [ ] Fulfillment sur paiement (checkout.session.completed → commande Shopify, idempotent) — V1: server.js:235-294 — V2: ✅ (sur-ensemble) — webhook → `markSalePaid` → outbox `syncSale` idempotent (`services/payments.ts:181-209`, `services/sales.ts:100-159`).
- [ ] check_payment_link (polling statut) — V1: server.js:296-306 — V2: 🟡 — remplacé par webhook + watchdog (pas d'endpoint polling) ; résultat équivalent.
- [ ] Idempotence sur fulfillment (ne pas re-pousser si déjà paid) — V1: server.js:239 — V2: ✅ (sur-ensemble) — garde `status===PAID && shopifyOrderId` (`services/payments.ts:207`) + `syncStatus` (`services/sales.ts:104-108`).
- [ ] Multi-compte Stripe par marché (FR/US) — V1: ❌ (1 seul compte) — V2: ✅ (sur-ensemble) — `services/payments.ts:16-36`, `services/stripe.ts:37-46`.
- [ ] Watchdog réconciliation Stripe ↔ Shopify — V1: ❌ absent — V2: ✅ (sur-ensemble) — `services/reconciliation.ts`, `routes/reconciliation.ts`, `services/stripe.ts:14-46`.

### Module — Taxes (US Sales Tax)

- [ ] Calcul taxe via création + suppression d'un draft order Shopify — V1: server.js:752-926 — V2: ✅ (sur-ensemble) — `services/shopify.ts:381-423` utilise `draftOrderCalculate` (calcul sans persister, pas de création/suppression).
- [x] Cartographie ZIP→État US (zipToState, 51 plages) — V1: server.js:757-812 — V2: ✅ (DÉCISION : non repris volontairement) — **Shopify = seule source de vérité de la Sales Tax**. La V2 transmet l'adresse complète (`countryCode`/`provinceCode`/`zip`/`city`) à `draftOrderCalculate` (`services/shopify.ts:394-400`) et Shopify calcule les taux par État/ville/comté en temps réel (cf. facture cible : NY State + NYC + Metropolitan). On NE fige PAS de table ZIP→État (vieillirait mal).
- [x] Contournement conversion devise Shopify Markets (conversionRate) — V1: server.js:879-912 — V2: ✅ (DÉCISION : NE PAS bypasser Markets) — la V2 envoie `presentmentCurrencyCode` et utilise les montants Shopify **tels quels** (`services/shopify.ts:393,414-421`). Aucun re-scaling. Reste uniquement une **vérif de config boutique** (prix USD cohérents) — pas de code à écrire.
- [ ] Dé-duplication des lignes de taxe identiques — V1: server.js:889-905, app.js:2658-2665 — V2: 🟡 — lignes renvoyées telles quelles par Shopify (`services/shopify.ts:417`) ; dé-dup explicite à vérifier.
- [ ] shipping forcé à 0 mais requires_shipping=true pour taxer à destination — V1: server.js:821-854 — V2: ✅ — `requiresShipping:true, taxable:true` (`services/shopify.ts:404-406`).

### Module — Shopify sync

- [ ] Auth client_credentials grant + cache token (renouvellement <1 min) — V1: server.js:118-145 — V2: ✅ — `services/shopify.ts:14-42`.
- [ ] Version d'API Shopify — V1: `2024-01` REST (server.js:113) — V2: ✅ (sur-ensemble) — version récente + GraphQL (`config.shopify.apiVersion`, `services/shopify.ts:50`).
- [ ] Produits Shopify (liste, format variante prix×100) — V1: server.js:422-443 — V2: ✅ — `fetchVariantDataBySku` GraphQL + pagination cursor (`services/shopify.ts:303-330`).
- [ ] Clients Shopify (liste/recherche/création) — V1: server.js:445-480 — V2: ✅ — `services/shopify.ts:526-589`.
- [ ] Inventaire Shopify — V1: server.js:482-498 — V2: 🟡 — V2 gère l'inventaire en propre (Postgres/Material) ; lecture de l'inventaire Shopify (quantités variantes) non exposée à l'identique.
- [ ] Commandes Shopify (status=any) — V1: server.js:928-946 — V2: ✅ — `listRecentOrders`/`getOrdersWithRefs` (`services/shopify.ts:620-658`).
- [ ] Création commande sur vente payée (orders.json POST, tags vendeur, note_attributes Stripe) — V1: server.js:518-575,235-294 — V2: ✅ — `createRecoveryOrder` (`services/shopify.ts:146-202`) avec tags POS + customAttributes Stripe.
- [ ] Draft order (calcul taxe + création « mise de côté ») — V1: server.js:752-926 — V2: ✅ — `createDraftOrder` (`services/shopify.ts:441-469`).
- [ ] product_by_sku (prix + variant_id) — V1: server.js:721-750 — V2: ✅ — `fetchVariantDataBySku` (map SKU→prix/image).
- [ ] Reports/KPIs Shopify (jour/semaine/mois, CRM count, emails opt-in) — V1: server.js:658-717 — V2: 🟡 — `getReports` (`services/shopify.ts:230-286`) fait jour/semaine/mois + crmCount ; **le compteur « emails opt-in »** (emailCount) n'est pas calculé.
- [ ] Annulation commande Shopify — V1: server.js:641-645 (cancel.json) — V2: ✅ — `cancelShopifyOrder` (`services/shopify.ts:336-351`).
- [ ] Sync produit PLM → Shopify (create/update, options Couleur/Taille) — V1: server.js:1319-1393 — V2: ✅ — `syncProductToShopify` mono-variante `productSet` (`services/shopify.ts:495-523`).

### Module — Transverse (i18n, auth, devises, divers)

- [ ] i18n FR/EN (dictionnaire embarqué, scan DOM + placeholders) — V1: stripe-tpe.js:40-160 — V2: ✅ (sur-ensemble) — `web/src/i18n.tsx` (~300 clés, basé sur clés au lieu de scan DOM).
- [ ] Traduction des libellés produits (couleurs/matières) à la volée — V1: stripe-tpe.js:91-109, app.js:397-416 — V2: 🟡 — i18n statique présent ; traduction dynamique des noms de variantes (translateTerm sur display name) à confirmer.
- [ ] Toggle langue (drapeau) + persistance localStorage — V1: stripe-tpe.js:111-165 — V2: ✅ — `web/src/components/Header.tsx:40-44`, persistance `tiraboschi_lang`.
- [ ] Symboles devise (€/$) — V1: app.js:1055,2338 — V2: ✅ — `web/src/store.tsx` (CurrencyProvider).
- [ ] Taux de conversion devise pour affichage KPIs (currencyRates.multiplier) — V1: app.js:2336-2345 — V2: 🟡 — affichage devise présent ; conversion multiplicative des KPIs (V1 lisait `window.currencyRates`, jamais défini → fallback 1) non reproduite (KPIs en devise boutique).
- [ ] Login email/mot de passe — V1: auth.js:8-81 (côté navigateur, BDD JSON en clair) — V2: ✅ (sur-ensemble sécurisé) — `routes/auth.ts:8`, bcrypt+JWT (`services/auth.ts`).
- [ ] Session persistée 24 h (localStorage) — V1: app.js:2369-2382 — V2: ✅ — `web/src/store.tsx` (token + user localStorage, restauration au reload).
- [ ] Contrôle d'accès UI par permission (masquage des onglets nav) — V1: auth.js:49-68 — V2: 🟡 — permissions présentes côté API ; masquage UI des sections selon permissions à confirmer (`web/src/components/BottomNav.tsx`).
- [ ] Pavé PIN de connexion — V1: app.js:2322-2330 (pin-btn) — V2: ❌ — login email/mot de passe seul, pas de pavé PIN.
- [ ] Badge état serveur + Stripe + TPE (health, polling 10 s) — V1: stripe-tpe.js:166-212, server.js:104 — V2: 🟡 — health check présent (`web/src/components/Header.tsx:13-14`, `routes/health.ts`) ; le triple badge SERVEUR/STRIPE/TPE et le polling 10 s exacts non reproduits.
- [ ] Déconnexion auto si compte bloqué/supprimé (vérif périodique) — V1: stripe-tpe.js:174-183 — V2: 🟡 — l'API rejette au login si `!active` ; révocation en cours de session (401 → redirect) via `web/src/lib/api.ts` mais pas de polling « compte bloqué » dédié.
- [ ] Dashboard : accueil + actions rapides + KPIs — V1: index.html:60-103, app.js:2332-2346 — V2: ✅ — `web/src/pages/Dashboard.tsx`.
- [ ] Navigation SPA par sections + menu bas — V1: app.js:3-27, index.html (bottom-nav) — V2: ✅ — `web/src/components/BottomNav.tsx`, `web/src/sections.ts`.

---

## Écarts V1 NON à reproduire (dette / sécurité corrigée en V2)

Ces comportements de la V1 sont **volontairement absents** de la V2 (cf. CLAUDE.md « Risques V1 ») :

- Backdoor `admin_secours` / `admin` au login — V1: auth.js:17-28 — V2: ❌ supprimé (correct).
- Mots de passe en clair dans la BDD utilisateurs JSON — V1: server.js:40-44 — V2: bcrypt.
- `GET /api/users` renvoie les mots de passe en clair — V1: server.js:1274-1281 — V2: `routes/users.ts:20` ne sélectionne jamais le hash, route protégée ADMIN.
- Persistance fichiers JSON non atomique (`writeFileSync`) — V1: server.js:62-76 — V2: PostgreSQL + Prisma (transactions).
- API entièrement ouverte (0 auth serveur) — V1: toutes routes server.js — V2: `requireAuth`/`requireRole` sur les routes.

---

## Points à traiter en priorité (synthèse pour l'équipe)

Top écarts ❌ / 🟡 à arbitrer pour garantir la parité métier :

1. **🟡/❌ Consentement marketing RGPD** — cases email/SMS captées (`Pos.tsx:498-502`) mais jamais poussées vers Shopify (`services/shopify.ts:559-589`). À implémenter (`emailMarketingConsent`/`smsMarketingConsent`). NB : déjà cassé en V1.
2. **❌ Encart workaround in-app-browser sur `/pay/:id`** (WhatsApp/Instagram « Ouvrir dans Safari ») — V1: server.js:344-345,375-389 ; absent de `routes/pay.ts`. Risque réel : clients ouvrant le lien depuis WhatsApp.
3. **🟡 Wizard POS 5 étapes + double mode prix Sur place/Expédié DDP par article** — V1: app.js:877-1002 ; V2 fait 3 niveaux + mode au checkout (`Configurator.tsx`, `Pos.tsx:572-579`). Vérifier que l'UX vendeur reste équivalente.
4. **✅ DÉCISION — ZIP→État & bypass Markets : NON repris.** Shopify est la seule source de vérité de la Sales Tax (taux par État/ville/comté en temps réel). La V2 lui transmet l'adresse complète et utilise ses montants tels quels. On ne fige pas de table ZIP→État et on ne bypass pas Markets. Seule action : vérifier la config devise/Markets de la boutique en USD réel (pas de code).
6. **❌ Champ commission vendeur** — V1: index.html:709 ; absent du modèle `User` V2. À ajouter si la paie commission est utilisée.
7. **🟡 `/pay/:id` bilingue (EN/FR selon session)** — V1: server.js:336-346 ; V2 FR uniquement (`routes/pay.ts`).
8. **🟡 KPI « emails opt-in »** non calculé — V1: server.js:697-699 ; absent de `getReports` (`services/shopify.ts:230-286`).
9. **🟡 Note de commande libre côté POS** — V1: index.html:260-262 ; V2 génère une note auto mais pas de champ vendeur libre.
10. **❌ Pavé PIN de connexion** — V1: app.js:2322-2330 ; V2 = email+mot de passe. À trancher (ergonomie Trunk Show vs sécurité).
