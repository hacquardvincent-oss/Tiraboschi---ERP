# SPEC_FONCTIONNEL_V2.md — Tiraboschi POS / ERP (V2)

> Spécification fonctionnelle de référence, issue du brief produit (2026-06-07) + recommandations
> de reprise de lead. Complète `CADRAGE_V2.md` (décisions techniques) et `AUDIT_V1.md`.
> **Cible** : POS terrain (vendeurs) greffé sur un PLM/ERP (produit + logistique), synchronisé
> Shopify, piloté par un **référentiel central** (Admin).

---

## 0. Principes structurants (à ne jamais perdre de vue)

1. **L'Admin/référentiel est le socle de TOUT.** Les formulaires (Collection, POS) ne peuvent
   fonctionner que si les listes (matières avec **ID**, couleurs, options, ateliers, fournisseurs,
   HS codes, frais de transport…) existent. → **construit en premier.**
2. **Aucune saisie libre sur les champs à ID** (matière, couleur, modèle…) : toujours des listes
   issues du référentiel → SKU cohérents + sync Shopify fiable (la dette n°1 de la V1).
3. **Langue ≠ Marché.** Langue UI (FR/EN) **indépendante** du marché de vente
   (France/EU → EUR + TVA 20% ; US → USD + sales tax + DDP). Deux sélecteurs distincts.
4. **Rôles appliqués côté serveur** (pas cosmétiques comme en V1) : Vendeur / Produit / Logistique / Admin.
5. **Shopify = master au démarrage** (catalogue), l'app monte en puissance jusqu'à devenir master
   (cf. `CADRAGE_V2.md` §4 — source de vérité par paliers).

---

## 1. Header (toutes pages)
- **Indicateurs de connexion temps réel** : 🟢/🔴 **TPE Stripe Terminal S710** connecté, 🟢/🔴 **API Stripe**.
  Un vendeur doit le voir **avant d'encaisser**.
- Sélecteur **Marché/Devise** (EUR / USD) + sélecteur **Langue** (FR / EN), distincts.
- Utilisateur courant + déconnexion.

## 2. Home (Accueil)
- **Accès facilité** aux entrées du menu (raccourcis).
- **« Bonjour {prénom vendeur} »**.
- **KPIs** : CA du **jour**, cumul **semaine**, cumul **mois** (source : Shopify). Météo (nice-to-have).
- Dernières transactions (3-5).

## 3. POS (Caisse) — vendeurs
- **Infos client** : recherche client existant (CRM) ou création rapide (nom, email, tél +33/+1, adresses, RGPD).
- **Récupération de l'offre produit** : catalogue (depuis Collection/Shopify), sélection de la référence.
- **Calcul du panier** selon le **marché** :
  - France/EU : **TVA 20%** (EUR).
  - US : **sales tax** réelle par destination (via Draft Orders Shopify, cf. `legacy-v1/EXTRACTS.md`),
    option **Expédié DDP** (frais de port paramétrables + duties incluses, suffixe SKU `-DDP`).
- **Envoi de la commande sur le TPE Stripe Reader S710** (PaymentIntent capture).
- **Lien de paiement** Stripe (WhatsApp/Insta) + page `/pay/:id` (à conserver de la V1).
- Article hors-catalogue à la volée.

## 4. Collection (PLM) — produit + vente
- **Récupération de la collection depuis Shopify** : fiches produit par collection.
- **Recherche** de référence (vendeurs + équipe produit).
- **Création / modification** de références **avec MAJ du catalogue Shopify** (sync bidirectionnelle).
- **Fiche technique complète (PLM / BOM)** — s'inspirer d'un vrai PLM (cf. `docs/specs/FICHES_TECHNIQUES…xlsx`) :
  matière principale (animal/type/coloris/quantité/fournisseur), matière secondaire, doublure,
  bijouterie 1-4, packaging, ateliers, coûts (revient + façon), prix HT EUR/USD → TTC auto.
- **Moteur SKU intégré au formulaire** (règles CDC) : génération auto à partir des valeurs du
  référentiel, avec incrément (modèle, couleur ⚠️ Noir=999). *(moteur déjà codé + testé)*
- Sert de **base aux ordres de production** (toutes les infos de conception y sont).

## 5. CRM — vendeurs
- **Moteur de recherche client** : retrouver vite un client.
- **Fiche client** : habitudes d'achat, historique, **données manquantes** mises en évidence (RGPD/contact).
- **Formulaire d'ajout** client. Base synchronisée Shopify.

## 6. Sales (Ventes) — vendeurs
- **Historique des commandes** + moteur de recherche.
- **Annuler / rembourser / modifier** une commande (refund Stripe + cancel/maj Shopify).
- (reco) statut de paiement + n° de série des pièces vendues.

## 7. Inventaire (MRP) — logistique
Workflow complet (cf. `docs/specs/Inventaire…xlsx` + `CADRAGE_V2.md` §5 P4) :
- **Gestion de l'inventaire** matières (peaux, bijoux…) **et** pièces finies, avec **ID matière**
  (`PEA-VEA-DEL-001`, règles de nommage du fichier).
- **Réception matières** (bon de réception) → **arrivée entrepôt**.
- **Sorties matières** : exceptionnelle / **vers ateliers** (+ matières en transit).
- **Ordre de production** vers ateliers, **déclenché par les commandes clients**.
- **Suivi de production** (statuts) → **récupération de la marchandise** (bon de réception pièces + n° série).
- (reco) **scan code-barres/QR** (réception + inventaire tournant), **alertes seuil**, **valorisation**,
  **bons de commande fournisseur auto** depuis les besoins BOM.

## 8. Admin — administrateur
- **Gestion des utilisateurs** (CRUD, rôles, permissions).
- **Pilotage de la base de données / référentiel** : accès à **tous les champs pré-remplis** qui
  alimentent les formulaires de l'app. Ex. base **Animal, Matière 1, Matière 2, Type de peau,
  Doublure, Couleurs (+ID), Options, Tailles, Modèles, Saisons, Bijouterie, Fournisseurs, Ateliers,
  HS codes, Origines**. Chaque matière a un **ID** (cf. docs).
- **Import/Export Excel/CSV** : base **matières**, **produits**, **utilisateurs**.
- **Paramétrage des frais de transport** → consommés par le calcul POS (DDP).

---

## 9. Transverse (recommandations de reprise)

### Formulaires 🔑
- **Pilotés par le référentiel** (dropdowns Admin), validation **Zod**, champs requis, erreurs inline.
- **Brouillon/autosave** pour les fiches techniques (40+ champs).
- **Recherche/autocomplete** (matières, clients, références).
- Composants réutilisables, **tactiles** (≥44px) pour le POS.

### Rôles & permissions
- Vendeur · Produit · Logistique · Admin. Menu bas adapté aux permissions ; **contrôle serveur** (JWT + autorisation par route).

### International
- **Langue UI (FR/EN)** ≠ **Marché/Devise/Taxe**. Champs contenu produit bilingues pour Shopify.

### Intégrations
- **Stripe Terminal S710** (connection token, PaymentIntent), **Stripe Checkout** (liens + `/pay/:id`),
  **Shopify Admin API** (GraphQL récent, sync bidirectionnelle), watchdog réconciliation (déjà en place).

### Fonctionnalités manquantes recommandées
- Vendeur : lien de paiement, **PDF facture/reçu**, dispo stock à la vente, commissions, **POS hors-ligne**.
- Logistique : **n° de série par pièce**, scan QR/code-barres, alertes seuil, PO fournisseur auto, valorisation.
- Transverse : **journal d'audit**, **recherche globale**, import/export Excel.

---

## 10. Roadmap re-séquencée (par dépendances)

| Ordre | Brique | Pourquoi à ce niveau |
|---|---|---|
| **1** | **Admin / Référentiel** (matières+ID, couleurs, options, modèles, saisons, ateliers, fournisseurs, HS, **frais de transport**) + **import** de la base existante | Socle : alimente tous les formulaires |
| **2** | **Collection / PLM** : fiche technique + **SKU intégré** + recherche + sync Shopify | Dépend du référentiel ; base des ordres de prod |
| **3** | **POS** : client → produit → panier (TVA/sales tax) → **TPE S710** + liens de paiement | Dépend du catalogue + référentiel |
| **4** | **Inventaire / Production** : réception → sorties → OP → suivi → réception pièces (+ n° série) | Dépend du référentiel + Collection (BOM) |
| **5** | **CRM** + **Sales** (historique, refund/cancel) | S'appuie sur Shopify + commandes POS |
| **6** | **Header** (indicateurs TPE/Stripe) + **Home** (KPIs) | Transverse, branché une fois les flux en place |

> Auth JWT + persistance (Postgres) : **déjà en place**. Watchdog sync Stripe↔Shopify : **déjà en place**.

---

## 11. État au 2026-06-07
- ✅ Backend déployé, auth JWT, ERP module 1 (matières/fournisseurs/ateliers/mouvements), watchdog.
- ✅ Frontend V2 (menu bas, i18n, €/$), login OK.
- ✅ Moteur SKU (CDC) + tests.
- ✅ **Brique 1 — Référentiel Admin** : `RefItem` + seed 17 dictionnaires + API `/api/ref` + écran Admin.
- ✅ **Brique 2 — Collection/PLM** : `Product` + API `/api/products` (CRUD+recherche, SKU serveur) +
  écran catalogue/recherche + fiche technique pilotée par le référentiel (dropdowns) + SKU auto.
- ⏭️ **Prochaines** : import matières réelles (`docs/specs/`, arbitrages à trancher) · édition de fiche ·
  **sync Shopify** (pull collection + push) · brique 3 **POS** (TPE S710 + taxes).
