import { useEffect, useState } from 'react';
import { useNav } from '../nav';
import { useToast } from '../toast';
import { api } from '../lib/api';
import { useCurrency } from '../store';
import { chargeOnReader } from '../lib/terminal';

interface Product {
  id: string;
  sku: string;
  name: string;
  priceHtEur?: string | null;
  priceHtUsd?: string | null;
}

interface CartLine {
  uid: string; // clé interne (produit catalogue: id ; hors catalogue: hc-…)
  id?: string; // id produit (catalogue uniquement → disponibilité)
  sku: string;
  name: string;
  unitHt: number; // prix HT unitaire dans la devise courante
  qty: number;
}

interface CartAvailLine {
  sku: string;
  path: 'stock' | 'production' | 'blocked';
  inStock: number;
  readyDate: string | null;
  note?: string;
}

interface SavedSale {
  id: string;
  reference: string;
  market: 'FR' | 'US';
}

const TVA_EUR = 0.2; // TVA France 20%

export function Pos() {
  const { currency } = useCurrency(); // EUR (France/EU) | USD (US)
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const emptyCustomer = {
    firstName: '',
    lastName: '',
    email: '',
    phoneExt: currency === 'USD' ? '+1' : '+33',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    zip: '',
    province: '',
    country: currency === 'USD' ? 'US' : 'FR',
    acceptsEmail: true,
    acceptsSms: true,
    note: '',
  };
  const [customer, setCustomer] = useState(emptyCustomer);
  const setC = (patch: Partial<typeof emptyCustomer>) => {
    setCustomer((c) => ({ ...c, ...patch }));
    setTaxQuote(null); // l'adresse change → la taxe calculée n'est plus valable
  };
  const [usTaxRate, setUsTaxRate] = useState('8'); // estimation, % (la taxe exacte sera calculée par Shopify à l'encaissement)
  const [ddp, setDdp] = useState(false);
  const [shipping, setShipping] = useState('100'); // frais de port DDP (param Admin à terme)
  const toast = useToast();
  const setErr = (m: string) => { if (m) toast(m, 'error'); }; // erreurs → toast
  const [busy, setBusy] = useState<'' | 'save' | 'link' | 'tpe'>('');
  const [saved, setSaved] = useState<SavedSale | null>(null);
  const [payLink, setPayLink] = useState('');
  const [tpeStatus, setTpeStatus] = useState('');

  const [cartAvail, setCartAvail] = useState<{ readyDate: string | null; lines: CartAvailLine[] } | null>(null);
  const [taxQuote, setTaxQuote] = useState<{ totalTaxCents: number; currency: string; lines: { title: string; rate: number; amountCents: number }[] } | null>(null);
  const [taxBusy, setTaxBusy] = useState(false);

  const { posCustomer, setPosCustomer } = useNav();
  useEffect(() => {
    // Frais de port DDP par défaut depuis le paramètre Admin.
    api<{ value: string | null }>('/api/settings/globalShippingUsd')
      .then((s) => { if (s.value) setShipping(s.value); })
      .catch(() => {});
    // Client transmis depuis le CRM (« Choisir »).
    if (posCustomer) {
      setCustomer((c) => ({ ...c, ...Object.fromEntries(Object.entries(posCustomer).filter(([, v]) => v != null)) }));
      setPosCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cat = cart.filter((l) => l.id);
    if (cat.length === 0) return setCartAvail(null);
    api<{ readyDate: string | null; lines: CartAvailLine[] }>('/api/catalog/availability', {
      method: 'POST',
      body: { items: cat.map((l) => ({ id: l.id, qty: l.qty })) },
    })
      .then(setCartAvail)
      .catch(() => setCartAvail(null));
  }, [cart]);

  const search = async (query: string) => {
    setQ(query);
    if (query.length < 1) return setResults([]);
    try {
      setResults(await api<Product[]>('/api/products?q=' + encodeURIComponent(query)));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const priceOf = (p: Product) =>
    parseFloat((currency === 'EUR' ? p.priceHtEur : p.priceHtUsd) ?? '0') || 0;

  const dirty = () => {
    // Le panier change → la vente précédemment enregistrée n'est plus à jour.
    setSaved(null);
    setPayLink('');
    setTpeStatus('');
    setTaxQuote(null);
  };

  async function computeTax() {
    if (cart.length === 0) return setErr('Panier vide.');
    if (!customer.country) return setErr('Pays du client requis pour le calcul des taxes.');
    setTaxBusy(true);
    setErr('');
    try {
      const q = await api<{ totalTaxCents: number; currency: string; lines: { title: string; rate: number; amountCents: number }[] }>(
        '/api/pos/sales/tax-quote',
        {
          method: 'POST',
          body: {
            currency,
            items: cart.map((l) => ({ title: l.name, priceCents: Math.round(l.unitHt * 100), qty: l.qty })),
            address: {
              countryCode: customer.country,
              provinceCode: customer.province || undefined,
              zip: customer.zip || undefined,
              city: customer.city || undefined,
              address1: customer.address1 || undefined,
            },
          },
        },
      );
      setTaxQuote(q);
      if (q.lines.length === 0) setErr('Shopify n’a renvoyé aucune taxe pour cette adresse (vérifier la config taxe Shopify).');
    } catch (e) {
      setErr((e as Error).message);
      setTaxQuote(null);
    } finally {
      setTaxBusy(false);
    }
  }

  const add = (p: Product) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.uid === p.id);
      if (i >= 0) {
        const copy = [...c];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...c, { uid: p.id, id: p.id, sku: p.sku, name: p.name, unitHt: priceOf(p), qty: 1 }];
    });
    setQ('');
    setResults([]);
    dirty();
  };

  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const addCustom = () => {
    const price = parseFloat(customPrice) || 0;
    if (!customName.trim() || price <= 0) return setErr('Nom et prix de la pièce hors catalogue requis.');
    setErr('');
    setCart((c) => [...c, { uid: 'hc-' + Date.now(), sku: '', name: customName.trim(), unitHt: price, qty: 1 }]);
    setCustomName('');
    setCustomPrice('');
    setShowCustom(false);
    dirty();
  };

  const removeLine = (uid: string) => {
    setCart((c) => c.filter((l) => l.uid !== uid));
    dirty();
  };

  const subtotal = cart.reduce((s, l) => s + l.unitHt * l.qty, 0);
  const ship = ddp ? parseFloat(shipping) || 0 : 0;
  const taxable = subtotal + ship;
  const estTax = currency === 'EUR' ? subtotal * TVA_EUR : taxable * ((parseFloat(usTaxRate) || 0) / 100);
  // Taxe réelle Shopify si calculée, sinon estimation.
  const tax = taxQuote ? taxQuote.totalTaxCents / 100 : estTax;
  const total = subtotal + ship + tax;

  const sym = currency === 'EUR' ? '€' : '$';
  const fmt = (n: number) => n.toFixed(2) + ' ' + sym;
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
  const availLabel = (a: CartAvailLine) => {
    if (a.path === 'stock') return `En stock (${a.inStock}) · livrable ~${fmtDate(a.readyDate)}`;
    if (a.path === 'production') return `Sur commande · livrable ~${fmtDate(a.readyDate)}`;
    return `⚠ ${a.note ?? 'indisponible'}`;
  };

  /** Validation minimale : email (reçu) ; adresse complète si expédition DDP. */
  function validate(): string | null {
    if (!customer.email.trim()) return 'Email client requis (pour le reçu).';
    if (ddp && (!customer.address1.trim() || !customer.city.trim() || !customer.zip.trim()))
      return 'Adresse, ville et code postal requis pour une expédition DDP.';
    return null;
  }

  /** Crée la vente côté serveur (une seule fois) et la mémorise pour l'encaissement. */
  async function ensureSale(): Promise<SavedSale> {
    if (saved) return saved;
    const items = cart.map((l) => ({
      title: l.name,
      sku: l.sku || undefined,
      priceCents: Math.round(l.unitHt * 100),
      qty: l.qty,
    }));
    const taxLines = taxQuote
      ? taxQuote.lines.map((t) => ({ title: t.title, rate: t.rate, amountCents: t.amountCents }))
      : [
          {
            title: currency === 'EUR' ? 'TVA 20%' : 'Sales tax (est.)',
            rate: currency === 'EUR' ? 0.2 : (parseFloat(usTaxRate) || 0) / 100,
            amountCents: Math.round(tax * 100),
          },
        ];
    const market: 'FR' | 'US' = currency === 'EUR' ? 'FR' : 'US';
    const sale = await api<{ id: string; reference: string }>('/api/pos/sales', {
      method: 'POST',
      body: {
        market,
        currency,
        customer,
        items,
        taxLines,
        shippingCents: ddp ? Math.round(ship * 100) : 0,
      },
    });
    const s: SavedSale = { id: sale.id, reference: sale.reference, market };
    setSaved(s);
    return s;
  }

  async function onSave() {
    if (cart.length === 0) return setErr('Panier vide.');
    const v = validate();
    if (v) return setErr(v);
    setErr('');
    setBusy('save');
    try {
      const s = await ensureSale();
      toast(`Vente enregistrée (${s.reference}).`, 'success');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function onPaymentLink() {
    if (cart.length === 0) return setErr('Panier vide.');
    const v = validate();
    if (v) return setErr(v);
    setErr('');
    setBusy('link');
    try {
      const s = await ensureSale();
      const res = await api<{ url: string }>(`/api/pos/sales/${s.id}/payment-link`, {
        method: 'POST',
        body: {},
      });
      setPayLink(res.url);
      toast('Lien de paiement généré.', 'success');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function onTpe() {
    if (cart.length === 0) return setErr('Panier vide.');
    const v = validate();
    if (v) return setErr(v);
    setErr('');
    setBusy('tpe');
    setTpeStatus('Initialisation…');
    try {
      const s = await ensureSale();
      await chargeOnReader(s.id, s.market, setTpeStatus);
      setTpeStatus('Paiement accepté ✓ — commande Shopify en cours de création.');
      toast('Paiement TPE accepté ✓', 'success');
    } catch (e) {
      setTpeStatus('');
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function newSale() {
    setCart([]);
    setCustomer(emptyCustomer);
    setDdp(false);
    setSaved(null);
    setPayLink('');
    setTpeStatus('');
    setErr('');
  }

  function shareWhatsapp() {
    if (!payLink) return;
    window.open(
      'https://wa.me/?text=' + encodeURIComponent('Votre lien de paiement Tiraboschi : ' + payLink),
      '_blank',
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-base">Caisse (POS)</h2>
          <span className="text-xs px-2 py-1 rounded border border-white/20">
            Marché : {currency === 'EUR' ? 'France / EU (TVA 20%)' : 'US (Sales tax)'}
          </span>
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Client</div>
        <div className="grid grid-cols-2 gap-3">
          <input className="field" placeholder="Prénom" value={customer.firstName} onChange={(e) => setC({ firstName: e.target.value })} />
          <input className="field" placeholder="Nom" value={customer.lastName} onChange={(e) => setC({ lastName: e.target.value })} />
          <input className="field col-span-2" type="email" placeholder="Email (obligatoire pour le reçu)" value={customer.email} onChange={(e) => setC({ email: e.target.value })} />
          <div className="flex gap-2 col-span-2">
            <select className="field w-24" value={customer.phoneExt} onChange={(e) => setC({ phoneExt: e.target.value })}>
              <option value="+33">🇫🇷 +33</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+39">🇮🇹 +39</option>
            </select>
            <input className="field flex-1" type="tel" placeholder="Téléphone" value={customer.phone} onChange={(e) => setC({ phone: e.target.value })} />
          </div>
          <input className="field col-span-2" placeholder="Adresse (ligne 1)" value={customer.address1} onChange={(e) => setC({ address1: e.target.value })} />
          <input className="field col-span-2" placeholder="Appartement, suite… (optionnel)" value={customer.address2} onChange={(e) => setC({ address2: e.target.value })} />
          <input className="field" placeholder="Ville" value={customer.city} onChange={(e) => setC({ city: e.target.value })} />
          <input className="field" placeholder="Code postal" value={customer.zip} onChange={(e) => setC({ zip: e.target.value })} />
          <input className="field" placeholder="État / Province" value={customer.province} onChange={(e) => setC({ province: e.target.value })} />
          <select className="field" value={customer.country} onChange={(e) => setC({ country: e.target.value })}>
            <option value="US">États-Unis</option>
            <option value="FR">France</option>
            <option value="GB">Royaume-Uni</option>
            <option value="IT">Italie</option>
          </select>
          <textarea className="field col-span-2" rows={2} placeholder="Notes sur le client (goûts…)" value={customer.note} onChange={(e) => setC({ note: e.target.value })} />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-white/70">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={customer.acceptsEmail} onChange={(e) => setC({ acceptsEmail: e.target.checked })} /> Marketing email
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={customer.acceptsSms} onChange={(e) => setC({ acceptsSms: e.target.checked })} /> Marketing SMS
          </label>
        </div>
      </div>

      {/* Produits */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-editorial text-white/50">Produit</div>
          <button className="text-azure text-xs" onClick={() => setShowCustom(!showCustom)}>+ Pièce hors catalogue</button>
        </div>
        <input className="field" placeholder="Rechercher une référence (SKU ou nom)…" value={q} onChange={(e) => search(e.target.value)} />
        {results.length > 0 && (
          <div className="mt-2 border border-white/10 rounded divide-y divide-white/10">
            {results.map((p) => (
              <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-white/5 flex justify-between" onClick={() => add(p)}>
                <span><span className="font-mono text-azure">{p.sku}</span> — {p.name}</span>
                <span>{fmt(priceOf(p))}</span>
              </button>
            ))}
          </div>
        )}
        {showCustom && (
          <div className="mt-2 border border-white/10 rounded p-3 flex gap-2 items-end">
            <input className="field flex-1" placeholder="Désignation (ex. Sur-mesure)" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <input className="field w-28" type="number" step="0.01" placeholder={'Prix HT ' + sym} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
            <button className="btn" onClick={addCustom}>Ajouter</button>
          </div>
        )}
      </div>

      {/* Panier */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Panier</div>
        {cart.length === 0 && <p className="text-white/40 text-sm">Panier vide.</p>}
        {cart.map((l) => (
          <div key={l.uid} className="flex items-center justify-between py-1.5 border-b border-white/10 text-sm">
            <div className="flex-1">
              <div className="font-mono text-azure text-xs">{l.sku || 'HORS CATALOGUE'}</div>
              <div>{l.name}</div>
              {(() => {
                const a = l.sku ? cartAvail?.lines.find((x) => x.sku === l.sku) : null;
                return a ? (
                  <div className={'text-[11px] ' + (a.path === 'blocked' ? 'text-red-400' : 'text-white/40')}>{availLabel(a)}</div>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <span>×{l.qty}</span>
              <span className="w-20 text-right">{fmt(l.unitHt * l.qty)}</span>
              <button className="text-red-400/70" onClick={() => removeLine(l.uid)}>✕</button>
            </div>
          </div>
        ))}

        {currency === 'USD' && (
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ddp} onChange={(e) => setDdp(e.target.checked)} /> Expédié DDP
            </label>
            {ddp && (
              <span className="flex items-center gap-1">
                Port <input className="field w-20 py-1" value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </span>
            )}
            {!taxQuote && (
              <span className="flex items-center gap-1">
                Sales tax % (est.) <input className="field w-16 py-1" value={usTaxRate} onChange={(e) => setUsTaxRate(e.target.value)} />
              </span>
            )}
            <button className="px-2 py-1 rounded border border-azure text-azure" onClick={computeTax} disabled={taxBusy}>
              {taxBusy ? 'Calcul…' : 'Calculer la taxe (Shopify)'}
            </button>
          </div>
        )}

        <div className="mt-3 text-sm space-y-1">
          <Row label="Sous-total HT" value={fmt(subtotal)} />
          {ddp && <Row label="Frais de port (DDP)" value={fmt(ship)} />}
          {taxQuote
            ? taxQuote.lines.map((t, i) => (
                <Row key={i} label={`${t.title}${t.rate ? ' (' + (t.rate * 100).toFixed(2) + '%)' : ''}`} value={fmt(t.amountCents / 100)} />
              ))
            : <Row label={currency === 'EUR' ? 'TVA 20%' : 'Sales tax (est.)'} value={fmt(tax)} />}
          <div className="flex justify-between font-semibold text-azure pt-1 border-t border-white/10">
            <span>Total {currency === 'EUR' ? 'TTC' : 'taxes comprises'}</span>
            <span>{fmt(total)}</span>
          </div>
          {cartAvail && cart.length > 0 && (
            <div className="flex justify-between text-xs pt-1">
              <span className="text-white/50">Livraison estimée au client</span>
              <span className={cartAvail.readyDate ? 'text-white/80' : 'text-red-400'}>
                {cartAvail.readyDate ? '~' + fmtDate(cartAvail.readyDate) : 'à confirmer (voir lignes)'}
              </span>
            </div>
          )}
          {currency === 'USD' && !taxQuote && (
            <p className="text-white/40 text-[11px]">
              Taxe estimée. Clique « Calculer la taxe (Shopify) » après avoir saisi l'adresse pour le détail exact par juridiction.
            </p>
          )}
          {taxQuote && <p className="text-green-400/70 text-[11px]">Taxe réelle calculée par Shopify pour l'adresse saisie.</p>}
        </div>
      </div>

      {/* Encaissement */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Encaissement</div>
        <button className="btn w-full" onClick={onSave} disabled={busy !== '' || cart.length === 0}>
          {busy === 'save' ? 'Enregistrement…' : saved ? `Commande enregistrée (${saved.reference})` : 'Enregistrer la commande'}
        </button>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <button className="btn" onClick={onTpe} disabled={busy !== '' || cart.length === 0}>
            {busy === 'tpe' ? 'TPE…' : 'TPE Stripe S710'}
          </button>
          <button className="btn" onClick={onPaymentLink} disabled={busy !== '' || cart.length === 0}>
            {busy === 'link' ? 'Génération…' : 'Lien de paiement'}
          </button>
        </div>

        {tpeStatus && <p className="text-azure text-sm mt-3">{tpeStatus}</p>}

        {payLink && (
          <div className="mt-3 space-y-2">
            <div className="text-xs uppercase tracking-editorial text-white/50">Lien de paiement</div>
            <input className="field text-xs" readOnly value={payLink} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => navigator.clipboard?.writeText(payLink)}>📋 Copier</button>
              <button className="btn flex-1" onClick={shareWhatsapp}>💬 WhatsApp</button>
            </div>
            <p className="text-white/40 text-[11px]">
              Dès que le client paie, la commande Shopify est créée automatiquement (suivi dans <b>Ventes</b>).
            </p>
          </div>
        )}

        {saved && (
          <button className="text-azure text-sm mt-3" onClick={newSale}>+ Nouvelle vente</button>
        )}

        <p className="text-white/40 text-[11px] mt-2">
          La commande est enregistrée (durable) avant tout encaissement. Paiement Stripe (lien ou TPE
          S710) → commande Shopify créée automatiquement, avec retries — impossible à perdre.
        </p>
      </div>

    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-white/80">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
