-- Paramètres globaux (frais de port, etc.)
CREATE TABLE "Setting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
