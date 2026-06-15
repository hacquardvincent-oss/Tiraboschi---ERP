import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assembleSku } from '../services/sku';
import { syncProductToShopify, fetchProductImagesBySku } from '../services/shopify';
import { importCatalogCsv, importTechSheetsCsv } from '../services/import';
import { computeAvailability } from '../services/atp';

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
  const p = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { bomLines: { include: { material: true } } },
  });
  if (!p) return res.status(404).json({ error: 'Fiche introuvable.' });
  res.json(p);
});

// Remplace la nomenclature chiffrée (lignes matière reliées au stock) d'une fiche
productsRouter.put('/:id/bom', async (req, res) => {
  const lines: { materialId?: string; role?: string; quantity?: unknown; unit?: string }[] = Array.isArray(req.body?.lines)
    ? req.body.lines
    : [];
  try {
    await prisma.$transaction([
      prisma.bomLine.deleteMany({ where: { productId: req.params.id } }),
      prisma.bomLine.createMany({
        data: lines
          .filter((l) => l.materialId && l.quantity !== undefined && l.quantity !== '' && l.quantity !== null)
          .map((l) => ({
            productId: req.params.id,
            materialId: l.materialId as string,
            role: l.role || 'principale',
            quantity: l.quantity as never,
            unit: l.unit || 'piece',
          })),
      }),
    ]);
    res.json(await prisma.bomLine.findMany({ where: { productId: req.params.id }, include: { material: true } }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Disponibilité / délai de production d'un produit (moteur ATP)
productsRouter.get('/:id/availability', async (req, res) => {
  const qty = Math.max(1, Number(req.query.qty) || 1);
  const a = await computeAvailability(req.params.id, qty);
  if (!a) return res.status(404).json({ error: 'Fiche introuvable.' });
  res.json(a);
});

// Import CSV de la collection (app_base_v3 / Import_Shopify) — upsert par SKU, idempotent
productsRouter.post('/import', async (req, res) => {
  const csv = (req.body ?? {}).csv;
  if (typeof csv !== 'string' || csv.trim().length === 0) return res.status(400).json({ error: 'csv requis.' });
  try {
    res.json(await importCatalogCsv(csv));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Backfill des visuels produits depuis Shopify (par SKU)
productsRouter.post('/import-images', async (_req, res) => {
  try {
    const map = await fetchProductImagesBySku();
    const products = await prisma.product.findMany({ select: { id: true, sku: true } });
    let updated = 0;
    for (const p of products) {
      const url = map.get(p.sku);
      if (url) {
        await prisma.product.update({ where: { id: p.id }, data: { imageUrl: url } });
        updated++;
      }
    }
    res.json({ updated, shopifyImages: map.size });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Import descriptif des fiches techniques (FICHES) → texte de référence par modèle
productsRouter.post('/tech-sheets-import', async (req, res) => {
  const csv = (req.body ?? {}).csv;
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'csv requis.' });
  try {
    res.json(await importTechSheetsCsv(csv));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
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
