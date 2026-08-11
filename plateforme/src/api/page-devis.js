/* La page /devis/:token — l'univers de la maison, pas celui du back-office.
   Une seule URL par devis, toujours à jour : la cliente ne voit jamais une
   version intermédiaire ni un état incohérent. */

const ETATS_CLIENTE = {
  consulte: 'À votre lecture',
  a_retravailler: 'En reprise chez votre conseiller',
  accepte: 'Acceptée — acompte à régler',
  acompte_encaisse: 'En façonnage',
  en_production: 'En façonnage',
  livree: 'Livrée',
  expire: 'Expirée — votre conseiller reste joignable',
};

export function pageDevis(d) {
  const v = d.versions.at(-1);
  const lignes = v.chiffrage.lignes.map(l => `
    <div class="ligne"><span class="k">${l.k}</span><span>${l.v}</span>
      <span class="p">${l.p ? '+ ' + euros(l.p) : 'inclus'}</span></div>`).join('');
  const actions =
    d.etat === 'consulte' ? `
      <form method="post" action="/devis/${d.token}/retravailler" class="lign">
        <input name="message" placeholder="Un souhait d'ajustement ?" class="champ">
        <button class="cta">Demander un ajustement</button></form>
      <form method="post" action="/devis/${d.token}/accepter">
        <button class="cta cta--plein">Valider cette pièce</button></form>`
    : d.etat === 'accepte' ? `
      <a class="cta cta--plein" href="${d.lien_acompte ?? '#'}">Régler l'acompte · ${euros(d.acompte)}</a>`
    : `<span class="etat">${ETATS_CLIENTE[d.etat] ?? d.etat}${d.serie ? ' — pièce ' + d.serie : ''}</span>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devis ${d.id} — Atelier Tiraboschi</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#efeae3;color:#0a0a0a;font-family:'Playfair Display',Georgia,serif;
  min-height:100vh;padding:clamp(24px,6vh,64px) 18px}
.doc{background:#fff;max-width:640px;margin:0 auto;padding:46px clamp(22px,5vw,54px);
  box-shadow:0 30px 80px rgba(10,10,10,.12)}
.num{font-size:9px;letter-spacing:.26em;text-transform:uppercase;opacity:.45;
  font-family:system-ui,sans-serif;display:flex;justify-content:space-between}
h1{font-size:clamp(26px,5vw,38px);letter-spacing:-.02em;margin:16px 0 26px}
h1 em{font-style:italic}
.ligne{display:flex;justify-content:space-between;gap:14px;padding:11px 0;
  border-bottom:1px solid rgba(10,10,10,.1);font-size:14px}
.ligne .k{font-size:9px;letter-spacing:.16em;text-transform:uppercase;opacity:.45;
  font-family:system-ui,sans-serif;padding-top:3px}
.ligne .p{font-size:11px;opacity:.55;white-space:nowrap;font-family:system-ui,sans-serif}
.tt{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px}
.tt .l{font-size:9px;letter-spacing:.24em;text-transform:uppercase;opacity:.4;font-family:system-ui,sans-serif}
.tt .v{font-size:32px}
.actions{margin-top:32px;display:flex;flex-direction:column;gap:12px}
.lign{display:flex;gap:10px}
.champ{flex:1;border:none;border-bottom:1px solid rgba(10,10,10,.3);background:none;
  font-family:inherit;font-size:13px;padding:8px 2px;outline:none}
.cta{border:1px solid #0a0a0a;background:none;padding:14px 28px;font-size:10px;
  letter-spacing:.22em;text-transform:uppercase;font-family:system-ui,sans-serif;
  cursor:pointer;text-align:center;text-decoration:none;color:inherit;transition:.3s}
.cta:hover{background:#0a0a0a;color:#fff}
.cta--plein{background:#0a0a0a;color:#fff}
.etat{display:inline-block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  font-family:system-ui,sans-serif;border:1px solid currentColor;padding:8px 16px}
.note{font-size:11px;line-height:1.8;opacity:.5;margin-top:26px;font-style:italic}
</style></head><body>
<div class="doc">
  <div class="num"><span>Devis ${d.id} · version ${d.version_courante}</span><span>Atelier Tiraboschi</span></div>
  <h1>Votre <em>${v.chiffrage.libelles.modele}</em></h1>
  ${lignes}
  <div class="tt"><span class="l">Estimation ferme</span><span class="v">${euros(d.total)}</span></div>
  <div class="actions">${actions}</div>
  <p class="note">Façonnage : 12 à 16 semaines. Un cuir exotique reste soumis à
  disponibilité en tannerie. Votre conseiller reste votre interlocuteur unique.</p>
</div></body></html>`;
}

const euros = n => n.toLocaleString('fr-FR') + ' €';
