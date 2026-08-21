-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelCode" TEXT,
    "yearCode" TEXT,
    "seasonCode" TEXT,
    "materialCode" TEXT,
    "optionCode" TEXT,
    "colorCode" TEXT,
    "sizeCode" TEXT,
    "animalCode" TEXT,
    "skinTypeCode" TEXT,
    "liningCode" TEXT,
    "atelierCode" TEXT,
    "supplierCode" TEXT,
    "jewelryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "packaging" TEXT,
    "bom" JSONB,
    "priceHtEur" DECIMAL(12,2),
    "priceHtUsd" DECIMAL(12,2),
    "costMaterial" DECIMAL(12,2),
    "costMaking" DECIMAL(12,2),
    "shopifyProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");
