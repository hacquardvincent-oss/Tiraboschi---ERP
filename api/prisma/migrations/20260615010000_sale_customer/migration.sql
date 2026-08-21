-- Coordonnées client complètes (adresse de livraison, opt-in) mémorisées sur la vente.
ALTER TABLE "Sale" ADD COLUMN "customer" JSONB;
