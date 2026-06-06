import { prisma } from '../db/prisma';
import { hashPassword } from './auth';

/**
 * Crée l'admin initial à partir de ADMIN_EMAIL / ADMIN_PASSWORD si absent.
 * Permet d'avoir un premier compte sans terminal. Idempotent.
 */
export async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL/ADMIN_PASSWORD absents — pas de seed admin.');
    return;
  }
  const lower = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) return;
  await prisma.user.create({
    data: {
      email: lower,
      passwordHash: await hashPassword(password),
      firstName: 'Admin',
      role: 'ADMIN',
      permissions: ['caisse', 'collection', 'stock', 'ventes', 'admin'],
    },
  });
  console.log(`[seed] admin créé : ${lower}`);
}
