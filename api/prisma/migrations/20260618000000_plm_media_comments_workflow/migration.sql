-- Workflow PLM (état « En revue ») + médias (galerie) + commentaires.

-- Nouvel état de validation entre Brouillon et Validé.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

-- Traçabilité de la validation sur la fiche produit.
ALTER TABLE "Product" ADD COLUMN "validatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "validatedBy" TEXT;

-- Galerie d'images (médias) — 1ʳᵉ image = couverture.
CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fil de commentaires.
CREATE TABLE "ProductComment" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductComment_productId_idx" ON "ProductComment"("productId");
ALTER TABLE "ProductComment" ADD CONSTRAINT "ProductComment_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
