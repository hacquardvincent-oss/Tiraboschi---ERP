-- Fiche technique PLM enrichie : statut, douanes, prix DDP.
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'VALIDATED');
ALTER TABLE "Product" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Product" ADD COLUMN "dutiesShippingUsd" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "finalPriceDdp" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "hsCode" TEXT;
ALTER TABLE "Product" ADD COLUMN "countryOrigin" TEXT;
