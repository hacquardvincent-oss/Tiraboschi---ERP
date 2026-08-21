import { prisma } from '../db/prisma';

/** Stock théorique courant par matière (somme du ledger). */
async function stockByMaterial(): Promise<Map<string, number>> {
  const sums = await prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } });
  return new Map(sums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));
}

/**
 * Ouvre une session de comptage : fige le stock théorique de chaque matière (filtrée par catégorie)
 * dans des lignes InventoryCount (counted vide). Une seule session OPEN à la fois par catégorie.
 */
export async function openInventorySession(category: string | undefined, userId?: string) {
  const where = category ? { category: category as never } : undefined;
  const materials = await prisma.material.findMany({ where, select: { id: true } });
  const stock = await stockByMaterial();
  const session = await prisma.inventorySession.create({
    data: {
      reference: 'INV-' + Date.now(),
      category: category ?? null,
      createdById: userId,
      counts: {
        create: materials.map((m) => ({ materialId: m.id, theoretical: stock.get(m.id) ?? 0 })),
      },
    },
  });
  return session;
}

/** Détail d'une session : lignes + matière + comptage précédent (dernière session clôturée). */
export async function inventorySessionDetail(id: string) {
  const session = await prisma.inventorySession.findUnique({ where: { id }, include: { counts: true } });
  if (!session) return null;
  const matIds = session.counts.map((c) => c.materialId);
  const materials = await prisma.material.findMany({ where: { id: { in: matIds } } });
  const byMat = new Map(materials.map((m) => [m.id, m]));

  // Comptage précédent (dernière session clôturée, même périmètre si possible)
  const prev = await prisma.inventorySession.findFirst({
    where: { status: 'CLOSED', id: { not: id } },
    orderBy: { closedAt: 'desc' },
    include: { counts: true },
  });
  const prevByMat = new Map((prev?.counts ?? []).map((c) => [c.materialId, c.counted == null ? null : Number(c.counted)]));

  const lines = session.counts
    .map((c) => {
      const m = byMat.get(c.materialId);
      return {
        id: c.id,
        materialId: c.materialId,
        code: m?.code ?? '—',
        name: m?.name ?? '—',
        unit: m?.unit ?? '',
        theoretical: Number(c.theoretical),
        counted: c.counted == null ? null : Number(c.counted),
        previous: prevByMat.get(c.materialId) ?? null,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  return { session, lines };
}

/** Clôture : crée les mouvements d'ajustement (counted − theoretical) pour les écarts. */
export async function closeInventorySession(id: string, userId?: string) {
  const session = await prisma.inventorySession.findUnique({ where: { id }, include: { counts: true } });
  if (!session) throw new Error('Session introuvable.');
  if (session.status === 'CLOSED') throw new Error('Session déjà clôturée.');
  let adjustments = 0;
  for (const c of session.counts) {
    if (c.counted == null) continue;
    const delta = Number(c.counted) - Number(c.theoretical);
    if (delta === 0) continue;
    await prisma.stockMovement.create({
      data: {
        materialId: c.materialId,
        type: 'ADJUSTMENT',
        quantity: delta,
        reference: session.reference,
        note: `Ajustement inventaire ${session.reference}`,
        createdById: userId,
      },
    });
    adjustments++;
  }
  await prisma.inventorySession.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
  return { adjustments };
}
