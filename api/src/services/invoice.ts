import PDFDocument from 'pdfkit';
import type { Sale } from '@prisma/client';
import type { SaleItem, SaleTaxLine, SaleCustomer } from './sales';
import { LEGAL } from '../legal';

export type DocType = 'QUOTE' | 'INVOICE';
type Lang = 'fr' | 'en';

const GOLD = '#C9A86A';
const INK = '#141312';
const MUTE = '#7A7873';

// Identité légale de la maison (mentions automatiques sur tous les devis/factures).
const SIREN = LEGAL.siren;
const VAT = LEGAL.vat;

const T: Record<Lang, Record<string, string>> = {
  fr: {
    quote: 'DEVIS', invoice: 'FACTURE D’ACOMPTE', no: 'N°', date: 'Date', order: 'Commande', currency: 'Devise',
    billedTo: 'FACTURÉ À', description: 'DÉSIGNATION', qty: 'QTÉ', unit: 'PRIX UNIT.', amount: 'MONTANT',
    subtotal: 'Sous-total', shipping: 'Livraison', complimentary: 'Offerte', tax: 'Taxes', total: 'Total (TTC)',
    terms: 'CONDITIONS DE PAIEMENT — 50 % / 50 %', deposit: 'ACOMPTE', balance: 'SOLDE',
    received: 'REÇU', due: 'À PAYER', onDelivery: 'À LA RÉCEPTION',
    depositNote: '50 % du total, par lien de paiement sécurisé.', balanceNote: 'Solde 50 %, à la réception, par lien de paiement sécurisé.',
    fullDue: 'MONTANT DÛ', fullPaid: 'PAYÉ', thanks: 'Merci de votre confiance.',
  },
  en: {
    quote: 'QUOTE', invoice: 'BALANCE INVOICE', no: 'No.', date: 'Date', order: 'Order', currency: 'Currency',
    billedTo: 'BILLED TO', description: 'DESCRIPTION', qty: 'QTY', unit: 'UNIT PRICE', amount: 'AMOUNT',
    subtotal: 'Subtotal', shipping: 'Shipping', complimentary: 'Complimentary', tax: 'Sales Tax', total: 'Total (incl. tax)',
    terms: 'PAYMENT TERMS — 50% / 50%', deposit: 'DEPOSIT', balance: 'BALANCE',
    received: 'RECEIVED', due: 'DUE', onDelivery: 'ON DELIVERY',
    depositNote: '50% of the total, via secure card payment link.', balanceNote: 'Remaining 50%, due on delivery, via secure card payment link.',
    fullDue: 'AMOUNT DUE', fullPaid: 'PAID', thanks: 'Thank you for your trust.',
  },
};

/** Génère le devis/facture PDF d'une vente (gabarit Tiraboschi, bilingue selon le marché). */
export function generateSaleDocument(sale: Sale, type: DocType): Promise<Buffer> {
  const lang: Lang = sale.market === 'US' || sale.currency.toUpperCase() === 'USD' ? 'en' : 'fr';
  const t = T[lang];
  const items = (sale.items as unknown as SaleItem[]) ?? [];
  const taxLines = (sale.taxLines as unknown as SaleTaxLine[]) ?? [];
  const cust = (sale.customer as unknown as SaleCustomer | null) ?? null;
  const sym = sale.currency.toUpperCase() === 'USD' ? '$' : '€';
  const money = (cents: number) => sym + (cents / 100).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isDeposit = sale.paymentPlan === 'DEPOSIT_50';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 48;
    const R = doc.page.width - 48;
    const W = R - L;

    // ─── En-tête : maison (gauche) + document (droite) ───
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text('TIRABOSCHI', L, 50, { characterSpacing: 3 });
    doc.fillColor(GOLD).font('Helvetica').fontSize(8).text('PARIS — SINCE 1904', L, 78, { characterSpacing: 2 });
    doc.fillColor(MUTE).fontSize(8).text('96 Avenue de Clichy · 75017 Paris · France', L, 94);
    doc.text('+33 7 69 08 30 08 · laurene.mauro@boschi-paris.com', L, 105);
    doc.text(`SIREN ${SIREN} · ${lang === 'fr' ? 'TVA' : 'VAT'} ${VAT}`, L, 116);

    const title = type === 'INVOICE' ? t.invoice : t.quote;
    doc.fillColor(INK).font('Helvetica').fontSize(16).text(title, L, 50, { width: W, align: 'right', characterSpacing: 1 });
    const metaTop = 80;
    const metaRow = (label: string, value: string, y: number) => {
      doc.fillColor(MUTE).font('Helvetica').fontSize(8).text(label, R - 220, y, { width: 120, align: 'right' });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(8).text(value, R - 95, y, { width: 95, align: 'right' });
    };
    metaRow(t.no, sale.reference, metaTop);
    metaRow(t.date, new Date(sale.createdAt).toISOString().slice(0, 10), metaTop + 13);
    metaRow(t.order, sale.shopifyOrderName ?? '—', metaTop + 26);
    metaRow(t.currency, sale.currency.toUpperCase(), metaTop + 39);

    doc.moveTo(L, 132).lineTo(R, 132).strokeColor(INK).lineWidth(1).stroke();

    // ─── Facturé à ───
    let y = 150;
    doc.fillColor(MUTE).font('Helvetica').fontSize(8).text(t.billedTo, L, y, { characterSpacing: 1 });
    y += 14;
    const name = sale.customerName || [cust?.firstName, cust?.lastName].filter(Boolean).join(' ') || '—';
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(name, L, y);
    y += 15;
    doc.font('Helvetica').fontSize(9).fillColor(MUTE);
    if (sale.customerEmail || cust?.email) { doc.text(sale.customerEmail ?? cust?.email ?? '', L, y); y += 12; }
    const addr = [cust?.address1, [cust?.city, cust?.province, cust?.zip].filter(Boolean).join(', ')].filter((x): x is string => !!x);
    for (const line of addr) { doc.text(line, L, y); y += 12; }
    if (cust?.country) { doc.text(cust.country, L, y); y += 12; }

    // ─── Tableau des lignes ───
    y += 16;
    const cQty = R - 200, cUnit = R - 140, cAmt = R;
    doc.fillColor(MUTE).font('Helvetica').fontSize(8);
    doc.text(t.description, L, y);
    doc.text(t.qty, cQty - 30, y, { width: 30, align: 'right' });
    doc.text(t.unit, cUnit - 70, y, { width: 70, align: 'right' });
    doc.text(t.amount, cAmt - 80, y, { width: 80, align: 'right' });
    y += 12;
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#DDD').lineWidth(0.5).stroke();
    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    for (const it of items) {
      doc.fillColor(INK).text(it.title, L, y, { width: cQty - 40 - L });
      doc.text(String(it.qty), cQty - 30, y, { width: 30, align: 'right' });
      doc.text(money(it.priceCents), cUnit - 70, y, { width: 70, align: 'right' });
      doc.text(money(it.priceCents * it.qty), cAmt - 80, y, { width: 80, align: 'right' });
      y += Math.max(16, doc.heightOfString(it.title, { width: cQty - 40 - L }) + 4);
    }

    // ─── Totaux ───
    const tLabelX = cAmt - 340, tLabelW = 220, tValX = cAmt - 120, tValW = 120;
    y += 6;
    doc.moveTo(tLabelX, y).lineTo(R, y).strokeColor('#DDD').lineWidth(0.5).stroke();
    y += 10;
    const totRow = (label: string, value: string, opts: { bold?: boolean; sub?: boolean } = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.sub ? 8 : 9).fillColor(opts.sub ? MUTE : INK);
      const h = Math.max(opts.sub ? 11 : 13, doc.heightOfString(label, { width: tLabelW }));
      doc.text(label, tLabelX, y, { width: tLabelW, align: 'left' });
      doc.text(value, tValX, y, { width: tValW, align: 'right' });
      y += h + 3;
    };
    totRow(t.subtotal, money(sale.subtotalCents));
    totRow(t.shipping, sale.shippingCents > 0 ? money(sale.shippingCents) : `${t.complimentary} — ${money(0)}`);
    totRow(t.tax, money(sale.taxCents));
    for (const tl of taxLines) totRow('   ' + tl.title + (tl.rate ? ` (${(tl.rate * 100).toFixed(3)}%)` : ''), money(tl.amountCents), { sub: true });
    y += 2;
    doc.moveTo(tLabelX, y).lineTo(R, y).strokeColor(INK).lineWidth(1).stroke();
    y += 8;
    totRow(t.total, money(sale.totalCents), { bold: true });

    // ─── Conditions de paiement ───
    y += 24;
    if (isDeposit) {
      doc.fillColor(INK).rect(L, y, W, 22).fill(INK);
      doc.fillColor('#FFF').font('Helvetica-Bold').fontSize(9).text(t.terms, L + 10, y + 7, { characterSpacing: 1 });
      y += 34;
      const colW = (W - 16) / 2;
      const box = (x: number, label: string, state: string, amount: string, note: string) => {
        doc.fillColor(MUTE).font('Helvetica').fontSize(8).text(`${label} — ${state}`, x, y, { width: colW });
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(amount, x, y + 13, { width: colW });
        doc.fillColor(MUTE).font('Helvetica').fontSize(8).text(note, x, y + 33, { width: colW });
      };
      const depState = type === 'INVOICE' && sale.depositPaidAt ? t.received : t.due;
      const balState = sale.balancePaidAt ? t.received : t.onDelivery;
      box(L, t.deposit, depState, money(sale.depositCents), t.depositNote);
      box(L + colW + 16, t.balance, balState, money(sale.balanceCents), t.balanceNote);
      y += 60;
    } else {
      const paid = sale.status === 'PAID';
      doc.fillColor(MUTE).font('Helvetica').fontSize(8).text(paid ? t.fullPaid : t.fullDue, L, y);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(money(sale.totalCents), L, y + 12);
      y += 44;
    }

    // ─── Pied de page (mentions légales) ───
    doc.fillColor(MUTE).font('Helvetica').fontSize(7.5).text(
      `SIREN ${SIREN} · ${lang === 'fr' ? 'TVA intracommunautaire' : 'EU VAT'} ${VAT}`,
      L, doc.page.height - 74, { width: W, align: 'center' },
    );
    doc.fontSize(8).text(
      `TIRABOSCHI — 96 Avenue de Clichy · 75017 Paris · France · ${t.thanks}`,
      L, doc.page.height - 60, { width: W, align: 'center' },
    );

    doc.end();
  });
}
