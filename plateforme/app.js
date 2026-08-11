/* Bootstrap de la Plateforme — mince par principe : env, store, routes, workers. */

import express from 'express';
import { ouvrirStore } from './src/data/store.js';
import { monterRoutes } from './src/api/routes.js';
import { traiterJournal } from './src/data/journal.js';
import { WORKERS, evaluerTriggersDifferes } from './src/workers/index.js';

export async function creerApp(options = {}) {
  const store = await ouvrirStore(options);
  const app = express();
  app.get('/api/sante', (_req, res) => res.json({
    ok: true, data: store.mode, organes: process.env.ORGANES_MODE ?? 'simulation',
  }));
  monterRoutes(app, store, options);
  return { app, store };
}

/* Lancement direct (pas en test) */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, store } = await creerApp();
  const port = process.env.PORT ?? 3100;
  // filet de sécurité : le journal est retraité périodiquement (idempotent),
  // et les triggers différés (relance J+7, expiration) évalués chaque heure
  setInterval(() => traiterJournal(store, WORKERS, {}).catch(console.error), 15_000);
  setInterval(() => evaluerTriggersDifferes(store).catch(console.error), 3_600_000);
  app.listen(port, () => console.log(
    `Plateforme Tiraboschi — http://localhost:${port} · data=${store.mode} · organes=${process.env.ORGANES_MODE ?? 'simulation'}`));
}
