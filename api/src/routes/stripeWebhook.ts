import { Router, raw } from 'express';
import { handleStripeWebhook } from '../services/payments';

/**
 * Webhook Stripe (un endpoint par marché → secret de signature distinct).
 * Doit être monté AVANT express.json (signature calculée sur le corps brut).
 * Public (pas d'auth) : authentifié par la signature Stripe-Signature.
 */
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/:market', raw({ type: '*/*' }), async (req, res) => {
  const signature = req.header('stripe-signature');
  if (!signature) return res.status(400).json({ error: 'Signature manquante.' });
  const market = req.params.market === 'US' ? 'US' : 'FR';
  try {
    await handleStripeWebhook(market, req.body as Buffer, signature);
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook] échec :', (e as Error).message);
    res.status(400).json({ error: (e as Error).message });
  }
});
