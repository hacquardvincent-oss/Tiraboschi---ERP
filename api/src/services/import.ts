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
export async function importCatalogCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
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
  return res;
}
