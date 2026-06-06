
/* =========================================
   AUTHENTICATION CONNECTOR
   ========================================= */
window.currentUser = null;

// 4. AUTHENTIFICATION & LOGIN
window.login = async (email, password) => {
    try {
        const res = await fetch('/api/users?_t=' + Date.now());
        appUsers = await res.json();
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPassword = (password || '').trim();
        let user = appUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail && (u.password || '').trim() === cleanPassword);

        // Fallback administrateur de secours (bypass BDD)
        if (cleanEmail === 'admin_secours' && cleanPassword === 'admin') {
            user = {
                firstName: "Admin",
                lastName: "Secours",
                name: "Admin Secours",
                email: "admin_secours",
                password: "admin",
                role: "admin",
                permissions: ["caisse", "collection", "stock", "ventes", "admin"],
                commission: "0"
            };
        }

        if (!user) {
            alert("Email ou Mot de passe incorrect");
            return;
        }
        if (user.isBlocked) {
            alert("Ce compte a été bloqué par l'administrateur.");
            return;
        }

        vendorName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.name;
        window.currentUser = user;

        document.getElementById('current-vendor').innerText = `Vendeur : ${vendorName}`;
        document.getElementById('dashboard-welcome').innerText = `Bonjour ${vendorName.split(' ')[0]} 👋`;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');

        // Control access based on permissions
        const perms = user.permissions || [];

        const caisseBtn = document.querySelector('.nav-btn[data-target="section-payment"]');
        if (caisseBtn) caisseBtn.style.display = (perms.includes('caisse') || user.role === 'admin') ? 'flex' : 'none';

        const clientsBtn = document.querySelector('.nav-btn[data-target="section-customers"]');
        if (clientsBtn) clientsBtn.style.display = (perms.includes('caisse') || user.role === 'admin') ? 'flex' : 'none';

        const ventesBtn = document.querySelector('.nav-btn[data-target="section-history"]');
        if (ventesBtn) ventesBtn.style.display = (perms.includes('caisse') || user.role === 'admin') ? 'flex' : 'none';

        const collectionBtn = document.querySelector('.nav-btn[data-target="section-inventory"]');
        if (collectionBtn) collectionBtn.style.display = (perms.includes('produit') || user.role === 'admin') ? 'flex' : 'none';

        const erpBtn = document.querySelector('.nav-btn[data-target="section-erp"]');
        if (erpBtn) erpBtn.style.display = (perms.includes('logistique') || user.role === 'admin') ? 'flex' : 'none';

        const adminBtn = document.querySelector('.nav-btn[data-target="section-admin"]');
        if (adminBtn) adminBtn.style.display = (user.role === 'admin') ? 'flex' : 'none';

        if (typeof switchCurrency === 'function') {
            switchCurrency(currentLang === 'fr' ? 'eur' : 'usd');
        }

        init();
        initializeTerminal();
        showSection('section-dashboard');
    } catch (e) {
        console.error(e);
        alert("Erreur de connexion");
    }
}


