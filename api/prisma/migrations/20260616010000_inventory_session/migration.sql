-- Sessions d'inventaire tournant (comptage matières + écarts + ajustements).
CREATE TABLE "InventorySession" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "category" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "InventorySession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventorySession_reference_key" ON "InventorySession"("reference");

CREATE TABLE "InventoryCount" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "theoretical" DECIMAL(12,3) NOT NULL,
  "counted" DECIMAL(12,3),
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCount_sessionId_materialId_key" ON "InventoryCount"("sessionId", "materialId");
CREATE INDEX "InventoryCount_materialId_idx" ON "InventoryCount"("materialId");
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
