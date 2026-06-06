import express from 'express';
import { config } from './config';
import { healthRouter } from './routes/health';
import { recoveryRouter } from './routes/recovery';
import { recoveryUiRouter } from './routes/recoveryUi';
import { reconciliationRouter } from './routes/reconciliation';
import { reconciliationUiRouter } from './routes/reconciliationUi';
import { reconcile } from './services/reconciliation';

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'Tiraboschi ERP API (V2)', status: 'ok' });
});

app.use('/api', healthRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/recovery', recoveryUiRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/reconciliation', reconciliationUiRouter);

/**
 * Watchdog : vérifie périodiquement les paiements Stripe non synchronisés dans Shopify.
 * Alerte par log (une vraie alerte email/Slack viendra ensuite). Désactivé si aucun compte Stripe.
 */
function startWatchdog(): void {
  if (config.stripeAccounts.length === 0) {
    console.log('[watchdog] désactivé (aucun compte Stripe configuré).');
    return;
  }
  const intervalMs = Number(process.env.WATCHDOG_INTERVAL_MS) || 6 * 60 * 60 * 1000; // 6h
  const run = async () => {
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const report = await reconcile(since);
      if (report.missing.length > 0) {
        console.warn(
          `[watchdog] ⚠️ ${report.missing.length} paiement(s) Stripe sans commande Shopify depuis ${since} :`,
          report.missing.map((m) => `${m.account}:${m.id} ${m.amount}${m.currency}`).join(', '),
        );
      } else {
        console.log(`[watchdog] OK — ${report.matched} paiements réconciliés depuis ${since}.`);
      }
    } catch (err) {
      console.error('[watchdog] erreur :', (err as Error).message);
    }
  };
  setTimeout(run, 30_000); // 1er passage 30s après le boot
  setInterval(run, intervalMs);
  console.log(`[watchdog] activé (intervalle ${Math.round(intervalMs / 3600000)}h).`);
}

app.listen(config.port, () => {
  console.log(`API V2 à l'écoute sur le port ${config.port} (env: ${config.nodeEnv})`);
  startWatchdog();
});
