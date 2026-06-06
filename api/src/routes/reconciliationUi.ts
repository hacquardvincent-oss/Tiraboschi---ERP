import { Router } from 'express';

/** Page navigateur (affichage libre) pour lancer la réconciliation Stripe ↔ Shopify. */
export const reconciliationUiRouter = Router();

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Réconciliation Stripe ↔ Shopify — Tiraboschi ERP</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 860px; margin: 24px auto; padding: 0 16px; color:#111; background:#f6f6f6; }
  h1 { font-size: 1.25rem; }
  label { display:block; font-weight:600; margin: 14px 0 6px; }
  input { padding:10px; border:1px solid #ccc; border-radius:6px; font-size:14px; }
  button { margin-left:8px; padding:11px 18px; background:#050505; color:#fff; border:none; border-radius:6px; font-size:15px; cursor:pointer; box-shadow:0 2px 0 #00D4FF; }
  button:disabled { opacity:.5; }
  .summary { margin-top:16px; padding:12px 14px; background:#fff; border-radius:8px; border:1px solid #e3e3e3; }
  table { width:100%; border-collapse:collapse; margin-top:14px; background:#fff; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #eee; font-size:13px; }
  th { background:#fafafa; }
  .ok { color:#1a7f37; font-weight:600; }
  .bad { color:#b3261e; font-weight:600; }
  pre { background:#0b0b0b; color:#ffd7d7; padding:12px; border-radius:6px; white-space:pre-wrap; }
  .note { color:#666; font-size:13px; }
</style>
</head>
<body>
  <h1>Réconciliation Stripe ↔ Shopify</h1>
  <p class="note">Compare les paiements Stripe réussis (FR + US) aux commandes Shopify. Liste les paiements encaissés <strong>sans commande Shopify</strong>.</p>

  <label for="key">Clé (RECOVERY_KEY)</label>
  <input id="key" type="password" placeholder="colle ta clé" autocomplete="off">
  <label for="since">Depuis (date)</label>
  <input id="since" type="date" value="2026-05-01">
  <button id="btn" onclick="runReco()">Lancer la réconciliation</button>

  <div id="result"></div>

<script>
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
  async function runReco() {
    var key = document.getElementById('key').value.trim();
    var since = document.getElementById('since').value;
    var btn = document.getElementById('btn');
    var box = document.getElementById('result');
    if (!key) { box.innerHTML = '<p class="bad">Entre la clé.</p>'; return; }
    btn.disabled = true; box.innerHTML = '<p>Analyse en cours…</p>';
    try {
      var res = await fetch('/api/reconciliation?since=' + encodeURIComponent(since), { headers: { 'x-recovery-key': key } });
      var d = await res.json();
      if (!res.ok) { box.innerHTML = '<pre>' + esc(JSON.stringify(d, null, 2)) + '</pre>'; btn.disabled = false; return; }
      var html = '<div class="summary">Depuis <b>' + esc(d.since) + '</b> — Stripe: <b>' + d.stripePayments + '</b> paiements · Shopify: <b>' + d.shopifyOrders + '</b> commandes · ';
      html += 'réconciliés: <span class="ok">' + d.matched + '</span> · manquants: <span class="' + (d.missing.length ? 'bad' : 'ok') + '">' + d.missing.length + '</span></div>';
      if (d.missing.length) {
        html += '<table><tr><th>Compte</th><th>PaymentIntent</th><th>Montant</th><th>Date</th><th>Email</th></tr>';
        d.missing.forEach(function(m){
          html += '<tr><td>' + esc(m.account) + '</td><td>' + esc(m.id) + '</td><td>' + esc(m.amount) + ' ' + esc(m.currency) + '</td><td>' + esc(m.createdISO) + '</td><td>' + esc(m.email) + '</td></tr>';
        });
        html += '</table>';
      } else {
        html += '<p class="ok">✅ Aucun paiement non synchronisé. Tout est dans Shopify.</p>';
      }
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<p class="bad">Erreur : ' + esc(e.message) + '</p>';
    }
    btn.disabled = false;
  }
</script>
</body>
</html>`;

reconciliationUiRouter.get('/', (_req, res) => {
  res.type('html').send(PAGE);
});
