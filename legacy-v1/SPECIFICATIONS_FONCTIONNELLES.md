# Spécifications Fonctionnelles - Tiraboschi POS / ERP

Ce document décrit de manière exhaustive l'architecture et les fonctionnalités du système applicatif "Point de Vente (POS) et ERP" de la Maison Tiraboschi, conçu spécifiquement pour la maroquinerie de luxe et les événements de type Trunk Show.

---

## 1. Architecture Globale

L'application suit une architecture légère, autonome et résiliente, pensée pour ne pas dépendre entièrement d'une connexion internet stable (hors encaissement Stripe) :

*   **Frontend (Côté Client)** : HTML5, CSS3, Vanilla JavaScript (`app.js`, `style.css`). Aucune librairie complexe (React/Vue) n'est utilisée pour garantir une vitesse d'exécution maximale.
*   **Backend (Côté Serveur)** : Node.js avec Express (`server.js`). Fournit les API (CRUD) permettant de lire et d'écrire la donnée.
*   **Base de Données** : Fichiers plats locaux au format JSON (`data/erp_db.json`, `data/orders.json`, `data/inventory.json`). Cela permet une sauvegarde simple, une lecture ultra-rapide et l'éviction de dépendances lourdes (SQL).
*   **Paiement** : Intégration du SDK **Stripe Terminal** pour communiquer avec les lecteurs de cartes physiques (ex: Stripe S710).

---

## 2. Direction Artistique ("The Blue Sole")

Le design system a été pensé pour refléter l'ADN luxe de la marque (inspiration Tom Ford x Signature Bleu Azur) :
*   **Couleurs** : Noir profond (`#050505`), panneaux de verre assombris (`rgba(15, 15, 15, 0.95)`), accent "Bleu Azur" (`#00D4FF`).
*   **Boutons** : Noirs avec texte blanc et une subtile ligne d'ombre Bleu Azur en bas (rappel de la semelle iconique).
*   **Typographie** : Utilisation de `Inter`. Les titres sont en majuscules (uppercase) avec un crénage large (`letter-spacing: 0.15em`) pour un style éditorial.
*   **Composants UI** : Angles droits ou très légèrement arrondis (`border-radius: 4px`), focus lumineux uniquement à l'interaction.

---

## 3. Modules Fonctionnels

### 3.1. Traduction Native (i18n)
*   **Moteur interne** : Un dictionnaire bilingue (FR/EN) est embarqué dans `app.js`.
*   **Fonctionnement** : Un bouton permet de basculer la langue par défaut (US / EN). Le système scanne le DOM et remplace instantanément tous les textes statiques et les attributs `placeholder`.
*   **Avantage** : Traduction 100% fiable, sans dépendance externe (Google Translate), évitant les problèmes d'affichage.

### 3.2. Dashboard (Tableau de Bord)
*   **KPIs** : Affichage des ventes du Jour, de la Semaine et du Mois.
*   **Actions Rapides** : Accès direct à la nouvelle vente ou au stock.
*   **Dernières Transactions** : Liste synthétique des 3 dernières commandes générées.

### 3.3. Module Caisse (POS)
C'est le cœur de l'application destiné aux vendeurs lors des Trunk Shows.

*   **Gestion Client** : 
    *   Formulaire de saisie complet (Nom, Email, Téléphone avec indicatif par défaut +1 ou +33, Adresses).
    *   Gestion RGPD (Cases à cocher pour le marketing Email et SMS).
*   **Devise** : Bascule dynamique EUR / USD. Adapte les pré-calculs de taxes.
*   **Assistant de Vente (Wizard en 4 Étapes)** :
    1.  *Modèle* : Sélection visuelle du sac (ex: Olympe).
    2.  *Couleur* : Filtrage des couleurs existantes pour le modèle choisi.
    3.  *Options* : Sélection des finitions (ex: Chaîne dorée, Strap croco).
    4.  *Mode d'Achat* : L'algorithme calcule dynamiquement le prix en fonction de la situation du client :
        *   **Sur Place (Take away)** : Le client repart avec la pièce. Ajout de la TVA (20% en EUR) ou de la *Sales Tax* locale estimée (8% en USD).
        *   **Expédié (Shipped DDP)** : Le sac partira de l'Atelier. Ajout des frais de port forfaitaires (30€ en EUR, 100$ en USD) et des frais de douane (Duties) évalués à 9% pour les USA. Le SKU reçoit un suffixe `-DDP` pour prévenir la logistique.
*   **Article Hors Catalogue** : Possibilité de créer un produit sur-mesure à la volée. Enregistre des attributs stricts pour la synchronisation Shopify (SKU, Code-barres, Poids, Politique de rupture de stock).
*   **Panier & Encaissement** :
    *   Détail ligne par ligne avec SKU et boutons de suppression.
    *   Les prix affichés dans le panier s'entendent toujours **Toutes Taxes et Douanes Comprises** pour une transparence totale.
    *   Bouton déclenchant l'envoi du montant total direct sur le Terminal Stripe physique.

### 3.4. Module ERP & PLM (Gestion des Produits & Nomenclatures)
Outil destiné au chef d'atelier ou à l'administrateur de production.

*   **Catalogue Visuel** : Liste groupée de tous les modèles avec compteurs de déclinaisons.
*   **Générateur de Fiche Technique (PLM)** :
    *   Création ou modification d'une déclinaison.
    *   **SKU Engine** : Génération automatique, infaillible et incrémentale du SKU. Format : `[MODÈLE][ANNÉE][SAISON]-[MATIÈRE]-[OPTION]-[COULEUR]`. (ex: `OL25H-CU001-002-NR`). Si la combinaison existe déjà, le système incrémente la fin (ex: `-01`, `-02`).
    *   **Nomenclature (BOM - Bill of Materials)** : Sélection des composants précis (Matière principale, Bijouterie, Doublure, Packaging).
    *   **Finance** : Saisie du coût de revient (Matière + Façon), saisie des prix de vente HT de base (en EUR et USD). Le formulaire auto-calcule instantanément et de manière visuelle les équivalents TTC (TVA 20%) ou Taxes US.

### 3.5. Module Traçabilité & Stocks (MRP)
*   **Réception Fournisseur** : Formulaire permettant de générer un "Bon de Réception interne" palliant l'absence de BL fournisseur.
*   **Traçabilité Matière** : Génération automatique d'étiquettes QR Code pour les nouveaux rouleaux de cuir.
*   **Alerte Stock** : Suivi des niveaux critiques sur les accessoires (bouclerie, doublure) et les produits finis.

---

## 4. Logique de Données (erp_db.json)

Le fichier `erp_db.json` est le cœur de l'entreprise. Il centralise :
*   `materials` : Les matières premières (ex: CU001 pour Cuir, CE001 pour Cuir Exceptionnel).
*   `hardware` : La bijouterie et les finitions.
*   `linings` : Les doublures.
*   `colors` : Le dictionnaire des codes couleurs.
*   `optionTypes` : Les types de chaînes ou bandoulières.
*   `variants` : La liste définitive des 16 déclinaisons de sacs actuellement au catalogue, servant de source de vérité pour les fiches techniques et le POS.

---

## 5. Perspectives d'Évolution (V2)

1.  **Synchronisation Bi-directionnelle Shopify** : Déploiement des APIs pour pousser les nouveaux produits Hors Catalogue ou les nouvelles Fiches Techniques directement sur le site E-commerce via GraphQL.
2.  **Auth JWT** : Remplacement du login par PIN basique par un système sécurisé basé sur des jetons JWT et la définition stricte des permissions (Vendeur vs Admin).
3.  **Webhook Stripe** : Écoute des paiements confirmés pour générer la facture PDF instantanée et décrémenter le stock dans le module MRP.
