require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// ─── MONGODB ───────────────────────────────────────────────────────────────────
// URI stockée dans .env — jamais hardcodée dans le code
const mongoClient = new MongoClient(process.env.MONGO_URI);
let _db = null;

async function getMongoDB() {
    if (!_db) {
        await mongoClient.connect();
        _db = mongoClient.db('tiraboschi_pos');
    }
    return _db;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
    origin: (origin, cb) => {
        // Autorise les requêtes sans origin (mobile, Postman, serveur)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS bloqué : ${origin}`));
    },
    credentials: true
}));

const USERS_DB_PATH = path.join(__dirname, 'data', 'users_db.json');
const PRODUCTS_DB_PATH = path.join(__dirname, 'data', 'products_db.json');

function readUsersDB() {
    const defaultUsers = [
        { id: "USR-1", firstName: "Vincent", lastName: "Hacquard", name: "Vincent Hacquard", email: "hacquard.vincent@gmail.com", password: "admin", role: "admin", permissions: ["caisse", "collection", "stock", "ventes", "admin"], commission: "0" },
        { id: "USR-2", firstName: "Laurène", lastName: "Mauro", name: "Laurène Mauro", email: "laurene", password: "1234", role: "admin", permissions: ["caisse", "collection", "stock", "ventes", "admin"], commission: "0" },
        { id: "USR-CHIARA", firstName: "Chiara", lastName: "", name: "Chiara", email: "chiara", password: "1234", role: "user", permissions: ["caisse", "ventes"], commission: "0" },
        { id: "USR-PATTI", firstName: "Patti", lastName: "", name: "Patti", email: "Patti", password: "1234", role: "user", permissions: ["caisse", "ventes"], commission: "0" }
    ];

    if (!fs.existsSync(USERS_DB_PATH)) {
        if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
        const initData = { users: defaultUsers };
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify(initData, null, 2));
        return initData;
    }

    let db = JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf8'));
    if (!db.users || db.users.length === 0) {
        db.users = defaultUsers;
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify(db, null, 2));
    }
    return db;
}

function writeUsersDB(data) {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(data, null, 2));
}

function readProductsDB() {
    if (!fs.existsSync(PRODUCTS_DB_PATH)) {
        if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
        return { variants: [], materials: [], packaging: [], collections: [], production_orders: [], suppliers: [], stock: [], config: {} };
    }
    return JSON.parse(fs.readFileSync(PRODUCTS_DB_PATH, 'utf8'));
}

function writeProductsDB(data) {
    fs.writeFileSync(PRODUCTS_DB_PATH, JSON.stringify(data, null, 2));
}

// --- MOTEUR PLM : GÉNÉRATEUR D'ID (SKU) — Format strict ---
// Format: [ID_MODELE][ANNÉE][SAISON] — [ID_MATIERE][OPTION]-[COULEUR]
function generateSKU(variant) {
    const model = (variant.idModel || "AA000").toUpperCase();
    const year = (variant.idYear || "25");
    const season = (variant.idSeason || "H").toUpperCase();
    const option = String(variant.idOption || "00").padStart(2, "0");
    const mat = (variant.idMaterialPrimary || "CU000").toUpperCase();
    const color = (variant.idColor || "000");
    // [MODEL][YY][S]-[MAT][OPT]-[COLOR]
    return `${model}${year}${season}-${mat}${option}-${color}`;
}

// Le webhook Stripe nécessite le body brut (avant JSON parsing) — doit être déclaré AVANT express.json()
app.use('/api/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ─── SHOPIFY ──────────────────────────────────────────────────────────────────
// Auth via client credentials grant (nouveau standard Shopify Dev Dashboard 2026)
// Les tokens expirent après 24h — le cache les renouvelle automatiquement.
// Credentials à stocker dans .env : SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN
    ? process.env.SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : null;
const SHOPIFY_API_VERSION = '2024-01';

let _shopifyToken = null;
let _shopifyTokenExpiresAt = 0;

async function getShopifyHeaders() {
    if (!shopifyDomain || !process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
        throw new Error("Configuration Shopify manquante (SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID ou SHOPIFY_CLIENT_SECRET absents).");
    }
    // Renouvelle le token si absent ou expirant dans moins d'1 minute
    if (!_shopifyToken || Date.now() > _shopifyTokenExpiresAt - 60_000) {
        const response = await fetch(`https://${shopifyDomain}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.SHOPIFY_CLIENT_ID,
                client_secret: process.env.SHOPIFY_CLIENT_SECRET,
            })
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Erreur token Shopify (${response.status}) : ${err}`);
        }
        const { access_token, expires_in } = await response.json();
        _shopifyToken = access_token;
        _shopifyTokenExpiresAt = Date.now() + expires_in * 1000;
    }
    return {
        'X-Shopify-Access-Token': _shopifyToken,
        'Content-Type': 'application/json'
    };
}

// --- ROUTES STRIPE & TERMINAL ---
app.post('/api/create_payment_intent', async (req, res) => {
    try {
        const { amount, currency } = req.body;
        const intent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency: currency || 'usd',
            payment_method_types: ['card_present'],
            capture_method: 'manual',
        });
        res.json({ client_secret: intent.client_secret, id: intent.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/capture_payment_intent', async (req, res) => {
    try {
        const { payment_intent_id } = req.body;
        const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (intent.status === 'succeeded') {
            res.json({ intent });
        } else {
            const capturedIntent = await stripe.paymentIntents.capture(payment_intent_id);
            res.json({ intent: capturedIntent });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/create_payment_link', async (req, res) => {
    try {
        const { items, amount, currency, customer_email, customer, vendorId, vendorName } = req.body;
        let itemsSum = items.reduce((s, i) => s + (i.price || 0), 0);
        let line_items = items.map(i => ({
            price_data: {
                currency: currency || 'eur',
                product_data: { name: i.name || 'Article Tiraboschi' },
                unit_amount: Math.round(i.price || 0)
            },
            quantity: 1
        }));
        
        if (Math.round(amount) > itemsSum) {
            line_items.push({
                price_data: {
                    currency: currency || 'eur',
                    product_data: { name: currency === 'usd' ? 'Sales Tax & Duties' : 'Taxes & Frais' },
                    unit_amount: Math.round(amount) - itemsSum
                },
                quantity: 1
            });
        }

        const session = await stripe.checkout.sessions.create({
            line_items,
            mode: 'payment',
            locale: currency === 'usd' ? 'en' : 'fr',
            customer_email: customer_email || undefined,
            success_url: 'https://tiraboschi-paris.com/', 
            cancel_url: 'https://tiraboschi-paris.com/'
        });

        const domain = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const intermediaryUrl = `${protocol}://${domain}/pay/${session.id}`;
        
        // Sauvegarder la vente en attente localement
        const db = await readProductsDB();
        if (!db.sales) db.sales = [];
        db.sales.push({
            id: "LNK-" + session.id.substring(8, 16).toUpperCase(),
            sessionId: session.id,
            status: "pending",
            amount: amount / 100, // conversion des centimes en euros/dollars
            currency: currency,
            items: items,
            customer: customer || null,
            vendorId: vendorId || null,
            vendorName: vendorName || 'Inconnu',
            date: new Date().toISOString()
        });
        await writeProductsDB(db);

        res.json({ url: intermediaryUrl, session_id: session.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FONCTION DE SYNCHRONISATION SHOPIFY ---
async function fulfillPaymentLinkOrder(sessionId, sessionData) {
    const db = await readProductsDB();
    const pendingSaleIndex = (db.sales || []).findIndex(s => s.sessionId === sessionId);
    
    if (pendingSaleIndex > -1 && db.sales[pendingSaleIndex].status !== 'paid') {
        db.sales[pendingSaleIndex].status = 'paid';
        const sale = db.sales[pendingSaleIndex];
        await writeProductsDB(db);
        
        try {
            const headers = await getShopifyHeaders();
            const lineItems = sale.items.map(i => ({
                title: i.name || "Article Tiraboschi",
                sku: i.sku || "CUSTOM",
                price: (i.price / 100).toFixed(2),
                quantity: 1
            }));
            
            const itemsSumCents = sale.items.reduce((s, i) => s + (i.price || 0), 0);
            const collectedCents = Math.round(sale.amount * 100);
            if (collectedCents > itemsSumCents) {
                lineItems.push({
                    title: sale.currency === 'usd' ? 'Sales Tax & Duties' : 'Taxes & Frais',
                    price: ((collectedCents - itemsSumCents) / 100).toFixed(2),
                    quantity: 1
                });
            }
            
            const orderPayload = {
                order: {
                    line_items: lineItems,
                    financial_status: "paid",
                    send_receipt: true,
                    currency: sale.currency ? sale.currency.toUpperCase() : "EUR",
                    tags: `POS-Link, Vendeur:${sale.vendorName || 'Inconnu'}`,
                    note_attributes: [
                        { name: "Stripe SessionId", value: sessionId }
                    ]
                }
            };
            
            if (sale.customer && sale.customer.id) {
                orderPayload.order.customer = { id: sale.customer.id };
            } else if (sessionData && sessionData.customer_details && sessionData.customer_details.email) {
                orderPayload.order.email = sessionData.customer_details.email;
            }
            
            const shopifyRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`, {
                method: 'POST',
                headers,
                body: JSON.stringify(orderPayload)
            });
            
            const shopifyData = await shopifyRes.json();
            console.log("Shopify order fulfilled:", shopifyData.order ? shopifyData.order.id : shopifyData.errors);
        } catch (e) {
            console.error("Shopify push failed during fulfillment:", e);
        }
    }
}

app.get('/api/check_payment_link/:session_id', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.session_id);
        if (session.payment_status === 'paid') {
            await fulfillPaymentLinkOrder(session.id, session);
        }
        res.json({ payment_status: session.payment_status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/webhook', async (req, res) => {
    // Vérification de la signature Stripe — protège contre les faux événements
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature invalide :', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            await fulfillPaymentLinkOrder(session.id, session);
        }
        res.json({ received: true });
    } catch (e) {
        console.error("Webhook processing error:", e);
        res.status(500).send("Webhook error");
    }
});

app.get('/pay/:session_id', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.session_id);
        if (!session) return res.status(404).send('Session non trouvée.');

        const isEn = session.locale === 'en';
        
        const text = {
            lang: isEn ? "en" : "fr",
            title: isEn ? "Secure Payment - Tiraboschi" : "Paiement Sécurisé - Tiraboschi",
            heading: isEn ? "Secure Payment" : "Paiement Sécurisé",
            desc: isEn ? "Your order is ready. Click the button below to access our secure Stripe payment portal." : "Votre commande est prête à être finalisée. Cliquez sur le bouton ci-dessous pour accéder à notre portail de paiement sécurisé Stripe.",
            btn: isEn ? "Proceed to payment" : "Procéder au paiement",
            noticeTitle: isEn ? "💡 Display issue?" : "💡 Problème d'affichage ?",
            noticeBody: isEn ? "If you opened this link from WhatsApp or Instagram and the payment page doesn't load, click the 3 dots at the top right of your screen and select <strong>\"Open in Safari\"</strong> or <strong>\"Open in Chrome\"</strong>." : "Si vous avez ouvert ce lien depuis WhatsApp ou Instagram et que le paiement ne s'affiche pas, cliquez sur les 3 points en haut à droite de l'écran et choisissez <strong>\"Ouvrir dans Safari\"</strong> ou <strong>\"Ouvrir dans Chrome\"</strong>."
        };

        const html = `
        <!DOCTYPE html>
        <html lang="${text.lang}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${text.title}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; text-align: center; background-color: #fcfcfc; padding: 40px 20px; color: #111; margin: 0; }
                .container { max-width: 400px; margin: 40px auto; background: white; padding: 40px 30px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #eee; }
                h1 { font-family: 'Playfair Display', serif; font-size: 28px; margin-bottom: 12px; font-weight: 600; color: #000; }
                p { font-size: 15px; color: #555; margin-bottom: 32px; line-height: 1.6; }
                .btn { display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 16px 24px; font-size: 16px; font-weight: 500; border-radius: 8px; width: 100%; box-sizing: border-box; transition: background 0.3s, transform 0.1s; cursor: pointer; }
                .btn:hover { background-color: #222; transform: translateY(-1px); }
                .safari-notice { font-size: 13.5px; color: #666; margin-top: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px; text-align: left; border-left: 3px solid #d3b482; }
                .logo-placeholder { margin-bottom: 24px; font-family: 'Playfair Display', serif; font-size: 32px; letter-spacing: 2px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo-placeholder">TIRABOSCHI</div>
                <h1>${text.heading}</h1>
                <p>${text.desc}</p>
                <a href="${session.url}" class="btn">${text.btn}</a>
                <div class="safari-notice">
                    <strong>${text.noticeTitle}</strong><br><br>
                    ${text.noticeBody}
                </div>
            </div>
            <script>
                // Auto-redirect if not in an in-app browser to make it seamless when possible
                var ua = navigator.userAgent || navigator.vendor || window.opera;
                var isWhatsAppOrIG = (ua.indexOf("WhatsApp") > -1 || ua.indexOf("Instagram") > -1 || ua.indexOf("FBAN") > -1);
                if (!isWhatsAppOrIG) {
                    setTimeout(function() {
                        window.location.href = "${session.url}";
                    }, 2000);
                }
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } catch (err) {
        res.status(500).send("Erreur / Error: " + err.message);
    }
});

app.post('/api/connection_token', async (req, res) => {
    try {
        const connectionToken = await stripe.terminal.connectionTokens.create();
        res.json({ secret: connectionToken.secret });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/locations', async (req, res) => {
    try {
        const locations = await stripe.terminal.locations.list({ limit: 100 });
        res.json({ locations: locations.data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/readers', async (req, res) => {
    const { location } = req.query;
    try {
        const readers = await stripe.terminal.readers.list({ location, limit: 100 });
        res.json({ readers: readers.data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROUTES SHOPIFY ---
app.get('/api/shopify/products', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?status=active&limit=50`, { headers });
        const data = await response.json();
        const formattedProducts = [];
        data.products.forEach(p => {
            p.variants.forEach(v => {
                formattedProducts.push({
                    id: v.id,
                    name: v.title === "Default Title" ? p.title : `${p.title} - ${v.title}`,
                    price: Math.round(parseFloat(v.price) * 100),
                    image: p.image ? p.image.src : null,
                    product_id: p.id,
                    base_title: p.title,
                    sku: v.sku
                });
            });
        });
        res.json({ products: formattedProducts });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shopify/customers', async (req, res) => {
    const { query } = req.query;
    try {
        const headers = await getShopifyHeaders();
        let url = `https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=50`;
        if (query) url = `https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/search.json?query=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        res.json({ customers: data.customers });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shopify/customers', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        const payload = {
            customer: {
                first_name: req.body.first_name,
                last_name: req.body.last_name,
                email: req.body.email
            }
        };
        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            return res.status(400).json({ error: JSON.stringify(data.errors) });
        }
        res.json({ customer: data.customer });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shopify/inventory', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=50&status=active`, { headers });
        const data = await response.json();
        const inventory = [];
        data.products.forEach(p => {
            p.variants.forEach(v => {
                inventory.push({
                    id: v.id, product_title: p.title, variant_title: v.title === "Default Title" ? "" : v.title,
                    sku: v.sku, quantity: v.inventory_quantity, price: v.price
                });
            });
        });
        res.json({ inventory });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shopify/all_products', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=50`, { headers });
        const data = await response.json();
        res.json(data.products || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales', async (req, res) => {
    try {
        const db = await readProductsDB();
        res.json({ sales: db.sales || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sales', async (req, res) => {
    try {
        const db = await readProductsDB();
        if (!db.sales) db.sales = [];
        const sale = {
            ...req.body,
            id: "SALE-" + Date.now(),
            date: new Date().toISOString()
        };
        db.sales.push(sale);
        await writeProductsDB(db);

        // PUSH TO SHOPIFY
        try {
            const headers = await getShopifyHeaders();
            const lineItems = req.body.items.map(i => ({
                title: i.name || "Article Tiraboschi",
                sku: i.sku || "CUSTOM",
                price: (i.price / 100).toFixed(2),
                quantity: 1
            }));
            
            const orderPayload = {
                order: {
                    line_items: lineItems,
                    financial_status: "paid",
                    send_receipt: true,
                    currency: req.body.currency ? req.body.currency.toUpperCase() : "EUR",
                    tags: `POS, Vendeur:${req.body.vendorName || "Inconnu"}`,
                    note_attributes: []
                }
            };
            if (req.body.paymentIntentId) {
                orderPayload.order.note_attributes.push({ name: "Stripe PaymentIntent", value: req.body.paymentIntentId });
            }

            if (req.body.customer && req.body.customer.id) {
                orderPayload.order.customer = { id: req.body.customer.id };
            }

            const shopifyRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`, {
                method: 'POST',
                headers,
                body: JSON.stringify(orderPayload)
            });
            const shopifyData = await shopifyRes.json();
            if (!shopifyRes.ok) {
                console.error("Shopify order creation error:", shopifyData);
            }
        } catch (e) {
            console.error("Shopify sync failed:", e);
        }

        res.json({ success: true, sale });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/refund_order', async (req, res) => {
    try {
        const { orderId } = req.body;
        const headers = await getShopifyHeaders();
        
        // 1. Fetch Shopify order to get amount and date
        const shopifyOrderRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`, { headers });
        const shopifyOrderData = await shopifyOrderRes.json();
        
        if (!shopifyOrderRes.ok || !shopifyOrderData.order) {
            return res.status(404).json({ error: "Shopify order not found." });
        }
        
        const order = shopifyOrderData.order;
        const orderDate = new Date(order.created_at).getTime();
        const orderAmount = parseFloat(order.total_price);
        
        let stripeRefunded = false;

        // Try finding Stripe ID in Shopify note_attributes first
        let stripeSessionId = null;
        let stripePaymentIntentId = null;
        if (order.note_attributes && order.note_attributes.length > 0) {
            const sessionAttr = order.note_attributes.find(a => a.name === "Stripe SessionId");
            if (sessionAttr) stripeSessionId = sessionAttr.value;
            const piAttr = order.note_attributes.find(a => a.name === "Stripe PaymentIntent");
            if (piAttr) stripePaymentIntentId = piAttr.value;
        }

        // 2. If not found in note_attributes, fallback to finding matching Stripe payment in local DB
        if (!stripeSessionId && !stripePaymentIntentId) {
            const db = await readProductsDB();
            const matchingSale = (db.sales || []).find(s => {
                if (s.status !== 'paid') return false;
                const saleDate = new Date(s.date).getTime();
                const timeDiff = Math.abs(orderDate - saleDate);
                return timeDiff < 15 * 60 * 1000 && Math.abs(parseFloat(s.amount) - orderAmount) < 0.5;
            });
            if (matchingSale) {
                stripePaymentIntentId = matchingSale.paymentIntentId;
                stripeSessionId = matchingSale.sessionId;
            }
        }
        
        if (stripePaymentIntentId) {
            try {
                await stripe.refunds.create({ payment_intent: stripePaymentIntentId });
                stripeRefunded = true;
            } catch (e) {
                console.error("Stripe refund failed for PaymentIntent", e);
            }
        } else if (stripeSessionId) {
            try {
                const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
                if (session.payment_intent) {
                    await stripe.refunds.create({ payment_intent: session.payment_intent });
                    stripeRefunded = true;
                }
            } catch (e) {
                console.error("Stripe refund failed for Session", e);
            }
        }
        
        // 3. Cancel/Refund in Shopify
        const shopifyCancelRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}/cancel.json`, {
            method: 'POST',
            headers
        });
        const shopifyCancelData = await shopifyCancelRes.json();
        
        res.json({ 
            success: true, 
            shopifyCancelled: shopifyCancelRes.ok, 
            stripeRefunded,
            message: stripeRefunded ? "Commande annulée dans Shopify et remboursée sur Stripe." : "Commande annulée dans Shopify (Remboursement Stripe manuel requis si déjà payé)."
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shopify/reports', async (req, res) => {
    try {
        const { vendorId } = req.query;
        const headers = await getShopifyHeaders();
        let daily = 0, weekly = 0, monthly = 0;
        let crmCount = 0, emailCount = 0;
        let currency = 'EUR';
        let orderCount = 0;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const response = await fetch(
            `https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&financial_status=paid&limit=250`,
            { headers }
        );
        const data = await response.json();
        const orders = data.orders || [];

        orders.forEach(order => {
            if (order.cancelled_at) return; // Skip cancelled orders
            // Optionnel : filtrage par vendeur si on peut le déduire des tags
            const orderDate = new Date(order.created_at);
            const amount = parseFloat(order.total_price) || 0;
            if (orderDate >= startOfMonth) monthly += amount;
            if (orderDate >= startOfWeek) weekly += amount;
            if (orderDate >= startOfDay) daily += amount;
        });
        orderCount += orders.length;
        if (orders[0] && orders[0].currency) currency = orders[0].currency;

        try {
            const custRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250`, { headers });
            const custData = await custRes.json();
            if (custData.customers) crmCount = custData.customers.length;

            const emailRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/search.json?query=email:*&limit=250`, { headers });
            const emailData = await emailRes.json();
            if (emailData.customers) emailCount = emailData.customers.length;
        } catch (e) {
            console.warn("Erreur CRM count:", e);
        }

        // NOTE : on n'additionne plus les ventes locales ici.
        // Les ventes POS sont systématiquement pushées vers Shopify à la création,
        // donc elles sont déjà comptées dans les orders Shopify ci-dessus.
        // Additionner les deux reviendrait à doubler le CA. Shopify est la source de vérité.
        //
        // La seule exception : filtrage par vendeur (les tags Shopify portent "Vendeur:xxx").
        // TODO sprint 2 : filtrer les orders Shopify par tag vendeur côté API.

        res.json({ daily: Math.round(daily * 100) / 100, weekly: Math.round(weekly * 100) / 100, monthly: Math.round(monthly * 100) / 100, currency, orderCount, crmCount, emailCount });
    } catch (err) {
        console.error('Reporting error:', err.message);
        res.status(500).json({ error: err.message, daily: 0, weekly: 0, monthly: 0, currency: 'EUR' });
    }
});



app.get('/api/shopify/product_by_sku/:sku', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        // Since Shopify REST API doesn't officially support sku filtering on products.json well,
        // we fetch products and filter in memory (or assuming it works if it does).
        // Let's query graphql or just all products. Wait, GraphQL is better but let's use REST.
        // Actually, draft_orders can take a variant_id, but we need variant_id.
        // Let's just fetch products and find the variant.
        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`, { headers });
        const data = await response.json();
        if (!data.products) return res.status(404).json({ error: "Not found" });

        let foundVariant = null;
        for (const p of data.products) {
            const v = p.variants.find(v => v.sku === req.params.sku);
            if (v) {
                foundVariant = v;
                break;
            }
        }

        if (foundVariant) {
            res.json({ price: foundVariant.price, variant_id: foundVariant.id });
        } else {
            res.status(404).json({ error: "SKU not found in Shopify" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shopify/calculate_taxes', async (req, res) => {
    try {
        const { zip, country, state, items, currency } = req.body;
        const headers = await getShopifyHeaders();

        const zipToState = (zipCode) => {
            const z = parseInt(zipCode, 10);
            if (isNaN(z)) return '';
            if (z >= 35000 && z <= 36999) return 'AL';
            if (z >= 99500 && z <= 99999) return 'AK';
            if (z >= 85000 && z <= 86599) return 'AZ';
            if (z >= 71600 && z <= 72999) return 'AR';
            if (z >= 90000 && z <= 96199) return 'CA';
            if (z >= 80000 && z <= 81699) return 'CO';
            if (z >= 6000 && z <= 6999) return 'CT';
            if (z >= 19700 && z <= 19999) return 'DE';
            if (z >= 32000 && z <= 34999) return 'FL';
            if (z >= 30000 && z <= 31999) return 'GA';
            if (z >= 96700 && z <= 96999) return 'HI';
            if (z >= 83200 && z <= 83999) return 'ID';
            if (z >= 60000 && z <= 62999) return 'IL';
            if (z >= 46000 && z <= 47999) return 'IN';
            if (z >= 50000 && z <= 52899) return 'IA';
            if (z >= 66000 && z <= 67999) return 'KS';
            if (z >= 40000 && z <= 42799) return 'KY';
            if (z >= 70000 && z <= 71599) return 'LA';
            if (z >= 3900 && z <= 4999) return 'ME';
            if (z >= 20600 && z <= 21999) return 'MD';
            if (z >= 1000 && z <= 2799) return 'MA';
            if (z >= 48000 && z <= 49999) return 'MI';
            if (z >= 55000 && z <= 56799) return 'MN';
            if (z >= 38600 && z <= 39799) return 'MS';
            if (z >= 63000 && z <= 65899) return 'MO';
            if (z >= 59000 && z <= 59999) return 'MT';
            if (z >= 68000 && z <= 69399) return 'NE';
            if (z >= 88900 && z <= 89899) return 'NV';
            if (z >= 3000 && z <= 3899) return 'NH';
            if (z >= 7000 && z <= 8999) return 'NJ';
            if (z >= 87000 && z <= 88499) return 'NM';
            if (z >= 10000 && z <= 14999) return 'NY';
            if (z >= 27000 && z <= 28999) return 'NC';
            if (z >= 58000 && z <= 58899) return 'ND';
            if (z >= 43000 && z <= 45999) return 'OH';
            if (z >= 73000 && z <= 74999) return 'OK';
            if (z >= 97000 && z <= 97999) return 'OR';
            if (z >= 15000 && z <= 19699) return 'PA';
            if (z >= 2800 && z <= 2999) return 'RI';
            if (z >= 29000 && z <= 29999) return 'SC';
            if (z >= 57000 && z <= 57799) return 'SD';
            if (z >= 37000 && z <= 38599) return 'TN';
            if (z >= 75000 && z <= 79999) return 'TX';
            if (z >= 84000 && z <= 84999) return 'UT';
            if (z >= 5000 && z <= 5999) return 'VT';
            if (z >= 22000 && z <= 24699) return 'VA';
            if (z >= 98000 && z <= 99499) return 'WA';
            if (z >= 24700 && z <= 26899) return 'WV';
            if (z >= 53000 && z <= 54999) return 'WI';
            if (z >= 82000 && z <= 83199) return 'WY';
            if (z >= 20000 && z <= 20099) return 'DC';
            return '';
        };

        let mappedState = state;
        if (!mappedState && zip && (!country || country === 'US')) {
            mappedState = zipToState(zip);
        }

        const db = await readProductsDB();
        const configShipping = db.config?.shippingCost ? parseFloat(db.config.shippingCost) : 100.00;
        const shippingTotal = 0.00; // Le shipping est maintenant directement inclus dans le prix de l'article (DDP)

        const line_items = items.map(i => {
            return {
                title: i.name || 'Custom Item',
                price: (i.price / 100).toFixed(2),
                quantity: 1,
                sku: 'POS-' + (i.sku || 'CUSTOM'),
                requires_shipping: true, // Forcé à true pour obliger Shopify à taxer au lieu de destination (US) même pour les achats sur place
                taxable: true
            };
        });

        const draftOrderPayload = {
            draft_order: {
                line_items,
                shipping_address: {
                    city: req.body.city || '',
                    zip: zip || '',
                    country: country || 'US',
                    province: mappedState || ''
                },
                use_customer_default_address: false,
                taxes_included: false,
                currency: currency ? currency.toUpperCase() : 'USD'
            }
        };

        // Always send a shipping line (even if 0.00) so Shopify applies destination-based US taxes
        draftOrderPayload.draft_order.shipping_line = {
            custom: true,
            title: "Expédition (Shipping)",
            price: shippingTotal.toFixed(2)
        };

        const response = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(draftOrderPayload)
        });

        const data = await response.json();

        if (data.errors) {
            console.error("Shopify Draft Order Error:", data.errors);
            const errorMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : data.errors;
            return res.status(400).json({ error: errorMsg });
        }

        const draftOrder = data.draft_order;

        if (draftOrder && draftOrder.id) {
            fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draftOrder.id}.json`, {
                method: 'DELETE',
                headers
            }).catch(e => console.error('Failed to delete temp draft order', e));
        }

        // Bypass Shopify Markets automatic currency conversion by scaling the values back to our explicit POS expected subtotal
        const expectedSubtotal = items.reduce((s, i) => s + (i.price / 100), 0);
        const shopifySubtotal = parseFloat(draftOrder.subtotal_price) || expectedSubtotal;
        
        // Calculate the conversion rate Shopify applied (e.g., 1.015 if it converted EUR to USD)
        const conversionRate = (shopifySubtotal > 0 && expectedSubtotal > 0) ? (shopifySubtotal / expectedSubtotal) : 1;

        let actualTaxLines = [];
        let actualTotalTax = 0;
        
        if (draftOrder.tax_lines && draftOrder.tax_lines.length > 0) {
            const taxMap = {};
            draftOrder.tax_lines.forEach(t => {
                const key = t.title + '_' + t.rate;
                if (!taxMap[key]) {
                    taxMap[key] = { title: t.title, rate: t.rate, price: 0 };
                }
                taxMap[key].price += (parseFloat(t.price) / conversionRate);
            });
            Object.values(taxMap).forEach(t => {
                actualTotalTax += t.price;
                actualTaxLines.push({
                    title: t.title,
                    rate: t.rate,
                    price: t.price.toFixed(2)
                });
            });
        } else {
            actualTotalTax = (parseFloat(draftOrder.total_tax) || 0) / conversionRate;
            actualTaxLines = draftOrder.tax_lines || [];
        }

        const actualShipping = shippingTotal; // Force exactement le shipping demandé, on ignore la ligne convertie de Shopify
        const fixedTotalPrice = expectedSubtotal + actualShipping + actualTotalTax;

        res.json({
            subtotal: expectedSubtotal.toFixed(2),
            total_tax: actualTotalTax.toFixed(2),
            tax_lines: actualTaxLines,
            total_price: fixedTotalPrice.toFixed(2),
            shipping: actualShipping.toFixed(2),
            estimated_duties: 0
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shopify/orders', async (req, res) => {
    try {
        const headers = await getShopifyHeaders();
        // status=any brings all orders (open, closed, archived)
        const response = await fetch(
            `https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=50`,
            { headers }
        );
        const data = await response.json();
        
        if (data.errors) {
            return res.status(400).json({ error: JSON.stringify(data.errors) });
        }
        
        res.json({ orders: data.orders || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES ERP / PLM ---
app.get(['/api/erp/collection', '/api/erp/collections'], async (req, res) => {
    const db = await readProductsDB();
    res.json(db.variants || []);
});

app.get('/api/erp/materials', async (req, res) => {
    const db = await readProductsDB();
    res.json(db.stock || []);
});

app.post('/api/erp/materials', async (req, res) => {
    const db = await readProductsDB();
    if (!db.stock) db.stock = [];
    const items = req.body; // Expecting array of new items
    if (Array.isArray(items)) {
        db.stock.push(...items);
        await writeProductsDB(db);
    }
    res.json({ success: true });
});

app.post('/api/erp/materials/update', async (req, res) => {
    const db = await readProductsDB();
    if (!db.stock) db.stock = [];
    const { id, group, color, qty, feet } = req.body;

    const index = db.stock.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ error: "Composant introuvable." });

    db.stock[index].rolls = qty;
    db.stock[index].quantity = qty;
    db.stock[index].feet = feet;

    await writeProductsDB(db);
    res.json({ success: true });
});

app.post('/api/erp/stock_movement', async (req, res) => {
    const db = await readProductsDB();
    if (!db.stock) db.stock = [];
    const { group, color, type, qty, user } = req.body;

    // Reverse-engineer the group name to find matching items
    // group format: "Peaux > Taurillon > Standard" or "Bijoux > Chaîne" or "PIECE_MODELE-..."

    if (group.startsWith('PIECE_')) {
        const declName = group.replace('PIECE_', '');
        if (!db.variants) db.variants = [];
        let matchingVar = null;
        for (let v of db.variants) {
            const vName = (v.modelName + '-' + (v.compositionPrimary ? v.compositionPrimary.replace('Cuir ', '') : 'MATIERE') + '-' + (v.idColor || v['plm-color'] || 'COULEUR') + '-' + (db.config?.options?.find(o => o.id === v['plm-option-1'])?.name || v['plm-option-1'] || 'STANDARD')).toUpperCase().replace(/\s+/g, '-');
            if (vName === declName) {
                matchingVar = v;
                break;
            }
        }
        if (!matchingVar) return res.status(404).json({ error: "Pièce introuvable." });

        const q = parseFloat(qty);
        let currQty = parseFloat(matchingVar.quantity || 0);
        if (type === 'sortie') {
            if (currQty < q) return res.status(400).json({ error: "Stock de pièces insuffisant." });
            matchingVar.quantity = currQty - q;
        } else {
            matchingVar.quantity = currQty + q;
        }
    } else {
        const isBijou = group.startsWith('Bijoux');

        let matchingItems = db.stock.filter(m => {
            if ((m.color || '').trim().toLowerCase() !== color.toLowerCase()) return false;

            m.category = (m.category || '').trim();
            m.leather_type = (m.leather_type || '').trim();

            const mIsBijou = m.isJewelry || m.category.toLowerCase() === 'bijoux' || m.category.toLowerCase() === 'bijouterie';
            if (mIsBijou !== isBijou) return false;

            if (isBijou) {
                const typeBijou = (m.detail || m.leather_type || 'Général').trim();
                return `Bijoux > ${typeBijou}` === group;
            } else {
                const animal = (m.animal || m.category || 'Général').trim();
                const lType = (m.leather_type || 'Standard').trim();
                return `Peaux > ${animal} > ${lType}` === group;
            }
        });

        if (matchingItems.length === 0) {
            return res.status(404).json({ error: "Aucun composant correspondant trouvé" });
        }

        let remaining = parseFloat(qty);
        for (let item of matchingItems) {
            if (remaining <= 0) break;
            const itemQty = parseFloat(item.rolls !== undefined ? item.rolls : (item.quantity || 0));

            if (type === 'sortie') {
                if (itemQty > 0) {
                    const toDeduct = Math.min(itemQty, remaining);
                    item.rolls = itemQty - toDeduct;
                    remaining -= toDeduct;
                }
            } else {
                item.rolls = itemQty + remaining;
                remaining = 0;
            }
        }
    }

    if (!db.movements) db.movements = [];
    const moveId = Date.now().toString();
    db.movements.push({
        id: moveId,
        group, color, type, qty, user,
        date: new Date().toISOString()
    });

    await writeProductsDB(db);
    res.json({ success: true });
});

app.get('/api/erp/movements', async (req, res) => {
    const db = await readProductsDB();
    res.json(db.movements || []);
});

app.get('/api/erp/production_orders', async (req, res) => {
    const db = await readProductsDB();
    res.json(db.production_orders || []);
});

app.post('/api/erp/variant', async (req, res) => {
    const db = await readProductsDB();
    const variant = req.body;
    let skuToSave = variant.originalSKU;

    if (!skuToSave) {
        skuToSave = generateSKU(variant);
        if (db.variants && db.variants.some(v => v.sku === skuToSave)) {
            return res.status(400).json({ error: "Une déclinaison avec ce SKU (" + skuToSave + ") existe déjà." });
        }
    }

    variant.sku = skuToSave;
    variant.updatedAt = new Date().toISOString();

    if (!db.variants) db.variants = [];
    const index = db.variants.findIndex(v => v.sku === variant.sku);
    if (index > -1) {
        db.variants[index] = { ...db.variants[index], ...variant };
    } else {
        db.variants.push(variant);
    }

    await writeProductsDB(db);
    res.json({ success: true, sku: variant.sku });
});

app.delete('/api/erp/variant/:sku', async (req, res) => {
    const db = await readProductsDB();
    if (db.variants) {
        db.variants = db.variants.filter(v => v.sku !== req.params.sku);
        await writeProductsDB(db);
    }
    res.json({ success: true });
});

app.post('/api/erp_receive_materials', async (req, res) => {
    const db = await readProductsDB();
    const { items } = req.body;
    if (!db.stock) db.stock = [];
    items.forEach(item => {
        db.stock.push({
            ...item,
            id: "MAT-" + Date.now() + Math.random().toString(36).substr(2, 5),
            updatedAt: new Date().toISOString()
        });
    });
    await writeProductsDB(db);
    res.json({ success: true });
});

app.get('/api/erp/config', async (req, res) => {
    const db = await readProductsDB();
    res.json(db.config || {});
});

app.post('/api/erp/config', async (req, res) => {
    const db = await readProductsDB();
    db.config = req.body;
    await writeProductsDB(db);
    res.json({ success: true });
});

app.post('/api/erp/production_order', async (req, res) => {
    const db = await readProductsDB();
    const { items, atelier } = req.body;

    // Logic to deduct materials
    items.forEach(item => {
        const variant = db.variants.find(v => v.sku === item.sku);
        if (variant) {
            // Find matching material in stock (simplification: find by color and animal)
            const material = db.stock.find(m => m.color === variant.idColor && m.category === (variant.animalPrimary || variant.compositionPrimary?.split(' ')[1]));
            if (material) {
                const consumption = 2.5; // Average feet per bag
                if (material.feet >= consumption) {
                    material.feet -= consumption;
                    material.updatedAt = new Date().toISOString();
                } else {
                    console.warn(`Stock insuffisant pour ${variant.sku}`);
                }
            }
        }
    });

    const order = {
        id: "PO-" + Date.now(),
        items,
        atelier,
        status: "En cours",
        createdAt: new Date().toISOString()
    };
    if (!db.production_orders) db.production_orders = [];
    db.production_orders.push(order);

    await writeProductsDB(db);
    res.json({ success: true, orderId: order.id });
});

// --- IMPORT CSV DES PRIX ---
app.post('/api/erp/import_csv', async (req, res) => {
    try {
        const { csv } = req.body;
        if (!csv) return res.status(400).json({ error: "Aucun contenu CSV" });
        
        let text = csv;
        // Handle weird character encodings
        text = text.replace(/Chaǩne/g, 'Chaîne').replace(/Chane/g, 'Chaîne').replace(/\?"/g, '-').replace(/\?/g, '-');
        
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        const newVariants = [];
        const prodVariants = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            let cols = [];
            let current = '';
            let inQuotes = false;
            for (let c = 0; c < line.length; c++) {
                if (line[c] === '"') {
                    inQuotes = !inQuotes;
                } else if (line[c] === ';' && !inQuotes) {
                    cols.push(current.trim());
                    current = '';
                } else {
                    current += line[c];
                }
            }
            cols.push(current.trim());
            if (cols.length < 6) continue;

            let model = cols[0];
            let mat = cols[1];
            let opt = cols[2];
            let color = cols[3];
            let name = cols[4];
            let sku = cols[5].replace(/"/g, '');
            let priceStr = cols[6] ? cols[6].replace(/"/g, '').trim() : "0";
            let price = parseFloat(priceStr.replace(/,/g, '.')) || 0;

            let idModel = "AA000"; let idYear = "26"; let idSeason = "E";
            let idMat = "CU000"; let idOpt = "00"; let idColor = "000";
            
            if (sku.includes('-')) {
                const parts = sku.split('-');
                if (parts[0].length >= 5) {
                    idModel = parts[0].substring(0, 5);
                    idYear = parts[0].substring(5, 7) || "26";
                    idSeason = parts[0].substring(7, 8) || "E";
                }
                if (parts[1] && parts[1].length >= 5) {
                    idMat = parts[1].substring(0, 5);
                    idOpt = parts[1].substring(5, 7) || "00";
                }
                if (parts[2]) { idColor = parts[2]; }
            }

            newVariants.push({
                "plm-model-name": idModel, "plm-year": idYear, "plm-season": idSeason,
                "plm-option-1": idOpt, "plm-color": idColor, "plm-material-global": idMat,
                "plm-status": "Validé", "sku": sku, "modelName": name,
                "compositionPrimary": mat, "posModel": model, "posMaterial": mat,
                "posOption": opt, "posColor": color, "price": price, "stock": 0
            });
            prodVariants.push({
                "sku": sku, "name": name, "idModel": idModel, "idYear": idYear, "idSeason": idSeason,
                "idMaterialPrimary": idMat, "idOption": idOpt, "idColor": idColor,
                "price": price, "stock": 0, "posModel": model, "posMaterial": mat, "posOption": opt, "posColor": color
            });
        }

        const erpDbPath = path.join(__dirname, 'data', 'erp_db.json');
        const productsDbPath = path.join(__dirname, 'data', 'products_db.json');
        
        if (fs.existsSync(erpDbPath)) {
            const erpDb = JSON.parse(fs.readFileSync(erpDbPath, 'utf8'));
            erpDb.variants = newVariants;
            fs.writeFileSync(erpDbPath, JSON.stringify(erpDb, null, 2), 'utf8');
        }
        if (fs.existsSync(productsDbPath)) {
            const prodDb = JSON.parse(fs.readFileSync(productsDbPath, 'utf8'));
            prodDb.variants = prodVariants;
            fs.writeFileSync(productsDbPath, JSON.stringify(prodDb, null, 2), 'utf8');
        }

        res.json({ success: true, count: newVariants.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES UTILISATEURS (stockage JSON — MongoDB supprimé) ---
app.get('/api/users', (req, res) => {
    try {
        const db = readUsersDB();
        res.json(db.users || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users', (req, res) => {
    try {
        const db = readUsersDB();
        const newUser = { ...req.body, id: 'USR-' + Date.now() };
        db.users.push(newUser);
        writeUsersDB(db);
        res.json({ success: true, user: newUser });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id', (req, res) => {
    try {
        const db = readUsersDB();
        const idx = db.users.findIndex(u => u.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: "Utilisateur non trouvé" });
        db.users[idx] = { ...db.users[idx], ...req.body, id: req.params.id };
        writeUsersDB(db);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', (req, res) => {
    try {
        const db = readUsersDB();
        db.users = db.users.filter(u => u.id !== req.params.id);
        writeUsersDB(db);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/erp/sync_shopify', async (req, res) => {
    const { sku } = req.body;
    const db = await readProductsDB();
    const variant = db.variants.find(v => v.sku === sku);
    if (!variant) return res.status(404).json({ error: "Variante non trouvée" });

    try {
        const headers = await getShopifyHeaders();

        // 1. Chercher si le produit existe déjà par SKU
        const searchRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?sku=${sku}`, { headers });
        const searchData = await searchRes.json();
        const existingProduct = searchData.products ? searchData.products[0] : null;

        const productPayload = {
            product: {
                title: `${variant.modelName} - ${variant.compositionPrimary || 'Matière'} - ${variant.idColor || variant['plm-color'] || '000'}`,
                body_html: `<strong>Fiche Technique Tiraboschi</strong><br>Matière: ${variant.compositionPrimary}<br>Origine: ${variant.countryOrigin}`,
                vendor: "Tiraboschi",
                product_type: "Maroquinerie",
                status: "active",
                variants: [{
                    sku: variant.sku,
                    price: variant.priceEur || "0.00",
                    inventory_management: "shopify",
                    option1: variant.idColor,
                    option2: variant.idSize
                }],
                options: [
                    { name: "Couleur", values: [variant.idColor] },
                    { name: "Taille", values: [variant.idSize] }
                ]
            }
        };

        let result;
        if (existingProduct) {
            // Update
            const updateRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products/${existingProduct.id}.json`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(productPayload)
            });
            result = await updateRes.json();
        } else {
            // Create
            const createRes = await fetch(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json`, {
                method: 'POST',
                headers,
                body: JSON.stringify(productPayload)
            });
            result = await createRes.json();
        }

        // 2. Récupérer les prix calculés par Shopify (ex: via Markets)
        // Note: Dans un environnement réel, on lirait les 'presentment_prices' ou via GraphQL
        // Ici on simule la récupération du prix Shopify mis à jour
        const updatedVariant = result.product.variants.find(v => v.sku === sku);
        if (updatedVariant) {
            variant.shopifyId = result.product.id;
            variant.shopifyVariantId = updatedVariant.id;
            variant.priceShopify = updatedVariant.price;
            if (result.product.image) {
                variant.shopifyImage = result.product.image.src;
            } else if (result.product.images && result.product.images.length > 0) {
                variant.shopifyImage = result.product.images[0].src;
            }
            await writeProductsDB(db);
        }

        res.json({ success: true, product: result.product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => console.log(`Serveur Tiraboschi v2.0 sur http://localhost:${port}`));
