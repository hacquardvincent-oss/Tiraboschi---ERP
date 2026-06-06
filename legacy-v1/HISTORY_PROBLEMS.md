# Historique des problèmes rencontrés — V1

> Reconstitué depuis l'historique git (`main`) et les **86 scripts de hotfix archivés** dans
> `scripts/migrations/` du repo principal. Objectif : que la session V2 sache **quels bugs sont
> récurrents** et **pourquoi**, pour ne pas les reproduire.

## Cause racine n°1 — `app.js` monolithique (2817 lignes) régulièrement corrompu
Les correctifs étaient appliqués par **scripts de patch automatiques** qui réécrivaient le fichier par
recherche/remplacement de chaînes. Résultat : corruptions d'encodage à répétition, d'où :
- `fix_app_js_corruption.js`, `fix_app_js_corruption_2.js`
- `fix_encoding.js`, `fix_literals.js`, `fix_newlines.js`, `fix_end.js`
- `restore.js`, `restore_app.js`, `restore_app2.js` (restauration après casse)
- commits `Fix syntax error`, `fix: remove stray await from getShopifyHeaders declaration`

**Leçon V2** : ne plus patcher du code par scripts de remplacement de chaînes. Découper en modules.

## Cause racine n°2 — Persistance JSON non atomique → corruption de données
- `restore_db.js`, `replace_db.js`, `replace_db_v3.js`, `update_and_export_db.js`
- Le `prestart` rejoue encore `replace_db_v3.js` + `import_inventaire.js` à chaque boot (risqué).

**Leçon V2** : base persistante (Mongo/SQLite/Postgres) + écritures atomiques.

## Bugs récurrents par thème (nombre d'itérations = nombre de scripts)

| Thème | Scripts (itérations) | Ce que ça révèle |
|---|---|---|
| **Récapitulatif POS** | `fix_recap`, `_recap2`, `_recap3`, `_recap_again`, `_recap_again2` (**5×**) | Logique d'affichage du récap jamais stabilisée |
| **Alertes stock** | `fix_alert`, `fix_alerts2`→`6` (**6×**) | Seuils/affichage d'alerte repris 6 fois |
| **SKU** | `fix_sku`, `fix_app_sku`, `fix_skus_and_export`, `clean_skus` | Moteur SKU + cohérence export instables |
| **Volet lien de paiement** (git) | 7 commits `fix(pos)` drawer (z-index, backdrop-filter, click, panier vide) | UI du bottom-drawer Stripe difficile à fiabiliser → finalement remplacée par un bloc inline |
| **Conversion centimes** | commit `conversion correcte des centimes pour ajout dynamique des taxes` | Bug de ×100 / ÷100 sur les taxes du lien Stripe |
| **Prix POS / fallback** | `fix_pos_price_display`, `fix_caisse_price_fallback`, `fix_pos_logic`, `fix_step5_shopify` | Affichage prix + fallback Shopify injoignable |
| **Couleurs** | `fix_color_names`, `fix_color_names_2` | Traduction/affichage des noms de couleurs |
| **Groupement catalogue** | `fix_grouping`, `fix_grouping_2` | Regroupement par modèle |
| **Export CSV** | `fix_export_csv`, `fix_zip_block` | Génération export |
| **Crash historique** | `fix_history_crash` | Page Ventes plantait |
| **Chemins API** | `fix_api_paths` | Routes mal câblées après refactor |
| **Patchs serveur** | `patch_server`, `patch_server_reports`, `patch_taxes`, `patch_app` | Correctifs serveur appliqués hors versioning propre |

## Repères chronologiques (commits clés de `main`)
1. `Initial commit … stripe terminal & Shopify sync fixes` — base Antigravity.
2. Saga du **lien de paiement** : volet drawer → inline (≈12 commits), i18n FR/EN, page `/pay/:id`.
3. `implement Stripe Webhook` + `Fix webhook fulfillment logic` — fiabilisation paiement async.
4. `Add automated refund feature` + UI `Remboursé`.
5. `Delete CLAUDE.md` / `Delete CONTEXT.md` — purge d'anciens docs.
6. `refactor: réorganisation structure repo` (`c9038d6`) — archivage des ~60→86 hotfix.
7. Derniers `fix:` — pricing Rafael USD 3850, chemins `prestart`, `await` parasite Shopify.

## Problèmes encore OUVERTS au gel V1 (à traiter en V2)
Voir `HANDOFF.md` §6 — résumé : persistance JSON éphémère Render, MongoDB code mort, mots de passe
en clair, écritures non atomiques, `prestart` rejouant des migrations, pagination Shopify absente,
`app.js` monolithique, API Shopify figée `2024-01`.

---
*Généré le 2026-06-06. Source : `git log main` + `scripts/migrations/` du repo `tpe-stripe710`.*
