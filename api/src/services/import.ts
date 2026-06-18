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
 * Import multi-catégories du référentiel : chaque COLONNE du CSV est une catégorie
 * (en-tête = nom de catégorie), chaque valeur non vide devient une entrée (code = libellé).
 * Idempotent. Pratique pour charger toutes les listes (BDD_APP) en un seul import.
 */
export async function importRefMultiCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (rows.length === 0) return res;
  const categories = Object.keys(rows[0]);
  for (const category of categories) {
    const seen = new Set<string>();
    for (const row of rows) {
      const val = (row[category] ?? '').trim();
      if (!val || seen.has(val)) continue;
      seen.add(val);
      try {
        const existing = await prisma.refItem.findUnique({ where: { category_code: { category, code: val } } });
        await prisma.refItem.upsert({
          where: { category_code: { category, code: val } },
          create: { category, code: val, label: val },
          update: { label: val },
        });
        existing ? res.updated++ : res.created++;
      } catch (e) {
        res.errors.push(`${category}/${val}: ${(e as Error).message}`);
      }
    }
  }
  return res;
}

/**
 * Import descriptif des fiches techniques (FICHES, feuille RESUME) → texte de référence
 * par modèle, stocké dans Product.bom.techSheet (lisible dans la fiche PLM, non relié au stock).
 * Rattache le modèle aux produits via le référentiel models (label → code) ou le nom.
 */
export async function importTechSheetsCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const modelHeader = headers.find((h) => /mod[èe]le/i.test(h));
  if (!modelHeader) {
    res.errors.push('Colonne « Modèle » introuvable.');
    return res;
  }
  // Regroupe les lignes (et leurs champs non vides) par modèle.
  const byModel = new Map<string, string[]>();
  for (const row of rows) {
    const model = (row[modelHeader] ?? '').trim();
    if (!model) {
      res.skipped++;
      continue;
    }
    const parts = headers
      .filter((h) => h !== modelHeader && (row[h] ?? '').trim() !== '')
      .map((h) => `${h}: ${row[h].trim()}`);
    const lines = byModel.get(model) ?? [];
    if (parts.length) lines.push(parts.join(' · '));
    byModel.set(model, lines);
  }

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  for (const [model, lines] of byModel) {
    const techSheet = lines.join('\n');
    try {
      // Trouve les codes modèle correspondants
      const refModels = await prisma.refItem.findMany({ where: { category: 'models' } });
      const codes = refModels.filter((r) => norm(r.label) === norm(model)).map((r) => r.code);
      const products = codes.length
        ? await prisma.product.findMany({ where: { modelCode: { in: codes } } })
        : await prisma.product.findMany({ where: { name: { startsWith: model } } });
      if (products.length === 0) {
        res.skipped++;
        continue;
      }
      for (const p of products) {
        const bom = (p.bom as Record<string, unknown> | null) ?? {};
        await prisma.product.update({ where: { id: p.id }, data: { bom: { ...bom, techSheet } as object } });
      }
      res.updated += products.length;
    } catch (e) {
      res.errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  return res;
}

/**
 * Import « base complète » : un seul CSV normalisé pour TOUT le référentiel.
 * Colonnes : category;code;label[;sortOrder] (1 ligne = 1 entrée). C'est le format
 * miroir de l'export (round-trip : exporter → corriger dans Excel → réimporter en masse).
 * Idempotent : upsert par (category, code). Lignes incomplètes ignorées.
 */
export async function importRefFullCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    const category = col(row, 'category', 'catégorie', 'categorie', 'liste');
    const label = col(row, 'label', 'libellé', 'libelle', 'nom', 'name');
    const code = col(row, 'code', 'id') || label;
    const sortRaw = col(row, 'sortorder', 'sort order', 'ordre', 'tri');
    if (!category || !code || !label) {
      res.skipped++;
      continue;
    }
    const sortOrder = sortRaw != null ? parseInt(sortRaw.replace(/[^0-9-]/g, ''), 10) : NaN;
    const hasSort = Number.isFinite(sortOrder);
    try {
      const existing = await prisma.refItem.findUnique({ where: { category_code: { category, code } } });
      await prisma.refItem.upsert({
        where: { category_code: { category, code } },
        create: { category, code, label, ...(hasSort ? { sortOrder } : {}) },
        update: { label, ...(hasSort ? { sortOrder } : {}) },
      });
      existing ? res.updated++ : res.created++;
    } catch (e) {
      res.errors.push(`${category}/${code}: ${(e as Error).message}`);
    }
  }
  return res;
}

/**
 * Exporte TOUT le référentiel en un CSV normalisé (category;code;label;sortOrder),
 * trié par catégorie puis code. Miroir de `importRefFullCsv` pour le round-trip.
 */
export async function exportRefCsv(): Promise<string> {
  const items = await prisma.refItem.findMany({ orderBy: [{ category: 'asc' }, { code: 'asc' }] });
  const esc = (s: string) => (/[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const lines = ['category;code;label;sortOrder'];
  for (const it of items) {
    lines.push([it.category, it.code, it.label, String(it.sortOrder)].map(esc).join(';'));
  }
  return lines.join('\n');
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
