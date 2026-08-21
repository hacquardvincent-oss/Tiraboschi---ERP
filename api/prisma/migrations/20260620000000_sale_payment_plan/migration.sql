-- Plan de paiement acompte/solde sur les ventes (devis/facture + 50-50).

-- Nouvel état : acompte payé, solde dû.
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'AWAITING_BALANCE';

ALTER TABLE "Sale" ADD COLUMN "paymentPlan" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "Sale" ADD COLUMN "depositCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "balancePaidAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "documentType" TEXT;
ALTER TABLE "Sale" ADD COLUMN "depositSessionId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "balanceSessionId" TEXT;
