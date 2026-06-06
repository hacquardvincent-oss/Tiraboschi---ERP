

// 5. NAVIGATION SPA (ROUTAGE GLOBAL)
function showSection(sectionId) {
    document.querySelectorAll('.modal').forEach(m => {
        // Ne pas fermer la fiche technique si on va vers l'ERP (pour config)
        if (m.id === 'modal-product-sheet' && sectionId === 'section-erp') return;
        m.classList.add('hidden');
        m.style.display = 'none';
    });
    document.querySelectorAll('.app-section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    if (sectionId === 'section-dashboard') loadReporting();
    if (sectionId === 'section-payment') loadProducts(currentCurrency);
    if (sectionId === 'section-inventory') loadCollection();
    if (sectionId === 'section-customers') loadCustomers();
    if (sectionId === 'section-history') loadHistory();
    if (sectionId === 'section-erp') loadERPModule('dash');
    if (sectionId === 'section-admin') loadAdminModule('config');
}

window.loadAdminModule = async (tab) => {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.admin-tab[data-admin="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.admin-content').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
    });

    const targetId = tab === 'config' ? 'admin-config' : 'admin-users';
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
    }

    if (tab === 'config') {
        renderConfigTable();
    } else if (tab === 'users') {
        loadUsers();
    }
}

window.loadERPModule = async (tab) => {
    // Clean active states for buttons
    document.querySelectorAll('.erp-tab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.erp-tab[data-erp="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Hide all contents
    document.querySelectorAll('.erp-content').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
    });

    // Target ID mapping based on data-erp
    const targetId = tab === 'dash' ? 'erp-dash' : tab === 'mat' ? 'erp-materials' : tab === 'prod' ? 'erp-prod' : 'erp-log';
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
    }

    if (tab === 'dash') {
        try {
            const matRes = await fetch('/api/erp/materials');
            const materials = await matRes.json();
            const grouped = {};
            materials.forEach(m => {
                const isBijou = m.isJewelry || (m.category && (m.category.toLowerCase() === 'bijoux' || m.category.toLowerCase() === 'bijouterie'));
                const animal = (m.animal || m.category || 'Général').trim().replace(/^Peaux\s+/i, '');
                const key = isBijou ? `Bijoux_${m.detail || m.leather_type || 'Standard'}_${m.color}` : `Peaux_${animal}_${m.leather_type || ''}_${m.color}`;
                const labelMat = `${animal} ${m.leather_type ? m.leather_type + ' ' : ''}${m.color}`.trim();
                if (!grouped[key]) grouped[key] = { isBijou, label: isBijou ? `${m.detail || m.leather_type || 'Standard'} ${m.color}` : labelMat, qty: 0 };
                let r = parseFloat(m.rolls !== undefined ? m.rolls : (m.quantity || 0));
                let f = parseFloat(m.feet || 0);
                if (isNaN(r)) r = 0;
                if (isNaN(f)) f = 0;
                if (r === 0 && f > 0) r = 1;
                grouped[key].qty += r;
            });
            const rupturesMat = Object.values(grouped).filter(g => !g.isBijou && g.qty <= 0);
            const rupturesPieces = Object.values(grouped).filter(g => g.isBijou && g.qty <= 0);

            const prodRes = await fetch('/api/erp/production_orders');
            const prods = await prodRes.json();

            const alertMat = document.getElementById('erp-stat-mat-alert');
            if (alertMat) {
                alertMat.querySelector('.stat-value').innerText = rupturesMat.length;
                alertMat.onclick = () => {
                    if (rupturesMat.length === 0) return alert("Aucune rupture Matière.");
                    alert("Liste de Rachat (Matières):\n" + rupturesMat.map(g => `- ${g.label}`).join("\n"));
                };
            }

            const alertPieces = document.getElementById('erp-stat-pieces-alert');
            if (alertPieces) {
                alertPieces.querySelector('.stat-value').innerText = rupturesPieces.length;
                alertPieces.onclick = () => {
                    if (rupturesPieces.length === 0) return alert("Aucune rupture Pièces.");
                    alert("Relance Production (Pièces):\n" + rupturesPieces.map(g => `- Bijoux ${g.label}`).join("\n"));
                };
            }

            const countProd = document.getElementById('erp-stat-prod-count');
            if (countProd) countProd.querySelector('.stat-value').innerText = prods.length;
        } catch (e) { console.error(e); }
    }
    else if (tab === 'mat') {
        populateSelect('filter-mat-animal', window.erpConfig.animalTypes);
        populateSelect('filter-mat-type', window.erpConfig.skinTypes);
        populateSelect('filter-mat-jewelry', window.erpConfig.jewelry);
        populateSelect('filter-mat-color', window.erpConfig.colors);
        try {
            const matRes = await fetch('/api/erp/materials');
            window.erpMaterials = await matRes.json();
            renderERPMaterials();

            const moveRes = await fetch('/api/erp/movements');
            window.erpMovements = await moveRes.json();
            window.renderERPMovements();
        } catch (e) { console.error(e); }
    }
    else if (tab === 'prod') {
        const list = document.getElementById('erp-production-list');
        if (!list) return;
        list.innerHTML = '<p class="loading-text">Chargement...</p>';
        try {
            const prodRes = await fetch('/api/erp/production_orders');
            const prods = await prodRes.json();

            list.innerHTML = '';
            // Group by atelier
            const groups = {};
            prods.forEach(p => {
                const at = p.atelier || 'Atelier Inconnu';
                if (!groups[at]) groups[at] = [];
                groups[at].push(p);
            });
            for (const [atelier, items] of Object.entries(groups)) {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div style="flex:1;"><strong>${atelier} : ${items.length} colis à préparer</strong></div>
                    <button class="btn secondary small-btn">Détails</button>
                `;
                list.appendChild(div);
            }
        } catch (e) { console.error(e); }
    }
    else if (tab === 'log') {
        try {
            const moveRes = await fetch('/api/erp/movements');
            window.erpMovements = await moveRes.json();
            window.renderERPPiecesMovements();

            const colRes = await fetch('/api/erp/collection');
            collection = await colRes.json();
            window.renderERPStockPieces();
        } catch (e) { console.error(e); }
    }
    else if (tab === 'config') {
        loadERPConfig();
    }
    else if (tab === 'users') {
        window.loadUsers();
    }
};

window.renderERPMaterials = () => {
    if (typeof window.matVisibleCount === 'undefined') window.matVisibleCount = 20;
    const list = document.getElementById('erp-materials-list');
    if (!list) return;

    if (!window.erpMaterials || window.erpMaterials.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucune matière en stock.</p>';
        return;
    }

    const searchVal = document.getElementById('search-materials')?.value.toLowerCase() || '';

    const filtered = window.erpMaterials.filter(m => {
        if (!searchVal) return true;
        const txt = ((m.category || '') + ' ' + (m.animal || '') + ' ' + (m.leather_type || '') + ' ' + (m.color || '') + ' ' + (m.location || '') + ' ' + (m.id || '')).toLowerCase();
        return txt.includes(searchVal);
    });

    if (filtered.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucun résultat.</p>';
        return;
    }

    list.innerHTML = '';

    const groups = {};
    filtered.forEach(m => {
        let groupName = 'Autre';
        if (m.category && (m.category.toLowerCase() === 'peaux' || m.category.toLowerCase() === 'peau')) {
            if (m.animal && m.leather_type) {
                groupName = `${m.animal} ${m.leather_type}`;
            } else if (m.animal) {
                groupName = `${m.animal}`;
            } else {
                groupName = 'Peaux';
            }
        } else if (m.category === 'Doublure' && m.animal) {
            groupName = `Doublure ${m.animal}`;
        } else if (m.category === 'Métal' || m.category === 'Bijouterie' || m.category === 'Bijoux') {
            groupName = `Bijoux (${m.detail || 'Standard'})`;
        } else {
            groupName = m.category || 'Autre';
        }

        const normalizedGroup = groupName.toLowerCase();
        let realGroupName = Object.keys(groups).find(k => k.toLowerCase() === normalizedGroup);
        if (!realGroupName) realGroupName = groupName;

        if (!groups[realGroupName]) groups[realGroupName] = [];
        groups[realGroupName].push(m);
    });

    const sortedGroups = Object.keys(groups).sort().reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
    }, {});

    let count = 0;
    const limit = window.matVisibleCount || 20;
    const entries = Object.entries(sortedGroups);
    for (const [groupName, items] of entries) {
        if (count >= limit) {
            const moreBtn = document.createElement('button');
            moreBtn.className = 'btn secondary';
            moreBtn.style.marginTop = '16px';
            moreBtn.innerText = 'Charger plus (' + (entries.length - count) + ' restants)';
            moreBtn.onclick = () => {
                window.matVisibleCount = limit + 20;
                renderERPMaterials();
            };
            list.appendChild(moreBtn);
            break;
        }
        count++;

        const total = items.reduce((sum, i) => {
            let r = parseFloat(i.rolls || i.quantity || 0);
            let f = parseFloat(i.feet || 0);
            if (isNaN(r)) r = 0;
            if (isNaN(f)) f = 0;
            if (r === 0 && f > 0) r = 1;
            return sum + r;
        }, 0);
        const unit = groupName.startsWith('Bijoux') ? 'unités' : 'rouleaux';

        const colorsMap = {};
        items.forEach(i => {
            const c = (i.color || 'N/A').trim();
            if (!colorsMap[c]) colorsMap[c] = [];
            colorsMap[c].push(i);
        });

        let colorHtml = '';
        Object.keys(colorsMap).sort().forEach(c => {
            const safeGrp = groupName.replace(/'/g, "\\'");
            const safeCol = c.replace(/'/g, "\\'");
            let totalRollsColor = 0;
            let totalFeetColor = 0;
            let itemsHtml = '';

            colorsMap[c].forEach((i, idx) => {
                const safeId = i.id || '';
                let rolls = parseFloat(i.rolls || i.quantity || 0);
                let feet = parseFloat(i.feet || 0);
                if (isNaN(rolls)) rolls = 0;
                if (isNaN(feet)) feet = 0;
                if (rolls === 0 && feet > 0) rolls = 1;

                totalRollsColor += rolls;
                totalFeetColor += feet;

                itemsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 8px 0; flex-wrap: wrap; gap: 8px;">
                        <span>Rouleau #${idx + 1} ${safeId ? `<small style="color:var(--text-muted); font-size:0.7rem;">(ID: ${safeId})</small>` : ''}</span>
                        <div style="display:flex; align-items:center; gap: 12px; flex-wrap: wrap;">
                            <span>${rolls} ${unit} ${feet > 0 ? `(${feet.toFixed(2)} pieds)` : ''}</span>
                            <button class="btn secondary small-btn" onclick="openStockEdit('${safeId}', '${safeGrp}', '${safeCol}', ${rolls}, ${feet})" style="padding: 4px 8px; font-size: 0.8rem; white-space: nowrap;">Modifier</button>
                        </div>
                    </div>
                `;
            });

            colorHtml += `
                <div style="margin-bottom: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;" onclick="this.nextElementSibling.classList.toggle('hidden'); const i = this.querySelector('.toggle-icon'); if(i) i.innerText = i.innerText === '▶' ? '▼' : '▶';">
                        <strong>${c}</strong>
                        <span>${totalRollsColor} ${unit} ${totalFeetColor > 0 ? `(${totalFeetColor.toFixed(2)} pieds)` : ''} <span class="toggle-icon">▶</span></span>
                    </div>
                    <div class="hidden" style="padding: 0 12px; border-left: 2px solid rgba(255,255,255,0.1); margin-left: 8px; margin-top: 4px;">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        });

        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'stretch';

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; cursor:pointer; padding:8px 0;" onclick="this.nextElementSibling.classList.toggle('hidden'); const i = this.querySelector('.toggle-icon'); if(i) i.innerText = i.innerText === '▶' ? '▼' : '▶';">
                <strong>${groupName}</strong>
                <span>${total} ${unit} <span class="toggle-icon">▶</span></span>
            </div>
            <div class="hidden" style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top:8px;">
                ${colorHtml}
            </div>
        `;
        list.appendChild(div);
    }

    const select = document.getElementById('erp-sortie-mat-select');
    if (select) {
        select.innerHTML = '<option value="">-- Choisir une matière --</option>';
        Object.keys(sortedGroups).forEach(groupName => {
            const colors = {};
            sortedGroups[groupName].forEach(m => {
                const c = (m.color || '').trim().toLowerCase();
                if (!colors[c]) colors[c] = m.color || 'Standard';
            });
            Object.values(colors).forEach(c => {
                select.innerHTML += `<option value="${groupName}|||${c}">${groupName} - ${c}</option>`;
            });
        });
    }
};

window.renderERPMovements = () => {
    const list = document.getElementById('erp-movements-history');
    if (!list) return;
    if (!window.erpMovements || window.erpMovements.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucun mouvement récent.</p>';
        return;
    }

    // Trier par date décroissante
    const sorted = [...window.erpMovements].sort((a, b) => new Date(b.date) - new Date(a.date));

    list.innerHTML = sorted.map(m => `
        <div class="list-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${m.group} - ${m.color}</strong><br>
                <small>${m.type === 'sortie' ? 'Sortie' : 'Entrée'} de ${m.qty} | Par: ${m.user} | ${new Date(m.date).toLocaleString('fr-FR')}</small>
            </div>
            ${m.type === 'sortie' ? `<button class="btn secondary small-btn" onclick="window.revertMovement('${m.id}')">Réinsérer</button>` : ''}
        </div>
    `).join('');
};

window.revertMovement = async (id) => {
    const move = window.erpMovements.find(m => m.id === id);
    if (!move) return;
    if (!confirm("Voulez-vous réinsérer ce composant en stock ?")) return;

    try {
        const res = await fetch('/api/erp/stock_movement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group: move.group,
                color: move.color,
                type: 'entree',
                qty: move.qty,
                user: (window.currentUser ? window.currentUser.firstName : 'Auto-Réinsertion')
            })
        });
        if (res.ok) {
            alert("Réinsertion effectuée !");
            if (move.group.startsWith('PIECE_')) loadERPModule('log');
            else loadERPModule('mat');
        } else {
            alert("Erreur lors de la réinsertion.");
        }
    } catch (e) { }
};

window.generateDisplayName = window.generateDisplayName = function (v) {
    if (!v) return 'Produit Inconnu';
    const model = v.modelName || 'Modèle';
    const matiere = v.compositionPrimary ? v.compositionPrimary.replace('Cuir ', '') : '';
    const couleur = v.idColor || v['plm-color'] || '';

    const option1Id = v['plm-option-1'];
    const optionName = window.erpConfig?.options?.find(o => o.id === option1Id)?.name || option1Id || '';
    const optionColor = v['plm-option-color-1'] || '';

    const baseName = `${model} ${matiere} ${couleur}`.trim().replace(/\s+/g, ' ');

    if (optionName && optionName !== 'STANDARD' && optionName !== 'AUCUNE' && optionName.trim() !== '') {
        const str = `${baseName} avec ${optionName} ${optionColor}`.trim().replace(/\s+/g, ' ');
        return window.translateTerm(str, window.currentLang || 'en');
    } else {
        const str = `${model} - ${matiere} - ${couleur}`.replace(/\s-\s-\s/g, ' - ').replace(/ - $/g, '').trim();
        return window.translateTerm(str, window.currentLang || 'en');
    }
};

window.renderERPStockPieces = () => {
    const list = document.getElementById('erp-pieces-list');
    if (!list) return;
    list.innerHTML = '';

    const models = {};
    collection.forEach(v => {
        if (!models[v.modelName]) models[v.modelName] = [];
        models[v.modelName].push(v);
    });

    Object.keys(models).sort().forEach(mName => {
        const variants = models[mName];
        const card = document.createElement('div');
        card.className = 'model-card-premium';
        card.innerHTML = `
            <div class="model-info">
                <div>
                    <div class="model-name">${mName}</div>
                    <div class="model-counts">${variants.length} déclinaison(s)</div>
                </div>
            </div>
            <div class="model-expanded-view hidden">
                ${variants.map(v => {
            const declName = window.generateDisplayName(v);
            const declKey = (v.modelName + '-' + (v.compositionPrimary ? v.compositionPrimary.replace('Cuir ', '') : 'MATIERE') + '-' + (v.idColor || v['plm-color'] || 'COULEUR') + '-' + (window.erpConfig?.options?.find(o => o.id === v['plm-option-1'])?.name || v['plm-option-1'] || 'STANDARD')).toUpperCase().replace(/\s+/g, '-');
            return `
                    <div class="declination-item" style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="declination-info">
                            <div class="decl-color" style="font-weight:bold;">${declName}</div>
                            <div class="decl-sku">Quantité: ${v.quantity || 0}</div>
                        </div>
                        <button class="btn secondary small-btn" onclick="window.openStockEditPieces('${declKey}', '${declName.replace(/'/g, "\\'")}')">Sortie Exceptionnelle</button>
                    </div>
                `}).join('')}
            </div>
        `;
        card.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') card.querySelector('.model-expanded-view').classList.toggle('hidden');
        };
        list.appendChild(card);
    });

    const select = document.getElementById('erp-sortie-pieces-select');
    if (select) {
        select.innerHTML = '<option value="">-- Choisir une pièce --</option>';
        Object.keys(models).sort().forEach(mName => {
            const variants = models[mName];
            variants.forEach(v => {
                const declName = window.generateDisplayName(v);
                const declKey = (v.modelName + '-' + (v.compositionPrimary ? v.compositionPrimary.replace('Cuir ', '') : 'MATIERE') + '-' + (v.idColor || v['plm-color'] || 'COULEUR') + '-' + (window.erpConfig?.options?.find(o => o.id === v['plm-option-1'])?.name || v['plm-option-1'] || 'STANDARD')).toUpperCase().replace(/\s+/g, '-');
                select.innerHTML += `<option value="${declKey}">${declName}</option>`;
            });
        });
    }
};

window.renderERPPiecesMovements = () => {
    const list = document.getElementById('erp-pieces-movements-history');
    if (!list) return;
    if (!window.erpMovements || window.erpMovements.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucun mouvement récent.</p>';
        return;
    }

    const sorted = [...window.erpMovements].filter(m => m.group.startsWith('PIECE_')).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sorted.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucun mouvement de pièces.</p>';
        return;
    }

    list.innerHTML = sorted.map(m => `
        <div class="list-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${m.color}</strong><br>
                <small>${m.type === 'sortie' ? 'Sortie' : 'Entrée'} de ${m.qty} | Par: ${m.user} | ${new Date(m.date).toLocaleString('fr-FR')}</small>
            </div>
            ${m.type === 'sortie' ? `<button class="btn secondary small-btn" onclick="window.revertMovement('${m.id}')">Réinsérer</button>` : ''}
        </div>
    `).join('');
};

window.openStockEditPieces = (declKey, declName) => {
    document.getElementById('stock-edit-title').innerText = declName || declKey;
    document.getElementById('stock-edit-group').value = 'PIECE_' + declKey;
    document.getElementById('stock-edit-color').value = declName || declKey;
    document.getElementById('stock-edit-qty').value = '';
    document.getElementById('stock-edit-type').value = 'sortie';
    document.getElementById('modal-stock-edit').classList.remove('hidden');
    document.getElementById('modal-stock-edit').style.display = 'flex';
};

window.openStockEdit = (id, group, color, currentRolls, currentFeet) => {
    document.getElementById('direct-edit-title').innerText = `${group} - ${color}`;
    document.getElementById('direct-edit-id').value = id;
    document.getElementById('direct-edit-group').value = group;
    document.getElementById('direct-edit-color').value = color;
    document.getElementById('direct-edit-qty').value = currentRolls || 0;
    document.getElementById('direct-edit-feet').value = currentFeet || 0;

    document.getElementById('modal-direct-edit').classList.remove('hidden');
    document.getElementById('modal-direct-edit').style.display = 'flex';
};

window.submitDirectEdit = async () => {
    const id = document.getElementById('direct-edit-id').value;
    const group = document.getElementById('direct-edit-group').value;
    const color = document.getElementById('direct-edit-color').value;
    const qty = parseFloat(document.getElementById('direct-edit-qty').value);
    const feet = parseFloat(document.getElementById('direct-edit-feet').value);

    try {
        const res = await fetch('/api/erp/materials/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, group, color, qty, feet })
        });
        if (res.ok) {
            document.getElementById('modal-direct-edit').classList.add('hidden');
            document.getElementById('modal-direct-edit').style.display = 'none';
            loadERPModule('mat');
        } else {
            alert("Erreur lors de la modification.");
        }
    } catch (e) {
        alert("Erreur de connexion.");
    }
};

window.resetMatFilters = () => {
    document.getElementById('search-materials').value = '';
    document.getElementById('filter-mat-cat').value = '';
    document.getElementById('filter-mat-animal').value = '';
    document.getElementById('filter-mat-type').value = '';
    document.getElementById('filter-mat-jewelry').value = '';
    document.getElementById('filter-mat-color').value = '';
    renderERPMaterials();
};

let receiptItemCount = 0;
window.openReceiveMaterialsModal = () => {
    document.getElementById('receipt-items-container').innerHTML = '';
    receiptItemCount = 0;
    populateSelect('receipt-supplier', window.erpConfig.suppliers);
    addReceiptItem();
    document.getElementById('modal-erp-receipt').classList.remove('hidden');
    document.getElementById('modal-erp-receipt').style.display = 'flex';
};

window.addReceiptItem = () => {
    receiptItemCount++;
    const id = receiptItemCount;
    const container = document.getElementById('receipt-items-container');
    const div = document.createElement('div');
    div.className = "material-block dynamic-section";
    div.id = `receipt-item-${id}`;

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4>Élément ${id}</h4>
            <button class="btn danger small-btn" onclick="document.getElementById('receipt-item-${id}').remove()">X</button>
        </div>
        <div class="input-group">
            <label>Catégorie</label>
            <select id="rec-cat-${id}" class="custom-input" onchange="toggleReceiptFields(${id})">
                <option value="Peaux">Peaux</option>
                <option value="Bijoux">Bijoux</option>
            </select>
        </div>
        <div id="rec-fields-${id}" class="form-grid"></div>
    `;
    container.appendChild(div);
    toggleReceiptFields(id);
};

window.toggleReceiptFields = (id) => {
    const cat = document.getElementById(`rec-cat-${id}`).value;
    const fields = document.getElementById(`rec-fields-${id}`);
    if (cat === 'Peaux') {
        fields.innerHTML = `
            <div class="input-group"><label>Matière</label><select id="rec-mat-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Type</label><select id="rec-type-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Détail</label><select id="rec-detail-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Coloris</label><select id="rec-color-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Pieds (Longueur)</label><input type="number" id="rec-feet-${id}" class="custom-input" step="0.01"></div>
            <div class="input-group"><label>Rouleaux (Qté)</label><input type="number" id="rec-qty-${id}" class="custom-input"></div>
        `;
        populateSelect(`rec-mat-${id}`, window.erpConfig.animalTypes);
        populateSelect(`rec-type-${id}`, window.erpConfig.skinTypes);
        populateSelect(`rec-detail-${id}`, window.erpConfig.materialDetails);
        populateSelect(`rec-color-${id}`, window.erpConfig.colors);
    } else {
        fields.innerHTML = `
            <div class="input-group"><label>Détails Bijou</label><select id="rec-detail-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Coloris</label><select id="rec-color-${id}" class="custom-input"></select></div>
            <div class="input-group"><label>Quantité</label><input type="number" id="rec-qty-${id}" class="custom-input"></div>
        `;
        populateSelect(`rec-detail-${id}`, window.erpConfig.jewelry);
        populateSelect(`rec-color-${id}`, window.erpConfig.colors);
    }
};

window.finalizeReceipt = async () => {
    const supplier = document.getElementById('receipt-supplier').value;
    const date = document.getElementById('receipt-date').value;
    if (!supplier || !date) return alert("Fournisseur et Date requis.");

    const items = [];
    for (let i = 1; i <= receiptItemCount; i++) {
        const catEl = document.getElementById(`rec-cat-${i}`);
        if (!catEl) continue;
        const cat = catEl.value;
        const feetInput = document.getElementById(`rec-feet-${i}`);
        let feet = 0;
        if (feetInput) feet = parseFloat(feetInput.value) || 0;

        let qty = parseFloat(document.getElementById(`rec-qty-${i}`).value);
        if (isNaN(qty) && feet > 0) qty = 1;
        else if (isNaN(qty)) continue;

        if (feet > 0) qty = Math.max(1, qty);

        const item = {
            category: cat,
            supplier: supplier,
            date: date,
            quantity: qty,
            rolls: qty,
            color: document.getElementById(`rec-color-${i}`).value,
        };
        if (cat === 'Peaux') {
            item.leather_type = document.getElementById(`rec-type-${i}`).value;
            item.animal = document.getElementById(`rec-mat-${i}`).value;
            item.detail = document.getElementById(`rec-detail-${i}`).value;
            item.feet = feet;
            item.location = "Entrepôt";
        } else {
            item.detail = document.getElementById(`rec-detail-${i}`).value;
            item.location = "Atelier Bijouterie";
        }
        items.push(item);
    }

    if (items.length === 0) return alert("Veuillez ajouter au moins un élément valide avec une quantité.");

    let recapMsg = `RÉCAPITULATIF - Bon de Livraison - ${date}
Fournisseur: ${supplier}
Total éléments: ${items.length}

Détails:
`;
    items.forEach(it => {
        if (it.category === 'Peaux') recapMsg += `- ${it.animal} ${it.leather_type} ${it.color} : ${it.rolls} rlx (${it.feet} pds)
`;
        else recapMsg += `- Bijoux ${it.detail} ${it.color} : ${it.quantity} pièces
`;
    });
    recapMsg += "\\nConfirmer la réception et l'incrémentation du stock ?";

    if (!confirm(recapMsg)) return;

    try {
        const res = await fetch('/api/erp/materials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        const resData = await res.json();
        if (resData.success) {
            alert("Réception validée avec succès ! Le stock a été mis à jour.");
            document.getElementById('modal-erp-receipt').classList.add('hidden');
            document.getElementById('modal-erp-receipt').style.display = 'none';
            if (window.loadERPMaterials) await window.loadERPMaterials();
        } else {
            alert("Erreur serveur.");
        }
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la réception.");
    }
};

// 6. MODULE CAISSE (POS)
let posSelection = { model: null, color: null, variant: null };

async function loadProducts(currency) {
    if (!collection || collection.length === 0) {
        // Fallback to fetch if collection not loaded
        try {
            const res = await fetch('/api/erp/collection');
            collection = await res.json();
        } catch (e) { }
    }
    if (document.getElementById('pos-step-1') && !document.getElementById('pos-step-1').classList.contains('hidden')) {
        renderPosStep1(true);
    } else if (document.getElementById('pos-step-2') && !document.getElementById('pos-step-2').classList.contains('hidden')) {
        renderPosStep2();
    } else if (document.getElementById('pos-step-3') && !document.getElementById('pos-step-3').classList.contains('hidden')) {
        renderPosStep3();
    }
}

window.posGoBack = function (step) {
    document.querySelectorAll('.pos-step').forEach(el => el.classList.add('hidden'));
    document.getElementById('pos-step-' + step).classList.remove('hidden');
    
    // Fallback if missing
        
    if (step === 1) document.getElementById('bc-model').innerText = "1. Modèle";
    if (step === 2) document.getElementById('bc-model').innerText = "2. Matière";
    if (step === 3) document.getElementById('bc-model').innerText = "3. Options";
    if (step === 4) document.getElementById('bc-model').innerText = "4. Couleur";
    if (step === 5) document.getElementById('bc-model').innerText = "5. Validation (" + window.getColorName(posSelection.variant.posColor) + ")";
}

window.renderPosStep1 = function (doNotResetView = false) {
    const grid = document.getElementById('pos-grid-models');
    if (!grid) return;

    if (!doNotResetView) posGoBack(1);

    const term = document.getElementById('search-catalog')?.value.toLowerCase() || '';
    let models = [...new Set(collection.filter(v => v.posModel).map(v => v.posModel))];
    if (term) {
        models = models.filter(m => {
            const matchModelName = m.toLowerCase().includes(term);
            const matchVariants = collection.some(v => v.posModel === m && (v.sku?.toLowerCase().includes(term) || v.modelName?.toLowerCase().includes(term)));
            return matchModelName || matchVariants;
        });
    }

    grid.innerHTML = '';
    if (models.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1;">Aucun modèle trouvé.</p>`;
        return;
    }

    models.forEach(m => {
        const card = document.createElement('div');
        card.className = 'btn secondary product-card grouped-card';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.padding = '24px 12px';
        card.innerHTML = `<span style="font-size: 1.2rem; font-weight: bold;">${m}</span>`;
        card.onclick = () => {
            const isUSD = document.getElementById('btn-usd')?.classList.contains('active');
            const zipInput = document.getElementById('cust-zip');
            if (isUSD && zipInput && !zipInput.value.trim()) {
                zipInput.style.border = '2px solid #ff4d4d';
                let msg = document.getElementById('zip-error-msg');
                if (!msg) {
                    msg = document.createElement('div');
                    msg.id = 'zip-error-msg';
                    msg.style.color = '#ff4d4d';
                    msg.style.fontSize = '0.85rem';
                    msg.style.marginTop = '4px';
                    msg.style.fontWeight = '500';
                    msg.innerText = 'Required for sales tax + validate';
                    zipInput.parentNode.appendChild(msg);
                }

                const btnValidate = document.getElementById('btn-validate-cust');
                if (btnValidate) {
                    btnValidate.style.backgroundColor = '#ff4d4d';
                    btnValidate.style.color = 'white';
                    btnValidate.style.transform = 'scale(1.05)';
                    setTimeout(() => {
                        btnValidate.style.backgroundColor = '';
                        btnValidate.style.color = '';
                        btnValidate.style.transform = '';
                    }, 1500);
                }

                zipInput.scrollIntoView({behavior: 'smooth', block: 'center'});
                return;
            } else if (zipInput) {
                zipInput.style.border = '';
                const msg = document.getElementById('zip-error-msg');
                if (msg) msg.remove();
            }

            posSelection.model = m;
            renderPosStep2();
        };
        grid.appendChild(card);
    });
}

window.renderPosStep2 = function () {
    posGoBack(2);
    const grid = document.getElementById('pos-grid-materials');
    grid.innerHTML = '';

    const materials = [...new Set(collection.filter(v => v.posModel === posSelection.model && v.posMaterial).map(v => v.posMaterial))];

    materials.forEach(mat => {
        const card = document.createElement('div');
        card.className = 'btn secondary product-card grouped-card';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.padding = '24px 12px';
        card.innerHTML = `<span style="font-size: 1.2rem; font-weight: bold;">${mat}</span>`;
        card.onclick = () => {
            posSelection.material = mat;
            renderPosStep3();
        };
        grid.appendChild(card);
    });
}

window.renderPosStep3 = function () {
    posGoBack(3);
    const grid = document.getElementById('pos-grid-options');
    grid.innerHTML = '';

    const options = [...new Set(collection.filter(v => v.posModel === posSelection.model && v.posMaterial === posSelection.material).map(v => v.posOption))];

    options.forEach(opt => {
        const label = opt ? opt : 'Standard';
        const card = document.createElement('div');
        card.className = 'btn secondary product-card variant-card';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.padding = '24px 12px';
        card.innerHTML = `<span style="font-size: 1.2rem; font-weight: bold;">${label}</span>`;
        card.onclick = () => {
            posSelection.option = opt;
            renderPosStep4();
        };
        grid.appendChild(card);
    });
}

window.renderPosStep4 = function () {
    posGoBack(4);
    
    const grid = document.getElementById('pos-grid-colors');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Hide checkout modes for step 4
    
    const variants = collection.filter(v => v.posModel === posSelection.model && v.posMaterial === posSelection.material && v.posOption === posSelection.option);

    variants.forEach(v => {
        const colorName = window.getColorName(v.posColor);
        const card = document.createElement('div');
        card.className = 'btn secondary product-card variant-card';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.padding = '24px 12px';
        card.innerHTML = `<span style="font-size: 1.2rem; font-weight: bold;">${colorName}</span>`;
        card.onclick = () => {
            posSelection.variant = v;
            renderPosStep5();
        };
        grid.appendChild(card);
    });
}

window.renderPosStep5 = async function () {
    posGoBack(5);
        
    const container = document.getElementById('pos-checkout-modes');
    container.innerHTML = '<p>Interrogation de Shopify en cours...</p>';

    const v = posSelection.variant;
    if (!v) return;

    try {
        const res = await fetch(`/api/shopify/product_by_sku/${v.sku}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Erreur inconnue");
        
        
        let shopifyPrice = parseFloat(v.price);
        if (isNaN(shopifyPrice) || shopifyPrice === 0) {
            shopifyPrice = parseFloat(v['plm-price-usd-ht']);
        }
        if (isNaN(shopifyPrice) || shopifyPrice === 0) {
            shopifyPrice = parseFloat(data.price) || 0;
            console.warn('Local price missing, using Shopify fallback');
        }
        container.innerHTML = '';

        
        const isUSD = document.getElementById('btn-usd')?.classList.contains('active');

        let priceSurPlace = shopifyPrice;
        let labelSurPlace = "Sur place (Take away)";
        let descSurPlace = `Prix Shopify: ${priceSurPlace.toFixed(2)} (Sales Tax calculée dans le panier)`;

        let priceExpedie = shopifyPrice + (window.erpConfig?.shippingCost !== undefined ? parseFloat(window.erpConfig.shippingCost) : 100);
        let labelExpedie = "Expédié (Shipped DDP)";
        let descExpedie = `Prix Shopify: ${shopifyPrice.toFixed(2)} + Frais de port (${(window.erpConfig?.shippingCost !== undefined ? parseFloat(window.erpConfig.shippingCost) : 100).toFixed(2)})`;

        const baseName = v.name || v.modelName || v.posModel || 'Produit';
        const translatedColor = window.getColorName ? window.getColorName(v.posColor) : v.posColor;
        const finalName = baseName.replace(v.posColor, translatedColor);

        const card1 = document.createElement('div');
        card1.className = 'product-card grouped-card';
        card1.style.cursor = 'pointer';
        card1.innerHTML = `
            <h3 style="color: var(--primary-color); margin-bottom: 8px;">🛍️ ${labelSurPlace}</h3>
            <p style="font-size: 1.5rem; font-weight: bold;">${priceSurPlace.toFixed(2)}</p>
            <p style="font-size: 0.85rem; opacity: 0.8;">${descSurPlace}</p>
        `;
        card1.onclick = () => {
            cart.push({ id: v.sku, sku: v.sku, name: `${finalName} (Sur Place)`, price: Math.round(priceSurPlace * 100), isTakeaway: true });
            renderCart();
            window.posGoBack(1);
        };

        const card2 = document.createElement('div');
        card2.className = 'product-card grouped-card';
        card2.style.cursor = 'pointer';
        card2.innerHTML = `
            <h3 style="color: var(--secondary-color); margin-bottom: 8px;">✈️ ${labelExpedie}</h3>
            <p style="font-size: 1.5rem; font-weight: bold;">${priceExpedie.toFixed(2)}</p>
            <p style="font-size: 0.85rem; opacity: 0.8;">${descExpedie}</p>
        `;
        card2.onclick = () => {
            cart.push({ id: v.sku + '-DDP', sku: v.sku, name: `${finalName} (Expédié)`, price: Math.round(priceExpedie * 100), isTakeaway: false });
            renderCart();
            window.posGoBack(1);
        };

        container.appendChild(card1);
        container.appendChild(card2);
        
    } catch (err) {
        // Fallback to ERP price if Shopify is unreachable
        let shopifyPrice = parseFloat(v.price);
        if (isNaN(shopifyPrice) || shopifyPrice === 0) {
            shopifyPrice = parseFloat(v['plm-price-usd-ht']) || 0;
        }
        container.innerHTML = '';
        
        const isUSD = document.getElementById('btn-usd')?.classList.contains('active');

        let priceSurPlace = shopifyPrice;
        let labelSurPlace = "Sur place (Take away)";
        let descSurPlace = `Prix ERP: ${priceSurPlace.toFixed(2)} (Shopify injoignable)`;

        let priceExpedie = shopifyPrice;
        let labelExpedie = "Expédié (Shipped DDP)";
        let descExpedie = `Prix ERP: ${priceExpedie.toFixed(2)} (Shopify injoignable)`;

        const baseName2 = v.name || v.modelName || v.posModel || 'Produit';
        const translatedColor2 = window.getColorName ? window.getColorName(v.posColor) : v.posColor;
        const finalName2 = baseName2.replace(v.posColor, translatedColor2);

        const card1 = document.createElement('div');
        card1.className = 'product-card grouped-card';
        card1.style.cursor = 'pointer';
        card1.innerHTML = `
            <h3 style="color: var(--primary-color); margin-bottom: 8px;">🛍️ ${labelSurPlace}</h3>
            <p style="font-size: 1.5rem; font-weight: bold;">${priceSurPlace.toFixed(2)}</p>
            <p style="font-size: 0.85rem; opacity: 0.8; color: orange;">${descSurPlace}</p>
        `;
        card1.onclick = () => {
            cart.push({ id: v.sku, sku: v.sku, name: `${finalName2} (Sur Place)`, price: Math.round(priceSurPlace * 100), isTakeaway: true });
            renderCart();
            window.posGoBack(1);
        };

        const card2 = document.createElement('div');
        card2.className = 'product-card grouped-card';
        card2.style.cursor = 'pointer';
        card2.innerHTML = `
            <h3 style="color: var(--secondary-color); margin-bottom: 8px;">✈️ ${labelExpedie}</h3>
            <p style="font-size: 1.5rem; font-weight: bold;">${priceExpedie.toFixed(2)}</p>
            <p style="font-size: 0.85rem; opacity: 0.8; color: orange;">${descExpedie}</p>
        `;
        card2.onclick = () => {
            cart.push({ id: v.sku + '-DDP', sku: v.sku, name: `${finalName2} (Expédié)`, price: Math.round(priceExpedie * 100), isTakeaway: false });
            renderCart();
            window.posGoBack(1);
        };

        container.appendChild(card1);
        container.appendChild(card2);
    }
}

window.addInlineCustomItemToCart = () => {
    const nameInput = document.getElementById('inline-custom-item-name');
    const priceInput = document.getElementById('inline-custom-item-price');
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name || isNaN(price) || price <= 0) {
        alert("Veuillez saisir un nom et un prix valide.");
        return;
    }

    cart.push({
        sku: 'CUSTOM-' + Date.now().toString().substr(-6),
        name: name,
        price: Math.round(price * 100),
        isTakeaway: false
    });

    nameInput.value = '';
    priceInput.value = '';
    document.getElementById('inline-custom-product').classList.add('hidden');
    renderCart();
};

window.addCustomItemToCart = () => {
    const name = document.getElementById('custom-item-name').value;
    const price = parseFloat(document.getElementById('custom-item-price').value);
    
    if (!name || isNaN(price)) return alert("Veuillez saisir un nom et un prix valide.");

    cart.push({
        id: 'CUSTOM_' + Date.now(),
        name: name,
        price: price * 100,
        sku: 'CUSTOM-ITEM',
        isTakeaway: true // par defaut sur place
    });

    document.getElementById('modal-custom-product').classList.add('hidden');
    renderCart();
    window.posGoBack(1);
};

window.searchWizard = function () {
    renderPosStep1();
};

function renderCart() {
    const listContainer = document.getElementById('cart-items-list');
    listContainer.innerHTML = '';

    const symbol = currentCurrency === 'eur' ? '€' : '$';

    if (cart.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-muted);">Le panier est vide.</p>';
        document.getElementById('btn-charge').disabled = true;
        if(document.getElementById('btn-payment-link')) document.getElementById('btn-payment-link').disabled = true;
    } else {
        document.getElementById('btn-charge').disabled = false;
        if(document.getElementById('btn-payment-link')) document.getElementById('btn-payment-link').disabled = false;
        cart.forEach((item, index) => {
            const priceVal = (item.price / 100).toFixed(2);
            // On estime que le prix TTC affiché = Prix HT + Taxes. 
            // Pour le breakdown, on affiche juste le nom et le prix payé.
            listContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-size: 0.95rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color:var(--text-muted);">${item.sku}</small>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <strong>${symbol}${priceVal}</strong>
                        <br><button onclick="cart.splice(${index}, 1); renderCart();" style="background:none; border:none; color:var(--error-color); cursor:pointer; font-size: 0.8rem; padding:0; margin-top:4px;">Retirer</button>
                    </div>
                </div>
            `;
        });
    }

    const total = cart.reduce((s, i) => s + i.price, 0);

    document.getElementById('cart-total-amount').innerHTML = `
        <div style="font-size: 0.9rem; font-weight: normal; margin-bottom: 4px; opacity: 0.8; color: var(--success-color);">
            Taxes et/ou douanes incluses.
        </div>
        <div>Total : ${symbol}${(total / 100).toFixed(2)}</div>
    `;

    if (window.calculateCheckoutTaxes && cart.length > 0 && document.getElementById('btn-usd')?.classList.contains('active')) {
        calculateCheckoutTaxes();
    } else {
        const taxEl = document.getElementById('cart-tax');
        if (taxEl) taxEl.innerText = "$0.00";
        
        const dutiesEl = document.getElementById('cart-duties');
        if (dutiesEl) dutiesEl.innerText = "Incluses";
        
        const taxLinesEl = document.getElementById('cart-tax-lines');
        if (taxLinesEl) {
            taxLinesEl.innerHTML = "";
            taxLinesEl.style.display = 'none';
        }
        
        const totalAmountEl = document.getElementById('cart-total-amount');
        if (totalAmountEl) {
            totalAmountEl.innerText = symbol + (total / 100).toFixed(2);
        }
        
        window.checkoutFinalTotal = total;
    }
}

function switchCurrency(curr) {
    currentCurrency = curr;
    document.getElementById('btn-usd')?.classList.toggle('active', curr === 'usd');
    document.getElementById('btn-eur')?.classList.toggle('active', curr === 'eur');

    // Rafraîchissement ciblé des composants (Caisse + Dashboard KPIs + Collection)
    if (typeof loadProducts === 'function') loadProducts(curr);
    if (typeof loadReporting === 'function') loadReporting();
    if (typeof renderCollectionDashboard === 'function' && typeof collection !== 'undefined') renderCollectionDashboard(collection);

    if (curr === 'usd') {
        const elFn = document.getElementById('cust-firstname'); if (elFn) elFn.placeholder = "First Name";
        const elLn = document.getElementById('cust-lastname'); if (elLn) elLn.placeholder = "Last Name";
        const elAd = document.getElementById('cust-address'); if (elAd) elAd.placeholder = "Address (Line 1)";
        const elCi = document.getElementById('cust-city'); if (elCi) elCi.placeholder = "City";
        const elZi = document.getElementById('cust-zip'); if (elZi) elZi.placeholder = "Zip Code";
        const elSt = document.getElementById('cust-state'); if (elSt) elSt.placeholder = "State";
        const elPh = document.getElementById('cust-phone-ext'); if (elPh) elPh.value = "+1";
        const elCo = document.getElementById('cust-country'); if (elCo) elCo.value = "US";
    } else {
        const elFn = document.getElementById('cust-firstname'); if (elFn) elFn.placeholder = "Prénom";
        const elLn = document.getElementById('cust-lastname'); if (elLn) elLn.placeholder = "Nom";
        const elAd = document.getElementById('cust-address'); if (elAd) elAd.placeholder = "Adresse (Ligne 1)";
        const elCi = document.getElementById('cust-city'); if (elCi) elCi.placeholder = "Ville";
        const elZi = document.getElementById('cust-zip'); if (elZi) elZi.placeholder = "Code Postal";
        const elSt = document.getElementById('cust-state'); if (elSt) elSt.placeholder = "Région / Département";
        const elPh = document.getElementById('cust-phone-ext'); if (elPh) elPh.value = "+33";
        const elCo = document.getElementById('cust-country'); if (elCo) elCo.value = "FR";
    }

    loadProducts(curr);

    // Refresh POS prices if currently selecting
    if (document.getElementById('pos-step-4') && !document.getElementById('pos-step-4').classList.contains('hidden')) {
        renderPosStep4();
    }
    renderCart();
}

// 7. MODULE CLIENTS
async function loadCustomers() {
    const list = document.getElementById('customers-list');
    if (!list) return;
    try {
        const res = await fetch('/api/shopify/customers');
        const data = await res.json();
        customersList = data.customers || [];
        renderCustomers(customersList, list);
    } catch (e) { console.error("Err customers", e); }
}

function renderCustomers(list, container) {
    container.innerHTML = '';
    const q = document.getElementById('search-customer')?.value.toLowerCase() || '';

    if (!q) {
        container.innerHTML = '<p class="loading-text">Saisissez votre recherche pour afficher les clients...</p>';
        return;
    }

    let filtered = list;
    if (q) {
        filtered = list.filter(c =>
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.first_name + " " + c.last_name).toLowerCase().includes(q)
        );
        filtered.sort((a, b) => {
            const aEmail = a.email && a.email.toLowerCase().includes(q) ? 1 : 0;
            const bEmail = b.email && b.email.toLowerCase().includes(q) ? 1 : 0;
            return bEmail - aEmail;
        });
    }

    filtered.forEach(c => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div style="flex:1; cursor:pointer;" onclick='editCustomer(${JSON.stringify(c)})'>
                <strong>${c.first_name} ${c.last_name}</strong><br><small>${c.email || "Pas d'email"}</small>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn secondary small-btn" onclick='editCustomer(${JSON.stringify(c)})'>Modifier</button>
                <button class="btn primary small-btn" onclick='selectCustomer(${JSON.stringify(c)})'>Choisir</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.selectCustomer = (c) => {
    window.selectedCustomer = c;
    document.getElementById('cust-firstname').value = c.first_name || "";
    document.getElementById('cust-lastname').value = c.last_name || "";
    document.getElementById('cust-email').value = c.email || "";
    document.getElementById('catalog-container')?.classList.remove('hidden'); // ensure it stays visible
    document.querySelector('.nav-btn[data-target="section-payment"]')?.click();
};

window.editCustomer = (c) => {
    document.getElementById('new-cust-first').value = c.first_name || "";
    document.getElementById('new-cust-last').value = c.last_name || "";
    document.getElementById('new-cust-email').value = c.email || "";
    document.getElementById('inline-add-customer').classList.remove('hidden');
    // Scroll to the top of the customer section
    document.getElementById('section-customers').scrollIntoView({ behavior: 'smooth' });
};

window.saveCustomerModal = async (selectAfter) => {
    const cust = {
        first_name: document.getElementById('new-cust-first').value,
        last_name: document.getElementById('new-cust-last').value,
        email: document.getElementById('new-cust-email').value
    };
    if (!cust.first_name || !cust.last_name) return alert("Nom et prénom requis");
    if (!cust.email) alert("Attention : Pas d'email renseigné, le client ne recevra pas de reçu numérique.");

    document.getElementById('btn-save-customer').disabled = true;
    document.getElementById('btn-save-select-customer').disabled = true;

    try {
        const res = await fetch('/api/shopify/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cust)
        });
        const data = await res.json();
        
        if (!res.ok || data.error) {
            throw new Error(data.error || "Erreur Shopify");
        }

        document.getElementById('btn-close-new-customer')?.click();

        if (selectAfter) {
            selectCustomer(data.customer);
        } else {
            alert("Fiche Client enregistrée dans Shopify !");
        }
        
        loadCustomers();
    } catch (err) {
        alert("Erreur lors de la création du client : " + err.message);
    } finally {
        document.getElementById('btn-save-customer').disabled = false;
        document.getElementById('btn-save-select-customer').disabled = false;
    }
};

// 8. MODULE VENTES (HISTORIQUE)
let ordersList = [];

async function loadHistory() {
    const list = document.getElementById('orders-list');
    if (!list) return;
    list.innerHTML = '<p class="loading-text">Chargement des ventes (Shopify)...</p>';
    try {
        const res = await fetch('/api/shopify/orders');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        ordersList = data.orders || [];
        renderHistory();
    } catch (e) {
        console.error("Err history", e);
        list.innerHTML = `<p style="color:var(--danger-color); padding: 16px;">Impossible de charger les ventes : ${e.message}</p>`;
    }
}

function renderHistory(searchQuery = '') {
    const container = document.getElementById('orders-list');
    if (!container) return;
    container.innerHTML = '';

    const q = searchQuery.toLowerCase();

    const filtered = ordersList.filter(o => {
        const orderId = String(o.id || o.name || '');
        const nameMatch = orderId.toLowerCase().includes(q);
        const emailMatch = (o.customer && o.customer.email) ? o.customer.email.toLowerCase().includes(q) : false;
        const fname = o.customer && o.customer.first_name ? o.customer.first_name : '';
        const lname = o.customer && o.customer.last_name ? o.customer.last_name : '';
        const fullName = (fname + " " + lname).trim().toLowerCase();
        const nameMatch2 = fullName ? fullName.includes(q) : false;
        return nameMatch || emailMatch || nameMatch2;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p>Aucune commande trouvée.</p>';
        return;
    }

    filtered.forEach(o => {
        const div = document.createElement('div');
        div.className = 'list-item-column';
        const dateStr = o.date || o.created_at;
        const date = dateStr ? new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const customerStr = o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Client Inconnu';
        
        let amount = o.amount || o.total_price || 0;
        if (o.amount && amount > 1000) amount = amount / 100;
        
        const itemsStr = o.items ? o.items.map(i => i.name || i.sku).join(', ') : 'Articles';

        const isRefunded = o.financial_status === 'refunded';
        const isPartiallyRefunded = o.financial_status === 'partially_refunded';
        const isCancelled = o.cancelled_at || o.cancelled;

        let statusText = o.financial_status || o.paymentMethod || 'Payé';
        let statusClass = 'paid';
        let cancelStyle = '';

        if (isRefunded) {
            statusText = 'Remboursé';
            statusClass = 'cancelled';
            cancelStyle = 'text-decoration: line-through; color: var(--text-muted);';
        } else if (isPartiallyRefunded) {
            statusText = 'Partiellement Remboursé';
            statusClass = 'cancelled';
        } else if (isCancelled) {
            statusText = 'Annulé';
            statusClass = 'cancelled';
            cancelStyle = 'text-decoration: line-through; color: var(--text-muted);';
        } else if (o.financial_status === 'paid') {
            statusText = 'Payé';
        }

        div.innerHTML = `
            <div style="display:flex; flex-wrap: wrap; justify-content:space-between; width:100%; align-items:flex-start; gap: 8px;">
                <div style="flex: 1 1 150px; min-width: 0;">
                    <strong style="font-size: 1rem; color: var(--primary-color); word-break: break-word;">Commande ${o.id || o.name || ''}</strong>
                    <br><small style="font-size:0.8rem; color:var(--text-muted);">${date}</small>
                </div>
                <div style="flex: 0 1 auto; text-align:right;">
                    <strong style="${cancelStyle}; font-size:1.1rem; color: var(--text-main);">$${parseFloat(amount).toFixed(2)}</strong><br>
                    <span class="status-pill ${statusClass}" style="margin-top: 4px; display:inline-block; ${isCancelled ? 'background-color: #ff4d4d; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;' : ''}">${statusText}</span>
                </div>
            </div>
            
            <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--glass-border); font-size:0.85rem; word-break: break-word;">
                <div style="margin-bottom:4px; display:flex; align-items:flex-start; gap:6px;">
                    <span>👤</span> <strong style="min-width: 0;">${customerStr}</strong>
                </div>
                <div style="color:var(--text-muted); display:flex; align-items:flex-start; gap:6px;">
                    <span>🛍️</span> <span style="min-width: 0;">${itemsStr}</span>
                </div>
            </div>
            
            <div style="display:flex; flex-wrap: wrap; gap:8px; margin-top:12px; width: 100%;">
                <button class="btn secondary" style="flex:1 1 30%; width:auto; min-width:0; font-size:0.75rem; padding:8px 2px;" onclick="alert('Modification en cours de raccordement API')">Modifier</button>
                <button class="btn secondary" style="flex:1 1 30%; width:auto; min-width:0; font-size:0.75rem; padding:8px 2px;" onclick="window.refundOrder('${o.id}')">Rembourser</button>
                <button class="btn danger" style="flex:1 1 30%; width:auto; min-width:0; font-size:0.75rem; padding:8px 2px;" onclick="window.refundOrder('${o.id}')">Annuler</button>
            </div>
        `;
        container.appendChild(div);
    });

    const dashboardList = document.getElementById('dashboard-recent-sales');
    if (dashboardList) {
        dashboardList.innerHTML = '';
        const recent = filtered.slice(0, 3);
        if (recent.length === 0) {
            dashboardList.innerHTML = '<p class="loading-text">Aucune transaction récente à afficher.</p>';
        } else {
            recent.forEach(o => {
                const isRefunded = o.financial_status === 'refunded' || o.financial_status === 'partially_refunded';
                const isCancelled = o.cancelled_at || o.cancelled;
                let badge = '';
                if (isRefunded) badge = '<span style="color:#ff4d4d;font-size:0.8em;margin-left:4px;">(Remboursé)</span>';
                else if (isCancelled) badge = '<span style="color:#ff4d4d;font-size:0.8em;margin-left:4px;">(Annulé)</span>';
                
                dashboardList.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 8px; margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                        <div style="flex: 1; min-width: 0;">
                            <strong style="word-break: break-word;">${o.name}</strong> ${badge}
                            <br><small style="color:var(--text-muted); word-break: break-word;">${o.customer ? o.customer.first_name + ' ' + o.customer.last_name : 'Inconnu'}</small>
                        </div>
                        <div style="flex-shrink: 0; text-align: right; font-weight:bold; ${(isCancelled || isRefunded) ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${o.total_price} ${o.currency}</div>
                    </div>
                `;
            });
        }
    }
}
window.refundOrder = async function(orderId) {
    if (!confirm("Voulez-vous vraiment annuler et rembourser cette commande ? (L'action sera irréversible dans Shopify et Stripe si applicable)")) return;
    try {
        const res = await fetch('/api/refund_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadHistory(); // Refresh history
        } else {
            alert("Erreur lors de l'annulation: " + (data.error || "Inconnue"));
        }
    } catch (e) {
        console.error(e);
        alert("Erreur réseau ou serveur.");
    }
};

window.cancelOrder = window.refundOrder;

// 8. MODULE INVENTAIRE & COLLECTION
async function loadCollection() {
    const list = document.getElementById('collection-dashboard');
    if (!list) return;
    list.innerHTML = '<p class="loading-text">Chargement de la collection...</p>';
    try {
        const res = await fetch('/api/erp/collection');
        const data = await res.json();
        collection = data || [];
        renderCollectionDashboard(collection);
    } catch (e) { console.error("Err collection", e); }
}

function renderCollectionDashboard(data) {
    const container = document.getElementById('collection-dashboard');
    if (!container) return;
    container.innerHTML = '';

    const countValidated = data.filter(v => v['plm-status'] === 'Validé' || v.status === 'Validé').length;
    const countEl = document.getElementById('validated-models-count');
    if (countEl) countEl.innerText = countValidated;

    const q = document.getElementById('search-collection')?.value.toLowerCase();
    const filtered = data.filter(v => !q || (v.sku && v.sku.toLowerCase().includes(q)) || (v.modelName && v.modelName.toLowerCase().includes(q)));

    const tree = {};
    filtered.forEach(v => {
        const mod = v.posModel || v.modelName.split(' - ')[0] || v.modelName || 'Inconnu';
        const mat = v.posMaterial || 'Cuir Vachette';
        const opt = (v.posOption && v.posOption !== '-') ? v.posOption : 'Sans option';
        
        if (!tree[mod]) tree[mod] = {};
        if (!tree[mod][mat]) tree[mod][mat] = {};
        if (!tree[mod][mat][opt]) tree[mod][mat][opt] = [];
        
        tree[mod][mat][opt].push(v);
    });

    Object.keys(tree).sort().forEach(mName => {
        let totalVariants = 0;
        let matsHtml = '';

        Object.keys(tree[mName]).sort().forEach(matName => {
            let optsHtml = '';
            
            Object.keys(tree[mName][matName]).sort().forEach(optName => {
                const variants = tree[mName][matName][optName];
                totalVariants += variants.length;
                
                const varsHtml = variants.map(v => `
                    <div class="declination-item" style="margin-left: 20px; padding: 10px; border-left: 2px solid var(--border-color);">
                        <div class="declination-info">
                            <div class="decl-color" style="font-weight:bold;">${window.getColorName ? window.getColorName(v.posColor || v.idColor) : (v.posColor || v.idColor || 'Couleur')} (${v.quantity || 0})</div>
                            <div class="decl-sku" style="display:flex; gap:10px;">
                                <span>${v.sku}</span>
                                <span style="color:var(--primary-color); font-weight:bold;">${v['plm-price-usd-ht'] ? '$' + parseFloat(v['plm-price-usd-ht']).toFixed(2) : 'Pas de prix'}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <span class="status-pill ${(v['plm-status'] || v.status) === 'Validé' || (v['plm-status'] || v.status) === 'Validé' ? 'paid' : 'pending'}">${v['plm-status'] || v.status || 'Brouillon'}</span>
                            <button class="btn secondary small-btn" onclick="window.openProductSheet('${v.sku}'); event.stopPropagation();">Modifier</button>
                        </div>
                    </div>
                `).join('');
                
                optsHtml += `
                    <div class="option-group" style="margin-top: 10px; margin-left: 15px;">
                        <div style="font-weight: 500; color: #666; margin-bottom: 5px;">↳ Option : ${optName} (${variants.length})</div>
                        ${varsHtml}
                    </div>
                `;
            });
            
            matsHtml += `
                <div class="material-group" style="margin-top: 15px;">
                    <div style="font-weight: 600; color: #444; border-bottom: 1px solid #eee; padding-bottom: 4px;">♦ Matière : ${matName}</div>
                    ${optsHtml}
                </div>
            `;
        });

        const card = document.createElement('div');
        card.className = 'model-card-premium';
        card.innerHTML = `
            <div class="model-info">
                <div>
                    <div class="model-name">${mName}</div>
                    <div class="model-counts">${totalVariants} déclinaison(s)</div>
                </div>
                <button class="btn secondary small-btn" onclick="window.createNewDeclination('${mName}'); event.stopPropagation();">+ Déclinaison</button>
            </div>
            <div class="model-expanded-view hidden" style="padding-top: 10px;">
                ${matsHtml}
            </div>
        `;
        card.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') card.querySelector('.model-expanded-view').classList.toggle('hidden');
        };
        container.appendChild(card);
    });
}

window.openProductSheet = (sku) => {
    const v = collection.find(i => i.sku === sku);
    if (!v) return;
    originalSKU = sku;
    const customModal = document.getElementById('modal-custom-product');
    if(customModal) {
        customModal.classList.add('hidden');
        customModal.style.display = 'none';
    }
    document.getElementById('modal-product-sheet').classList.remove('hidden');
    document.getElementById('modal-product-sheet').style.display = 'flex';

    // Remplissage Form dynamique pour tous les champs plm-
    document.querySelectorAll('[id^="plm-"]').forEach(el => {
        if (v[el.id] !== undefined) {
            if (el.type === 'checkbox') {
                el.checked = v[el.id];
                el.dispatchEvent(new Event('change'));
            } else {
                el.value = v[el.id];
            }
        } else {
            // Reset fields not present in saved variant
            if (el.type === 'checkbox') { el.checked = false; el.dispatchEvent(new Event('change')); }
            else el.value = "";
        }
    });

    // Auto-calcul TTC
    if (v['plm-price-eur']) document.getElementById('plm-price-eur-ttc').value = (parseFloat(v['plm-price-eur']) * 1.20).toFixed(2);
    if (v['plm-price-usd']) document.getElementById('plm-price-usd-ttc').value = (parseFloat(v['plm-price-usd']) * 1.08).toFixed(2);

    generateUISKU();
};

window.createNewModel = () => {
    originalSKU = null;
    document.getElementById('fiche-technique-form').reset();
    
    // Force close custom-product modal if it was somehow stuck open
    const customModal = document.getElementById('modal-custom-product');
    if(customModal) {
        customModal.classList.add('hidden');
        customModal.style.display = 'none';
    }
    
    document.getElementById('modal-product-sheet').classList.remove('hidden');
    document.getElementById('modal-product-sheet').style.display = 'flex';
    generateUISKU();
};

window.createNewDeclination = (modelName) => {
    originalSKU = null;
    document.getElementById('fiche-technique-form').reset();
    const model = (window.erpConfig.models || []).find(m => m.name === modelName);
    const modelId = model ? model.id : "";
    document.getElementById('plm-model-name').value = modelId;

    // Pré-remplissage avec le Noir 999 et données du modèle de base
    document.getElementById('plm-color').value = "999";
    const baseVariant = collection.find(v => v.idModel === modelId);
    if (baseVariant) {
        document.getElementById('plm-year').value = baseVariant.idYear || "";
        document.getElementById('plm-season').value = baseVariant.idSeason || "";
        document.getElementById('plm-material-global').value = baseVariant.idMaterialPrimary || "";
        document.getElementById('plm-size').value = baseVariant.idSize || "";
        document.getElementById('plm-mat1-animal').value = baseVariant.idMaterialPrimary ? baseVariant.idMaterialPrimary : "";
        document.getElementById('plm-mat1-color').value = "999"; // Noir
        document.getElementById('plm-price-usd-ht').value = "";
        document.getElementById('plm-duties-shipping-usd').value = "";
        document.getElementById('plm-final-price-ddp').value = "";
    }

    const customModal = document.getElementById('modal-custom-product');
    if(customModal) {
        customModal.classList.add('hidden');
        customModal.style.display = 'none';
    }
    document.getElementById('modal-product-sheet').classList.remove('hidden');
    document.getElementById('modal-product-sheet').style.display = 'flex';
    generateUISKU();
};

async function savePLM(e) {
    if (e) e.preventDefault();
    const isValid = checkFormValidity();
    const statusVal = document.getElementById('plm-status').value;
    const finalStatus = isValid ? statusVal : "Brouillon";

    if (!isValid && statusVal === "Validé") {
        alert("Certains champs obligatoires sont manquants. La fiche sera sauvegardée en Brouillon.");
        document.getElementById('plm-status').value = "Brouillon";
    }

    const data = {
        originalSKU: originalSKU,
        modelName: document.querySelector('#plm-model-name option:checked')?.text || "Sans Nom",
        sku: document.getElementById('generated-sku').innerText,
        compositionPrimary: "Cuir " + (document.getElementById('plm-mat1-animal')?.value || '') + " " + (document.getElementById('plm-mat1-color')?.value || '')
    };

    document.querySelectorAll('[id^="plm-"]').forEach(el => {
        if (el.type === 'checkbox') data[el.id] = el.checked;
        else data[el.id] = el.value;
    });

    data.status = finalStatus;
    data['plm-status'] = finalStatus;

    try {
        const res = await fetch('/api/erp/variant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const resData = await res.json();
        if (resData.error) {
            alert("Erreur : " + resData.error);
        } else {
            alert("Fiche Sauvegardée !");
            await loadCollection();
            closeProductSheet();
        }
    } catch (err) {
        alert("Erreur lors de la sauvegarde.");
    }
}

window.syncToShopify = async () => {
    if (!originalSKU) return;
    updateConnectionStatus('connecting');
    const res = await fetch('/api/erp/sync_shopify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: originalSKU }) });
    const data = await res.json();
    if (data.success) {
        alert("Synchronisé avec Shopify ! Prix US mis à jour.");
        loadCollection();
        if (data.product && data.product.variants[0]) {
            document.getElementById('plm-price-usd').value = data.product.variants[0].price;
        }
    } else alert("Erreur Sync : " + data.error);
    updateConnectionStatus('connected');
};

window.deleteDeclination = async () => {
    if (!originalSKU) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette déclinaison ?")) return;

    // Pour l'instant on supprime localement dans db.variants
    try {
        const res = await fetch('/api/erp/variant/' + encodeURIComponent(originalSKU), { method: 'DELETE' });
        const resData = await res.json();
        if (resData.success) {
            alert("Déclinaison supprimée !");
            await loadCollection();
            closeProductSheet();
        } else {
            alert("Erreur lors de la suppression.");
        }
    } catch (e) {
        alert("Erreur réseau");
    }
};

// Duplicate erp removed

async function loadERPConfig() {
    const res = await fetch('/api/erp/config');
    window.erpConfig = await res.json();
    ID_MAPS = window.erpConfig; // update globally
    if (document.getElementById('admin-shipping-cost')) {
        document.getElementById('admin-shipping-cost').value = window.erpConfig.shippingCost || 100;
    }
    renderConfigTable();
}

window.saveShippingCost = async () => {
    const val = document.getElementById('admin-shipping-cost').value;
    window.erpConfig.shippingCost = parseFloat(val) || 100;
    const res = await fetch('/api/erp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(window.erpConfig)
    });
    if (res.ok) alert("Frais de port enregistrés !");
    else alert("Erreur de sauvegarde");
};

function renderConfigTable() {
    const category = document.getElementById('config-category-select').value;
    const container = document.getElementById('config-table-container');
    const items = (window.erpConfig[category] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    
    container.innerHTML = `
        <table class="config-table" style="width:100%; text-align:left; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
                    <th style="padding: 8px;">ID</th>
                    <th style="padding: 8px;">Nom</th>
                    <th style="padding: 8px; text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, index) => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 8px;">${item.id || ''}</td>
                        <td style="padding: 8px;">${item.name}</td>
                        <td style="padding: 8px; text-align:right;">
                            <button class="btn secondary small-btn" onclick="editConfigItem('${category}', '${item.id}')" style="margin-right:4px;">Modifier</button>
                            <button class="btn danger small-btn" onclick="deleteConfigItem('${category}', '${item.id}')">Supprimer</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.deleteConfigItem = async (category, id) => {
    if(confirm("Êtes-vous sûr de vouloir supprimer cet élément ?")) {
        const index = window.erpConfig[category].findIndex(i => i.id === id);
        if (index > -1) {
            window.erpConfig[category].splice(index, 1);
            await saveERPConfig();
        }
    }
};

window.editConfigItem = async (category, id) => {
    const index = window.erpConfig[category].findIndex(i => i.id === id);
    if (index === -1) return;
    const item = window.erpConfig[category][index];
    const newName = prompt("Modifier le nom :", item.name);
    if(newName && newName.trim() !== "") {
        window.erpConfig[category][index].name = newName.trim();
        await saveERPConfig();
    }
};

const configPrefixMap = {
    'models': 'MOD',
    'years': 'ANN',
    'seasons': 'SAI',
    'options': 'OPT',
    'optionTypes': 'TYP',
    'colors': 'COU',
    'sizes': 'TAI',
    'globalMaterials': 'MGL',
    'materials': 'MAT',
    'skinTypes': 'TDP',
    'linings': 'DOU',
    'materialDetails': 'DMA',
    'suppliers': 'FOU',
    'jewelry': 'BIZ',
    'origins': 'PAY',
    'hsCodes': 'CHS',
    'ateliers': 'ATE'
};

const autoGeneratedCategories = ['materials', 'skinTypes', 'linings', 'materialDetails', 'suppliers', 'jewelry', 'origins', 'hsCodes', 'ateliers'];

const skuCategoriesConfig = {
    'models': { type: 'prefix_seq', prefix: 'AA', pad: 3 },
    'years': { type: 'last_two' },
    'seasons': { type: 'season_logic' },
    'options': { type: 'seq', pad: 2 },
    'optionTypes': { type: 'seq', pad: 3 },
    'colors': { type: 'seq', pad: 3, ignoreMax: 900 },
    'sizes': { type: 'seq', pad: 2 },
    'globalMaterials': { type: 'global_mat_logic' }
};

document.getElementById('config-category-select')?.addEventListener('change', (e) => {
    renderConfigTable();
    const category = e.target.value;
    const idInput = document.getElementById('config-new-id');
    if (idInput) {
        idInput.disabled = true; // Tous les champs ID sont maintenant désactivés
        if (autoGeneratedCategories.includes(category)) {
            idInput.placeholder = "ID Auto-généré (ex: " + (configPrefixMap[category] || 'CFG') + "-001)";
        } else {
            idInput.placeholder = "ID SKU auto-généré selon les�Ʉgles métier";
        }
        idInput.value = '';
    }
});

document.getElementById('btn-add-config-item')?.addEventListener('click', async () => {
    const category = document.getElementById('config-category-select').value;
    const name = document.getElementById('config-new-name').value.trim();
    if (!name) return alert("Veuillez remplir le nom.");

    if (!window.erpConfig[category]) window.erpConfig[category] = [];

    let generatedId = "";

    if (autoGeneratedCategories.includes(category)) {
        const prefix = configPrefixMap[category] || 'CFG';
        let maxNum = 0;
        window.erpConfig[category].forEach(item => {
            if (item.id && typeof item.id === 'string' && item.id.startsWith(prefix + '-')) {
                const num = parseInt(item.id.replace(prefix + '-', ''), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        generatedId = prefix + '-' + String(maxNum + 1).padStart(3, '0');
    } else {
        const rule = skuCategoriesConfig[category];
        if (rule) {
            if (rule.type === 'last_two') {
                const match = name.match(/\d{4}/);
                generatedId = match ? match[0].slice(-2) : name.slice(-2).toUpperCase();
            } else if (rule.type === 'season_logic') {
                const lowerName = name.toLowerCase();
                if (lowerName.includes('hiver') || lowerName.includes('automne') || lowerName === 'h') {
                    generatedId = 'H';
                } else if (lowerName.includes('ete') || lowerName.includes('eté') || lowerName.includes('printemps') || lowerName === 'e') {
                    generatedId = 'E';
                } else {
                    generatedId = name.charAt(0).toUpperCase();
                }
            } else if (rule.type === 'global_mat_logic') {
                const isExotique = name.toLowerCase().includes('exceptionnel') || name.toLowerCase().includes('exotique');
                const prefix = isExotique ? 'CE' : 'CU';
                let maxNum = 0;
                window.erpConfig[category].forEach(item => {
                    if (item.id && typeof item.id === 'string' && item.id.startsWith(prefix)) {
                        const num = parseInt(item.id.replace(prefix, ''), 10);
                        if (!isNaN(num) && num > maxNum) maxNum = num;
                    }
                });
                generatedId = prefix + String(maxNum + 1).padStart(3, '0');
            } else if (rule.type === 'seq' || rule.type === 'prefix_seq') {
                let maxNum = 0;
                const prefix = rule.prefix || '';
                window.erpConfig[category].forEach(item => {
                    if (item.id && typeof item.id === 'string') {
                        let idStr = item.id;
                        if (prefix && idStr.startsWith(prefix)) {
                            idStr = idStr.substring(prefix.length);
                        } else if (prefix && !idStr.startsWith(prefix)) {
                            return;
                        }
                        const num = parseInt(idStr, 10);
                        const limit = rule.ignoreMax || Infinity;
                        if (!isNaN(num) && num > maxNum && num < limit) {
                            maxNum = num;
                        }
                    }
                });
                generatedId = prefix + String(maxNum + 1).padStart(rule.pad || 1, '0');
            }
        } else {
            generatedId = String(window.erpConfig[category].length + 1).padStart(2, '0');
        }
    }

    window.erpConfig[category].push({ name, id: generatedId });
    document.getElementById('config-new-name').value = '';

    await saveERPConfig();
});

async function saveERPConfig() {
    await fetch('/api/erp/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(window.erpConfig) });
    localStorage.setItem('erpConfigCache', JSON.stringify(window.erpConfig));
    alert("Configuration mise à jour !");
    initPLMForm();
    renderConfigTable();
}

// 10. INITIALISATION & LISTENERS SLOBAUX
function init() {
    setInterval(checkGlobalStatus, 10000);
    checkGlobalStatus();
    initPLMForm();
    attachListeners();

    if (!window.currentLang) {
        window.setLanguage('en');
    } else {
        window.setLanguage(window.currentLang);
    }
}


async function initPLMForm() {
    let config = null;
    const cachedConfig = localStorage.getItem('erpConfigCache');
    if (cachedConfig) {
        try { config = JSON.parse(cachedConfig); } catch (e) { }
    }

    if (!config) {
        const res = await fetch('/api/erp/config');
        config = await res.json();
        localStorage.setItem('erpConfigCache', JSON.stringify(config));
    }


    Object.keys(config).forEach(key => {
        if (Array.isArray(config[key])) {
            config[key].sort((a, b) => {
                const nameA = (a.name || a.id || '').toString().toLowerCase();
                const nameB = (b.name || b.id || '').toString().toLowerCase();
                return nameA.localeCompare(nameB);
            });
        }
    });

    window.erpConfig = config;
    ID_MAPS = config;

    // Peuplement dynamique des selects principaux
    populateSelect('plm-model-name', config.models);
    populateSelect('plm-color', config.colors);
    populateSelect('plm-size', config.sizes);

    // Nouveaux selects selon CDC
    populateSelect('plm-year', config.years);
    populateSelect('plm-season', config.seasons);
    populateSelect('plm-option-1', config.optionTypes);
    populateSelect('plm-option-2', config.optionTypes);
    populateSelect('plm-atelier', config.ateliers);
    populateSelect('plm-material-global', config.globalMaterials);
    populateSelect('plm-country-origin', config.origins);
    populateSelect('plm-hs-code', config.hsCodes);

    // Listes de matières pour les différents blocs
    ['mat1', 'mat2', 'mat3', 'lining'].forEach(prefix => {
        populateSelect(`plm-${prefix}-animal`, config.materials);
        populateSelect(`plm-${prefix}-type`, config.skinTypes);
        populateSelect(`plm-${prefix}-color`, config.colors);
        populateSelect(`plm-${prefix}-supplier`, config.suppliers);
        if (prefix === 'mat1') {
            populateSelect(`plm-mat1-details`, config.materialDetails);
        }
    });

    populateSelect('plm-bij1-supplier', config.suppliers);
    populateSelect('plm-bij1-details', config.jewelry);

    // Dynamic price calculators

}

function populateSelect(id, dataList) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">Choisir...</option>';
    if (dataList && Array.isArray(dataList)) {
        const sortedList = dataList.slice().sort((a, b) => {
            const nameA = (a.name || '').toString().toLowerCase();
            const nameB = (b.name || '').toString().toLowerCase();
            return nameA.localeCompare(nameB);
        });
        sortedList.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.id || i.name; // Use ID if available, else name
            opt.innerText = i.name;
            el.appendChild(opt);
        });
    }

    // Infer config category
    let category = null;
    if (window.erpConfig) {
        for (const [key, val] of Object.entries(window.erpConfig)) {
            if (val === dataList) {
                category = key;
                break;
            }
        }
    }

    if (category) {
        const createOpt = document.createElement('option');
        createOpt.value = "_CREATE_";
        createOpt.innerText = "+ Créer";
        createOpt.style.color = "var(--primary)";
        createOpt.style.fontWeight = "bold";
        el.appendChild(createOpt);

        if (!el.dataset.hasCreateListener) {
            el.dataset.hasCreateListener = "true";
            el.addEventListener('change', async (e) => {
                if (e.target.value === "_CREATE_") {
                    const name = prompt("Nom de la nouvelle entrée :");
                    if (name && name.trim()) {
                        let newId = name.trim().toUpperCase().replace(/\s+/g, '_').substring(0, 5) + Date.now().toString().slice(-3);
                        if (category === 'models') newId = 'AA' + Date.now().toString().slice(-3);
                        if (category === 'optionTypes') newId = Date.now().toString().slice(-2);
                        if (category === 'globalMaterials') newId = 'M' + Date.now().toString().slice(-4);
                        if (category === 'materials') newId = 'CU' + Date.now().toString().slice(-3);
                        if (category === 'colors') newId = Date.now().toString().slice(-3);

                        const newEntry = { name: name.trim(), id: newId };
                        window.erpConfig[category].push(newEntry);

                        try {
                            await fetch('/api/erp/config', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(window.erpConfig)
                            });

                            const opt = document.createElement('option');
                            opt.value = newId;
                            opt.innerText = name.trim();
                            el.insertBefore(opt, el.lastChild);
                            el.value = newId;

                            el.dispatchEvent(new Event('change'));
                        } catch (err) {
                            alert("Erreur lors de la sauvegarde.");
                            el.value = "";
                        }
                    } else {
                        el.value = "";
                    }
                }
            });
        }
    }
}

function generateUISKU() {
    if (originalSKU) {
        document.getElementById('generated-sku').innerText = originalSKU;
        return;
    }

    const model = document.getElementById('plm-model-name').value || "AA000";
    const year = document.getElementById('plm-year').value || "25";
    const season = document.getElementById('plm-season').value || "H";
    const option = String(document.getElementById('plm-option-1').value || "00").padStart(2, "0");
    const mat = document.getElementById('plm-material-global').value || "CU000";
    const color = document.getElementById('plm-color').value || "000";

    const sku = `${model}${year}${season}-${mat}${option}-${color}`;
    document.getElementById('generated-sku').innerText = sku;
}

function checkFormValidity() {
    const required = ['plm-model-name', 'plm-material-global', 'plm-color', 'plm-size', 'plm-year', 'plm-season', 'plm-atelier', 'plm-mat1-animal', 'plm-mat1-type', 'plm-mat1-color', 'plm-mat1-qty', 'plm-mat1-supplier'];
    let isValid = true;
    required.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el.value) isValid = false;
    });
    return isValid;
}

function setupDynamicToggles() {
    const toggles = [
        { check: 'plm-has-mat2', fields: 'mat2-fields' },
        { check: 'plm-has-mat3', fields: 'mat3-fields' },
        { check: 'plm-has-lining', fields: 'lining-fields' },
        { check: 'plm-has-bij1', fields: 'bij1-fields' }
    ];
    toggles.forEach(t => {
        const cb = document.getElementById(t.check);
        if (cb) {
            cb.addEventListener('change', (e) => {
                const fields = document.getElementById(t.fields);
                if (fields) {
                    if (e.target.checked) fields.classList.remove('hidden');
                    else fields.classList.add('hidden');
                }
            });
        }
    });

    // Add extra Bijouterie
    let bijCount = 1;
    const addBijBtn = document.createElement('button');
    addBijBtn.type = "button";
    addBijBtn.className = "btn secondary small-btn";
    addBijBtn.innerText = "➕ Ajouter Bijouterie Supplémentaire";
    addBijBtn.style.marginTop = "12px";
    addBijBtn.onclick = () => {
        if (bijCount >= 4) return alert("Maximum 4 bijouteries.");
        bijCount++;
        const container = document.getElementById('extra-bijouteries');
        const div = document.createElement('div');
        div.className = "material-block dynamic-section";
        div.innerHTML = `
            <h4>Bijouterie ${bijCount}</h4>
            <div class="input-group"><label>Détails</label><select id="plm-bij${bijCount}-details" class="premium-input"></select></div>
            <div class="form-grid">
                <div class="input-group"><label>Quantité</label><input type="number" id="plm-bij${bijCount}-qty" class="premium-input"></div>
                <div class="input-group"><label>Fournisseur</label><select id="plm-bij${bijCount}-supplier" class="premium-input"></select></div>
            </div>
        `;
        container.appendChild(div);
        populateSelect(`plm-bij${bijCount}-supplier`, window.erpConfig.suppliers);
        populateSelect(`plm-bij${bijCount}-details`, window.erpConfig.jewelry);
    };

    const extraBij = document.getElementById('extra-bijouteries');
    if (extraBij) extraBij.parentNode.insertBefore(addBijBtn, extraBij.nextSibling);

    // Add Options
    let optionCount = 2;
    document.getElementById('btn-add-option')?.addEventListener('click', () => {
        if (optionCount >= 4) return alert("Maximum 4 options.");
        optionCount++;
        const container = document.getElementById('options-container');
        const div = document.createElement('div');
        div.className = "input-group";
        div.style.marginTop = "12px";
        div.innerHTML = `
            <label>Option ${optionCount}</label>
            <select id="plm-option-${optionCount}" class="premium-input plm-option-field"></select>
        `;
        container.appendChild(div);
        populateSelect(`plm-option-${optionCount}`, window.erpConfig.optionTypes);
    });
}

function attachListeners() {
    const btnCharge = document.getElementById('btn-charge');
    if (btnCharge) btnCharge.addEventListener('click', window.charge);
    const btnCancel = document.getElementById('btn-cancel');
    if (btnCancel) btnCancel.addEventListener('click', window.cancelCharge);
    // Nav Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showSection(btn.dataset.target);
        };
    });

    // Caisse Listeners
    document.getElementById('btn-usd')?.addEventListener('click', () => switchCurrency('usd'));
    document.getElementById('btn-eur')?.addEventListener('click', () => switchCurrency('eur'));

    document.getElementById('search-catalog')?.addEventListener('input', () => {
        searchWizard();
    });

    document.getElementById('btn-search-catalog')?.addEventListener('click', () => {
        searchWizard();
    });

    document.getElementById('btn-reset-catalog')?.addEventListener('click', () => {
        const input = document.getElementById('search-catalog');
        if (input) {
            input.value = '';
            input.focus();
            searchWizard();
        }
    });

    window.triggerCustomProductModal = () => {
        const inlinePanel = document.getElementById('inline-custom-product');
        if(inlinePanel) {
            inlinePanel.classList.remove('hidden');
        }
    };
    document.getElementById('btn-custom-product')?.addEventListener('click', window.triggerCustomProductModal);

    document.getElementById('btn-open-customers-tab')?.addEventListener('click', () => {
        document.querySelector('.nav-btn[data-target="section-customers"]').click();
    });

    document.getElementById('btn-new-customer-form')?.addEventListener('click', () => {
        document.querySelectorAll('#modal-add-customer input').forEach(i => i.value = '');
        document.getElementById('modal-add-customer').classList.remove('hidden');
        document.getElementById('modal-add-customer').style.display = 'flex';
    });

    document.getElementById('btn-add-customer-modal')?.addEventListener('click', () => {
        document.querySelectorAll('#modal-add-customer input').forEach(i => i.value = '');
        document.getElementById('modal-add-customer').classList.remove('hidden');
        document.getElementById('modal-add-customer').style.display = 'flex';
    });

    document.getElementById('btn-validate-customer')?.addEventListener('click', () => {
        const reqIds = ['cust-firstname', 'cust-lastname', 'cust-email', 'cust-address', 'cust-city', 'cust-zip', 'cust-country'];
        let valid = true;
        reqIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (!el.value.trim()) {
                    el.classList.add('mandatory-empty');
                    valid = false;
                } else el.classList.remove('mandatory-empty');
            }
        });
        if (!valid) return alert("Veuillez saisir les informations obligatoires entourées en rouge pour la livraison.");
        document.getElementById('catalog-container').classList.remove('hidden');
    });

    // Customer Modal Buttons
    document.getElementById('btn-close-new-customer')?.addEventListener('click', () => {
        document.getElementById('modal-add-customer').classList.add('hidden');
        document.getElementById('modal-add-customer').style.display = 'none';
    });

    document.getElementById('btn-save-customer')?.addEventListener('click', () => saveCustomerModal(false));
    document.getElementById('btn-save-select-customer')?.addEventListener('click', () => saveCustomerModal(true));

    // Customer UI Listeners
    document.getElementById('search-customer')?.addEventListener('input', () => {
        const list = document.getElementById('customers-list');
        if (list) renderCustomers(customersList, list);
    });

    document.getElementById('btn-search-customer')?.addEventListener('click', () => {
        const list = document.getElementById('customers-list');
        if (list) renderCustomers(customersList, list);
    });

    document.getElementById('btn-reset-customer')?.addEventListener('click', () => {
        const input = document.getElementById('search-customer');
        const list = document.getElementById('customers-list');
        if (input) {
            input.value = '';
            input.focus();
            if (list) renderCustomers(customersList, list);
        }
    });

    // Real-time search for materials
    document.getElementById('search-materials')?.addEventListener('input', () => {
        window.matVisibleCount = 20;
        if (window.renderERPMaterials) window.renderERPMaterials();
    });
    document.getElementById('btn-search-materials')?.addEventListener('click', () => {
        window.matVisibleCount = 20;
        if (window.renderERPMaterials) window.renderERPMaterials();
    });
    document.getElementById('btn-reset-materials')?.addEventListener('click', () => {
        const input = document.getElementById('search-materials');
        if (input) {
            input.value = '';
            input.focus();
            if (window.renderERPMaterials) window.renderERPMaterials();
        }
    });

    document.getElementById('search-history')?.addEventListener('input', (e) => {
        renderHistory(e.target.value);
    });

    document.getElementById('btn-search-history')?.addEventListener('click', () => {
        const val = document.getElementById('search-history')?.value || '';
        renderHistory(val);
    });

    document.getElementById('btn-reset-history')?.addEventListener('click', () => {
        const input = document.getElementById('search-history');
        if (input) {
            input.value = '';
            input.focus();
            renderHistory('');
        }
    });

    // Collection Listeners
    document.getElementById('search-collection')?.addEventListener('input', () => renderCollectionDashboard(collection));
    document.getElementById('btn-search-collection')?.addEventListener('click', () => renderCollectionDashboard(collection));
    document.getElementById('btn-reset-collection')?.addEventListener('click', () => {
        const input = document.getElementById('search-collection');
        if (input) {
            input.value = '';
            input.focus();
            renderCollectionDashboard(collection);
        }
    });
    document.getElementById('btn-create-model-plm')?.addEventListener('click', createNewModel);
    document.getElementById('btn-save-plm')?.addEventListener('click', savePLM);
    document.getElementById('btn-sync-shopify')?.addEventListener('click', syncToShopify);
    document.getElementById('btn-delete-plm')?.addEventListener('click', window.deleteDeclination);

    // Dynamically update SKU in UI
    const skuFields = ['plm-model-name', 'plm-year', 'plm-season', 'plm-option-1', 'plm-material-global', 'plm-color'];
    skuFields.forEach(id => {
        document.getElementById(id)?.addEventListener('change', generateUISKU);
    });

    setupDynamicToggles();

    // ERP & Admin Listeners
    document.querySelectorAll('.erp-tab').forEach(btn => {
        btn.onclick = () => loadERPModule(btn.dataset.erp);
    });
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.onclick = () => loadAdminModule(btn.dataset.admin);
    });
    document.getElementById('btn-save-config')?.addEventListener('click', saveERPConfig);

    // Status Badge
    const statusBadge = document.getElementById('connection-status');
    if (statusBadge) {
        statusBadge.addEventListener('click', () => {
            if (!terminal) initializeTerminal();
            else discoverReaders();
        });
    }
}

// 11. BOOTSTRAP (PIN CODE)
document.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('cancel-btn')) pin = pin.slice(0, -1);
        else if (btn.classList.contains('submit-btn')) login(pin);
        else if (pin.length < 4) pin += btn.innerText;
        document.querySelectorAll('.pin-dot').forEach((dot, i) => dot.classList.toggle('filled', i < pin.length));
    });
});

async function loadReporting() {
    const url = window.currentUser ? `/api/shopify/reports?vendorId=${window.currentUser.id}` : '/api/shopify/reports';
    const res = await fetch(url);
    const d = await res.json();
    const curr = window.currentCurrency || 'usd';
    const rate = (window.currencyRates && window.currencyRates[curr]) ? window.currencyRates[curr].multiplier : 1;
    const symbol = (window.currencyRates && window.currencyRates[curr]) ? window.currencyRates[curr].symbol : '$';

    document.getElementById('stat-daily').innerText = `${symbol}${Math.round(d.daily * rate)}`;
    document.getElementById('stat-weekly').innerText = `${symbol}${Math.round(d.weekly * rate)}`;
    document.getElementById('stat-monthly').innerText = `${symbol}${Math.round(d.monthly * rate)}`;
    if (document.getElementById('stat-crm')) document.getElementById('stat-crm').innerText = d.crmCount || 0;
    if (document.getElementById('stat-emails-clients')) document.getElementById('stat-emails-clients').innerText = d.emailCount || d.crmCount || 0;
    if (document.getElementById('stat-emails-clients-page')) document.getElementById('stat-emails-clients-page').innerText = d.emailCount || d.crmCount || 0;
}

async function loadERPProduction() {
    const res = await fetch('/api/erp/production_orders');
    const data = await res.json();
    const list = document.getElementById('erp-production-list');
    if (list) list.innerHTML = data.map(p => `
        <div class="list-item"><strong>Ordre #${p.id}</strong><br><small>Atelier: ${p.atelier} • Statut: ${p.status}</small></div>
    `).join('');
}

async function loadERPDash() {
    loadReporting();
}



window.closeProductSheet = () => {
    document.getElementById('modal-product-sheet').classList.add('hidden');
    document.getElementById('modal-product-sheet').style.display = 'none';
};


window.addEventListener('load', () => {
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';

    const sessionStr = localStorage.getItem('appUserSession');
    if (sessionStr) {
        try {
            const session = JSON.parse(sessionStr);
            if (Date.now() - session.timestamp < 24 * 60 * 60 * 1000) {
                login(session.email, session.password);
            }
        } catch (e) { }
    }
});




window.loadUsers = async () => {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.innerHTML = '<p class="loading-text">Chargement des utilisateurs...</p>';
    try {
        const res = await fetch('/api/users?_t=' + Date.now());
        const users = await res.json();
        appUsers = users.sort((a, b) => (a.firstName || a.name || '').localeCompare(b.firstName || b.name || ''));
        list.innerHTML = '';
        appUsers.forEach(u => {
            const isBlocked = u.isBlocked;
            const permsStr = u.permissions && u.permissions.length ? u.permissions.join(', ') : 'Aucune';

            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'stretch';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:8px 0;" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <div>
                        <strong style="${isBlocked ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${u.firstName ? u.firstName + ' ' + (u.lastName || '') : u.name}</strong>
                        <div style="font-size:0.8rem; color:var(--text-muted);">Rôle: ${u.role} ${isBlocked ? '(Bloqué)' : ''} | Accès: [${permsStr}]</div>
                    </div>
                    <span>▼</span>
                </div>
                <div class="hidden user-edit-panel" style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top:8px;">
                    <div class="input-group">
                        <label>Prénom</label>
                        <input type="text" id="edit-fn-${u.id}" class="custom-input" value="${u.firstName || ''}">
                    </div>
                    <div class="input-group">
                        <label>Nom</label>
                        <input type="text" id="edit-ln-${u.id}" class="custom-input" value="${u.lastName || ''}">
                    </div>
                    <div class="input-group">
                        <label>Email</label>
                        <input type="email" id="edit-em-${u.id}" class="custom-input" value="${u.email || ''}">
                    </div>
                    <div class="input-group">
                        <label>Mot de passe</label>
                        <input type="text" id="edit-pwd-${u.id}" class="custom-input" value="${u.password || ''}">
                    </div>
                    
                    <div style="margin-top: 12px;">
                        <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:8px;">Permissions d'accès</label>
                        <div style="display:flex; gap:12px; flex-wrap:wrap;">
                            <label style="font-size:0.8rem;"><input type="checkbox" id="edit-perm-caisse-${u.id}" ${(u.permissions || []).includes('caisse') ? 'checked' : ''}> Caisse</label>
                            <label style="font-size:0.8rem;"><input type="checkbox" id="edit-perm-collection-${u.id}" ${(u.permissions || []).includes('collection') ? 'checked' : ''}> Collection</label>
                            <label style="font-size:0.8rem;"><input type="checkbox" id="edit-perm-stock-${u.id}" ${(u.permissions || []).includes('stock') ? 'checked' : ''}> Stock/OPS</label>
                            <label style="font-size:0.8rem;"><input type="checkbox" id="edit-perm-ventes-${u.id}" ${(u.permissions || []).includes('ventes') ? 'checked' : ''}> Ventes</label>
                            <label style="font-size:0.8rem;"><input type="checkbox" id="edit-perm-admin-${u.id}" ${(u.permissions || []).includes('admin') ? 'checked' : ''}> Admin</label>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        <button class="btn primary small-btn" onclick="window.saveUserInline('${u.id}')">Enregistrer</button>
                        <button class="btn ${isBlocked ? 'primary' : 'secondary'} small-btn" onclick="window.toggleBlockUser('${u.id}', ${!isBlocked})">${isBlocked ? 'Débloquer' : 'Bloquer'}</button>
                        <button class="btn danger small-btn" onclick="window.deleteUser('${u.id}')" style="background:var(--danger);color:white;border:none;">Supprimer</button>
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) { console.error(e); }
};

window.saveUserInline = async (id) => {
    const user = appUsers.find(u => u.id === id);
    if (!user) return;
    user.firstName = document.getElementById(`edit-fn-${id}`).value;
    user.lastName = document.getElementById(`edit-ln-${id}`).value;
    user.email = document.getElementById(`edit-em-${id}`).value;
    user.password = document.getElementById(`edit-pwd-${id}`).value;
    user.name = `${user.firstName} ${user.lastName}`.trim();


    const permissions = [];
    if (document.getElementById(`edit-perm-caisse-${id}`)?.checked) permissions.push('caisse');
    if (document.getElementById(`edit-perm-collection-${id}`)?.checked) permissions.push('collection');
    if (document.getElementById(`edit-perm-stock-${id}`)?.checked) permissions.push('stock');
    if (document.getElementById(`edit-perm-ventes-${id}`)?.checked) permissions.push('ventes');
    if (document.getElementById(`edit-perm-admin-${id}`)?.checked) permissions.push('admin');
    user.permissions = permissions;

    await fetch('/api/users/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });
    alert('Utilisateur mis à jour !');
    window.loadUsers();
};

window.toggleBlockUser = async (id, blockStatus) => {
    try {
        await fetch('/api/users/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isBlocked: blockStatus })
        });
        window.loadUsers();
    } catch (e) { console.error(e); }
};

window.forgotPassword = () => {
    alert("Veuillez contacter l'administrateur (hacquard.vincent@gmail.com) pour réinitialiser votre mot de passe ou débloquer votre compte.");
};

window.editUser = (id) => {
    const u = appUsers.find(user => user.id === id);
    if (!u) return;
    document.getElementById('new-user-firstname').value = u.firstName || u.name || '';
    document.getElementById('new-user-lastname').value = u.lastName || '';
    document.getElementById('new-user-email').value = u.email || '';
    document.getElementById('new-user-password').value = u.password || '';
    document.getElementById('new-user-commission').value = u.commission || 0;

    if (document.getElementById('perm-caisse')) document.getElementById('perm-caisse').checked = (u.permissions || []).includes('caisse');
    if (document.getElementById('perm-collection')) document.getElementById('perm-collection').checked = (u.permissions || []).includes('collection');
    if (document.getElementById('perm-stock')) document.getElementById('perm-stock').checked = (u.permissions || []).includes('stock');
    if (document.getElementById('perm-ventes')) document.getElementById('perm-ventes').checked = (u.permissions || []).includes('ventes');
    if (document.getElementById('perm-admin')) document.getElementById('perm-admin').checked = (u.permissions || []).includes('admin');

    const btn = document.querySelector('button[onclick="window.createUser()"]');
    if (btn) {
        btn.innerText = "Sauvegarder les modifications";
        btn.setAttribute('onclick', `window.saveUser('${id}')`);
    }
};

window.saveUser = async (id) => {
    const firstName = document.getElementById('new-user-firstname').value;
    const lastName = document.getElementById('new-user-lastname').value;
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const commission = document.getElementById('new-user-commission').value || 0;

    const permissions = [];
    if (document.getElementById('perm-caisse')?.checked) permissions.push('caisse');
    if (document.getElementById('perm-collection')?.checked) permissions.push('collection');
    if (document.getElementById('perm-stock')?.checked) permissions.push('stock');
    if (document.getElementById('perm-ventes')?.checked) permissions.push('ventes');
    if (document.getElementById('perm-admin')?.checked) permissions.push('admin');

    const role = permissions.includes('admin') ? 'admin' : 'user';

    if (!firstName || !password) return alert('Prénom et Mot de passe requis.');

    try {
        const res = await fetch('/api/users/' + id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, name: `${firstName} ${lastName}`, email, password, role, permissions, commission })
        });
        if (res.ok) {
            document.getElementById('new-user-firstname').value = '';
            document.getElementById('new-user-lastname').value = '';
            document.getElementById('new-user-email').value = '';
            document.getElementById('new-user-password').value = '';
            document.getElementById('new-user-commission').value = '';

            // Reset checkboxes
            document.querySelectorAll('#admin-users input[type="checkbox"]').forEach(c => c.checked = false);

            const btn = document.querySelector(`button[onclick="window.saveUser('${id}')"]`);
            if (btn) {
                btn.innerText = "+ Créer l'utilisateur";
                btn.setAttribute('onclick', 'window.createUser()');
            }
            window.loadUsers();
        }
    } catch (e) { console.error(e); }
};

window.createUser = async () => {
    const firstName = document.getElementById('new-user-firstname').value;
    const lastName = document.getElementById('new-user-lastname').value;
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const commission = document.getElementById('new-user-commission').value || 0;

    const permissions = [];
    if (document.getElementById('perm-caisse')?.checked) permissions.push('caisse');
    if (document.getElementById('perm-collection')?.checked) permissions.push('collection');
    if (document.getElementById('perm-stock')?.checked) permissions.push('stock');
    if (document.getElementById('perm-ventes')?.checked) permissions.push('ventes');
    if (document.getElementById('perm-admin')?.checked) permissions.push('admin');

    const role = permissions.includes('admin') ? 'admin' : 'user';

    if (!firstName || !password) return alert('Prénom et Mot de passe requis.');

    try {
        const res = await fetch('/api/users', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, name: `${firstName} ${lastName}`, email, password, role, permissions, commission })
        });
        if (res.ok) {
            document.getElementById('new-user-firstname').value = '';
            document.getElementById('new-user-lastname').value = '';
            document.getElementById('new-user-email').value = '';
            document.getElementById('new-user-password').value = '';
            document.getElementById('new-user-commission').value = '';
            document.querySelectorAll('#admin-users input[type="checkbox"]').forEach(c => c.checked = false);
            window.loadUsers();
        }
    } catch (e) { console.error(e); }
};

window.deleteUser = async (id) => {
    if (!confirm('Voulez-vous supprimer cet utilisateur ?')) return;
    try {
        await fetch('/api/users/' + id, { method: 'DELETE' });
        window.loadUsers();
    } catch (e) { console.error(e); }
};



window.calculateCheckoutTaxes = async () => {
    if (window.isCalculatingTaxes) return;
    const zip = document.getElementById('cust-zip')?.value || '';
    const state = document.getElementById('cust-state')?.value || '';
    const country = document.getElementById('cust-country')?.value || 'US';
    const city = document.getElementById('cust-city')?.value || '';

    const isUSD = document.getElementById('btn-usd').classList.contains('active');
    if (!isUSD) {
        window.isCalculatingTaxes = false;
        return;
    }
    
    if (cart.length === 0) {
        window.isCalculatingTaxes = false;
        return; // Allows the button to show success without throwing error
    }

    // We send cart data
    const items = cart.map(i => ({
        name: i.name,
        price: i.price,
        sku: i.sku,
        isTakeaway: i.isTakeaway
    }));

    window.isCalculatingTaxes = true;
    document.getElementById('cart-tax-zone').innerText = zip ? `(${zip})` : '(Estimating...)';
    document.getElementById('cart-total-amount').innerText = "Calcul en cours...";
    document.getElementById('btn-charge').disabled = true;
    if(document.getElementById('btn-payment-link')) document.getElementById('btn-payment-link').disabled = true;

    try {
        const reqBody = { zip, state, country, city, items, currency: currentCurrency };
        const res = await fetch('/api/shopify/calculate_taxes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // Subtotal removed per user request
        // Shipping UI removed
        document.getElementById('cart-duties').innerText = "Incluses";
        document.getElementById('cart-tax').innerText = "$" + parseFloat(data.total_tax).toFixed(2);
        
        const taxLinesEl = document.getElementById('cart-tax-lines');
        if (data.tax_lines && data.tax_lines.length > 0) {
            taxLinesEl.style.display = 'flex';
            taxLinesEl.style.flexDirection = 'column';
            
            // On dé-duplique les taxes si Shopify en envoie en double (même titre, même taux)
            const uniqueTaxes = [];
            data.tax_lines.forEach(t => {
                if (!uniqueTaxes.find(x => x.title === t.title && x.rate === t.rate)) {
                    uniqueTaxes.push(t);
                }
            });
            
            taxLinesEl.innerHTML = uniqueTaxes.map(t => 
                `<div style="display:flex; justify-content:space-between; width:100%;"><span>↳ ${t.title} (${(t.rate * 100).toFixed(2)}%)</span><span>$${parseFloat(t.price).toFixed(2)}</span></div>`
            ).join('');
        } else {
            taxLinesEl.style.display = 'none';
            taxLinesEl.innerHTML = '';
        }

        document.getElementById('cart-total-amount').innerText = "$" + parseFloat(data.total_price).toFixed(2);

        // Update Stripe charge amount logic?
        // Wait, stripe charge amount uses total from cart? Let's just save the final total in a global variable
        window.checkoutFinalTotal = parseFloat(data.total_price) * 100;
        document.getElementById('btn-charge').disabled = false;
        if(document.getElementById('btn-payment-link')) document.getElementById('btn-payment-link').disabled = false;

    } catch (err) {
        console.error("Tax calc error", err);
        const errStr = err.message || '';
        if (errStr.includes('province') || errStr.includes('state')) {
            alert("Shopify nécessite l'État (State) en plus du Zip Code pour calculer la taxe aux US. Veuillez l'ajouter ou vérifier vos paramètres.");
        } else if (errStr) {
            // Uncomment to debug if needed: alert("Erreur Shopify: " + errStr);
        }
        // Fallback
        const total = cart.reduce((s, i) => s + i.price, 0);
        // Subtotal removed per user request
        
        // Shipping is now bundled into the item price directly
        // Shipping UI removed
        document.getElementById('cart-duties').innerText = "Incluses";
        document.getElementById('cart-tax').innerText = "Erreur/Non calculé";
        
        const finalTotal = (total / 100);
        document.getElementById('cart-total-amount').innerText = "$" + finalTotal.toFixed(2);
        window.checkoutFinalTotal = Math.round(finalTotal * 100);
        document.getElementById('btn-charge').disabled = false;
        if(document.getElementById('btn-payment-link')) document.getElementById('btn-payment-link').disabled = false;
    } finally {
        window.isCalculatingTaxes = false;
    }
};

document.getElementById('cust-zip')?.addEventListener('input', () => {
    clearTimeout(window.zipTimeout);
    window.zipTimeout = setTimeout(calculateCheckoutTaxes, 800);
});

document.getElementById('cust-state')?.addEventListener('input', () => {
    clearTimeout(window.zipTimeout);
    window.zipTimeout = setTimeout(calculateCheckoutTaxes, 800);
});

document.getElementById('btn-validate-cust')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const originalText = btn.innerText;
    btn.innerText = "Calcul en cours...";
    btn.style.opacity = '0.7';
    btn.disabled = true;

    const zipInput = document.getElementById('cust-zip');
    if (zipInput && zipInput.value.trim()) {
        zipInput.style.border = '';
        const msg = document.getElementById('zip-error-msg');
        if (msg) msg.remove();
    }
    
    try {
        await window.calculateCheckoutTaxes();
        btn.innerText = "✓ Validé";
        btn.style.opacity = '1';
        btn.style.backgroundColor = '#25D366';
        btn.style.borderColor = '#25D366';
    } catch (err) {
        btn.innerText = "❌ Erreur";
        btn.style.backgroundColor = 'var(--danger)';
    } finally {
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.opacity = '1';
            btn.disabled = false;
        }, 2000);
    }
});

window.getColorName = function(colorId) {
    if (!colorId) return '';
    const numericId = parseInt(colorId, 10).toString();
    const match = (ID_MAPS.colors || []).find(c => c.id === colorId || c.id === numericId);
    if (match) return match.name;
    if (colorId === '999' || colorId === '001') return 'Noir';
    return 'Coloris ' + colorId;
};


// --- IMPORT CSV DES PRIX ---
window.uploadProductCSV = async function() {
    const fileInput = document.getElementById('admin-csv-upload');
    const statusEl = document.getElementById('csv-upload-status');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        statusEl.innerText = 'Veuillez sélectionner un fichier CSV.';
        statusEl.style.color = 'var(--danger)';
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        statusEl.innerText = 'Importation en cours...';
        statusEl.style.color = 'var(--text-main)';
        const csvText = e.target.result;
        
        try {
            const response = await fetch('/api/erp/import_csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ csv: csvText })
            });
            
            const data = await response.json();
            
            if (data.success) {
                statusEl.innerText = '✅ Base de données mise à jour avec succès (' + data.count + ' lignes modifiées) !';
                statusEl.style.color = '#4ade80'; // green
                fileInput.value = ''; // reset
                // Force le rechargement de la collection depuis le serveur
                try {
                    const colRes = await fetch('/api/erp/collection');
                    window.collection = await colRes.json();
                    if (typeof window.renderERPStockPieces === 'function') window.renderERPStockPieces();
                    if (typeof window.loadProducts === 'function') window.loadProducts(window.currentCurrency || 'usd');
                } catch(e) { console.error(e); }
                // Optionnel: Recharger la page entière pour s'assurer que tout est propre
                setTimeout(() => { window.location.reload(); }, 2000);
            } else {
                statusEl.innerText = '❌ Erreur: ' + (data.error || 'Erreur inconnue');
                statusEl.style.color = 'var(--danger)';
            }
        } catch (err) {
            statusEl.innerText = '❌ Erreur de connexion au serveur.';
            statusEl.style.color = 'var(--danger)';
        }
    };
    
    reader.readAsText(file);
};
