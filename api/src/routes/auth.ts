import { Router } from 'express';
import { prisma } from '../db/prisma';
import { verifyPassword, signToken } from '../services/auth';

export const authRouter = Router();

/** POST /api/auth/login { email, password } → { token, user } */
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'email et password requis.' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user || !user.active || !(await verifyPassword(String(password), user.passwordHash))) {
      res.status(401).json({ error: 'Identifiants invalides.' });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(503).json({ error: 'Base indisponible : ' + (err as Error).message });
  }
});
