/* Référentiel — matières, nuances, modèles, ferrures.
   Une seule responsabilité transverse : le FILTRAGE par statut The Society.
   Le configurateur ne reçoit JAMAIS une matière que la cliente n'a pas
   le droit de voir — le voile se décide ici, côté serveur. */

export function visiblePour(entree, statut) {
  const requis = Number(String(entree.visibilite ?? 'public').replace('societe:', '') || 0);
  return Number.isNaN(requis) ? true : (statut ?? 0) >= (entree.visibilite === 'public' || entree.visibilite === undefined ? 0 : requis);
}

export async function referentielPour(store, cliente) {
  const statut = cliente?.societe?.statut ?? 0;
  const [modeles, matieres, nuances, ferrures] = await Promise.all([
    store.col('ref_modeles').trouver({}),
    store.col('ref_matieres').trouver({}),
    store.col('ref_nuances').trouver({}),
    store.col('ref_ferrures').trouver({}),
  ]);
  return {
    statut,
    modeles: modeles.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    matieres: matieres.filter(m => visiblePour(m, statut)).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    nuances: nuances.filter(n => visiblePour(n, statut)).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    ferrures: ferrures.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
  };
}

/* Chiffrage d'une spécification — retourne prix + libellés + refus si un
   élément est inconnu ou interdit à cette cliente. */
export async function chiffrer(store, spec, cliente) {
  const ref = await referentielPour(store, cliente);
  const modele = ref.modeles.find(m => m._id === spec.modele);
  const matiere = ref.matieres.find(m => m._id === spec.matiere);
  const nuance = ref.nuances.find(n => n._id === spec.nuance);
  const ferrure = ref.ferrures.find(f => f._id === (spec.ferrure ?? 'laiton'));
  if (!modele) throw erreurMetier('modele_inconnu', spec.modele);
  if (!matiere) throw erreurMetier('matiere_indisponible', spec.matiere); // inconnue OU sous voile
  if (!nuance) throw erreurMetier('nuance_indisponible', spec.nuance);
  if (!ferrure) throw erreurMetier('ferrure_inconnue', spec.ferrure);
  const total = modele.base + (matiere.supplement ?? 0) + (ferrure.supplement ?? 0);
  return {
    libelles: { modele: modele.nom, matiere: matiere.nom, nuance: nuance.nom, ferrure: ferrure.nom },
    codes: { modele: modele.code_erp, matiere: matiere.code_erp, nuance: nuance.code_erp, ferrure: ferrure.code_erp },
    lignes: [
      { k: 'Silhouette', v: modele.nom, p: modele.base },
      { k: 'Matière', v: `${matiere.nom} · ${nuance.nom}`, p: matiere.supplement ?? 0 },
      { k: 'Ferrures', v: ferrure.nom, p: ferrure.supplement ?? 0 },
    ],
    total,
    devise: 'EUR',
  };
}

export function erreurMetier(code, detail) {
  const e = new Error(`${code}${detail ? ` : ${detail}` : ''}`);
  e.metier = code;
  return e;
}
