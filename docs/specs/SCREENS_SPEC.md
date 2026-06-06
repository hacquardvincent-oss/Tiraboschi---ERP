# Spécifications détaillées des écrans — V1 (reverse-engineering)

> Reconstitué depuis `public/index.html` (structure + champs) et `public/app.js` (données, rendu,
> moteurs de recherche). Objectif : permettre à la session V2 de reconstruire chaque écran à
> l'identique sans relire tout le code. **Source de vérité = le code** (réf. lignes indiquées).

## Navigation & permissions
SPA à sections (une seule page, `showSection(id)` masque/affiche). **Barre de nav basse** (`.bottom-nav`)
avec 6 entrées + Dashboard accessible via le logo :

| Label nav | Section id | Permission requise | Module |
|---|---|---|---|
| (logo) | `section-dashboard` | — | Accueil/KPIs |
| Caisse | `section-payment` | `caisse` | POS |
| Collection | `section-inventory` | `collection` | PLM catalogue |
| Clients | `section-customers` | (caisse/ventes) | CRM |
| Ventes | `section-history` | `ventes` | Historique |
| OPS | `section-erp` | `stock` | ERP/MRP |
| ADMIN | `section-admin` | `admin` | Admin |

Permissions disponibles : `caisse`, `collection`, `stock`, `ventes`, `admin` (cases à cocher par user).
Devise globale `usd`/`eur` (toggle `#btn-usd` / `#btn-eur`) — **USD = catalogue US par défaut actif**.
i18n FR/EN via `#btn-lang-toggle` (🇫🇷). 2 badges de statut header : `#connection-status-sdk` (SDK Stripe),
`#connection-status` (TPE, cliquable → reconnexion lecteur).

---

## 1. Écran de connexion — `#auth-screen`
- Champs : `#login-email` (texte, "Identifiant", autocomplete username), `#login-password`
  (password, "Mot de passe").
- Bouton `Se connecter` → `login(email, password)` (`auth.js`). Lien `Mot de passe oublié ?` →
  `forgotPassword()` (affiche un message, pas de vrai reset).
- ⚠️ Existe AUSSI un clavier PIN (`.pin-btn` / `.pin-dot`, `login(pin)`) câblé en bootstrap — vestige,
  l'auth réelle est identifiant + mot de passe.

---

## 2. Dashboard — `#section-dashboard`
Titre `#dashboard-welcome` = "Bonjour {prénom}". **5 cartes KPI** (`loadReporting()` → `GET /api/shopify/reports`) :

| Carte | id | Donnée |
|---|---|---|
| Aujourd'hui | `#stat-daily` | `daily` (CA jour Shopify) |
| Cette Semaine | `#stat-weekly` | `weekly` |
| Ce Mois | `#stat-monthly` | `monthly` |
| Base Clients | `#stat-crm` | `crmCount` |
| Emails Opt-in | `#stat-emails-clients` | `emailCount` |

Actions rapides : "Nouvelle Vente" → Caisse, "Voir Stock" → Collection.
"Dernières Transactions" `#dashboard-recent-sales` (3 dernières ventes, "Tout voir" → Ventes).

---

## 3. Caisse / POS — `#section-payment`
Titre "Nouvelle Vente" + `#current-vendor` (vendeur courant, masqué).

### 3.1 Sélecteur de devise
`#btn-usd` "USD (Catalogue US)" (actif par défaut) / `#btn-eur` "EUR (Catalogue FR)" →
`switchCurrency(curr)` (recharge produits + recalcule panier).

### 3.2 Bloc Client (formulaire de vente)
Bouton "🔍 Chercher Client" (`#btn-open-customers-tab`) → bascule sur l'onglet Clients.

| Champ | id | Type | Placeholder / options | Oblig.* |
|---|---|---|---|---|
| Prénom | `cust-firstname` | text | "Prénom" | ✅ |
| Nom | `cust-lastname` | text | "Nom" | ✅ |
| Email | `cust-email` | email | "Email (Obligatoire pour reçu)" | ✅ |
| Indicatif tél | `cust-phone-ext` | select | 🇺🇸+1 / 🇫🇷+33 (défaut +33) | |
| Téléphone | `cust-phone` | tel | "Téléphone" | |
| Adresse L1 | `cust-address` | text | "Adresse (Ligne 1)" | ✅ |
| Adresse L2 | `cust-address2` | text | "Appartement, suite… (Optionnel)" | |
| Ville | `cust-city` | text | "Ville" | ✅ |
| Code Postal | `cust-zip` | text | "Code Postal (ex: 10001)" | ✅ |
| État/Province | `cust-state` | text | "État / Province" | |
| Pays | `cust-country` | select | US (défaut) / FR | ✅ |
| Marketing email | `cust-accepts-email` | checkbox | coché par défaut (RGPD) | |
| Marketing SMS | `cust-accepts-sms` | checkbox | coché par défaut (RGPD) | |
| Notes client | `cust-note` | textarea | "Notes sur le client (goûts…)" | |

\* La validation `#btn-validate-customer` exige : firstname, lastname, email, address, city, zip,
country (sinon `.mandatory-empty` rouge + alerte). Bouton principal `#btn-validate-cust`
"Valider l'adresse (Calcul des Taxes)".

### 3.3 Catalogue produits — wizard 5 étapes (`#pos-wizard`)
Titre "Offre" + bouton "+ Pièce hors catalogue" (`#btn-custom-product`).
Barre de recherche `#search-catalog` ("Rechercher produit…") + boutons Rechercher/Réinitialiser
→ `searchWizard()` → `renderPosStep1()` (filtre les modèles, recherche **temps réel** sur `input`).

Fil d'ariane `#pos-breadcrumbs`. Étapes (chaque étape = grille de cartes cliquables) :
1. `#pos-step-1` `#pos-grid-models` — **Modèle** (`renderPosStep1`).
2. `#pos-step-2` `#pos-grid-materials` — **Matière** (+ "Retour aux modèles" `posGoBack(1)`).
3. `#pos-step-3` `#pos-grid-options` — **Option** (`posGoBack(2)`).
4. `#pos-step-4` `#pos-grid-colors` — **Couleur** (`posGoBack(3)`).
5. `#pos-step-5` `#pos-checkout-modes` — **Mode d'achat** : 2 cartes générées dynamiquement
   *Sur Place* / *Expédié DDP* (logique prix : voir `EXTRACTS.md §1`). `posGoBack(4)`.

Note de commande `#order-note` (textarea). Avertissement permanent : saisir ZIP + ville/État pour
les Sales Tax.

### 3.4 Pièce hors catalogue
Deux variantes : volet inline `#inline-custom-product` ET modale `#modal-custom-product` (z-index 9999).
- Champs : `inline-custom-item-name` / `custom-item-name` (Titre Shopify),
  `inline-custom-item-price` / `custom-item-price` (Prix HT).
- La modale affiche un **aperçu taxe en dur** : `#custom-tax-preview` = `prix × 0.08875` (Sales Tax
  estimées +8.875%) et `× 1.08875` (TTC). ⚠️ Taux NY hardcodé dans l'HTML (`oninput`).
- Ajout panier : `addInlineCustomItemToCart()` / `addCustomItemToCart()`.

### 3.5 Panier (`.cart-summary`)
- `#cart-items-list` : lignes injectées par `renderCart()` (`app.js:1051`) — chaque ligne = nom + SKU +
  prix + bouton suppression.
- Récap : `#cart-duties` = "Incluses", `#cart-tax` (Sales Tax via Shopify, `#cart-tax-zone` zone),
  `#cart-tax-lines` (détail lignes de taxe, masqué par défaut), `#cart-total-amount` (TOTAL À ENCAISSER).
- Le total déclenche `window.calculateCheckoutTaxes()` (`app.js:2604`) → `POST /api/shopify/calculate_taxes`.
- Boutons : `#btn-charge` "Lancer l'encaissement sur le TPE" (désactivé tant que panier vide) →
  `window.charge` (Stripe Terminal). `#btn-payment-link` "Générer Lien de Paiement (WhatsApp/Email)"
  → `generatePaymentLink()`.

### 3.6 Volet lien de paiement `#inline-payment-link`
`#generated-payment-link` (readonly, URL `/pay/:id`), boutons `copyPaymentLink()` (📋 Copier),
`shareWhatsapp()` (💬 WhatsApp). Statut paiement `#payment-status` (icône, `#status-title`,
`#status-message`, boutons Annuler/Nouvelle vente).

---

## 4. Clients / CRM — `#section-customers`
Titre "Annuaire Clients" + "+ Nouveau Client" (`#btn-add-customer-modal` → volet `#inline-add-customer`).
Carte KPI "Clients Opt-in (Marketing)" `#stat-emails-clients-page`.

### Moteur de recherche clients (`renderCustomers`, `app.js:1167`)
- Input `#search-customer` (recherche **temps réel** `input` + boutons).
- ⚠️ **Aucun résultat tant que le champ est vide** ("Saisissez votre recherche…").
- Filtre sur : **email** OU **"prénom nom"** (`includes`, insensible casse).
- Tri : priorité aux correspondances email.
- Résultat = `.list-item` : "Prénom Nom" + email + boutons **Modifier** (`editCustomer`) / **Choisir**
  (`selectCustomer` → préremplit le formulaire caisse + bascule sur Caisse).
- Source : `loadCustomers()` → `GET /api/shopify/customers` (`customersList` global).

### Volet nouveau client `#inline-add-customer`
Champs : `new-cust-first`, `new-cust-last`, `new-cust-email`, `new-cust-phone-ext`
(+1/+33/+44/+39), `new-cust-phone`, `new-cust-addr`, `new-cust-city`, `new-cust-zip`,
`new-cust-state`, `new-cust-country` (FR/US/IT/GB). Boutons : "Enregistrer"
(`saveCustomerModal(false)`), "Enregistrer & Caisse" (`saveCustomerModal(true)`), "Annuler".
→ `POST /api/shopify/customers`.

---

## 5. Ventes / Historique — `#section-history`
Titre "Historique des Ventes". Recherche `#search-history` (temps réel).

### Moteur de recherche ventes (`renderHistory`, `app.js:1283`)
- Filtre sur : **id/name de commande** OU **email client** OU **"prénom nom"** client.
- Source : `loadHistory()` → `ordersList` (commandes Shopify + ventes locales).
- Chaque résultat `.list-item-column` : date (`fr-FR` jj/mm/aaaa hh:mm), client (ou "Client Inconnu"),
  montant (gère centimes si `amount > 1000`), liste articles (`items[].name|sku`), **statut** :
  - `paid` → "Payé" ; `refunded` → "Remboursé" (barré) ; `partially_refunded` →
    "Partiellement Remboursé" ; `cancelled_at` → "Annulé" (barré).
  - Bouton remboursement → `refundOrder(orderId)` → `POST /api/refund_order`.

---

## 6. Collection / PLM — `#section-inventory`
Titre "Collection" + badge `#validated-models-count` "modèles actifs validés" + bouton
"＋ Nouveau Modèle" (`#btn-create-model-plm` → `createNewModel`). Recherche `#search-collection`.

### Moteur de recherche collection (`renderCollectionDashboard`, `app.js:1434`)
- Source : `loadCollection()` → `collection` (variants ERP).
- Filtre sur : **SKU** OU **modelName** (`includes`).
- Compte les `Validé` (`plm-status`/`status`) → `#validated-models-count`.
- **Arborescence à 3 niveaux** : Modèle (`posModel`) → Matière (`posMaterial`) → Option (`posOption`)
  → déclinaisons. Carte `.model-card-premium` repliable (clic) :
  - par déclinaison : couleur (`getColorName`) + quantité, SKU, prix (`plm-price-usd-ht` → "$x.xx"),
    pastille statut (Validé/Brouillon), bouton **Modifier** (`openProductSheet(sku)`).
  - bouton **+ Déclinaison** par modèle (`createNewDeclination(mName)`).

---

## 7. Fiche Technique PLM — modale `#modal-product-sheet`
Le formulaire le plus riche (`#fiche-technique-form`). Titre `#sheet-title` + SKU live
`#generated-sku` (`generateUISKU()`, recalcul sur change de model/year/season/option/material/color).
Sauvegarde `savePLM` → `POST /api/erp/variant`. Sections :

**1. Identification** : `plm-model-name` (select) ou nouveau (`plm-new-model-name`,
`plm-new-model-id`), `plm-material-global` (select, requis), `plm-color`, `plm-size`,
`plm-year` (2025/2026), `plm-season` (H Hiver / F Été).

**2. Options fonctionnelles** : `plm-option-1` (Aucune/Avec Pochon/Sans Pochon),
`plm-option-2` (Aucune/Avec Chaîne/Sans Chaîne), bouton "+ Ajouter une option" (`#btn-add-option`).

**3. Fabrication** : `plm-atelier` (select requis).

**4. Matières** (BOM) : Matière principale `plm-mat1-animal/type/color/qty/supplier/details`.
Toggles (cases) ajoutant des blocs dynamiques : Matière secondaire (`plm-mat2-*`), tertiaire
(`plm-mat3-*`), Doublure (`plm-lining-*`). Chaque bloc : animal, type, coloris, quantité, fournisseur.

**5. Bijouterie** : toggle `plm-has-bij1` → `plm-bij1-details/qty/supplier`. `#extra-bijouteries`
(bijouteries 2-4 ajoutées dynamiquement).

**6. Prix & Coûts** : `plm-price-usd-ht` (Price HT USD), `plm-duties-shipping-usd`,
`plm-final-price-ddp`.

**7. Logistique & Douanes** : `plm-hs-code` (Code HS), `plm-country-origin` (Pays d'origine).

**8. Statut** : `plm-status` (Brouillon / Validé).

Actions : "Sauvegarder la Fiche Technique" (`#btn-save-plm`), "Sync Shopify" (`#btn-sync-shopify` →
`syncToShopify` → `POST /api/erp/sync_shopify`), "Supprimer" (`#btn-delete-plm` →
`deleteDeclination` → `DELETE /api/erp/variant/:sku`).

> ⚠️ Les `<select>` (animal, type, couleur, fournisseur, atelier, hs, origine, matière globale) sont
> peuplés dynamiquement par `populateSelect(id, dataList)` (`app.js:1964`) depuis `config` ERP.

---

## 8. OPS / ERP — `#section-erp`
Titre "OPS". 4 onglets `.erp-tab` (`loadERPModule(tab)`) : **Dashboard / Stock Matières /
Production / Stock Pièces**.

### 8.1 Dashboard ERP `#erp-dash` (`loadERPDash`)
3 cartes : Alertes Matières (Qté 0) `#erp-stat-mat-alert`, Alertes Pièces (Qté 0)
`#erp-stat-pieces-alert`, Prods en cours `#erp-stat-prod-count`. Liste "Dernières alertes stock"
`#erp-dashboard-alerts`.

### 8.2 Stock Matières `#erp-materials` (`renderERPMaterials`, `app.js:180`)
Bouton "+ Nouvelle Réception" (`openReceiveMaterialsModal`). Recherche `#search-materials` (temps réel).

**Filtres (selects)** : `filter-mat-cat` (Toutes/Peaux/Bijoux), `filter-mat-animal`, `filter-mat-type`,
`filter-mat-jewelry`, `filter-mat-color` (peuplés dynamiquement). Bouton "Appliquer les Filtres".

**Moteur de recherche matières** : filtre texte sur concat de `category + animal + leather_type +
color + location + id`. **Regroupement** : Peaux → "{animal} {leather_type}", Bijoux → "Bijoux
({detail})", Doublure → "Doublure {animal}". **Pagination** : 20 groupes visibles (`matVisibleCount`),
bouton "Charger plus (N restants)". Total stock par groupe = somme `rolls|quantity` (+ `feet`).
Source : `window.erpMaterials`.

**Sortie exceptionnelle matière** : `erp-sortie-mat-select` (matière), `erp-sortie-mat-qty`,
`erp-sortie-mat-user` → `submitSortieExceptionnelle('mat')` → `POST /api/erp/stock_movement`.
Historique `#erp-movements-history` (`renderERPMovements`, revert possible via `revertMovement`).

### 8.3 Production `#erp-prod` (`loadERPProduction`)
"Suivi des Ordres de Production" `#erp-production-list` → `GET /api/erp/production_orders`.

### 8.4 Stock Pièces `#erp-log` (`renderERPStockPieces`, `app.js:418`)
Liste pièces finies `#erp-pieces-list` (par déclinaison). Sortie exceptionnelle pièces :
`erp-sortie-pieces-select/qty/user` → `submitSortieExceptionnelle('pieces')`. Historique
`#erp-pieces-movements-history`. Édition directe : `openStockEditPieces(declKey, declName)`.

### 8.5 Modales ERP
- **Matière** `#modal-erp-material` : `mat-id` (hidden), `mat-category` (ex Taurillon),
  `mat-leather-type` (ex Lagun), `mat-detail`, `mat-color`, `mat-feet` (Pieds), `mat-rolls`
  (Rouleaux), `mat-location` (ex E1-R3), `mat-min` (Stock Min alerte). → `POST /api/erp/materials`.
- **Modif manuelle** `#modal-direct-edit` : `direct-edit-id/group/color` (hidden),
  `direct-edit-qty`, `direct-edit-feet` → `submitDirectEdit()`.
- **Réception** `#modal-erp-receipt` : `receipt-supplier` (Tannerie Haas / Degermann / Bodin Joyeux /
  Atelier de Bijouterie), `receipt-date`, lignes d'articles dynamiques (`addReceiptItem`,
  `toggleReceiptFields`), "Valider et Créer le Stock" (`finalizeReceipt` →
  `POST /api/erp_receive_materials`).

---

## 9. Admin — `#section-admin`
Titre "ADMINISTRATION". 2 onglets `.admin-tab` (`loadAdminModule`) : **Base de Données (BDD) /
Utilisateurs**.

### 9.1 Config BDD `#admin-config` (`renderConfigTable`, `app.js:1706`)
Select `#config-category-select` (18 catégories) → édite le dictionnaire `config` correspondant :
`animalTypes, years, ateliers, jewelry, hsCodes, colors, materialDetails, linings, suppliers,
materials, globalMaterials, models, options, origins, seasons, sizes, optionTypes`.
- Tableau `#config-table-container` : édition/suppression (`editConfigItem` / `deleteConfigItem`).
- **Frais de port globaux** : `#admin-shipping-cost` → `saveShippingCost()` (config `shippingCost`).
- **Ajouter un élément** : `config-new-name` + `config-new-id` (ID manuel court, ex AA001) →
  `#btn-add-config-item`.
- **Import CSV prix** : `#admin-csv-upload` (.csv "app_base_v3.csv") → `uploadProductCSV()` →
  `POST /api/erp/import_csv`, statut `#csv-upload-status`.
Sauvegarde globale config → `saveERPConfig` → `POST /api/erp/config`.

### 9.2 Utilisateurs `#admin-users` (`loadUsers`, `app.js:2387`)
Liste `#admin-users-list` (édition inline `saveUserInline`, blocage `toggleBlockUser`, suppression
`deleteUser`). **Ajout user** : `new-user-firstname`, `new-user-lastname`, `new-user-email`,
`new-user-password` (Mot de passe / PIN), `new-user-commission` (%), **permissions** (cases
`perm-caisse`, `perm-collection`, `perm-stock`, `perm-ventes`, `perm-admin`) → `createUser()` →
`POST /api/users`. (Édition `PUT /api/users/:id`, suppression `DELETE /api/users/:id`.)

---

## 10. Récapitulatif des moteurs de recherche

| Écran | Input | Champs cherchés | Comportement | Fonction |
|---|---|---|---|---|
| Caisse catalogue | `#search-catalog` | modèles (étape 1) | temps réel, re-render wizard | `searchWizard`→`renderPosStep1` |
| Clients | `#search-customer` | email, "prénom nom" | temps réel, **vide = rien**, tri email | `renderCustomers` |
| Ventes | `#search-history` | id commande, email, "prénom nom" | temps réel | `renderHistory` |
| Collection | `#search-collection` | SKU, modelName | temps réel, arbo 3 niveaux | `renderCollectionDashboard` |
| Stock Matières | `#search-materials` | category, animal, leather_type, color, location, id | temps réel + 5 selects de filtre, pagination 20 | `renderERPMaterials` |

> Tous les moteurs sont **côté client** (`Array.filter` + `includes` insensible casse) sur des données
> déjà chargées en mémoire. Aucun endpoint de recherche serveur — point à revoir en V2 si volumétrie.

---

## 11. Sources de données par écran (rappel)
| Écran | Endpoint(s) | Variable globale |
|---|---|---|
| Dashboard | `GET /api/shopify/reports` | — |
| Caisse (produits) | `loadProducts(currency)`, `GET /api/shopify/product_by_sku/:sku` | `collection`/`cart` |
| Caisse (taxes) | `POST /api/shopify/calculate_taxes` | — |
| Clients | `GET /api/shopify/customers` | `customersList` |
| Ventes | `GET /api/sales` + orders Shopify | `ordersList` |
| Collection/PLM | `GET /api/erp/collection`, `POST /api/erp/variant` | `collection` |
| Matières | `GET /api/erp/materials`, `/movements` | `window.erpMaterials` |
| Production | `GET /api/erp/production_orders` | — |
| Config | `GET/POST /api/erp/config` | `window.erpConfig` |
| Users | `GET/POST/PUT/DELETE /api/users` | — |

*Généré le 2026-06-06 depuis `public/index.html` + `public/app.js` (commit `683baba`).*
