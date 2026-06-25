import { prisma } from '../db/prisma';
import type { SaleItem } from './sales';

/** Choisit l'atelier le plus rapide capable de produire un modèle (sinon le premier atelier). */
async function pickWorkshop(modelCode: string | null): Promise<string | null> {
  if (modelCode) {
    const cap = await prisma.workshopCapability.findFirst({
      where: { modelCode },
      orderBy: { workshop: { leadTimeDays: 'asc' } },
    });
    if (cap) return cap.workshopId;
  }
  const any = await prisma.workshop.findFirst({ orderBy: { leadTimeDays: 'asc' } });
  return any?.id ?? null;
}

/**
 * Orchestration post-paiement : pour chaque ligne, réserve les pièces en stock disponibles,
 * sinon crée un ordre de production (atelier compétent). Crée les tâches de préparation.
 * Idempotent par référence de commande.
 */
export async function orchestrateSale(saleId: string): Promise<void> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  // Production lancée dès l'acompte (AWAITING_BALANCE) ou au paiement complet (PAID).
  if (!sale || (sale.status !== 'PAID' && sale.status !== 'AWAITING_BALANCE')) return;
  const ref = sale.shopifyOrderName ?? sale.reference;

  const [poCount, ftCount] = await Promise.all([
    prisma.productionOrder.count({ where: { clientOrderRef: ref } }),
    prisma.fulfillmentTask.count({ where: { shopifyOrderRef: ref } }),
  ]);
  if (poCount > 0 || ftCount > 0) return; // déjà orchestrée

  const items = (sale.items as unknown as SaleItem[]) ?? [];
  for (const it of items) {
    if (!it.sku) continue;
    let remaining = it.qty || 1;

    // Chemin stock : réserver des pièces disponibles non déjà allouées
    const serials = await prisma.serial.findMany({
      where: {
        variantSku: it.sku,
        status: 'AVAILABLE',
        fulfillmentTasks: { none: { status: { in: ['TO_PREPARE', 'READY'] } } },
      },
      take: remaining,
    });
    for (const s of serials) {
      await prisma.fulfillmentTask.create({
        data: { shopifyOrderRef: ref, serialId: s.id, status: 'TO_PREPARE' },
      });
      await prisma.serial.update({ where: { id: s.id }, data: { location: 'réservé:' + ref } });
      remaining--;
    }
    if (remaining <= 0) continue;

    // Reste à produire (made-to-order)
    const product = await prisma.product.findFirst({ where: { sku: it.sku } });
    const workshopId = await pickWorkshop(product?.modelCode ?? null);
    if (workshopId) {
      await prisma.productionOrder.create({
        data: {
          reference: 'OP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          workshopId,
          variantSku: it.sku,
          quantity: remaining,
          clientOrderRef: ref,
          status: 'REQUESTED',
        },
      });
    }
    // Tâche de préparation (liée à un n° de série à la réception des pièces)
    await prisma.fulfillmentTask.create({ data: { shopifyOrderRef: ref, status: 'TO_PREPARE' } });
  }
}

/** Liste de prélèvement matières d'un ordre de production (depuis la nomenclature chiffrée). */
export async function pickingList(productionOrderId: string) {
  const po = await prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
  if (!po) return null;
  const product = await prisma.product.findFirst({
    where: { sku: po.variantSku },
    include: { bomLines: { include: { material: true } } },
  });
  const lines = await Promise.all(
    (product?.bomLines ?? []).map(async (l) => {
      const agg = await prisma.stockMovement.aggregate({ where: { materialId: l.materialId }, _sum: { quantity: true } });
      const stock = Number(agg._sum.quantity ?? 0);
      const perPiece = Number(l.quantity);
      return {
        materialId: l.materialId,
        code: l.material.code,
        name: l.material.name,
        role: l.role,
        unit: l.unit,
        perPiece,
        need: perPiece * po.quantity,
        stock,
        short: stock < perPiece * po.quantity,
      };
    }),
  );
  return { productionOrder: po, lines };
}

/** Sortie des matières vers l'atelier (consommation BOM × quantité) + passage en transit. */
export async function issueMaterials(productionOrderId: string, userId?: string): Promise<void> {
  const data = await pickingList(productionOrderId);
  if (!data) throw new Error('Ordre introuvable.');
  const po = data.productionOrder;
  await prisma.$transaction([
    ...data.lines.map((l) =>
      prisma.stockMovement.create({
        data: {
          materialId: l.materialId,
          type: 'ISSUE_TO_WORKSHOP',
          quantity: -Math.abs(l.need), // sortie de stock
          workshopId: po.workshopId,
          reference: po.reference,
          note: `Sortie atelier (OP ${po.reference})`,
          createdById: userId,
        },
      }),
    ),
    prisma.productionOrder.update({ where: { id: po.id }, data: { status: 'MATERIALS_IN_TRANSIT' } }),
  ]);
}

/**
 * Réception des pièces produites : bon de réception + génération des n° de série (traçabilité),
 * passage de l'OP en RECEIVED, et liaison aux tâches de préparation en attente.
 */
export async function receiveFinishedPieces(productionOrderId: string, quantity?: number) {
  const po = await prisma.productionOrder.findUnique({ where: { id: productionOrderId } });
  if (!po) throw new Error('Ordre introuvable.');
  const qty = quantity && quantity > 0 ? quantity : po.quantity;
  const base = Date.now().toString(36).toUpperCase();

  const receipt = await prisma.finishedPieceReceipt.create({
    data: { reference: 'BRP-' + Date.now(), productionOrderId: po.id, quantity: qty },
  });

  const serials = [];
  for (let i = 1; i <= qty; i++) {
    serials.push(
      await prisma.serial.create({
        data: {
          serial: `${po.variantSku}-${base}-${i}`,
          variantSku: po.variantSku,
          productionOrderId: po.id,
          status: 'AVAILABLE',
          location: 'entrepôt',
        },
      }),
    );
  }
  await prisma.productionOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED' } });

  // Lier les pièces aux tâches de préparation en attente de cette commande
  if (po.clientOrderRef) {
    const openTasks = await prisma.fulfillmentTask.findMany({
      where: { shopifyOrderRef: po.clientOrderRef, serialId: null, status: 'TO_PREPARE' },
      take: serials.length,
    });
    for (let i = 0; i < openTasks.length && i < serials.length; i++) {
      await prisma.fulfillmentTask.update({ where: { id: openTasks[i].id }, data: { serialId: serials[i].id } });
      await prisma.serial.update({ where: { id: serials[i].id }, data: { location: 'réservé:' + po.clientOrderRef } });
    }
  }
  return { receipt, serials: serials.length };
}
