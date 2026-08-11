/* Journal d'événements — LA seule voie de communication entre modules.
   `emettre` écrit le fait ; `traiterJournal` fait consommer chaque événement
   par chaque worker intéressé, une seule fois (idempotence par marquage).
   En prod : appelé sur interval. En test : appelé explicitement — déterministe. */

export async function emettre(store, type, sujet, donnees = {}, { muet = false, quand } = {}) {
  return store.col('evenements').insererUn({
    type, sujet, donnees, muet,
    at: (quand ?? new Date()).toISOString(),
    consommations: {},
  });
}

export async function traiterJournal(store, workers, ctx) {
  let traites = 0;
  for (const w of workers) {
    const evts = await store.col('evenements').trouver({ [`consommations.${w.nom}`]: { $exists: false } });
    for (const evt of evts.sort((a, b) => a.at.localeCompare(b.at))) {
      if (!w.types.includes(evt.type)) {
        await marquer(store, evt._id, w.nom, 'ignore');
        continue;
      }
      await w.traiter({ ...ctx, store }, evt);   // un worker qui jette laisse l'evt non marqué → rejouable
      await marquer(store, evt._id, w.nom, new Date().toISOString());
      traites++;
    }
  }
  return traites;
}

async function marquer(store, id, worker, valeur) {
  await store.col('evenements').majUn({ _id: id }, { [`consommations.${worker}`]: valeur });
}

/* Timeline d'une cliente = le journal filtré. Aucune table dédiée. */
export async function timeline(store, clienteId) {
  const devis = await store.col('devis').trouver({ cliente: clienteId });
  const ids = new Set([clienteId, ...devis.map(d => d.id)]);
  const evts = await store.col('evenements').trouver({});
  return evts.filter(e => ids.has(e.sujet)).sort((a, b) => b.at.localeCompare(a.at));
}
