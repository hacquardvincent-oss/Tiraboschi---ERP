import { Router } from 'express';

/**
 * Page web minimale (non protégée à l'affichage) pour déclencher une récupération
 * de commande depuis un navigateur, sans terminal. Le POST reste protégé par la
 * RECOVERY_KEY saisie dans le formulaire (jamais stockée côté serveur ni dans le repo).
 */
export const recoveryUiRouter = Router();

const PREFILLED_ATLANTA = JSON.stringify(
  {
    currency: 'USD',
    email: 'pmtatlanta@comcast.net',
    customer: { firstName: 'Patricia', lastName: 'Thomas' },
    shippingAddress: {
      firstName: 'Patricia',
      lastName: 'Thomas',
      city: 'Atlanta',
      provinceCode: 'GA',
      zip: '30342',
      countryCode: 'US',
    },
    lineItems: [
      {
        title: 'Pochon – Cuir Agneau – Pochon avec Chaîne – Coloris Beige (Sur Place)',
        quantity: 1,
        price: '680.00',
      },
    ],
    taxLines: [
      { title: 'Georgia State Tax (4%)', rate: 0.04, price: '27.20' },
      { title: 'Fulton County Tax (3%)', rate: 0.03, price: '20.40' },
      { title: 'Fulton County TSPLOST (0.75%)', rate: 0.0075, price: '5.11' },
    ],
    stripeId: 'pi_3TehiGBXF9ywmV5N07aEiJ5L',
    processedAt: '2026-06-04T18:18:00Z',
    note: 'Récupération vente TPE non synchronisée — TIRABOSCHI, LLC — 04/06/2026 20:18',
  },
  null,
  2,
);

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Récupération de commande — Tiraboschi ERP</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #111; background: #f6f6f6; }
  h1 { font-size: 1.25rem; }
  label { display:block; font-weight:600; margin: 14px 0 6px; }
  input, textarea { width:100%; box-sizing:border-box; padding:10px; border:1px solid #ccc; border-radius:6px; font-family: ui-monospace, monospace; font-size: 13px; }
  textarea { height: 360px; }
  button { margin-top:16px; padding:12px 18px; background:#050505; color:#fff; border:none; border-radius:6px; font-size:15px; cursor:pointer; box-shadow: 0 2px 0 #00D4FF; }
  button:disabled { opacity:.5; cursor:default; }
  pre { background:#0b0b0b; color:#d7ffe8; padding:14px; border-radius:6px; white-space:pre-wrap; word-break:break-word; margin-top:16px; }
  .note { color:#666; font-size:13px; }
</style>
</head>
<body>
  <h1>Récupération de commande Shopify</h1>
  <p class="note">Recrée une commande encaissée mais absente de Shopify (montants + taxes exacts, statut payé, sans reçu).</p>

  <label for="key">Clé de récupération (RECOVERY_KEY)</label>
  <input id="key" type="password" placeholder="colle ta RECOVERY_KEY ici" autocomplete="off">

  <label for="payload">Détails de la commande (JSON, pré-rempli pour la vente d'Atlanta)</label>
  <textarea id="payload">${PREFILLED_ATLANTA}</textarea>

  <button id="btn" onclick="submitOrder()">Créer la commande dans Shopify</button>
  <pre id="out">Résultat ici…</pre>

<script>
  async function submitOrder() {
    var key = document.getElementById('key').value.trim();
    var btn = document.getElementById('btn');
    var out = document.getElementById('out');
    if (!key) { out.textContent = 'Entre la clé de récupération.'; return; }
    var payload;
    try { payload = JSON.parse(document.getElementById('payload').value); }
    catch (e) { out.textContent = 'JSON invalide : ' + e.message; return; }
    btn.disabled = true; out.textContent = 'Création en cours…';
    try {
      var res = await fetch('/api/recovery/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-recovery-key': key },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      out.textContent = (res.ok ? '✅ ' : '❌ ') + JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent = 'Erreur réseau : ' + e.message;
    }
    btn.disabled = false;
  }
</script>
</body>
</html>`;

recoveryUiRouter.get('/', (_req, res) => {
  res.type('html').send(PAGE);
});
