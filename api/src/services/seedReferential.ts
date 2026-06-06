import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/prisma';

// Dictionnaires du config V1 (format {name, id}) → référentiel générique.
const CATEGORIES = [
  'models', 'years', 'seasons', 'options', 'optionTypes', 'colors', 'sizes',
  'globalMaterials', 'animalTypes', 'skinTypes', 'linings', 'materialDetails',
  'suppliers', 'jewelry', 'origins', 'hsCodes', 'ateliers',
];

/** Seed initial du référentiel depuis legacy-v1/data/products_db.json (propre). Idempotent. */
export async function seedReferential(): Promise<void> {
  const existing = await prisma.refItem.count();
  if (existing > 0) {
    console.log(`[seed-ref] déjà peuplé (${existing} entrées) — skip.`);
    return;
  }
  const file = path.join(__dirname, '..', '..', 'legacy-v1', 'data', 'products_db.json');
  if (!fs.existsSync(file)) {
    console.log('[seed-ref] products_db.json introuvable — skip.');
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { config?: Record<string, unknown> };
  const config = data.config ?? {};
  let total = 0;
  for (const category of CATEGORIES) {
    const list = config[category];
    if (!Array.isArray(list)) continue;
    let sortOrder = 0;
    for (const it of list as Array<{ id?: unknown; name?: unknown }>) {
      if (!it || it.id == null || it.name == null) continue;
      await prisma.refItem.upsert({
        where: { category_code: { category, code: String(it.id) } },
        update: { label: String(it.name), sortOrder },
        create: { category, code: String(it.id), label: String(it.name), sortOrder },
      });
      sortOrder += 1;
      total += 1;
    }
  }
  console.log(`[seed-ref] référentiel seedé : ${total} entrées sur ${CATEGORIES.length} catégories.`);
}
