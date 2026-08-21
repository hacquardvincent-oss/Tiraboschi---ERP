import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/prisma';

// Dictionnaires du config V1 (format {name, id}) → référentiel générique.
const CATEGORIES = [
  'models', 'years', 'seasons', 'options', 'optionTypes', 'colors', 'sizes',
  'globalMaterials', 'animalTypes', 'skinTypes', 'linings', 'materialDetails',
  'suppliers', 'jewelry', 'origins', 'hsCodes', 'ateliers',
];

/** Résout le JSON V1 quel que soit le mode d'exécution (tsx/dev ou node dist/ en prod). */
function resolveDbFile(): string | null {
  const rel = ['legacy-v1', 'data', 'products_db.json'];
  const candidates = [
    path.join(__dirname, '..', '..', '..', rel[0], rel[1], rel[2]), // dist/services → racine repo
    path.join(__dirname, '..', '..', rel[0], rel[1], rel[2]),
    path.join(process.cwd(), rel[0], rel[1], rel[2]), // cwd = racine repo
    path.join(process.cwd(), '..', rel[0], rel[1], rel[2]), // cwd = api/
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Seed du référentiel depuis legacy-v1/data/products_db.json (config V1 propre).
 * Idempotent et NON destructif : ne peuple QUE les catégories actuellement vides.
 * → si l'import catalogue a déjà créé models/materials/colors, on remplit les 14 autres
 *   (animaux, peaux, doublures, fournisseurs, bijouterie, origines, codes HS, ateliers…)
 *   sans écraser les libellés déjà importés.
 */
export async function seedReferential(): Promise<void> {
  const file = resolveDbFile();
  if (!file) {
    console.log('[seed-ref] products_db.json introuvable — skip.');
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { config?: Record<string, unknown> };
  const config = data.config ?? {};

  // Catégories déjà peuplées → on n'y touche pas.
  const counts = await prisma.refItem.groupBy({ by: ['category'], _count: { _all: true } });
  const nonEmpty = new Set(counts.filter((c) => c._count._all > 0).map((c) => c.category));

  let total = 0;
  const filled: string[] = [];
  for (const category of CATEGORIES) {
    if (nonEmpty.has(category)) continue; // déjà alimentée (ex. import catalogue)
    const list = config[category];
    if (!Array.isArray(list)) continue;
    let sortOrder = 0;
    let n = 0;
    for (const it of list as Array<{ id?: unknown; name?: unknown }>) {
      if (!it || it.id == null || it.name == null) continue;
      await prisma.refItem.upsert({
        where: { category_code: { category, code: String(it.id) } },
        update: { label: String(it.name), sortOrder },
        create: { category, code: String(it.id), label: String(it.name), sortOrder },
      });
      sortOrder += 1;
      n += 1;
      total += 1;
    }
    if (n > 0) filled.push(`${category}:${n}`);
  }
  console.log(
    total > 0
      ? `[seed-ref] catégories complétées (${filled.join(', ')}) — ${total} entrées.`
      : '[seed-ref] toutes les catégories déjà peuplées — rien à faire.',
  );
}
