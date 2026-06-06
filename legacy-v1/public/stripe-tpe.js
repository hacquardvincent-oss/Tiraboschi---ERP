
/* =========================================
   STRIPE TERMINAL CONNECTOR
   ========================================= */
window.terminal = null;
window.terminalStatus = 'disconnected';

/**
 * APP.JS - VERSION ULTIME - SYSTÈME TIRABOSCHI OPS
 * Restoration de toutes les fonctionnalités Premium, MRP et Synchro Shopify.
 */

// 1. CONFIGURATION & CONSTANTES D'IDENTIFICATION
// 1. CONFIGURATION & CONSTANTES D'IDENTIFICATION
let ID_MAPS = {};
window.erpConfig = {};

let appUsers = [];
window.currentUser = null;
let pin = "";
let vendorName = "";
let inventory = [];
let collection = [];
let customersList = [];
let cart = [];
let currentCurrency = 'usd';
window.selectedCustomer = null;
let originalSKU = null;
let terminal = null;
let isServerOnline = false;
let terminalStatus = 'not_connected';

let currentLang = localStorage.getItem('appLang') || 'en';

setTimeout(() => {
    const btn = document.getElementById('btn-lang-toggle');
    if (btn) btn.innerText = currentLang === 'en' ? '🇺🇸' : '🇫🇷';
}, 100);

window.translations = {
    fr: {
        "Accueil": "Accueil",
        "Caisse": "Caisse",
        "Collection": "Collection",
        "Clients": "Clients",
        "Ventes": "Ventes",
        "OPS": "OPS",
        "Admin": "Admin",
        "Nouveau Client": "+ Nouveau Client",
        "Créer Nouveau Modèle": "+ Créer Nouveau Modèle",
        "Annuaire Clients": "Annuaire Clients",
        "Panier": "Panier",
        "Rechercher": "Rechercher",
        "Réinitialiser": "Réinitialiser",
        "Noir": "Noir", "Rouge": "Rouge", "Bleu": "Bleu", "Vert": "Vert", "Blanc": "Blanc",
        "Cacahuète": "Cacahuète", "Loutre": "Loutre", "Veau": "Veau", "Taurillon": "Taurillon", "Chèvre": "Chèvre",
        "Pochon": "Pochon", "Chaîne": "Chaîne", "Cuir": "Cuir", "Expédié": "Expédié", "Sur Place": "Sur Place",
        "avec": "avec",
        "Accepte le marketing par email (RGPD)": "Accepte le marketing par email (RGPD)",
        "Accepte le marketing par SMS (RGPD)": "Accepte le marketing par SMS (RGPD)",
        "Notes sur le client (goûts, habitudes...)": "Notes sur le client (goûts, habitudes...)",
        "Note sur la commande": "Note sur la commande",
        "Instructions spéciales, options choisies...": "Instructions spéciales, options choisies..."
    },
    en: {
        "Accueil": "Home",
        "Caisse": "POS",
        "Collection": "Collection",
        "Clients": "Customers",
        "Ventes": "Sales",
        "OPS": "OPS",
        "Admin": "Admin",
        "Nouveau Client": "+ New Customer",
        "Créer Nouveau Modèle": "+ New Model",
        "Annuaire Clients": "Customer Directory",
        "Panier": "Cart",
        "Rechercher": "Search",
        "Réinitialiser": "Reset",
        "Noir": "Black", "Rouge": "Red", "Bleu": "Blue", "Vert": "Green", "Blanc": "White",
        "Cacahuète": "Peanut", "Loutre": "Otter", "Veau": "Calf", "Taurillon": "Bullcalf", "Chèvre": "Goat",
        "Pochon": "Pouch", "Chaîne": "Chain", "Cuir": "Leather", "Expédié": "Shipped", "Sur Place": "In Store",
        "avec": "with",
        "Accepte le marketing par email (RGPD)": "Accepts email marketing (GDPR)",
        "Accepte le marketing par SMS (RGPD)": "Accepts SMS marketing (GDPR)",
        "Notes sur le client (goûts, habitudes...)": "Customer notes (tastes, habits...)",
        "Note sur la commande": "Order note",
        "Instructions spéciales, options choisies...": "Special instructions, chosen options..."
    }
};

window.translateTerm = function (term, lang) {
    if (!term || typeof term !== 'string') return term;
    const isEn = lang === 'en';

    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let translated = term;
    Object.keys(window.translations.fr).forEach(k => {
        const frTerm = window.translations.fr[k];
        const enTerm = window.translations.en[k];
        if (frTerm && enTerm && frTerm !== enTerm) {
            const searchStr = isEn ? frTerm : enTerm;
            const replaceStr = isEn ? enTerm : frTerm;
            const regex = new RegExp(`\\b${escapeRegExp(searchStr)}\\b`, 'gi');
            translated = translated.replace(regex, replaceStr);
        }
    });
    return translated;
};

window.setLanguage = function (lang) {
    window.currentLang = lang;
    localStorage.setItem('appLang', lang);
    const isEn = lang === 'en';

    const btn = document.getElementById('btn-lang-toggle');
    if (btn) btn.innerText = isEn ? '🇺🇸' : '🇫🇷';

    // Translate placeholders
    document.querySelectorAll('[placeholder]').forEach(el => {
        let originalKey = el.getAttribute('data-i18n-ph');
        if (!originalKey) {
            const phText = el.getAttribute('placeholder');
            const frEntry = Object.entries(window.translations.fr).find(([k, v]) => v === phText);
            const enEntry = Object.entries(window.translations.en).find(([k, v]) => v === phText);
            if (frEntry) originalKey = frEntry[0];
            else if (enEntry) originalKey = enEntry[0];
            if (originalKey) el.setAttribute('data-i18n-ph', originalKey);
        }
        if (originalKey && window.translations[lang][originalKey]) {
            el.setAttribute('placeholder', window.translations[lang][originalKey]);
        }
    });

    // Bascule de la devise
    if (typeof switchCurrency === 'function') {
        switchCurrency(isEn ? 'usd' : 'eur');
    }

    // Traduction DOM basique
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
        const text = node.nodeValue.trim();
        if (text) {
            let originalKey = node.parentElement.getAttribute('data-i18n');
            if (!originalKey) {
                const frEntry = Object.entries(window.translations.fr).find(([k, v]) => v === text);
                const enEntry = Object.entries(window.translations.en).find(([k, v]) => v === text);
                if (frEntry) originalKey = frEntry[0];
                else if (enEntry) originalKey = enEntry[0];

                if (originalKey) node.parentElement.setAttribute('data-i18n', originalKey);
            }
            if (originalKey && window.translations[lang][originalKey]) {
                node.nodeValue = node.nodeValue.replace(text, window.translations[lang][originalKey]);
            }
        }
    }
};

window.toggleLanguage = function () {
    const isEn = window.currentLang === 'en';
    window.setLanguage(isEn ? 'fr' : 'en');
};// 2. ÉTAT DE CONNEXION GLOBAL (SERVEUR + STRIPE)
async function checkGlobalStatus() {
    const badge = document.getElementById('connection-status');
    if (!badge) return;
    try {
        const res = await fetch('/api/health');
        const data = await res.json();
        isServerOnline = data.status === 'ok';

        if (window.currentUser) {
            const userRes = await fetch('/api/users?_t=' + Date.now());
            const usersData = await userRes.json();
            const me = usersData.find(u => u.id === window.currentUser.id);
            if (!me || me.isBlocked) {
                window.currentUser = null;
                alert("Votre session a été déconnectée (compte bloqué ou supprimé).");
                window.location.reload();
            }
        }
    } catch (e) { isServerOnline = false; }

        const sdkBadge = document.getElementById('connection-status-sdk');
    if (sdkBadge) {
        if (!isServerOnline) {
            sdkBadge.className = 'status-badge disconnected';
            sdkBadge.innerHTML = '<span class="dot"></span> STRIPE API HORS-LIGNE';
        } else {
            sdkBadge.className = 'status-badge connected';
            sdkBadge.innerHTML = '<span class="dot"></span> STRIPE API OK';
        }
    }

    if (!isServerOnline) {
        badge.className = 'status-badge disconnected';
        badge.innerHTML = '<span class="dot"></span> SERVEUR HORS-LIGNE';
    } else if (terminalStatus !== 'connected') {
        badge.className = 'status-badge disconnected';
        badge.innerHTML = `<span class="dot"></span> ${terminalStatus === 'connecting' ? 'Recherche TPE...' : 'TPE DÉCONNECTÉ'}`;
    } else {
        badge.className = 'status-badge connected';
        badge.innerHTML = '<span class="dot"></span> TPE CONNECTÉ';
    }
}

function updateConnectionStatus(status) {
    terminalStatus = status;
    checkGlobalStatus();
}

// 3. STRIPE TERMINAL INITIALIZATION
async function initializeTerminal() {
    if (typeof StripeTerminal === 'undefined') return;
    terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => {
            const res = await fetch('/api/connection_token', { method: 'POST' });
            const data = await res.json();
            return data.secret;
        },
        onUnexpectedReaderDisconnect: () => {
            updateConnectionStatus('not_connected');
        },
        onConnectionStatusChange: (event) => {
            updateConnectionStatus(event.status);
        }
    });
    discoverReaders();
}

async function discoverReaders() {
    if (!terminal) return;
    updateConnectionStatus('connecting');
    const locRes = await fetch('/api/locations', { method: 'POST' }); const locData = await locRes.json(); const locations = locData.locations || []; let config = { simulated: true }; if (locations.length > 0) { config = { simulated: false, location: locations[0].id }; } const discoverResult = await terminal.discoverReaders(config);
    if (discoverResult.discoveredReaders && discoverResult.discoveredReaders.length > 0) {
        await terminal.connectReader(discoverResult.discoveredReaders[0]);
    } else {
        updateConnectionStatus('not_connected');
    }
}



// Expose these to window so app.js can use them
window.initializeTerminal = initializeTerminal;
window.updateConnectionStatus = updateConnectionStatus;

// --- PAIEMENT STRIPE TERMINAL ---
window.charge = async function() {
    if (!terminal || terminalStatus !== 'connected') {
        alert("TPE non connecté. Veuillez vérifier la connexion.");
        return;
    }
    if (cart.length === 0) {
        alert("Le panier est vide.");
        return;
    }

    const btnCharge = document.getElementById('btn-charge');
    if (btnCharge) btnCharge.disabled = true;

    try {
        updateConnectionStatus('charging');

        const statusEl = document.getElementById('payment-status');
        const titleEl = document.getElementById('status-title');
        const msgEl = document.getElementById('status-message');
        
        statusEl.classList.remove('hidden');
        const btnCancel = document.getElementById('btn-cancel');
        if (btnCancel) btnCancel.classList.remove('hidden');
        titleEl.innerText = "En attente du client";
        msgEl.innerText = "Veuillez demander au client de passer sa carte sur le lecteur.";

        const amount = window.checkoutFinalTotal || cart.reduce((s, i) => s + i.price, 0);

        // 1. Create PaymentIntent on server
        const res = await fetch('/api/create_payment_intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount, currency: currentCurrency })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // 2. Collect PaymentMethod
        titleEl.innerText = "Présentez la carte";
        const collectResult = await terminal.collectPaymentMethod(data.client_secret);
        if (collectResult.error) {
            throw new Error(collectResult.error.message);
        }

        // 3. Process Payment
        titleEl.innerText = "Traitement en cours...";
        msgEl.innerText = "Veuillez patienter...";
        const processResult = await terminal.processPayment(collectResult.paymentIntent);
        
        if (processResult.error) {
            throw new Error(processResult.error.message);
        } else if (processResult.paymentIntent) {
            // 4. Capture Payment on server
            titleEl.innerText = "Capture du paiement...";
            const captureRes = await fetch('/api/capture_payment_intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_intent_id: processResult.paymentIntent.id })
            });
            const captureData = await captureRes.json();
            
            if (captureData.error) throw new Error(captureData.error);
            
            // Save local sale
            const salesRes = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amount / 100,
                    currency: currentCurrency,
                    items: cart,
                    customer: window.selectedCustomer,
                    vendorId: window.currentUser ? window.currentUser.id : null,
                    vendorName: window.currentUser ? (window.currentUser.firstName || window.currentUser.name) : 'Inconnu',
                    paymentIntentId: processResult.paymentIntent.id
                })
            });
            const salesData = await salesRes.json();
            if (!salesRes.ok || salesData.error) {
                throw new Error(salesData.error || "Erreur lors de l'enregistrement de la vente.");
            }

            titleEl.innerText = "Paiement réussi !";
            msgEl.innerText = "La transaction a été validée avec succès.";
            
            cart = [];
            renderCart();
            document.getElementById('cart-subtotal').innerText = "$0.00";
            document.getElementById('cart-shipping').innerText = "$0.00";
            document.getElementById('cart-duties').innerText = "$0.00";
            document.getElementById('cart-tax').innerText = "$0.00";
            document.getElementById('cart-total-amount').innerText = "$0.00";
            
            // Clear selected customer
            window.selectedCustomer = null;
            if (document.getElementById('cust-firstname')) document.getElementById('cust-firstname').value = "";
            if (document.getElementById('cust-lastname')) document.getElementById('cust-lastname').value = "";
            if (document.getElementById('cust-email')) document.getElementById('cust-email').value = "";
            if (document.getElementById('cust-zip')) document.getElementById('cust-zip').value = "";
            
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 3000);
        }
    } catch (e) {
        console.error("Payment error", e);
        const statusEl = document.getElementById('payment-status');
        const titleEl = document.getElementById('status-title');
        const msgEl = document.getElementById('status-message');
        titleEl.innerText = "Erreur de paiement";
        msgEl.innerText = e.message || "Une erreur est survenue";
        
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 5000);
    } finally {
        if (btnCharge) btnCharge.disabled = false;
        const btnCancel = document.getElementById('btn-cancel');
        if (btnCancel) btnCancel.classList.add('hidden');
        if (terminalStatus === 'charging') {
            updateConnectionStatus('connected');
        } else {
            checkGlobalStatus();
        }
    }
};

window.generatePaymentLink = async function() {
    const btn = document.getElementById('btn-payment-link');
    const originalText = btn ? btn.innerText : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Génération en cours...";
        btn.style.opacity = "0.7";
    }

    const showError = (msg) => {
        if (btn) {
            btn.innerText = "❌ Erreur";
            btn.style.backgroundColor = "var(--danger)";
            btn.style.borderColor = "var(--danger)";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
                btn.style.borderColor = "";
                btn.disabled = false;
                btn.style.opacity = "1";
            }, 3000);
        }
        alert(msg); // Fallback
    };

    try {
        const currentCart = window.cart || (typeof cart !== 'undefined' ? cart : []);
        if (!currentCart || currentCart.length === 0) {
            throw new Error("Le panier est vide.");
        }
        
        const amount = window.checkoutFinalTotal || currentCart.reduce((s, i) => s + (i.price || 0), 0);
        if (amount <= 0) {
            throw new Error("Le montant doit être supérieur à 0.");
        }
        
        const isUSD = document.getElementById('btn-usd')?.classList.contains('active');
        const curr = isUSD ? 'usd' : 'eur';

        const res = await fetch('/api/create_payment_link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: currentCart,
                amount: amount, // Envoi en centimes (comme le reste)
                currency: curr,
                customer_email: window.selectedCustomer ? window.selectedCustomer.email : '',
                customer: window.selectedCustomer || null,
                vendorId: window.currentUser ? window.currentUser.id : null,
                vendorName: window.currentUser ? (window.currentUser.firstName || window.currentUser.name) : 'Inconnu'
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const linkInput = document.getElementById('generated-payment-link');
        if (linkInput) linkInput.value = data.url;
        
        const inlinePanel = document.getElementById('inline-payment-link');
        if (inlinePanel) {
            inlinePanel.classList.remove('hidden');
        } else {
            alert("Lien de paiement généré :\n" + data.url);
        }

        if (btn) {
            btn.innerText = "✓ Lien Généré";
            btn.style.backgroundColor = "#25D366";
            btn.style.borderColor = "#25D366";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
                btn.style.borderColor = "";
                btn.disabled = false;
                btn.style.opacity = "1";
            }, 2000);
        }

        // Start polling for payment link status
        if (window.paymentLinkInterval) clearInterval(window.paymentLinkInterval);
        
        let pollCount = 0;
        const maxPolls = 120; // 10 minutes (120 * 5s)
        
        window.paymentLinkInterval = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                clearInterval(window.paymentLinkInterval);
                return;
            }
            try {
                const checkRes = await fetch(`/api/check_payment_link/${data.session_id}`);
                const checkData = await checkRes.json();
                
                if (checkData.payment_status === 'paid') {
                    clearInterval(window.paymentLinkInterval);
                    
                    alert("Paiement via lien reçu avec succès ! La vente est enregistrée en arrière-plan par Stripe.");
                    
                    // Reset cart
                    if (typeof cart !== 'undefined') {
                        cart.splice(0, cart.length);
                    } else if (window.cart) {
                        window.cart.splice(0, window.cart.length);
                    }
                    if (typeof renderCart === 'function') renderCart();
                    
                    // Clear selected customer
                    window.selectedCustomer = null;
                    if (document.getElementById('cust-firstname')) document.getElementById('cust-firstname').value = "";
                    if (document.getElementById('cust-lastname')) document.getElementById('cust-lastname').value = "";
                    if (document.getElementById('cust-email')) document.getElementById('cust-email').value = "";
                    if (document.getElementById('cust-zip')) document.getElementById('cust-zip').value = "";
                    
                    if (document.getElementById('inline-payment-link')) {
                        document.getElementById('inline-payment-link').classList.add('hidden');
                    }
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        }, 5000);

    } catch (e) {
        console.error("Erreur génération lien", e);
        showError(e.message);
    }
};

window.copyPaymentLink = function() {
    const linkInput = document.getElementById('generated-payment-link');
    if (!linkInput) return;
    
    const isUSD = document.getElementById('btn-usd')?.classList.contains('active');
    
    // Uniquement le lien pour le bouton Copier
    const textToCopy = linkInput.value;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(isUSD ? "Link copied!" : "Lien copié dans le presse-papier !");
        }).catch(() => {
            linkInput.select();
            document.execCommand("copy");
            alert(isUSD ? "Link copied!" : "Lien copié dans le presse-papier !");
        });
    } else {
        linkInput.select();
        document.execCommand("copy");
        alert(isUSD ? "Link copied!" : "Lien copié dans le presse-papier !");
    }
};

window.shareWhatsapp = function() {
    const link = document.getElementById('generated-payment-link');
    if (!link || !link.value) return;
    
    const isUSD = document.getElementById('btn-usd')?.classList.contains('active');
    const text = isUSD 
        ? `Hello, here is your secure payment link for your Tiraboschi order: ${link.value}`
        : `Bonjour, voici votre lien de paiement sécurisé pour votre commande Tiraboschi : ${link.value}`;
        
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};
window.cancelCharge = async function() {
    if (!terminal) return;
    try {
        await terminal.cancelCollectPaymentMethod();
        const titleEl = document.getElementById('status-title');
        const msgEl = document.getElementById('status-message');
        if (titleEl) titleEl.innerText = "Annulation...";
        if (msgEl) msgEl.innerText = "Annulation de la transaction sur le lecteur...";
    } catch (err) {
        console.error("Cancel error", err);
    }
};

