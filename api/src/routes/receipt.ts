import { Router } from 'express';
import { prisma } from '../db/prisma';

export const receiptRouter = Router();

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

interface Item { title: string; sku?: string; priceCents: number; qty: number }
interface TaxLine { title: string; rate?: number; amountCents: number }
interface Cust { firstName?: string; lastName?: string; email?: string; phone?: string; address1?: string; address2?: string; city?: string; zip?: string; province?: string; country?: string }

/**
 * Reçu / facture imprimable (public par id cuid, comme le passeport).
 * GET /receipt/:id — page HTML claire, prête pour « Imprimer → PDF ».
 */
receiptRouter.get('/:id', async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
  if (!sale) {
    res.status(404).set('Content-Type', 'text/html').send('<p>Reçu introuvable.</p>');
    return;
  }
  const sym = sale.currency === 'EUR' ? '€' : sale.currency === 'USD' ? '$' : sale.currency;
  const m = (c: number) => (c / 100).toFixed(2) + ' ' + sym;
  const items = (sale.items as unknown as Item[]) ?? [];
  const taxLines = (sale.taxLines as unknown as TaxLine[]) ?? [];
  const cust = (sale.customer as unknown as Cust | null) ?? null;
  const custName = [cust?.firstName, cust?.lastName].filter(Boolean).join(' ') || sale.customerName || '';
  const addr = cust
    ? [cust.address1, cust.address2, [cust.zip, cust.city].filter(Boolean).join(' '), cust.province, cust.country].filter(Boolean)
    : [];
  const STATUS: Record<string, string> = { PAID: 'Payé', PENDING: 'En attente', REFUNDED: 'Remboursé', CANCELLED: 'Annulé' };

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Reçu ${esc(sale.reference)} — Tiraboschi</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@500&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f4f2ee;color:#1a1a1a;font-family:Inter,system-ui,sans-serif;padding:24px}
  .sheet{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e2da;border-radius:6px;padding:32px}
  .logo{font-family:'Playfair Display',Georgia,serif;font-size:2rem;text-align:center}
  .since{text-align:center;color:#9a7b3f;font-size:11px;letter-spacing:.15em;margin-top:2px}
  .rule{height:1px;background:#9a7b3f;width:64px;margin:14px auto 20px}
  h1{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#666;margin:0 0 4px}
  .row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
  .meta{font-size:12px;color:#555;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
  th{text-align:left;color:#888;font-weight:500;border-bottom:1px solid #eee;padding:6px 0;font-size:11px;text-transform:uppercase}
  td{padding:6px 0;border-bottom:1px solid #f0f0f0;vertical-align:top}
  td.r,th.r{text-align:right}
  .tot{display:flex;justify-content:space-between;font-weight:600;font-size:15px;border-top:2px solid #1a1a1a;padding-top:8px;margin-top:6px}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#eee;font-size:11px}
  .foot{margin-top:24px;text-align:center;color:#999;font-size:11px}
  .print{display:block;margin:18px auto 0;padding:10px 18px;border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;border-radius:4px;cursor:pointer;font-size:13px}
  @media print{ body{background:#fff;padding:0} .sheet{border:none} .print{display:none} }
</style></head>
<body><div class="sheet">
  <div class="logo">Tiraboschi</div><div class="since">SINCE 1904</div>
  <div class="rule"></div>
  <div class="row"><div><h1>Reçu</h1><div>${esc(sale.reference)}</div></div>
    <div style="text-align:right"><h1>Date</h1><div>${new Date(sale.createdAt).toLocaleDateString('fr-FR')}</div></div></div>
  <div class="meta">
    ${custName ? esc(custName) + '<br/>' : ''}
    ${cust?.email ? esc(cust.email) + '<br/>' : ''}
    ${addr.map((a) => esc(a as string)).join('<br/>')}
  </div>
  <table>
    <thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead>
    <tbody>
      ${items
        .map(
          (i) =>
            `<tr><td>${esc(i.title)}${i.sku ? `<br/><span style="color:#999;font-size:11px">${esc(i.sku)}</span>` : ''}</td><td class="r">${i.qty}</td><td class="r">${m(i.priceCents * i.qty)}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <div class="row"><span>Sous-total HT</span><span>${m(sale.subtotalCents)}</span></div>
  ${taxLines.map((tx) => `<div class="row"><span>${esc(tx.title)}</span><span>${m(tx.amountCents)}</span></div>`).join('')}
  ${sale.shippingCents ? `<div class="row"><span>Frais de port</span><span>${m(sale.shippingCents)}</span></div>` : ''}
  <div class="tot"><span>Total ${sale.currency === 'EUR' ? 'TTC' : 'taxes comprises'}</span><span>${m(sale.totalCents)}</span></div>
  <div style="margin-top:12px"><span class="badge">${STATUS[sale.status] ?? sale.status}</span>
    ${sale.shopifyOrderName ? ` · Commande ${esc(sale.shopifyOrderName)}` : ''}</div>
  <div class="foot">Merci de votre confiance.<br/>Tiraboschi — Maison de maroquinerie depuis 1904</div>
  <button class="print" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
</div></body></html>`);
});
