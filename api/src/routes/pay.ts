import { Router } from 'express';
import { prisma } from '../db/prisma';

export const payRouter = Router();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Page de redirection brandée vers le paiement Stripe (cible des liens envoyés au client).
 * Évite que les apps (WhatsApp/SMS) bloquent l'ouverture directe de Stripe, et personnalise l'attente.
 * GET /pay/:id
 */
payRouter.get('/:id', async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
  const url = sale?.paymentUrl ?? null;
  const paid = sale?.status === 'PAID';
  const body = !sale
    ? `<p class="msg">Lien introuvable.</p>`
    : paid
      ? `<p class="ok">✓ Paiement déjà reçu</p><p class="msg">Merci ! Cette commande est réglée.</p>`
      : !url
        ? `<p class="msg">Lien de paiement indisponible. Contactez la maison Tiraboschi.</p>`
        : `<div class="spin"></div>
           <p class="msg">Redirection vers le paiement sécurisé…</p>
           <a class="cta" href="${esc(url)}">Continuer vers le paiement</a>`;
  const redirect = sale && url && !paid;

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
${redirect ? `<meta http-equiv="refresh" content="1;url=${esc(url!)}"/>` : ''}
<title>Tiraboschi — Paiement sécurisé</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Playfair+Display:wght@500&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;background:#0C0B0A;color:#fff;font-family:Inter,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
  .card{max-width:380px}
  .logo{font-family:'Playfair Display',Georgia,serif;font-size:2.2rem;color:#F4F1EA}
  .since{color:#C9A86A;font-size:11px;letter-spacing:.15em;margin-top:2px}
  .rule{height:1px;width:64px;background:#C9A86A;margin:18px auto 26px}
  .spin{width:34px;height:34px;border:3px solid rgba(255,255,255,.15);border-top-color:#C9A86A;border-radius:50%;margin:0 auto 18px;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  .msg{color:rgba(255,255,255,.7);font-size:14px}
  .ok{color:#C9A86A;font-size:18px;margin-bottom:6px}
  .cta{display:inline-block;margin-top:18px;color:#C9A86A;font-size:13px;text-decoration:none;border:1px solid #C9A86A;padding:9px 16px;border-radius:4px}
</style></head>
<body><div class="card">
  <div class="logo">Tiraboschi</div><div class="since">SINCE 1904</div>
  <div class="rule"></div>
  ${body}
</div>
${redirect ? `<script>setTimeout(function(){location.replace(${JSON.stringify(url)})},900)</script>` : ''}
</body></html>`);
});
