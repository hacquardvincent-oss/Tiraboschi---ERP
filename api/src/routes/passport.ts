import { Router } from 'express';
import { prisma } from '../db/prisma';

export const passportRouter = Router();

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Passeport produit public (cible d'un QR code) : authenticité + traçabilité d'une pièce.
 * GET /passport/:serial — page HTML brandée, sans authentification.
 */
passportRouter.get('/:serial', async (req, res) => {
  const serialCode = req.params.serial;
  const serial = await prisma.serial.findUnique({ where: { serial: serialCode } });
  const product = serial
    ? await prisma.product.findFirst({ where: { sku: serial.variantSku } })
    : null;

  const found = !!serial;
  const rows: [string, string][] = [];
  if (product) {
    rows.push(['Modèle', product.name]);
    if (product.colorCode) rows.push(['Coloris', product.colorCode]);
    if (product.materialCode) rows.push(['Matière', product.materialCode]);
  }
  if (serial) {
    rows.push(['N° de série', serial.serial]);
    rows.push(['SKU', serial.variantSku]);
    rows.push(['Mise en stock', new Date(serial.createdAt).toLocaleDateString('fr-FR')]);
  }

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tiraboschi — Passeport produit</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@500&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;background:#0C0B0A;color:#fff;font-family:Inter,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;width:100%;background:rgba(22,20,18,.96);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:28px;text-align:center}
  .logo{font-family:'Playfair Display',Georgia,serif;font-size:2rem;color:#F4F1EA;letter-spacing:.02em}
  .since{color:#C9A86A;font-size:11px;letter-spacing:.15em;margin-top:2px}
  .rule{height:1px;width:64px;background:#C9A86A;margin:16px auto}
  .badge{display:inline-block;margin:8px 0 4px;padding:4px 10px;border-radius:4px;font-size:12px}
  .ok{background:rgba(201,168,106,.15);color:#C9A86A}
  .ko{background:rgba(248,113,113,.15);color:#fca5a5}
  table{width:100%;margin-top:14px;font-size:14px;border-collapse:collapse}
  td{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
  td.k{color:rgba(255,255,255,.45);width:42%}
  .note{color:rgba(255,255,255,.4);font-size:11px;margin-top:16px}
</style></head>
<body><div class="card">
  <div class="logo">Tiraboschi</div><div class="since">SINCE 1904</div>
  <div class="rule"></div>
  ${found
    ? `<div class="badge ok">✓ Pièce authentique</div>
       <table>${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
       <p class="note">Ce passeport atteste de l'authenticité de votre pièce, fabriquée par la maison Tiraboschi.</p>`
    : `<div class="badge ko">N° de série inconnu</div>
       <p class="note">Aucune pièce ne correspond à ce numéro (${esc(serialCode)}). En cas de doute, contactez la maison.</p>`}
</div></body></html>`);
});
