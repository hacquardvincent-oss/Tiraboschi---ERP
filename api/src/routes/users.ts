import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../services/auth';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

// Modules accessibles (accès par utilisateur) — alignés sur la navigation.
const MODULES = ['dashboard', 'pos', 'collection', 'crm', 'sales', 'inventory', 'admin'];
const sanitizePermissions = (p: unknown): string[] =>
  Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string' && MODULES.includes(x)) : [];

const SAFE = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  permissions: true,
  active: true,
  createdAt: true,
} as const;

usersRouter.get('/', async (_req, res) => {
  res.json(await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: SAFE }));
});

usersRouter.post('/', async (req, res) => {
  const { email, password, firstName, lastName, role, permissions } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email et password requis.' });
  try {
    const user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        passwordHash: await hashPassword(String(password)),
        firstName: firstName || null,
        lastName: lastName || null,
        role: role === 'ADMIN' ? 'ADMIN' : 'SELLER',
        permissions: sanitizePermissions(permissions),
      },
      select: SAFE,
    });
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.firstName !== undefined) data.firstName = b.firstName || null;
  if (b.lastName !== undefined) data.lastName = b.lastName || null;
  if (b.role !== undefined) data.role = b.role === 'ADMIN' ? 'ADMIN' : 'SELLER';
  if (b.permissions !== undefined) data.permissions = sanitizePermissions(b.permissions);
  if (b.active !== undefined) data.active = !!b.active;
  if (b.password) data.passwordHash = await hashPassword(String(b.password));
  try {
    res.json(await prisma.user.update({ where: { id: req.params.id }, data, select: SAFE }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.user?.sub === req.params.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte.' });
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
