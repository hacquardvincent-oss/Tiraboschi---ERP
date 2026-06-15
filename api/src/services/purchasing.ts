import { prisma } from '../db/prisma';

/**
 * Génère des bons de commande (DRAFT) à partir des matières sous le seuil,
 * regroupées par fournisseur. Quantité suggérée = (2×seuil − stock), au moins le seuil.
 */
export async function createPOsFromSuggestions() {
  const [materials, sums] = await Promise.all([
    prisma.material.findMany({ include: { supplier: true } }),
    prisma.stockMovement.groupBy({ by: ['materialId'], _sum: { quantity: true } }),
  ]);
  const stockByMat = new Map(sums.map((s) => [s.materialId, Number(s._sum.quantity ?? 0)]));

  const bySupplier = new Map<string, { materialId: string; quantity: number; unitCost: number }[]>();
  for (const m of materials) {
    const stock = stockByMat.get(m.id) ?? 0;
    const threshold = m.reorderThreshold != null ? Number(m.reorderThreshold) : null;
    if (threshold == null || stock > threshold || !m.supplierId) continue;
    const quantity = Math.max(threshold * 2 - stock, threshold);
    const lines = bySupplier.get(m.supplierId) ?? [];
    lines.push({ materialId: m.id, quantity, unitCost: m.unitCost != null ? Number(m.unitCost) : 0 });
    bySupplier.set(m.supplierId, lines);
  }

  const created = [];
  for (const [supplierId, lines] of bySupplier.entries()) {
    // Évite les doublons : pas de nouveau BC brouillon si un est déjà ouvert pour ce fournisseur
    const open = await prisma.purchaseOrder.count({ where: { supplierId, status: { in: ['DRAFT', 'SENT'] } } });
    if (open > 0) continue;
    created.push(
      await prisma.purchaseOrder.create({
        data: {
          reference: 'PO-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          supplierId,
          status: 'DRAFT',
          lines: { create: lines.map((l) => ({ materialId: l.materialId, quantity: l.quantity, unitCost: l.unitCost })) },
        },
        include: { supplier: true, lines: { include: { material: true } } },
      }),
    );
  }
  return created;
}

/**
 * Réception d'un bon de commande : bon de réception + entrée en stock (RECEIPT_IN)
 * de chaque ligne, puis passage du BC en RECEIVED.
 */
export async function receivePO(poId: string, userId?: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } });
  if (!po) throw new Error('Bon de commande introuvable.');
  if (po.status === 'RECEIVED') throw new Error('Bon de commande déjà réceptionné.');

  const receipt = await prisma.goodsReceipt.create({
    data: {
      reference: 'BR-' + Date.now(),
      purchaseOrderId: po.id,
      lines: { create: po.lines.map((l) => ({ materialId: l.materialId, quantity: l.quantity })) },
    },
  });
  for (const l of po.lines) {
    await prisma.stockMovement.create({
      data: {
        materialId: l.materialId,
        type: 'RECEIPT_IN',
        quantity: l.quantity, // entrée (positive)
        reference: po.reference,
        note: `Réception fournisseur (${po.reference})`,
        createdById: userId,
      },
    });
  }
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED' } });
  return receipt;
}
