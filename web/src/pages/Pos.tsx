import { useState } from 'react';
import { api } from '../lib/api';
import { useCurrency } from '../store';

interface Product {
  id: string;
  sku: string;
  name: string;
  priceHtEur?: string | null;
  priceHtUsd?: string | null;
}

interface CartLine {
  sku: string;
  name: string;
  unitHt: number; // prix HT unitaire dans la devise courante
  qty: number;
}

const TVA_EUR = 0.2; // TVA France 20%

export function Pos() {
  const { currency } = useCurrency(); // EUR (France/EU) | USD (US)
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [usTaxRate, setUsTaxRate] = useState('8'); // estimation, % (la taxe exacte sera calculée par Shopify à l'encaissement)
  const [ddp, setDdp] = useState(false);
  const [shipping, setShipping] = useState('100'); // frais de port DDP (param Admin à terme)
  const [err, setErr] = useState('');

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

  const add = (p: Product) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.sku === p.sku);
      if (i >= 0) {
        const copy = [...c];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...c, { sku: p.sku, name: p.name, unitHt: priceOf(p), qty: 1 }];
    });
    setQ('');
    setResults([]);
  };

  const removeLine = (sku: string) => setCart((c) => c.filter((l) => l.sku !== sku));

  const subtotal = cart.reduce((s, l) => s + l.unitHt * l.qty, 0);
  const ship = ddp ? parseFloat(shipping) || 0 : 0;
  const taxable = subtotal + ship;
  const tax =
    currency === 'EUR' ? subtotal * TVA_EUR : taxable * ((parseFloat(usTaxRate) || 0) / 100);
  const total = subtotal + ship + tax;

  const sym = currency === 'EUR' ? '€' : '$';
  const fmt = (n: number) => n.toFixed(2) + ' ' + sym;

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
          <input className="field" placeholder="Nom" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input className="field" placeholder="Email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
        </div>
      </div>

      {/* Produits */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Produit</div>
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
      </div>

      {/* Panier */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Panier</div>
        {cart.length === 0 && <p className="text-white/40 text-sm">Panier vide.</p>}
        {cart.map((l) => (
          <div key={l.sku} className="flex items-center justify-between py-1.5 border-b border-white/10 text-sm">
            <div className="flex-1">
              <div className="font-mono text-azure text-xs">{l.sku}</div>
              <div>{l.name}</div>
            </div>
            <div className="flex items-center gap-2">
              <span>×{l.qty}</span>
              <span className="w-20 text-right">{fmt(l.unitHt * l.qty)}</span>
              <button className="text-red-400/70" onClick={() => removeLine(l.sku)}>✕</button>
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
            <span className="flex items-center gap-1">
              Sales tax % (est.) <input className="field w-16 py-1" value={usTaxRate} onChange={(e) => setUsTaxRate(e.target.value)} />
            </span>
          </div>
        )}

        <div className="mt-3 text-sm space-y-1">
          <Row label="Sous-total HT" value={fmt(subtotal)} />
          {ddp && <Row label="Frais de port (DDP)" value={fmt(ship)} />}
          <Row label={currency === 'EUR' ? 'TVA 20%' : 'Sales tax (est.)'} value={fmt(tax)} />
          <div className="flex justify-between font-semibold text-azure pt-1 border-t border-white/10">
            <span>Total {currency === 'EUR' ? 'TTC' : 'taxes comprises'}</span>
            <span>{fmt(total)}</span>
          </div>
          {currency === 'USD' && (
            <p className="text-white/40 text-[11px]">
              Taxe estimée pour l'affichage. La taxe exacte par destination sera calculée par Shopify à l'encaissement.
            </p>
          )}
        </div>
      </div>

      {/* Paiement (3b) */}
      <div className="card">
        <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">Encaissement</div>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn opacity-50" disabled title="À brancher (3b)">TPE Stripe S710</button>
          <button className="btn opacity-50" disabled title="À brancher (3b)">Lien de paiement</button>
        </div>
        <p className="text-white/40 text-[11px] mt-2">
          Paiement à brancher (étape 3b) : SDK Stripe Terminal S710 + lien de paiement — nécessite la clé Stripe (write).
        </p>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}
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
