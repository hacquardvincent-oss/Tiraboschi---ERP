-- Lien de paiement Stripe Checkout (hébergé) mémorisé sur la vente.
ALTER TABLE "Sale" ADD COLUMN "paymentUrl" TEXT;
