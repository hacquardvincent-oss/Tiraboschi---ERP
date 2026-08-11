/* SKU canonique — format acté : MODEL-YYS-MAT-OPT-COLOR
   Ex. CO-26H-CU014-OR-MA. Une seule implémentation pour tout l'écosystème ;
   le PLM (fork VB) devra produire la même grammaire, pas le même code. */

export function genererSKU({ modele, annee = '26', saison = 'H', matiere, option = 'XX', nuance }) {
  for (const [nom, v] of Object.entries({ modele, matiere, nuance }))
    if (!v) throw new Error(`SKU : composant manquant — ${nom}`);
  return [
    modele.toUpperCase(),
    `${annee}${saison.toUpperCase()}`,
    matiere.toUpperCase(),
    option.toUpperCase(),
    nuance.toUpperCase(),
  ].join('-');
}

export function genererSerie(sequence, annee = new Date().getFullYear()) {
  return `TS-${annee}-${String(sequence).padStart(5, '0')}`;
}
