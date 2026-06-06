import { execSync } from 'node:child_process';
import express from 'express';
import { config } from './config';
import { healthRouter } from './routes/health';
import { recoveryRouter } from './routes/recovery';
import { recoveryUiRouter } from './routes/recoveryUi';
import { reconciliationRouter } from './routes/reconciliation';
import { reconciliationUiRouter } from './routes/reconciliationUi';
import { authRouter } from './routes/auth';
import { erpRouter } from './routes/erp';
import { dbHealthRouter } from './routes/dbHealth';
import { erpUiRouter } from './routes/erpUi';
import { reconcile } from './services/reconciliation';
import { sendAlert } from './services/alert';
import { seedAdmin } from './services/seed';

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
app.use('/api/auth', authRouter);
app.use('/api/erp', erpRouter);
app.use('/api/db', dbHealthRouter);
app.use('/app', erpUiRouter);

/**
 * Au boot : applique les migrations Prisma (idempotent) puis seed l'admin.
 * Résilient : en cas d'échec, on log et on continue (les autres routes restent up).
 */
async function initDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('[db] DATABASE_URL absent — fonctions base (auth/ERP) désactivées.');
    return;
  }
  try {
    console.log('[db] application des migrations (prisma migrate deploy)…');
    execSync('npx --no-install prisma migrate deploy', { stdio: 'inherit' });
    console.log('[db] migrations à jour.');
  } catch (err) {
    console.error('[db] échec migrate deploy :', (err as Error).message);
  }
  try {
    await seedAdmin();
  } catch (e) {
    console.error('[seed] erreur :', (e as Error).message);
  }
}

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
        const detail = report.missing
          .map((m) => `${m.account}:${m.id} ${m.amount}${m.currency}`)
          .join(', ');
        console.warn(`[watchdog] ⚠️ ${report.missing.length} paiement(s) Stripe sans commande Shopify depuis ${since} : ${detail}`);
        await sendAlert(
          `⚠️ Tiraboschi ERP — ${report.missing.length} paiement(s) Stripe encaissé(s) SANS commande Shopify (depuis ${since}) : ${detail}`,
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

async function bootstrap(): Promise<void> {
  // Migrations + seed AVANT d'ouvrir le port (le serveur n'accepte du trafic qu'une fois prêt).
  await initDatabase();
  app.listen(config.port, () => {
    console.log(`API V2 à l'écoute sur le port ${config.port} (env: ${config.nodeEnv})`);
    startWatchdog();
  });
}

bootstrap();
