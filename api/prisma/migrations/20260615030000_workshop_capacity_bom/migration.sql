-- Étape A : atelier capacitaire + matrice de compétences + nomenclature chiffrée.

-- Atelier enrichi
ALTER TABLE "Workshop" ADD COLUMN "location" TEXT;
ALTER TABLE "Workshop" ADD COLUMN "leadTimeDays" INTEGER;
ALTER TABLE "Workshop" ADD COLUMN "capacityPerMonth" INTEGER;
ALTER TABLE "Workshop" ADD COLUMN "moq" INTEGER;
ALTER TABLE "Workshop" ADD COLUMN "transitDays" INTEGER;
ALTER TABLE "Workshop" ADD COLUMN "shippingCost" DECIMAL(12,2);

-- Matrice de compétences atelier ↔ modèle
CREATE TABLE "WorkshopCapability" (
  "id" TEXT NOT NULL,
  "workshopId" TEXT NOT NULL,
  "modelCode" TEXT NOT NULL,
  "leadTimeDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkshopCapability_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkshopCapability_workshopId_modelCode_key" ON "WorkshopCapability"("workshopId", "modelCode");
CREATE INDEX "WorkshopCapability_modelCode_idx" ON "WorkshopCapability"("modelCode");
ALTER TABLE "WorkshopCapability" ADD CONSTRAINT "WorkshopCapability_workshopId_fkey"
  FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nomenclature chiffrée
CREATE TABLE "BomLine" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'principale',
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'piece',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BomLine_productId_idx" ON "BomLine"("productId");
CREATE INDEX "BomLine_materialId_idx" ON "BomLine"("materialId");
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
