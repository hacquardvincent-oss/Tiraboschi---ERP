// Moteur SKU produit — règles du CDC (docs/specs/CDC_calcul_SKU.docx).
// Format : [MODÈLE][ANNÉE][SAISON]-[MATIÈRE][OPTION]-[COULEUR]
// Exemple : AA002 + 26 + E + CU002 + 01 + 001  ->  AA00226E-CU00201-001

export interface SkuComponents {
  modelId: string; // ex. "AA002"
  yearId: string; // 2 chiffres, ex. "26"
  seasonId: string; // "H" | "E"
  materialId: string; // ex. "CU002" / "CE001"
  optionId: string; // 2 chiffres, ex. "01"
  colorId: string; // 3 chiffres, ex. "001" / "999"
}

/** Assemble le SKU final à partir des composants (formatage option/saison/casse). */
export function assembleSku(c: SkuComponents): string {
  const model = (c.modelId || 'AA000').toUpperCase();
  const year = (c.yearId || '25').padStart(2, '0');
  const season = (c.seasonId || 'H').toUpperCase();
  const material = (c.materialId || 'CU000').toUpperCase();
  const option = String(c.optionId ?? '00').padStart(2, '0');
  const color = c.colorId || '000';
  return `${model}${year}${season}-${material}${option}-${color}`;
}

/** Année : 2 derniers chiffres de l'année saisie ("2026" -> "26"). */
export function deriveYearId(yearInput: string | number): string {
  const digits = String(yearInput).replace(/\D/g, '');
  return digits.slice(-2).padStart(2, '0');
}

/** Saison : Hiver/Automne ou commence par H -> "H" ; Été/Ete/Printemps ou commence par E -> "E". */
export function deriveSeasonId(text: string): 'H' | 'E' {
  const t = (text || '').trim().toLowerCase();
  if (/hiver|automne/.test(t) || t.startsWith('h')) return 'H';
  if (/[ée]t[ée]|ete|printemps/.test(t) || t.startsWith('e')) return 'E';
  return 'H';
}

/** Matière globale : "Exceptionnel"/"Exotique" -> "CE" ; sinon (cuirs classiques) -> "CU". */
export function deriveMaterialPrefix(name: string): 'CE' | 'CU' {
  return /exceptionnel|exotique/i.test(name || '') ? 'CE' : 'CU';
}

/**
 * Prochain ID séquentiel pour un préfixe (modèle "AA", matière "CU"/"CE"), sur `width` chiffres.
 * Ex. nextSequentialId(["AA007"], "AA") -> "AA008".
 */
export function nextSequentialId(existingIds: string[], prefix: string, width = 3): string {
  const re = new RegExp(`^${prefix}(\\d{${width}})$`, 'i');
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix.toUpperCase() + String(max + 1).padStart(width, '0');
}

/**
 * Prochaine couleur (3 chiffres) en IGNORANT le code historique 999 (Noir, réservé)
 * pour ne pas générer "1000".
 */
export function nextColorId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n) && n !== 999) max = Math.max(max, n);
  }
  return String(max + 1).padStart(3, '0');
}
