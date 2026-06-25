# Feature — Acompte / Solde + Devis / Facture PDF + Alertes + Relance

> Spec validée le 2026-06-25 (parcours + décisions actées avec le lead). Contrat de réalisation.

## Objectif
Permettre au vendeur, face au client, de créer une commande avec **calcul de taxe Shopify**,
de proposer un paiement **100 %** ou **50 % maintenant / 50 % à la réception**, de générer un
**devis ou une facture PDF**, d'envoyer **document + lien de paiement**, de suivre la commande
**en attente** (app + Shopify) avec **alertes**, et de **relancer le 2ᵉ lien sans re-saisie**.

## Décisions actées
1. **Acompte = déclencheur.** Au paiement de l'acompte, on crée une **Order Shopify « partiellement payée »** et la **production démarre** (l'acompte sécurise la fabrication). Le solde la passe « payée ».
2. **Lien du solde = manuel** depuis Sales, au moment de l'expédition (« solde à la réception »).
3. **PDF** : aperçu dans l'app + téléchargement + envoi email (PDF joint).
4. **Taxe** : Shopify = seule source de vérité (`draftOrderCalculate`), aucun calcul maison.
5. **PDF rendu via Chromium/Playwright** (préinstallé) à partir d'un gabarit HTML brandé (fidèle à la maquette « Balance Invoice »).

## Statuts de la vente (app) et correspondance Shopify
| App `Sale.status` | Sens | Shopify |
|---|---|---|
| `PENDING` | créée, acompte non payé, lien envoyé | **Draft Order** (en attente) |
| `AWAITING_BALANCE` | acompte payé, solde dû | **Order** `financial_status: partially_paid` (+ transaction acompte) ; **production lancée** |
| `PAID` | soldée (100 % ou solde encaissé) | **Order** `paid` ; orchestration fulfillment complète |
| `CANCELLED` / `REFUNDED` | annulée / remboursée | Order annulée / remboursée |

> 100 % d'emblée : `PENDING` → (paiement) → `PAID` (Order payée directement).

## Modèle de données — champs à ajouter sur `Sale` (migration)
- `paymentPlan` : `FULL` | `DEPOSIT_50` (extensible).
- `depositCents`, `balanceCents` (dérivés du total TTC Shopify).
- `depositPaidAt`, `balancePaidAt` (DateTime?).
- `depositStripeSessionId`, `balanceStripeSessionId` (String?).
- `shopifyDraftOrderId` (String?) — en phase devis/avant acompte.
- `documentType` (`QUOTE` | `INVOICE`, dernier généré) — optionnel, traçabilité.
- (`shopifyOrderId`, `paymentUrl`, `stripeSessionId`, `paidAt` existent déjà.)

## Parcours détaillé
1. **POS** : panier (vignettes) + client + marché → **valider l'adresse** → taxe Shopify. Choix **100 % / 50-50**.
2. **Devis/Facture** : génération PDF (aperçu → télécharger / envoyer email). Création d'un **Draft Order Shopify** (panier + client + taxe). Statut app `PENDING`.
3. **Lien acompte** : Stripe Checkout pour l'acompte (ou 100 %) → page `/pay/:id` (anti-blocage in-app, bilingue).
4. **Acompte payé** (webhook Stripe) :
   - App : `AWAITING_BALANCE` (ou `PAID` si 100 %), `depositPaidAt` + session enregistrés.
   - Shopify : Draft → **Order `partially_paid`** avec transaction d'acompte ; **production lancée** (orchestration existante).
5. **Suivi & alertes** : Sales liste les commandes `PENDING` (acompte impayé) et `AWAITING_BALANCE` (solde dû) ; écran/badge d'alertes (étend le watchdog).
6. **Relance / solde** : depuis Sales, **« Renvoyer le lien »** (acompte) ou **« Encaisser le solde »** → 2ᵉ session Stripe pour le reste à charge, **à partir des données stockées** (zéro re-saisie). Envoi email/WhatsApp/SMS.
7. **Solde payé** : app `PAID` ; Shopify Order → `paid` ; fulfillment complété.

## Briques techniques
- **PDF** : service `services/invoice.ts` (HTML brandé → PDF via Playwright/Chromium). Gabarit devis & facture (en-tête Tiraboschi, lignes, taxes détaillées Shopify, blocs Acompte/Solde). Route `GET /api/pos/sales/:id/document?type=quote|invoice` (aperçu/téléchargement) + envoi email.
- **Stripe** : 2 sessions Checkout (acompte, solde) ; webhook `checkout.session.completed` matché par session id + jambe (acompte/solde) ; idempotence.
- **Shopify** : à l'acompte, création Order `partially_paid` (+ transaction) depuis le draft ; au solde, transaction finale → `paid`.
- **Alertes** : extension Sales + watchdog (commandes impayées / solde dû, ancienneté).
- **Front** : option de plan de paiement au POS ; fiche vente enrichie dans Sales (statut, acompte/solde, boutons relancer/encaisser solde, télécharger devis/facture) ; i18n FR/EN.

## Hors périmètre (pour l'instant)
- Échéancier > 2 paiements ; relances automatiques programmées (les alertes sont manuelles/visuelles d'abord).
