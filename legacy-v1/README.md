# legacy-v1/ — Dossier de reprise complet de la V1 (Tiraboschi POS / ERP)

Snapshot **autosuffisant** du projet V1 (en prod, repo `tpe-stripe710`, commit de référence
`683baba`). Conçu pour qu'une **nouvelle session puisse reprendre tout le projet** sans accès au repo
d'origine. **Référence en lecture seule** : ne pas exécuter, ne pas déployer.

## 👉 Ordre de lecture conseillé pour reprendre le projet
1. **`HANDOFF.md`** — contexte global, stack, état réel vérifié, suivi de projet, périmètre + 7
   questions de cadrage V2. **À charger en premier.**
2. **`HISTORY_PROBLEMS.md`** — historique des bugs rencontrés (reconstitué depuis git + 86 scripts de
   hotfix) : quels problèmes sont récurrents et pourquoi.
3. **`EXTRACTS.md`** — logiques clés extraites avec n° de lignes : formules de taxes, `generateSKU`,
   payloads Shopify, workaround `/pay/:id`.
4. **`SPECIFICATIONS_FONCTIONNELLES.md`** — specs d'origine (⚠️ partiellement divergentes du code).
5. **`SKU_MAPPING.md`** — table de correspondance des SKU.
6. Le code : `server.js` + `public/`. Les données : `data/`. La config connecteurs : `package.json`
   + `.env.example`.

## Contenu (ce que tu as dans ce dossier)
```
legacy-v1/
├── HANDOFF.md                       ← contexte + suivi de projet + cadrage V2  ⭐ START HERE
├── HISTORY_PROBLEMS.md              ← historique des problèmes rencontrés
├── EXTRACTS.md                      ← extraits curés (taxes, SKU, payloads, /pay)
├── SPECIFICATIONS_FONCTIONNELLES.md ← specs d'origine (⚠️ divergent du code)
├── SKU_MAPPING.md                   ← table de mapping des SKU
├── README.md                        ← ce fichier
│
├── server.js                        ← BACKEND complet (41 routes : Stripe, Shopify, ERP, taxes…)
├── public/                          ← FRONTEND (SPA Vanilla JS)
│   ├── app.js  index.html  style.css  auth.js  stripe-tpe.js
│
├── data/                            ← DONNÉES réelles (exemples SKU/variants/matières)
│   ├── products_db.json  (variants[285], materials[47], stock[4], config)
│   ├── erp_db.json       (⚠️ bloc `users` retiré — voir note sécurité)
│   └── erp_config_formatted.json
│
├── package.json                     ← CONNECTEURS : dépendances (stripe, mongodb, xlsx, puppeteer…)
└── .env.example                     ← CONFIG connecteurs : variables Stripe / Shopify / Mongo / CORS
```

## Couverture (réponse à « est-ce que j'ai tout ? »)
| Besoin | Où | Statut |
|---|---|---|
| Structure de l'app | `server.js`, `public/`, `HANDOFF.md` §2/§8 | ✅ |
| Toutes les fonctionnalités | `server.js` (41 routes), `HANDOFF.md` §3-4, `EXTRACTS.md` | ✅ |
| Connecteurs (Stripe, Shopify, Mongo) | code + `package.json` + `.env.example` + `HANDOFF.md` §5 | ✅ |
| Contexte & suivi de projet | `HANDOFF.md` | ✅ |
| Historique des problèmes | `HISTORY_PROBLEMS.md` | ✅ |
| Données d'exemple réelles | `data/` | ✅ |

## ⚠️ Avertissements
- **Specs ≠ code** : les `SPECIFICATIONS_FONCTIONNELLES.md` décrivent TVA 20% / Sales Tax 8% /
  duties 9% / port 30€-100$. **Le code en prod a divergé** : taxes US via Shopify Draft Orders,
  duties « incluses », port = config unique (défaut 100). **Le code fait foi.** (détail dans EXTRACTS.md)
- **Sécurité** : `users_db.json` non inclus et bloc `users` retiré d'`erp_db.json` (mots de passe en
  clair). Les credentials restent dans le repo principal `data/`, à migrer en bcrypt en V2.
- **Ne pas exécuter ce dossier** : c'est un gel de référence, pas une app déployable telle quelle.

*Snapshot du commit `683baba` (`tpe-stripe710`). Généré le 2026-06-06.*
