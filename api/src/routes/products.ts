import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assembleSku } from '../services/sku';
import { syncProductToShopify } from '../services/shopify';

export const productsRouter = Router();
productsRouter.use(requireAuth);

interface Codes {
  modelCode?: string | null;
  yearCode?: string | null;
  seasonCode?: string | null;
  materialCode?: string | null;
  optionCode?: string | null;
  colorCode?: string | null;
}

function buildSku(c: Codes): string {
  return assembleSku({
    modelId: c.modelCode ?? '',
    yearId: c.yearCode ?? '',
    seasonId: c.seasonCode ?? '',
    materialId: c.materialCode ?? '',
    optionId: c.optionCode ?? '00',
    colorId: c.colorCode ?? '000',
  });
}

const STRING_FIELDS = [
  'name', 'modelCode', 'yearCode', 'seasonCode', 'materialCode', 'optionCode', 'colorCode',
  'sizeCode', 'animalCode', 'skinTypeCode', 'liningCode', 'atelierCode', 'supplierCode', 'packaging',
  'hsCode', 'countryOrigin',
] as const;
const DECIMAL_FIELDS = [
  'priceHtEur', 'priceHtUsd', 'costMaterial', 'costMaking', 'dutiesShippingUsd', 'finalPriceDdp',
] as const;

function pickData(b: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const f of STRING_FIELDS) if (b[f] !== undefined) d[f] = b[f];
  if (b.status === 'DRAFT' || b.status === 'VALIDATED') d.status = b.status;
  if (Array.isArray(b.jewelryCodes)) d.jewelryCodes = b.jewelryCodes;
  if (b.bom !== undefined) d.bom = b.bom;
  for (const f of DECIMAL_FIELDS) if (b[f] !== undefined && b[f] !== '' && b[f] !== null) d[f] = b[f];
  return d;
}

// Liste + recherche (?q=)
productsRouter.get('/', async (req, res) => {
  const q = req.query.q ? String(req.query.q) : undefined;
  const where = q
    ? { OR: [{ sku: { contains: q, mode: 'insensitive' as const } }, { name: { contains: q, mode: 'insensitive' as const } }] }
    : undefined;
  res.json(await prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 300 }));
});

productsRouter.get('/:id', async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Fiche introuvable.' });
  res.json(p);
});

productsRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name requis.' });
  try {
    const sku = buildSku(b);
    const data = { ...pickData(b), sku } as Prisma.ProductUncheckedCreateInput;
    res.status(201).json(await prisma.product.create({ data }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

productsRouter.put('/:id', async (req, res) => {
  const b = req.body ?? {};
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Fiche introuvable.' });
    const merged = { ...existing, ...pickData(b) } as Codes;
    const sku = buildSku(merged);
    const data = { ...pickData(b), sku } as Prisma.ProductUncheckedUpdateInput;
    res.json(await prisma.product.update({ where: { id: req.params.id }, data }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

productsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Sync Shopify : crée/met à jour le produit (variante prix/SKU + statut). */
productsRouter.post('/:id/sync-shopify', async (req, res) => {
  try {
    const p = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Fiche introuvable.' });
    const price = p.priceHtEur ?? p.priceHtUsd;
    const result = await syncProductToShopify({
      shopifyProductId: p.shopifyProductId,
      title: p.name,
      sku: p.sku,
      price: price != null ? String(price) : undefined,
      status: p.status === 'VALIDATED' ? 'ACTIVE' : 'DRAFT',
      hsCode: p.hsCode,
      countryOrigin: p.countryOrigin,
    });
    const updated = await prisma.product.update({
      where: { id: p.id },
      data: { shopifyProductId: result.id },
    });
    res.json({ product: updated, shopify: result });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
