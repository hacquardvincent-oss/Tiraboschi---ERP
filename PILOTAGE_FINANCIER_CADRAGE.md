# Pilotage financier Tiraboschi — Dossier de cadrage

> Version 1.1 — 2026-09-11 · Rédigé pour arbitrage par Vincent Hacquard
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
| **D9** | **Le FEC est le contrat d'entrée comptable, pas l'API Pennylane.** Zéro abonnement supplémentaire, zéro dépendance éditeur (§2bis) | ⚠️ à valider |
| **D10** | **La ventilation analytique vit dans l'outil, pas dans Pennylane** : le module analytique payant n'est pas souscrit (§2bis) | ⚠️ à valider |

> **Contrainte cadre posée par le dirigeant (2026-09-11)** : construire une marque IA-native avec
> le minimum de charges récurrentes. Tout abonnement supplémentaire doit être justifié, pas
> supposé. Cette contrainte a fait réviser l'architecture initialement recommandée (API Pennylane
> + module analytique payant) au profit du FEC — voir §2bis.

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

## 2bis · Le FEC comme contrat d'entrée (révision de l'architecture)

### 2bis.1 Pourquoi le FEC plutôt que l'API

Le **Fichier des Écritures Comptables** est un export légalement normalisé (arrêté du 29 juillet
2013, art. A47 A-1 du LPF) : 18 colonnes obligatoires, séparateur tabulation, encodage UTF-8,
produit par **tout** logiciel de comptabilité français. Dans Pennylane :
`Comptabilité → Saisie → Exports → Exporter le FEC`.

| Critère | API Pennylane v2 | **FEC** |
|---|---|---|
| Coût récurrent | Abonnement Essentiel minimum | **0 €** |
| Dépendance éditeur | Totale | **Aucune** — Sage, Cegid, EBP, ACD produisent le même format |
| Migration d'outil comptable | Réécriture du connecteur | **Aucun impact** |
| Automatisation | Sync programmée | Export manuel mensuel (~5 min) |
| Granularité | Grand livre + factures + tiers | Grand livre complet (journal, date, compte, libellé, débit, crédit, pièce) |

Le FEC sert directement l'objectif « à terme, voir quel outil convient le mieux » : l'outil
comptable devient interchangeable sans toucher une ligne de Meridian.

### 2bis.2 Limites assumées du FEC

- **Un FEC *conforme* exige des écritures validées** (colonne `ValidDate`), ce qui n'arrive
  qu'à la clôture. Pour du pilotage mensuel on exporte des écritures non validées : parfaitement
  exploitable en gestion, sans valeur fiscale — ce n'est pas l'usage visé.
- **C'est un fichier, pas un flux** : un geste manuel par mois. Acceptable au volume d'une maison
  de cette taille ; à réévaluer si la cadence devient contraignante.
- **Pas d'axes analytiques** dans le format standard, pas de pièces jointes, pas de détail
  fournisseur au-delà du compte de tiers. D'où la ventilation par règles ci-dessous.

### 2bis.3 La ventilation analytique vit dans l'outil

Le module « analytique avancée » de Pennylane devient inutile :

- **Côté recettes** : l'ERP sait déjà pour chaque vente le canal (boutique, trunk show,
  sur-mesure, e-commerce, B2B), la zone et la collection. Aucun besoin que Pennylane le sache.
- **Côté charges** : une table de règles `compte + tiers + libellé → poste de gestion + canal`
  ventile de façon déterministe la grande majorité des écritures récurrentes (tannerie →
  matières ; façonnier → sous-traitance ; loyer → structure). Le reliquat est arbitré une fois
  à la main, et la règle est mémorisée.
- La table de règles est **versionnée dans le dépôt**, auditable, et reste la propriété de la
  maison. C'est la doctrine Meridian appliquée à la finance : la connaissance métier ne se loue pas.

### 2bis.4 Garde-fou d'architecture

**Meridian ne devient jamais le livre comptable.** La source de vérité reste un vrai logiciel de
comptabilité tenu par l'expert-comptable ; Meridian n'en est qu'une lecture de gestion. Cette
règle protège d'un risque réel du tout-maison : en cas de panne pendant une clôture, il n'y a
aucune ligne de support à appeler. Une lecture cassée se répare à froid ; un livre comptable
cassé, non.

### 2bis.5 Vérification économique préalable

L'offre **Collaboratif** de Pennylane est réservée aux entreprises invitées par leur cabinet et
**généralement payée par le cabinet**. Avant toute optimisation : établir qui paie quoi
aujourd'hui. Quitter Pennylane peut augmenter les honoraires du cabinet s'il y produit la
comptabilité — l'économie serait alors négative.

---

## 3 · Prérequis bloquants avant tout développement

| # | Prérequis | Pourquoi c'est bloquant |
|---|---|---|
| 1 | ~~Abonnement Pennylane Essentiel ou supérieur~~ — **levé par D9** | Le FEC est exportable sans condition d'abonnement. L'API redevient un accélérateur optionnel, à n'envisager que si le plan en cours l'inclut déjà |
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

- [ ] Établir **qui paie Pennylane aujourd'hui** (maison ou cabinet, offre Collaboratif ?) — §2bis.5
- [ ] **Exporter le FEC des 12 derniers mois** (`Comptabilité → Saisie → Exports`) — gratuit, sans
      condition d'abonnement, c'est le carburant de tout le reste
- [ ] Faire valider la structure du P&L de gestion (§5.2) par l'expert-comptable — conversation,
      aucun paramétrage payant requis
- [ ] Construire la **table de règles de ventilation** (§2bis.3) à partir du FEC réel
- [ ] Arbitrer à la main le reliquat non ventilé automatiquement, une fois
- [ ] Poser le budget de l'exercice (dans l'outil, pas nécessairement dans Pennylane)
- [ ] **Demander l'écriture mensuelle de variation de stock (6031)** sur la base de l'état de
      stock ERP — c'est le point qui rend le P&L mensuel honnête
- [ ] Produire un premier P&L de gestion sur les 12 mois d'historique et le confronter au compte
      de résultat officiel — l'écart doit s'expliquer ligne à ligne
- [ ] Piloter un mois complet, puis remplir la grille de gap ci-dessous

> Le plan analytique de Pennylane (§5.1) reste le **vocabulaire de référence** des axes, même
> lorsqu'il n'est pas paramétré dans Pennylane : ce sont ces codes que la table de règles produit.

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
│  Comptabilité            │        │  Écosystème Tiraboschi       │
│  (Pennylane aujourd'hui, │        │  MongoDB `tiraboschi`        │
│   interchangeable)       │        │  pos_variants · pos_ventes   │
│                          │        │  devis · pieces · fournisseurs│
│  → FEC mensuel (18 col.) │        └──────────────┬───────────────┘
└────────────┬─────────────┘                       │ lecture seule
             │ dépôt du fichier                    │ (utilisateur Mongo dédié)
             ▼                                     ▼
      ┌──────────────────────────────────────────────────┐
      │  MERIDIAN FINANCE (séparée : UI + auth dédiées)  │
      │  fin_ecritures   ← FEC parsé                     │
      │  fin_regles      ← ventilation compte/tiers→poste│
      │  fin_budget · fin_pri · fin_prestataires         │
      │  auth : JWT + bcrypt, accès dirigeants seulement │
      └──────────────────────────────────────────────────┘
```

L'API Pennylane n'apparaît pas dans ce schéma : elle ne remplacerait que la flèche « dépôt du
fichier » par une sync automatique, sans rien changer en aval. C'est précisément ce qui la rend
optionnelle et différable.

- **Table de règles** `fin_regles` : `compte + tiers + libellé → poste de gestion + canal`.
  Éditable dans l'interface, versionnée dans le dépôt. C'est l'artefact central de l'outil — et
  le seul actif qui ne se rachète pas.
- **Versionnement du budget** : `fin_budget` stocke chaque version (budget initial, 2+10, 3+9…)
  avec son horodatage. Un atterrissage n'écrase jamais le précédent.
- **Sync** : worker nocturne, pagination `cursor`, journal d'exécution (succès, volumétrie, erreurs).
- **Sécurité** : token Pennylane en variable d'environnement, jamais en base ni dans le dépôt.
  Rotation documentée.

---

## 7 · Backlog prévisionnel (à chiffrer après Phase 0)

### Phase 1 — Marge & PRI (le différenciant)
- [ ] Parseur FEC (18 colonnes, tabulation, UTF-8) + contrôle d'équilibre débit/crédit + idempotence
- [ ] Table de règles de ventilation, éditable et versionnée
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

- **Un FEC réel** (même partiel, même sur un exercice ancien) — c'est le seul intrant qui permet
  de construire et de tester la table de règles. ⚠️ Ne pas committer un FEC dans un dépôt public :
  il contient l'intégralité de la comptabilité.
- **Qui paie Pennylane aujourd'hui** : la maison, ou le cabinet via l'offre Collaboratif ?
- Nombre d'entités juridiques (FR seule, ou FR + structure US ?) — change le modèle de données
- Ordre de grandeur du CA annuel et nombre d'écritures par mois — détermine si un export mensuel
  manuel reste confortable

---

## 9 · Journal des révisions

| Date | Révision | Déclencheur |
|---|---|---|
| 2026-09-11 | v1.0 — cadrage initial, architecture sur API Pennylane + module analytique payant | Demande initiale |
| 2026-09-11 | v1.1 — **pivot FEC** (D9), ventilation analytique internalisée (D10), prérequis « abonnement Essentiel » levé | Contrainte dirigeant : marque IA-native, minimum de charges récurrentes, indépendance vis-à-vis de l'éditeur comptable |

---

*Dossier v1.0 — à faire vivre comme `ARCHITECTURE_ECOSYSTEME.md` : toute décision prise y est reportée.*
