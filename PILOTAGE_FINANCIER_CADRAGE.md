# Pilotage financier Tiraboschi — Dossier de cadrage

> Version 1.0 — 2026-09-11 · Rédigé pour arbitrage par Vincent Hacquard
> Périmètre : P&L de gestion, contrôle de gestion (atterrissages 2+10 / 3+9), suivi des
> prestataires, analyse du PRI, connexion comptable Pennylane.
> Documents liés : `ARCHITECTURE_ECOSYSTEME.md`, `HANDOFF_V2_SCOPING.md`, `CONTEXT.md`

---

## 0 · Décisions actées (session du 2026-09-11)

| # | Décision | Statut |
|---|---|---|
| **D6** | **Phase 0 avant tout développement** : paramétrer l'analytique Pennylane et piloter un mois réel, pour mesurer le gap avant d'engager du code | ✅ acté |
| **D7** | L'outil sera une **application séparée** (interface + authentification dédiées), et non un module du back-office POS | ✅ acté |
| **D7bis** | Réserve technique associée : l'app séparée **lit la base MongoDB de l'écosystème en lecture seule** plutôt que de dupliquer BOM et ventes. Séparation = accès et interface, jamais duplication de données | ⚠️ à confirmer |
| **D8** | Ordre des chantiers : C1 (migration base) → C2 (sécurité) → Phase 1 (PRI/marge) → Phase 2 (P&L/atterrissage) | ⚠️ à valider |

---

## 1 · Le diagnostic

### 1.1 Ce que Pennylane sait déjà faire

Vérifié le 2026-09-11 sur la documentation officielle :

| Fonction | Disponibilité | Remarque |
|---|---|---|
| P&L analytique | ✅ existe | Comptabilité > Compte de résultat > mode analytique |
| Plan analytique structuré (axes croisés) | ⚠️ **non actif par défaut** | À activer dans les options avancées — module payant supplémentaire |
| Budget / atterrissage | ✅ existe | Colonnes budget éditables, réel automatique, écarts calculés |
| Prévisionnel de trésorerie | ✅ existe | Inclus à partir de l'offre Essentiel |
| Scénarios multiples | ❌ | Limite remontée par les utilisateurs |
| Dashboards personnalisables | ❌ | Limite remontée par les utilisateurs |
| Prévisionnel automatisé | ❌ | Reste saisi à la main |

**Hypothèse principale du diagnostic** : le manque ressenti (« je ne retrouve pas les dashboards
de contrôle de gestion ») vient probablement d'un **plan comptable non ventilé analytiquement**,
pas d'une incapacité de l'outil. Tant que les achats de peaux, la sous-traitance façon, le
marketing et la structure tombent dans des comptes 6 génériques sans axe analytique, **aucun
outil ne produira un P&L de gestion exploitable** — on aura déplacé le problème dans une
interface plus jolie. C'est ce que la Phase 0 doit trancher, avec des faits.

### 1.2 Ce que Pennylane ne pourra jamais produire

Trois manques structurels, et ce sont eux qui justifient de construire :

**a) Le P&L mensuel est faux sans variation de stock.**
Pennylane enregistre une peau d'alligator en charge le mois de comptabilisation de la facture
tannerie (601/607). Si la peau est achetée en mars et que le sac part en novembre, mars est
artificiellement catastrophique et novembre artificiellement euphorique. Le coût des ventes réel
exige la **variation de stock (compte 603x)**, qui suppose une valorisation mensuelle du stock
matières et des en-cours — que **seul l'ERP connaît** (BOM × consommations × prix d'achat réels).

> Conséquence positive : l'ERP peut produire l'**état de stock mensuel valorisé** dont
> l'expert-comptable a besoin pour passer l'écriture de variation. Le projet n'améliore donc pas
> seulement un dashboard parallèle — il fiabilise la comptabilité officielle.

**b) L'atterrissage 2+10 exige un prévisionnel de CA que Pennylane ne peut pas connaître.**
Les 2 mois de réel viennent de la comptabilité. Les 10 mois restants viennent du **carnet de
devis** (états `envoye` / `consulte` / `accepte`, pondérés par un taux de transformation), du
**calendrier des trunk shows** et du stock disponible — données de la Plateforme. Sans cette
moitié, l'atterrissage n'est qu'une extrapolation de l'exercice précédent, donc sans valeur
décisionnelle.

**c) Le PRI est un calcul ERP, pas un calcul comptable.**
Pennylane connaît le montant d'une facture tannerie. Il ignore le prix au dm², la consommation
par modèle, le taux de chute, le coût de façon par pièce et les heures d'atelier. Le PRI par SKU
se calcule à partir du BOM, pas du grand livre.

### 1.3 Arbitrage build / buy

| Brique | Verdict | Raison |
|---|---|---|
| Suivi de trésorerie | **Acheter / utiliser Pennylane** | Commodité. Marché : Fygr ~39-79 €/mois, Agicap 150-799 € HT/mois |
| P&L analytique brut | **Utiliser Pennylane** | Existe nativement, à paramétrer |
| P&L **de gestion corrigé de la variation de stock** | **Construire** | Aucun SaaS n'a le BOM |
| Atterrissage 2+10 alimenté par le pipeline devis | **Construire** | Aucun SaaS n'a le carnet de devis |
| **PRI / marge par pièce et par canal** | **Construire** | Le vrai différenciant |
| Suivi prestataires (engagé / facturé / payé) | **Construire** | Croisement commandes ERP × factures Pennylane |

**Règle directrice : ne pas reconstruire le moteur comptable, construire le pont ERP ↔ comptabilité.**

---

## 2 · Contraintes techniques vérifiées (API Pennylane)

| Point | Valeur constatée | Impact |
|---|---|---|
| Version | **API v2 obligatoire** — v1 dépréciée depuis juillet 2025 | Construire directement en v2 |
| Authentification | Token entreprise généré dans le module **Connectivité** | Rôle **administrateur/dirigeant** requis |
| Abonnement | **Essentiel ou supérieur** | ⚠️ **Prérequis bloquant n°1 — à vérifier** |
| Scopes | Chaque scope a une variante `:readonly` | Utiliser exclusivement `trial_balance:readonly`, `supplier_invoices:readonly`, `customer_invoices:readonly` |
| Rate limit | **25 requêtes / 5 secondes** par token, tous endpoints confondus | Sync nocturne par lots + pagination `cursor`/`limit`. Jamais d'appel à chaud sur clic utilisateur |
| Webhooks | **En bêta** | Polling programmé, pas de push |
| Base URL | `https://app.pennylane.com/api/external/v2` | — |

**Endpoints retenus** : `trial_balance` (colonne vertébrale du P&L), `ledger_entries` /
`ledger_entry_lines` (détail et lettrage), `supplier_invoices` + `suppliers` (prestataires),
`customer_invoices` (rapprochement avec les ventes ERP).

**Note environnement** : depuis les sessions Claude Code hébergées, `app.pennylane.com` est
refusé par la politique réseau (403 sur le CONNECT, vérifié le 2026-09-11). Pour que l'assistant
puisse lire la comptabilité en direct pendant une session, il faut ajouter ce domaine à la liste
autorisée de l'environnement. L'application déployée (Render), elle, n'est pas concernée.

---

## 3 · Prérequis bloquants avant tout développement

| # | Prérequis | Pourquoi c'est bloquant |
|---|---|---|
| 1 | **Abonnement Pennylane Essentiel ou supérieur** | Sans accès API, tout le projet tombe |
| 2 | **C1 — migration des données JSON vers MongoDB** | Les données métier vivent sur un disque Render éphémère. Construire un module financier sur une base effaçable au prochain déploiement, c'est construire à l'envers |
| 3 | **C2 — bcrypt + JWT + rate limiting** | L'authentification actuelle est un PIN à 4 chiffres en clair, partagé par 4 personnes dont 2 vendeuses. Y mettre derrière le P&L, les marges et les prix d'achat fournisseurs est exclu |
| 4 | **Fiabilité du BOM à ±10 %** | Un PRI faux est pire que pas de PRI : il sert à fixer les prix |

---

## 4 · Les 4 causes de mortalité de ce type d'outil

1. **Confusion « réel comptable » / « réel de gestion »** — Pennylane reflète ce que
   l'expert-comptable a validé, avec décalage et écritures de fin de mois (provisions, FAE, CCA,
   cut-off). Le dashboard affichera des chiffres différents du compte de résultat officiel. Si
   l'écart n'est pas assumé et affiché explicitement dans l'interface, la confiance disparaît en
   quelques mois et l'outil meurt. **Cause de mortalité n°1.**
2. **Sécurité insuffisante** — voir prérequis 3.
3. **Base de données instable** — voir prérequis 2.
4. **Qualité du BOM** — voir prérequis 4.

**Parade de conception** : chaque écran affiche explicitement sa source et sa date d'arrêté
(`Réel comptable Pennylane au JJ/MM` vs `Réel de gestion ERP au JJ/MM`), et un écran de
réconciliation permanent explique l'écart entre les deux. Jamais un chiffre sans sa provenance.

---

## 5 · Phase 0 — paramétrage Pennylane (zéro développement)

Objectif : **mesurer le gap réel** avant d'engager du code. Durée estimée : une journée de
paramétrage avec l'expert-comptable, puis un mois de pilotage réel.

### 5.1 Plan analytique proposé — 3 axes maximum

Au-delà de 3 axes, la saisie devient ingérable et la ventilation se dégrade. Chaque axe porte
une valeur `NA — non affecté` obligatoire, pour les charges de structure qui ne se rattachent à
aucun canal.

**Axe 1 — CANAL** (le plus important : il porte la marge contributive)

| Code | Libellé |
|---|---|
| `BOU` | Boutique |
| `TRK` | Trunk show / événement |
| `SUR` | Sur-mesure / atelier (pipeline devis) |
| `ECO` | E-commerce Shopify |
| `B2B` | Conciergeries, hôtels, corporate |
| `NA` | Structure — non affecté |

**Axe 2 — ZONE**

| Code | Libellé |
|---|---|
| `FR` | France |
| `EU` | Union européenne |
| `US` | États-Unis (ventes DDP) |
| `INT` | International hors EU/US |
| `NA` | Structure — non affecté |

**Axe 3 — COLLECTION**

| Code | Libellé |
|---|---|
| `26H`, `26E`… | Saison (aligné sur le SKU : `MODEL-YYS-MAT-OPT-COLOR`) |
| `PERM` | Permanent |
| `SPE` | Pièce d'exception / cercle 4 |
| `NA` | Structure — non affecté |

> ⚠️ Le plan analytique structuré génère **toutes les combinaisons** : 6 × 5 × 5 = 150 codes.
> Restreindre dès le départ aux combinaisons réellement utilisées.

### 5.2 Structure du P&L de gestion cible

C'est le document à faire valider par l'expert-comptable — il conditionne tout le reste.

```
  CA net HT                                            701/706/707 − 709
─────────────────────────────────────────────────────────────────────────
  − Matières premières consommées                      601/607 ± 6031 (variation stock)
  − Garnitures, ferrures, bijouterie
  − Sous-traitance façon (ateliers)                    604 / 611
  − Emballages & packaging                             6026
  − Transport & douane sur ventes DDP                  624
═ MARGE BRUTE (M1)                                     → % par canal, par modèle
─────────────────────────────────────────────────────────────────────────
  − Masse salariale atelier / production                641/645 affectés production
═ MARGE SUR COÛTS DIRECTS (M2)
─────────────────────────────────────────────────────────────────────────
  − Marketing, communication, relations presse          623
  − Frais de vente : commissions, trunk shows           (location, transport, hospitality)
═ MARGE CONTRIBUTIVE PAR CANAL (M3)                     ← LE chiffre de pilotage
─────────────────────────────────────────────────────────────────────────
  − Loyers boutique / atelier                           613
  − Honoraires (expert-comptable, juridique)            622
  − Assurances                                          616
  − Masse salariale siège / administratif               641/645 affectés structure
  − Frais bancaires & commissions Stripe                627
═ EBITDA
  − Dotations aux amortissements                        681
═ RÉSULTAT D'EXPLOITATION
  ± Résultat financier / exceptionnel / IS
═ RÉSULTAT NET
```

### 5.3 KPIs de pilotage retenus

| KPI | Source | Pourquoi |
|---|---|---|
| Marge brute % **par canal** | Compta + ERP | Révèle si le sur-mesure paie vraiment vs la boutique |
| **Coefficient PRI → prix de vente** par modèle | ERP | Cœur de la politique tarifaire |
| **Taux de chute matières** | ERP | Poste de perte majeur en maroquinerie |
| **P&L par trunk show** (coût complet vs CA généré) | Compta + ERP | Un trunk show déficitaire est invisible dans un P&L global |
| Panier moyen par canal | ERP / Shopify | — |
| Délai devis → acompte encaissé | Plateforme | Mesure la conversion du pipeline sur-mesure |
| Stock matières en jours de CA | ERP | Le BFR d'une maison de luxe dort dans les peaux |

### 5.4 Checklist opérationnelle

- [ ] Vérifier l'abonnement Pennylane (Essentiel minimum) et le rôle administrateur
- [ ] Chiffrer le module « analytique avancée » (payant) avant de l'activer
- [ ] Activer le plan analytique structuré dans les options avancées
- [ ] Créer les 3 axes et leurs valeurs (§5.1)
- [ ] Faire valider la structure du P&L de gestion (§5.2) par l'expert-comptable
- [ ] Ventiler analytiquement les 12 derniers mois (Pennylane permet l'affectation en masse)
- [ ] Saisir le budget de l'exercice dans Pennylane
- [ ] **Demander l'écriture mensuelle de variation de stock (6031)** sur la base de l'état de
      stock ERP — c'est le point qui rend le P&L mensuel honnête
- [ ] Générer un token API **en lecture seule** (permet de tester l'extraction sans développer)
- [ ] Piloter un mois complet, puis remplir la grille de gap ci-dessous

### 5.5 Grille de mesure du gap (à remplir après le mois de pilotage)

| Besoin exprimé | Pennylane le fait ? | Verdict |
|---|---|---|
| P&L complet mensuel par canal | | |
| Atterrissage 2+10 / 3+9 | | |
| Marge par modèle / par pièce | | |
| PRI par SKU | | |
| Suivi prestataires (engagé / facturé / payé) | | |
| Comparaison budget vs réel par axe | | |

**Règle de décision** : si Pennylane couvre ≥ 70 % du besoin, on ne développe que le reste.

---

## 6 · Architecture cible (si la Phase 0 confirme le gap)

Application séparée (D7), avec la réserve D7bis : **une seule source de données**.

```
┌──────────────────────────┐        ┌──────────────────────────────┐
│  Pennylane (API v2)      │        │  Écosystème Tiraboschi       │
│  scopes :readonly        │        │  MongoDB `tiraboschi`        │
│  trial_balance           │        │  pos_variants · pos_ventes   │
│  ledger_entry_lines      │        │  devis · pieces · fournisseurs│
│  supplier_invoices       │        └──────────────┬───────────────┘
└────────────┬─────────────┘                       │ lecture seule
             │ sync nocturne (25 req/5 s)          │ (utilisateur Mongo dédié)
             ▼                                     ▼
      ┌──────────────────────────────────────────────────┐
      │  APP PILOTAGE (séparée : UI + auth dédiées)      │
      │  collections propres : fin_balance, fin_mapping, │
      │  fin_budget, fin_pri, fin_prestataires           │
      │  auth : JWT + bcrypt, accès dirigeants seulement │
      └──────────────────────────────────────────────────┘
```

- **Table de mapping** `fin_mapping` : compte comptable → poste du P&L de gestion. Éditable dans
  l'interface, versionnée. C'est l'artefact central d'un outil de contrôle de gestion.
- **Versionnement du budget** : `fin_budget` stocke chaque version (budget initial, 2+10, 3+9…)
  avec son horodatage. Un atterrissage n'écrase jamais le précédent.
- **Sync** : worker nocturne, pagination `cursor`, journal d'exécution (succès, volumétrie, erreurs).
- **Sécurité** : token Pennylane en variable d'environnement, jamais en base ni dans le dépôt.
  Rotation documentée.

---

## 7 · Backlog prévisionnel (à chiffrer après Phase 0)

### Phase 1 — Marge & PRI (le différenciant)
- [ ] Connecteur Pennylane v2 lecture seule + worker de sync + journal
- [ ] Table de mapping plan comptable → postes de gestion, éditable
- [ ] Calcul du PRI par SKU (BOM × prix d'achat réels × coût façon × taux de chute)
- [ ] Marge brute par pièce / modèle / matière / canal
- [ ] Suivi prestataires : engagé (commandes ERP) vs facturé (Pennylane) vs payé

### Phase 2 — P&L de gestion & atterrissage
- [ ] P&L mensuel par axe, corrigé de la variation de stock ERP
- [ ] Budget versionné, colonnes réel / budget / écart
- [ ] Atterrissages 2+10, 3+9, N+M génériques
- [ ] Prévisionnel de CA alimenté par le carnet de devis pondéré et le calendrier trunk shows
- [ ] Écran de réconciliation « réel comptable vs réel de gestion »

---

## 8 · Informations manquantes pour chiffrer

- Abonnement Pennylane exact (Essentiel ou supérieur ?)
- Module « analytique avancée » souscrit ou non, et son coût
- L'expert-comptable travaille-t-il sur Pennylane (affectation analytique en masse) ?
- Nombre d'entités juridiques (FR seule, ou FR + structure US ?) — change le modèle de données
- Ordre de grandeur du CA annuel et nombre de factures fournisseurs par mois — détermine si la
  sync nocturne suffit

---

*Dossier v1.0 — à faire vivre comme `ARCHITECTURE_ECOSYSTEME.md` : toute décision prise y est reportée.*
