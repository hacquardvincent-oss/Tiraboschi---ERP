import type { RequestHandler } from 'express';

/**
 * Garde simple par clé partagée (header x-recovery-key), en attendant l'auth JWT.
 * La clé vit dans RECOVERY_KEY (env), jamais dans le repo.
 */
export const requireRecoveryKey: RequestHandler = (req, res, next) => {
  const provided = req.header('x-recovery-key');
  if (!process.env.RECOVERY_KEY || provided !== process.env.RECOVERY_KEY) {
    res.status(401).json({ status: 'error', message: 'Clé invalide ou absente.' });
    return;
  }
  next();
};
