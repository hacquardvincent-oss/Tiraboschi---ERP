import type { RequestHandler } from 'express';
import { verifyToken, type JwtPayload } from '../services/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Exige un JWT valide (header Authorization: Bearer <token>). */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Token manquant.' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
};

/** Exige un rôle précis (ex. ADMIN). À utiliser après requireAuth. */
export const requireRole = (role: string): RequestHandler => (req, res, next) => {
  if (req.user?.role !== role) {
    res.status(403).json({ error: 'Accès refusé.' });
    return;
  }
  next();
};
