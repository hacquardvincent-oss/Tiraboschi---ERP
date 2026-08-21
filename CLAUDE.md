# CLAUDE.md — Tiraboschi POS / ERP (V2)

> À charger en premier à chaque session. Source d'autorité du projet.
> Dernière mise à jour : 2026-06-06.

## Projet
App tout-en-un (POS + ERP/PLM + Stock/MRP + CRM + Ventes + Admin) pour la maroquinerie de luxe
**Tiraboschi**, orientée ventes événementielles (**Trunk Shows**). Intègre Stripe Terminal S710,
liens de paiement Stripe Checkout, et Shopify Admin API.

**On construit la V2** : refonte complète (clean rebuild) du projet V1 (`tpe-stripe710`, développé via
Antigravity), en reprise de lead. Le code V1 est figé en référence lecture seule dans `legacy-v1/`.

## Documents d'autorité (lire dans cet ordre)
1. **`CADRAGE_V2.md`** — cadrage vivant : vision, stack, périmètre, roadmap, **décisions actées**.
2. **`SPEC_FONCTIONNEL_V2.md`** — **cible fonctionnelle détaillée par module** (POS/Collection/CRM/Ventes/Inventaire/Admin) + transverse + roadmap re-séquencée.
3. **`AUDIT_V1.md`** — audit code-vérifié du V1 : ce qui marche, ce qui ne va pas, ce qu'on fait mieux.
4. `docs/HANDOFF_V2_SCOPING.md` — audit d'une session précédente (référence).
5. `legacy-v1/` — code V1 figé + `EXTRACTS.md` (logique métier exacte : taxes, SKU, `/pay/:id`, Shopify).
6. `docs/specs/` — sources métier réelles (CDC SKU, BDD app, collections/ID, fiches techniques/BOM, inventaire).
7. `docs/archive/` — anciens `CLAUDE.md`/`CONTEXT.md` V1 (**périmés**, conservés pour historique seulement).

## Décisions techniques actées (V2)
- **Refonte complète**, pas de refactoring du V1.
- **TypeScript** back + front.
- Backend **Node 20 + Express** ; Frontend **React 18 + Vite + Tailwind** ; **PWA**.
- **Base : PostgreSQL + Prisma** (relationnel + transactions ; Mongo V1 = code mort, abandonné).
- **Auth serveur réelle** : bcrypt + JWT + autorisation par route/rôle (priorité absolue, cf. ci-dessous).
- **Shopify** : montée de version + GraphQL + pagination cursor, encapsulé dans un service de sync.
- **Source de vérité par paliers** : démarrage catalogue Shopify + inventaire Drive → cible : l'app master.
- **N° de série / traçabilité par pièce** dès la V2. **Trunk Shows** = objet de 1ʳᵉ classe.

## Risques V1 à NE PAS reproduire (vérifiés)
- 🔴 **API V1 entièrement ouverte** : 0 auth serveur, `GET /api/users` expose les mots de passe en clair,
  auth cosmétique côté navigateur, backdoor `admin_secours`/`admin`. → V2 : auth serveur dès la Phase 0.
- 🔴 Persistance éphémère + écritures non atomiques (corruption concurrente). → Postgres + transactions.
- 🔴 Monolithes patchés par remplacement de chaînes (86 hotfix, corruptions). → modules typés + revue diff.

## Méthode de travail
- `legacy-v1/` = lecture seule (ne pas exécuter/déployer).
- **Jamais** de patch de code par remplacement de chaînes. Modules typés, code + tests + revue par diff.
- **Sécurité + persistance d'abord** (Phase 0) avant toute feature.
- Fidélité métier : réimplémenter la logique prod vérifiée (`legacy-v1/EXTRACTS.md`) puis améliorer.
- Journaliser les décisions dans `CADRAGE_V2.md`.

## Git
- `main` = prod intouchable (jamais de push direct). Travail sur branche dédiée + PR, revue avant merge.
- Commits : `fix:` `feat:` `refactor:` `security:` `data:` `ux:` `chore:` `test:`.

## Prochaine étape
Cible fonctionnelle dans **`SPEC_FONCTIONNEL_V2.md`** (roadmap re-séquencée par dépendances).
État au 2026-06-07 : backend déployé (auth JWT + Postgres + watchdog Stripe↔Shopify), frontend V2
en ligne (menu bas, i18n, €/$), moteur SKU codé+testé. **Prochaine brique : #1 Admin/référentiel**
(matières avec ID, couleurs, options, ateliers, fournisseurs, frais de transport) + **import de la
base** `docs/specs/` — car tout formulaire (Collection/POS) en dépend. Puis #2 Collection/PLM (SKU
intégré), #3 POS (TPE S710 + taxes), #4 Inventaire/production, #5 CRM/Ventes, #6 header/KPIs.
