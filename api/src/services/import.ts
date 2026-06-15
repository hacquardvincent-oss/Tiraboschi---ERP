import { prisma } from '../db/prisma';

/**
 * Découpe un SKU Tiraboschi en composants pour alimenter l'arborescence collection.
 * Format : {modèle:5}{année:2}{saison:1}-{matière:5}{option:2}-{couleur}
 * ex. AA00326E-CU00700-001 → AA003 / 26 / E / CU007 / 00 / 001
 */
export function parseSku(sku: string): {
  modelCode?: string;
  yearCode?: string;
  seasonCode?: string;
  materialCode?: string;
  optionCode?: string;
  colorCode?: string;
} {
  const parts = sku.trim().split('-');
  if (parts.length < 3) return {};
  const [a, b, c] = parts;
  return {
    modelCode: a.slice(0, 5) || undefined,
    yearCode: a.slice(5, 7) || undefined,
    seasonCode: a.slice(7) || undefined,
    materialCode: b.slice(0, 5) || undefined,
    optionCode: b.slice(5) || undefined,
    colorCode: c || undefined,
  };
}

/** Parseur CSV minimal (délimiteur ; ou , détecté sur l'en-tête ; gère les guillemets). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === delim && !inQ) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

/** Trouve la valeur d'une colonne par mot-clé (insensible casse/accents). */
function col(row: Record<string, string>, ...keys: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const k of keys) {
    const nk = norm(k);
    const found = Object.keys(row).find((h) => norm(h).includes(nk));
    if (found && row[found] !== '') return row[found];
  }
  return undefined;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Importe / met à jour la collection depuis des lignes CSV (formats app_base_v3 ou Import_Shopify).
 * Idempotent : upsert par SKU. Met à jour le prix (USD) sans écraser le reste si la fiche existe.
 */
/** Upsert d'une entrée référentiel par (category, code). */
async function upsertRef(category: string, code: string, label: string) {
  if (!code || !label) return;
  await prisma.refItem.upsert({
    where: { category_code: { category, code } },
    create: { category, code, label },
    update: { label },
  });
}

export async function importCatalogCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  // Dérive les listes déroulantes (modèles, matières, couleurs) depuis la collection.
  const refs = { models: new Map<string, string>(), materials: new Map<string, string>(), colors: new Map<string, string>() };
  for (const row of rows) {
    const sku = col(row, 'variant sku', 'sku');
    if (!sku) {
      res.skipped++;
      continue;
    }
    const name = col(row, 'nom complet', 'nom', 'title') || sku;
    const priceRaw = col(row, 'prix ht', 'variant price / united states', 'variant price', 'prix');
    const priceHtUsd = priceRaw ? Number(priceRaw.replace(/[^0-9.,]/g, '').replace(',', '.')) : undefined;
    const codes = parseSku(sku);
    const modeleLabel = col(row, 'modèle', 'modele');
    const matiereLabel = col(row, 'matière', 'matiere');
    const couleurLabel = col(row, 'couleur');
    if (codes.modelCode && modeleLabel) refs.models.set(codes.modelCode, modeleLabel);
    if (codes.materialCode && matiereLabel) refs.materials.set(codes.materialCode, matiereLabel);
    if (codes.colorCode && couleurLabel) refs.colors.set(codes.colorCode, couleurLabel);
    try {
      const existing = await prisma.product.findUnique({ where: { sku } });
      if (existing) {
        await prisma.product.update({
          where: { sku },
          data: { ...(priceHtUsd != null && !Number.isNaN(priceHtUsd) ? { priceHtUsd } : {}) },
        });
        res.updated++;
      } else {
        await prisma.product.create({
          data: {
            sku,
            name,
            status: 'VALIDATED',
            ...codes,
            ...(priceHtUsd != null && !Number.isNaN(priceHtUsd) ? { priceHtUsd } : {}),
          },
        });
        res.created++;
      }
    } catch (e) {
      res.errors.push(`${sku}: ${(e as Error).message}`);
    }
  }
  for (const [code, label] of refs.models) await upsertRef('models', code, label);
  for (const [code, label] of refs.materials) await upsertRef('materials', code, label);
  for (const [code, label] of refs.colors) await upsertRef('colors', code, label);
  return res;
}

const MAT_CATEGORY: Record<string, 'LEATHER' | 'HARDWARE' | 'LINING' | 'PACKAGING' | 'OTHER'> = {
  peaux: 'LEATHER',
  cuir: 'LEATHER',
  bijoux: 'HARDWARE',
  bijouterie: 'HARDWARE',
  fournitures: 'HARDWARE',
  doublure: 'LINING',
  packaging: 'PACKAGING',
};

/**
 * Importe les matières (Peaux / Bijoux de l'inventaire) → table Material + stock initial.
 * Idempotent : upsert par ID matière ; le stock initial est posé via un mouvement ADJUSTMENT
 * de référence INIT-<code> (recréé à chaque import, donc le recomptage met à jour la base).
 * Tolérant : lignes sans ID matière valide (vide / #ERROR!) ignorées.
 */
export async function importMaterialsCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // Regroupe par ID matière (la source réutilise un même ID pour plusieurs coloris).
  const groups = new Map<
    string,
    { name: string; category: string; unit: string; unitCost?: number; supplier?: string; qty: number }
  >();
  for (const row of rows) {
    const code = col(row, 'id matière', 'id matiere', 'id');
    if (!code || /error/i.test(code)) {
      res.skipped++;
      continue;
    }
    const animal = col(row, 'animal') ?? '';
    const type = col(row, 'type') ?? '';
    const couleur = col(row, 'couleur') ?? '';
    const name = [animal, type, couleur].map((s) => s.trim()).filter(Boolean).join(' ') || code;
    const catRaw = (col(row, 'catégorie', 'categorie') ?? '').toLowerCase().trim();
    const category = MAT_CATEGORY[catRaw] ?? 'OTHER';
    const unit = category === 'LEATHER' ? 'pied' : 'piece';
    const costRaw = col(row, "coût d'achat", 'cout', 'coût', 'cout achat');
    const unitCost = costRaw ? Number(costRaw.replace(/[^0-9.,]/g, '').replace(',', '.')) : undefined;
    const supplier = col(row, 'fournisseur');
    const qtyRaw = col(row, 'recomptage total', 'recomptage', '1er comptage', 'quantité', 'quantite', 'pieds');
    const qty = qtyRaw ? Number(qtyRaw.replace(/[^0-9.,-]/g, '').replace(',', '.')) : 0;

    const g = groups.get(code) ?? { name, category, unit, unitCost, supplier, qty: 0 };
    g.name = name || g.name;
    if (unitCost != null && !Number.isNaN(unitCost)) g.unitCost = unitCost;
    if (supplier) g.supplier = supplier;
    g.qty += Number.isNaN(qty) ? 0 : qty;
    groups.set(code, g);
  }

  for (const [code, g] of groups) {
    try {
      let supplierId: string | undefined;
      if (g.supplier) {
        const existing = await prisma.supplier.findFirst({ where: { name: g.supplier } });
        supplierId = existing ? existing.id : (await prisma.supplier.create({ data: { name: g.supplier } })).id;
      }
      const existingMat = await prisma.material.findUnique({ where: { code } });
      const data = {
        name: g.name,
        category: g.category as never,
        unit: g.unit,
        ...(g.unitCost != null ? { unitCost: g.unitCost } : {}),
        ...(supplierId ? { supplierId } : {}),
      };
      const mat = existingMat
        ? await prisma.material.update({ where: { code }, data })
        : await prisma.material.create({ data: { code, ...data } });
      existingMat ? res.updated++ : res.created++;

      // Stock initial : ADJUSTMENT idempotent (recréé)
      const ref = 'INIT-' + code;
      await prisma.stockMovement.deleteMany({ where: { materialId: mat.id, reference: ref } });
      if (g.qty > 0) {
        await prisma.stockMovement.create({
          data: { materialId: mat.id, type: 'ADJUSTMENT', quantity: g.qty, reference: ref, note: 'Stock initial (import inventaire)' },
        });
      }
    } catch (e) {
      res.errors.push(`${code}: ${(e as Error).message}`);
    }
  }
  return res;
}

/**
 * Importe une liste de référentiel (une catégorie) depuis un CSV.
 * Colonnes reconnues : code/id (optionnel) + label/nom/libellé. Code auto = label si absent.
 * Idempotent : upsert par (category, code).
 */
export async function importRefCsv(category: string, text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    const label = col(row, 'label', 'libellé', 'libelle', 'nom', 'name');
    const code = col(row, 'code', 'id') || label;
    if (!code || !label) {
      res.skipped++;
      continue;
    }
    try {
      const existing = await prisma.refItem.findUnique({ where: { category_code: { category, code } } });
      await upsertRef(category, code, label);
      existing ? res.updated++ : res.created++;
    } catch (e) {
      res.errors.push(`${code}: ${(e as Error).message}`);
    }
  }
  return res;
}
