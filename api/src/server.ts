import express from 'express';
import { config } from './config';
import { healthRouter } from './routes/health';

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'Tiraboschi ERP API (V2)', status: 'ok' });
});

app.use('/api', healthRouter);

app.listen(config.port, () => {
  console.log(`API V2 à l'écoute sur le port ${config.port} (env: ${config.nodeEnv})`);
});
