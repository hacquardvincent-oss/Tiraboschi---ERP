# LEGACY V1 — Extraits de référence pour la V2

> Snapshot figé du code **V1 en production** (`tpe-stripe710`), commit `683baba`.
> Copie verbatim : `legacy-v1/server.js`, `legacy-v1/public/*`, `legacy-v1/SPECIFICATIONS_FONCTIONNELLES.md`.
> **Ce dossier est une référence en lecture seule** : ne pas l'exécuter, ne pas le déployer.
> Il sert à extraire les logiques exactes pour la reconstruction V2.

⚠️ **À lire en premier — divergence specs ↔ code.**
Le fichier `SPECIFICATIONS_FONCTIONNELLES.md` décrit une logique de taxes (TVA 20%, Sales Tax 8%,
duties 9%, frais de port 30€/100$). **Le code en prod a divergé** : ces constantes n'existent plus
telles quelles. La V1 réelle calcule les taxes US **dynamiquement via Shopify Draft Orders**, les
duties sont « Incluses » dans le prix, et le port est **une seule valeur de config** (défaut `100`).
**C'est le code (ci-dessous) qui fait foi, pas les specs.**

---

## 1. Formules de taxes / prix (la VRAIE logique V1)

La V1 répartit le calcul en **3 endroits** :

### 1a. Pré-calcul du prix dans le wizard POS — `legacy-v1/public/app.js` (~l. 905-915)
Au choix du mode d'achat, deux cartes sont générées :

```js
// shopifyPrice = v.price (ERP) avec fallback v['plm-price-usd-ht'] puis prix Shopify
let priceSurPlace = shopifyPrice;                 // Sur Place : prix nu, sales tax calculée ensuite dans le panier
let priceExpedie  = shopifyPrice +
    (window.erpConfig?.shippingCost !== undefined ? parseFloat(window.erpConfig.shippingCost) : 100);
// Expédié (Shipped DDP) = prix + frais de port (config, défaut 100). Duties = "Incluses".
```
- **Sur Place (Take away)** : `prix = shopifyPrice`. La sales tax US est calculée **après**, dans le
  panier, via l'appel à `/api/shopify/calculate_taxes`.
- **Expédié (Shipped DDP)** : `prix = shopifyPrice + shippingCost` (config `erpConfig.shippingCost`,
  défaut **100**). Le SKU reçoit le suffixe **`-DDP`** (`id: v.sku + '-DDP'`).
- Les montants partent en **centimes** vers le panier : `price: Math.round(price * 100)`.
- **Duties** : plus de calcul 9% — l'UI affiche `cart-duties = "Incluses"` (app.js l. 1099 / 2650 / 2696).
- ⚠️ Il existe un **bloc `catch` de fallback dupliqué** (Shopify injoignable) qui recopie ~60 lignes :
  dans ce cas `priceExpedie = shopifyPrice` (sans frais de port). À factoriser en V2.

### 1b. TVA 20% — uniquement à l'affichage PLM — `legacy-v1/public/app.js` (l. 1552)
```js
// Conversion HT → TTC pour l'affichage des prix dans la fiche technique (PLM), pas dans le POS :
document.getElementById('plm-price-eur-ttc').value = (parseFloat(v['plm-price-eur']) * 1.20).toFixed(2);
```
> La TVA 20% n'est donc PAS appliquée dans le panier POS — seulement comme aide à la saisie côté PLM.

### 1c. Calcul des taxes US réel — `legacy-v1/server.js` `POST /api/shopify/calculate_taxes` (l. 752-927)
Logique : créer un **Draft Order Shopify** temporaire pour laisser Shopify calculer la taxe exacte
par destination, lire `tax_lines`, puis **supprimer** le draft. Points clés :

- **Map ZIP → State US** : fonction `zipToState(zipCode)` (l. 757-816) — table complète des 50 états
  + DC par plages de codes postaux (ex. `90000-96199 → CA`, `10000-14999 → NY`). À réutiliser tel quel.
- `requires_shipping: true` + une `shipping_line` (même à `0.00`) sont **forcés** pour obliger Shopify
  à appliquer la taxe **destination-based** (l. 828, 853-857).
- `taxes_included: false`, `currency` = devise POS.
- **Bypass Shopify Markets** (conversion auto de devise) — l. 880-885 :
  ```js
  const expectedSubtotal = items.reduce((s, i) => s + (i.price / 100), 0);
  const shopifySubtotal  = parseFloat(draftOrder.subtotal_price) || expectedSubtotal;
  const conversionRate   = (shopifySubtotal > 0 && expectedSubtotal > 0)
                           ? (shopifySubtotal / expectedSubtotal) : 1;
  // chaque tax_line.price est redivisé par conversionRate pour revenir au montant POS attendu
  ```
- Le draft order temporaire est **supprimé en async** juste après lecture (l. 873-877).
- Réponse : `{ subtotal, total_tax, tax_lines, total_price, shipping, estimated_duties: 0 }`.
- ⚠️ `shippingTotal = 0.00` en dur dans cette route (l. 824) : le port est déjà inclus dans le prix
  article (DDP), donc non re-facturé ici. `estimated_duties` renvoyé à `0` (duties « incluses »).

**Résumé des « formules » réelles V1 :**
| Cas | Formule |
|---|---|
| Sur Place (prix article) | `shopifyPrice` |
| Sur Place (taxe) | Sales tax US réelle via Draft Order Shopify (par ZIP→State) |
| Expédié DDP (prix article) | `shopifyPrice + shippingCost` (config, défaut 100) |
| Duties | « Incluses » (0 calculé, bundlé dans le prix) |
| TVA 20% | uniquement HT→TTC à l'affichage PLM (`* 1.20`) |
| Bypass Markets | `taxe / (subtotalShopify / subtotalPOS)` |

---

## 2. `generateSKU` — `legacy-v1/server.js` (l. 80-89)

```js
function generateSKU(variant) {
    const model  = (variant.idModel || "AA000").toUpperCase();
    const year   = (variant.idYear || "25");
    const season = (variant.idSeason || "H").toUpperCase();
    const option = String(variant.idOption || "00").padStart(2, "0");
    const mat    = (variant.idMaterialPrimary || "CU000").toUpperCase();
    const color  = (variant.idColor || "000");
    // [MODEL][YY][S]-[MAT][OPT]-[COLOR]
    return `${model}${year}${season}-${mat}${option}-${color}`;
}
```
- Format : **`[MODEL][YY][S]-[MAT][OPT]-[COLOR]`** → ex. `OL25H-CU001-002-NR`, `AA00826E-BI00100-017`.
- `idOption` est paddé à 2 chiffres. `-DDP` est ajouté **côté frontend** (cf. §1a), pas ici.
- ⚠️ **Pas d'incrémentation séquentielle** `-01`/`-02` (promise dans les specs, jamais implémentée).
- ⚠️ `idOption` est un code numérique muet (`00`), pas sémantique.

---

## 3. Payloads Shopify (formats exacts à reproduire)

### 3a. Commande POS (vente directe) — `legacy-v1/server.js` `POST /api/sales` (l. 532-563)
```js
const lineItems = req.body.items.map(i => ({
    title: i.name || "Article Tiraboschi",
    sku: i.sku || "CUSTOM",
    price: (i.price / 100).toFixed(2),   // centimes → unités
    quantity: 1
}));
const orderPayload = {
    order: {
        line_items: lineItems,
        financial_status: "paid",
        send_receipt: true,
        currency: req.body.currency ? req.body.currency.toUpperCase() : "EUR",
        tags: `POS, Vendeur:${req.body.vendorName || "Inconnu"}`,
        note_attributes: []   // + { name: "Stripe PaymentIntent", value: paymentIntentId } si présent
    }
};
if (req.body.customer && req.body.customer.id) {
    orderPayload.order.customer = { id: req.body.customer.id };
}
// POST https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json
```

### 3b. Commande via lien de paiement — `legacy-v1/server.js` `fulfillPaymentLinkOrder` (l. 236-292)
Même structure, avec en plus la **ligne de taxes/frais** recalculée depuis le montant encaissé :
```js
const itemsSumCents  = sale.items.reduce((s, i) => s + (i.price || 0), 0);
const collectedCents = Math.round(sale.amount * 100);
if (collectedCents > itemsSumCents) {
    lineItems.push({
        title: sale.currency === 'usd' ? 'Sales Tax & Duties' : 'Taxes & Frais',
        price: ((collectedCents - itemsSumCents) / 100).toFixed(2),
        quantity: 1
    });
}
// tags: `POS-Link, Vendeur:${sale.vendorName}` ; note_attributes: [{ name:"Stripe SessionId", value: sessionId }]
// customer.id si connu, sinon order.email depuis sessionData.customer_details.email
```
- **Idempotence** : `fulfillPaymentLinkOrder` vérifie `db.sales[i].status !== 'paid'` avant de pousser
  (l. 239) → évite la double-commande quand webhook + polling `/check_payment_link` arrivent tous deux.

### 3c. Draft Order (calcul taxes) — voir §1c. Payload `draft_order` l. 833-851.

### 3d. Création client Shopify — `legacy-v1/server.js` `POST /api/shopify/customers` (l. 457+).
### 3e. Auth Shopify — `getShopifyHeaders()` (l. 118-146) : OAuth `client_credentials` →
header `X-Shopify-Access-Token`, token caché avec expiry. **API figée `2024-01`** (à monter en V2).

---

## 4. Workaround `/pay/:session_id` (in-app browsers WhatsApp/Instagram)

`legacy-v1/server.js` (l. 331-398). **Problème résolu** : les navigateurs intégrés de WhatsApp/
Instagram cassent l'affichage du Stripe Checkout. **Solution** : une page intermédiaire HTML servie
par le serveur.

Flux complet :
1. `POST /api/create_payment_link` (l. 174) crée la **Stripe Checkout Session**, puis renvoie une URL
   **`/pay/{session.id}`** (et NON l'URL Stripe directe) — l. 207-210 :
   ```js
   const protocol = req.headers['x-forwarded-proto'] || req.protocol;
   const intermediaryUrl = `${protocol}://${req.headers.host}/pay/${session.id}`;
   ```
   La vente est enregistrée en `status: "pending"` avec `id: "LNK-" + session.id.substring(8,16)`.
2. `GET /pay/:session_id` récupère la session Stripe et sert une page HTML autonome qui :
   - détecte la langue via `session.locale` (`en`/`fr`) — textes bilingues en dur ;
   - affiche un bouton « Procéder au paiement » → `href = session.url` (vraie URL Stripe) ;
   - affiche un **encart d'aide** : « ouvrez ce lien dans Safari/Chrome via les 3 points » ;
   - **auto-redirige** vers `session.url` après 2 s **sauf** si user-agent contient
     `WhatsApp` / `Instagram` / `FBAN` — l. 388-396 :
     ```js
     var isWhatsAppOrIG = (ua.indexOf("WhatsApp")>-1 || ua.indexOf("Instagram")>-1 || ua.indexOf("FBAN")>-1);
     if (!isWhatsAppOrIG) { setTimeout(function(){ window.location.href = "${session.url}"; }, 2000); }
     ```
3. Confirmation du paiement par **2 voies** (redondance) :
   - **Webhook** `POST /api/webhook` (signé, l. 308) sur `checkout.session.completed` → `fulfill…`.
   - **Polling** `GET /api/check_payment_link/:session_id` (l. 296) → si `payment_status === 'paid'`
     → `fulfill…`. L'idempotence (§3b) empêche le doublon.

---

## Index des emplacements (dans le snapshot figé)
| Élément | Fichier | Lignes |
|---|---|---|
| `generateSKU` | `legacy-v1/server.js` | 80-89 |
| `getShopifyHeaders` (auth) | `legacy-v1/server.js` | 118-146 |
| `create_payment_link` | `legacy-v1/server.js` | 174-228 |
| `fulfillPaymentLinkOrder` (payload + idempotence) | `legacy-v1/server.js` | 236-292 |
| `check_payment_link` (polling) | `legacy-v1/server.js` | 296-307 |
| Webhook signé | `legacy-v1/server.js` | 308-329 |
| Page `/pay/:id` (workaround) | `legacy-v1/server.js` | 331-398 |
| Payload commande POS | `legacy-v1/server.js` | 518-575 |
| `calculate_taxes` + `zipToState` + bypass Markets | `legacy-v1/server.js` | 752-927 |
| Pré-calcul prix wizard (DDP, port, -DDP) | `legacy-v1/public/app.js` | ~880-1000 |
| TVA 20% affichage PLM | `legacy-v1/public/app.js` | 1552 |

*Extraits générés le 2026-06-06 depuis le commit `683baba`. Aucune modification du code de prod.*
