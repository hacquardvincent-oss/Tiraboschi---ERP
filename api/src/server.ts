import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
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

// Frontend React (build Vite) servi par l'API — un seul service, comme la V1. web/dist depuis api/dist.
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

// CORS : utile seulement en dev (frontend Vite sur un autre port). En prod c'est la même origine.
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(['http://localhost:5173', 'http://localhost:4173']);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS bloqué : ' + origin));
    },
  }),
);

app.use(express.json());

// Fichiers statiques du frontend (assets, manifest, sw…)
app.use(express.static(WEB_DIST));

// Diagnostic public : où en est le frontend servi (chemins + fichiers présents).
app.get('/api/diag', (_req, res) => {
  const readDir = (p: string): string[] => {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  };
  res.json({
    webDist: WEB_DIST,
    cwd: process.cwd(),
    dirname: __dirname,
    webDistExists: fs.existsSync(WEB_DIST),
    indexHtmlExists: fs.existsSync(path.join(WEB_DIST, 'index.html')),
    files: readDir(WEB_DIST),
    assets: readDir(path.join(WEB_DIST, 'assets')),
  });
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

// Fallback SPA : toute route non-/api renvoie l'app React (client-side).
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

// Gestionnaire d'erreurs global : log + JSON (jamais de 500 « brut » silencieux).
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message });
});

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
    console.log(`[web] WEB_DIST=${WEB_DIST} existe=${fs.existsSync(WEB_DIST)} index=${fs.existsSync(path.join(WEB_DIST, 'index.html'))}`);
    startWatchdog();
  });
}

bootstrap();
