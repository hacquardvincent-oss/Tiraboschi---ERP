import { Router } from 'express';
import { prisma } from '../db/prisma';

export const dbHealthRouter = Router();

// Public : ne renvoie que des compteurs non sensibles (vérification navigateur).
dbHealthRouter.get('/health', async (_req, res) => {
  try {
    const [users, suppliers, workshops, materials, stockMovements] = await Promise.all([
      prisma.user.count(),
      prisma.supplier.count(),
      prisma.workshop.count(),
      prisma.material.count(),
      prisma.stockMovement.count(),
    ]);
    res.json({
      status: 'ok',
      connected: true,
      counts: { users, suppliers, workshops, materials, stockMovements },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', connected: false, message: (err as Error).message });
  }
});
