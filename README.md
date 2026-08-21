# Tiraboschi — POS / ERP (V2)

Application tout-en-un (POS + ERP/PLM + Stock/MRP + CRM + Ventes) pour la maroquinerie de luxe
**Tiraboschi**, orientée ventes événementielles (**Trunk Shows**). Intègre Stripe Terminal S710,
liens de paiement Stripe, et Shopify Admin API.

Ce dépôt porte la **refonte V2** (clean rebuild) du projet V1 (`tpe-stripe710`, développé via
Antigravity), désormais en reprise de lead.

## Documentation — par où commencer

| Document | Rôle |
|---|---|
| **[CADRAGE_V2.md](./CADRAGE_V2.md)** ⭐ | Cadrage vivant de la V2 : vision, stack, périmètre, roadmap, décisions actées |
| **[AUDIT_V1.md](./AUDIT_V1.md)** | Audit indépendant du code V1 (vérifié source) : ce qui marche, ce qui ne va pas, ce qu'on fait mieux |
| [docs/HANDOFF_V2_SCOPING.md](./docs/HANDOFF_V2_SCOPING.md) | Audit de cadrage d'une session précédente (référence) |
| [legacy-v1/](./legacy-v1/) | Snapshot du code V1 **en lecture seule** (code + données + logique métier extraite) |
| [CLAUDE.md](./CLAUDE.md) | Mémoire projet chargée au début de chaque session |

> Les anciens `CLAUDE.md` / `CONTEXT.md` (ère V1) sont **périmés** et archivés dans
> [`docs/archive/`](./docs/archive/). `CADRAGE_V2.md` + `AUDIT_V1.md` font foi.

## État

Phase de cadrage terminée. Décisions clés : refonte complète · TypeScript · Node/Express + React/Vite ·
**PostgreSQL + Prisma** · auth serveur réelle (bcrypt + JWT) · Shopify GraphQL · n° de série dès V2.

Prochaine étape : scaffolding **Phase 0** (fondations sécurité + persistance).
