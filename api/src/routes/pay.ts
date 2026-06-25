import { Router } from 'express';
import { prisma } from '../db/prisma';

export const payRouter = Router();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Navigateurs intégrés (in-app) qui cassent le Checkout Stripe en cas d'auto-redirection.
// On NE redirige PAS automatiquement dans ces cas : on invite à ouvrir dans Safari/Chrome.
const IN_APP_UA = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|Snapchat|TikTok|Twitter/i;

type Lang = 'fr' | 'en';
const T: Record<Lang, Record<string, string>> = {
  fr: {
    title: 'Tiraboschi — Paiement sécurisé',
    notFound: 'Lien introuvable.',
    paidTitle: '✓ Paiement déjà reçu',
    paidMsg: 'Merci ! Cette commande est réglée.',
    noUrl: 'Lien de paiement indisponible. Contactez la maison Tiraboschi.',
    redirecting: 'Redirection vers le paiement sécurisé…',
    cta: 'Continuer vers le paiement',
    inAppHelp: 'Pour des raisons de sécurité, ouvrez ce lien dans votre navigateur : appuyez sur ⋯ puis « Ouvrir dans le navigateur » (Safari / Chrome).',
  },
  en: {
    title: 'Tiraboschi — Secure payment',
    notFound: 'Link not found.',
    paidTitle: '✓ Payment already received',
    paidMsg: 'Thank you! This order is settled.',
    noUrl: 'Payment link unavailable. Please contact Tiraboschi.',
    redirecting: 'Redirecting to secure payment…',
    cta: 'Continue to payment',
    inAppHelp: 'For security reasons, open this link in your browser: tap ⋯ then “Open in browser” (Safari / Chrome).',
  },
};

/**
 * Page de redirection brandée vers le paiement Stripe (cible des liens envoyés au client).
 * - Navigateur normal : auto-redirection (meta refresh + JS) vers le Checkout Stripe.
 * - Navigateur in-app (WhatsApp/Instagram/Messenger…) : PAS d'auto-redirection (elle casse Stripe) ;
 *   on affiche un bouton + l'aide « ouvrir dans Safari/Chrome ».
 * Bilingue : EN pour le marché US, FR sinon (la langue suit le marché de la vente).
 * GET /pay/:id
 */
payRouter.get('/:id', async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
  const url = sale?.paymentUrl ?? null;
  const paid = sale?.status === 'PAID';
  const lang: Lang = sale?.market === 'US' || sale?.currency?.toUpperCase() === 'USD' ? 'en' : 'fr';
  const t = T[lang];
  const inApp = IN_APP_UA.test(req.header('user-agent') ?? '');

  const body = !sale
    ? `<p class="msg">${t.notFound}</p>`
    : paid
      ? `<p class="ok">${t.paidTitle}</p><p class="msg">${t.paidMsg}</p>`
      : !url
        ? `<p class="msg">${t.noUrl}</p>`
        : inApp
          ? `<a class="cta" href="${esc(url)}">${t.cta}</a>
             <p class="help">${t.inAppHelp}</p>`
          : `<div class="spin"></div>
             <p class="msg">${t.redirecting}</p>
             <a class="cta" href="${esc(url)}">${t.cta}</a>`;

  // Auto-redirection UNIQUEMENT hors navigateur in-app (sinon le Checkout Stripe se bloque).
  const redirect = !!(sale && url && !paid && !inApp);

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
${redirect ? `<meta http-equiv="refresh" content="1;url=${esc(url!)}"/>` : ''}
<title>${t.title}</title>
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
  .help{color:rgba(255,255,255,.45);font-size:12px;margin-top:18px;line-height:1.5}
</style></head>
<body><div class="card">
  <div class="logo">Tiraboschi</div><div class="since">SINCE 1904</div>
  <div class="rule"></div>
  ${body}
</div>
${redirect ? `<script>setTimeout(function(){location.replace(${JSON.stringify(url)})},900)</script>` : ''}
</body></html>`);
});
