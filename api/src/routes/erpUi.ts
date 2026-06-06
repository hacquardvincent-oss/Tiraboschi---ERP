import { Router } from 'express';

/** Mini-console web (login JWT + pilotage ERP) — sert sans terminal. */
export const erpUiRouter = Router();

// NB : contenu en template literal — ne PAS utiliser de backtick ni de ${} à l'intérieur.
const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tiraboschi ERP — Console</title>
<style>
  :root { --bg:#f5f5f5; --ink:#111; --accent:#00D4FF; --dark:#050505; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,system-ui,sans-serif; margin:0; background:var(--bg); color:var(--ink); }
  header { background:var(--dark); color:#fff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 0 var(--accent); }
  header h1 { font-size:15px; letter-spacing:.15em; text-transform:uppercase; margin:0; }
  main { max-width:1000px; margin:18px auto; padding:0 14px; }
  .card { background:#fff; border:1px solid #e3e3e3; border-radius:10px; padding:16px; margin-bottom:18px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.1em; margin:0 0 12px; }
  label { display:block; font-size:12px; font-weight:600; margin:8px 0 4px; }
  input, select, textarea { width:100%; padding:9px; border:1px solid #ccc; border-radius:6px; font-size:14px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; }
  .row > div { flex:1; min-width:140px; }
  button { padding:10px 16px; background:var(--dark); color:#fff; border:none; border-radius:6px; cursor:pointer; box-shadow:0 2px 0 var(--accent); font-size:14px; }
  button.link { background:none; color:#0b6; box-shadow:none; padding:4px; }
  table { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
  th,td { text-align:left; padding:7px 8px; border-bottom:1px solid #eee; }
  th { background:#fafafa; }
  .msg { font-size:13px; margin-top:8px; }
  .err { color:#b3261e; } .ok { color:#1a7f37; }
  #login { max-width:360px; margin:60px auto; }
  .hidden { display:none; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width:740px){ .grid2 { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <h1>Tiraboschi ERP — Console</h1>
  <div><span id="who"></span> <button id="logoutBtn" class="link hidden" style="color:#fff" onclick="logout()">Déconnexion</button></div>
</header>

<main>
  <div id="login" class="card">
    <h2>Connexion</h2>
    <label>Email</label><input id="email" type="email" autocomplete="username">
    <label>Mot de passe</label><input id="password" type="password" autocomplete="current-password">
    <div style="margin-top:12px"><button onclick="login()">Se connecter</button></div>
    <div id="loginMsg" class="msg"></div>
  </div>

  <div id="app" class="hidden">
    <div class="grid2">
      <div class="card">
        <h2>Fournisseurs matières</h2>
        <div class="row">
          <div><label>Nom *</label><input id="sup_name"></div>
          <div><label>Email</label><input id="sup_email"></div>
          <div><label>Téléphone</label><input id="sup_phone"></div>
        </div>
        <div style="margin-top:10px"><button onclick="createSupplier()">Ajouter</button></div>
        <div id="sup_msg" class="msg"></div>
        <table id="sup_tbl"></table>
      </div>

      <div class="card">
        <h2>Ateliers de production</h2>
        <div class="row">
          <div><label>Nom *</label><input id="wk_name"></div>
          <div><label>Email</label><input id="wk_email"></div>
          <div><label>Téléphone</label><input id="wk_phone"></div>
        </div>
        <div style="margin-top:10px"><button onclick="createWorkshop()">Ajouter</button></div>
        <div id="wk_msg" class="msg"></div>
        <table id="wk_tbl"></table>
      </div>
    </div>

    <div class="card">
      <h2>Matières (ID matière)</h2>
      <div class="row">
        <div><label>Code *</label><input id="mat_code" placeholder="CU001"></div>
        <div><label>Nom *</label><input id="mat_name"></div>
        <div><label>Catégorie</label><select id="mat_cat"></select></div>
        <div><label>Unité</label><input id="mat_unit" placeholder="dm², pièce…"></div>
        <div><label>Coût unitaire</label><input id="mat_cost" type="number" step="0.01"></div>
        <div><label>Devise</label><input id="mat_cur" value="EUR"></div>
        <div><label>Seuil alerte</label><input id="mat_thr" type="number" step="0.01"></div>
        <div><label>Fournisseur</label><select id="mat_sup"></select></div>
      </div>
      <div style="margin-top:10px"><button onclick="createMaterial()">Ajouter la matière</button></div>
      <div id="mat_msg" class="msg"></div>
      <table id="mat_tbl"></table>
    </div>

    <div class="card">
      <h2>Mouvements de stock</h2>
      <div class="row">
        <div><label>Matière *</label><select id="mv_mat"></select></div>
        <div><label>Type *</label><select id="mv_type"></select></div>
        <div><label>Quantité *</label><input id="mv_qty" type="number" step="0.01"></div>
        <div><label>Atelier (si sortie)</label><select id="mv_wk"></select></div>
        <div><label>Référence</label><input id="mv_ref"></div>
        <div><label>Note</label><input id="mv_note"></div>
      </div>
      <div style="margin-top:10px"><button onclick="createMovement()">Enregistrer le mouvement</button></div>
      <div id="mv_msg" class="msg"></div>
      <table id="mv_tbl"></table>
    </div>
  </div>
</main>

<script>
  var TOKEN = localStorage.getItem('tiraboschi_token') || '';
  var CATS = ['LEATHER','HARDWARE','LINING','PACKAGING','OTHER'];
  var MV_TYPES = ['RECEIPT_IN','EXCEPTIONAL_OUT','ISSUE_TO_WORKSHOP','IN_TRANSIT_TO_WORKSHOP','RETURN','ADJUSTMENT'];

  function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  function opt(v,label){ return '<option value="'+esc(v)+'">'+esc(label||v)+'</option>'; }

  async function api(path, method, body){
    var res = await fetch(path, {
      method: method||'GET',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN },
      body: body? JSON.stringify(body): undefined
    });
    if(res.status===401){ logout(); throw new Error('Session expirée, reconnecte-toi.'); }
    var data = await res.json().catch(function(){return {};});
    if(!res.ok) throw new Error(data.error || ('HTTP '+res.status));
    return data;
  }

  async function login(){
    var msg = document.getElementById('loginMsg'); msg.textContent='Connexion…'; msg.className='msg';
    try{
      var res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value }) });
      var d = await res.json();
      if(!res.ok) throw new Error(d.error||'Échec');
      TOKEN = d.token; localStorage.setItem('tiraboschi_token', TOKEN);
      document.getElementById('who').textContent = d.user.email + ' (' + d.user.role + ')';
      showApp();
    }catch(e){ msg.textContent = e.message; msg.className='msg err'; }
  }
  function logout(){ TOKEN=''; localStorage.removeItem('tiraboschi_token');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    document.getElementById('who').textContent='';
  }

  function fillSelect(id, items, valueKey, labelFn, placeholder){
    var sel = document.getElementById(id); var html = placeholder? opt('', placeholder):'';
    items.forEach(function(it){ html += opt(it[valueKey], labelFn(it)); }); sel.innerHTML = html;
  }

  async function showApp(){
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('mat_cat').innerHTML = CATS.map(function(c){return opt(c);}).join('');
    document.getElementById('mv_type').innerHTML = MV_TYPES.map(function(t){return opt(t);}).join('');
    await Promise.all([loadSuppliers(), loadWorkshops(), loadMaterials(), loadMovements()]);
  }

  // Fournisseurs
  async function loadSuppliers(){
    var items = await api('/api/erp/suppliers');
    document.getElementById('sup_tbl').innerHTML = '<tr><th>Nom</th><th>Email</th><th>Tél</th></tr>' +
      items.map(function(s){ return '<tr><td>'+esc(s.name)+'</td><td>'+esc(s.contactEmail)+'</td><td>'+esc(s.contactPhone)+'</td></tr>'; }).join('');
    fillSelect('mat_sup', items, 'id', function(s){return s.name;}, '— aucun —');
  }
  async function createSupplier(){
    var m=document.getElementById('sup_msg');
    try{ await api('/api/erp/suppliers','POST',{ name:val('sup_name'), contactEmail:val('sup_email'), contactPhone:val('sup_phone') });
      clear(['sup_name','sup_email','sup_phone']); m.textContent='Ajouté.'; m.className='msg ok'; loadSuppliers();
    }catch(e){ m.textContent=e.message; m.className='msg err'; }
  }

  // Ateliers
  async function loadWorkshops(){
    var items = await api('/api/erp/workshops');
    document.getElementById('wk_tbl').innerHTML = '<tr><th>Nom</th><th>Email</th><th>Tél</th></tr>' +
      items.map(function(w){ return '<tr><td>'+esc(w.name)+'</td><td>'+esc(w.contactEmail)+'</td><td>'+esc(w.contactPhone)+'</td></tr>'; }).join('');
    fillSelect('mv_wk', items, 'id', function(w){return w.name;}, '— aucun —');
  }
  async function createWorkshop(){
    var m=document.getElementById('wk_msg');
    try{ await api('/api/erp/workshops','POST',{ name:val('wk_name'), contactEmail:val('wk_email'), contactPhone:val('wk_phone') });
      clear(['wk_name','wk_email','wk_phone']); m.textContent='Ajouté.'; m.className='msg ok'; loadWorkshops();
    }catch(e){ m.textContent=e.message; m.className='msg err'; }
  }

  // Matières
  async function loadMaterials(){
    var items = await api('/api/erp/materials');
    var rows = await Promise.all(items.map(async function(mat){
      var s = await api('/api/erp/materials/'+mat.id+'/stock').catch(function(){return {stock:'?'};});
      return '<tr><td>'+esc(mat.code)+'</td><td>'+esc(mat.name)+'</td><td>'+esc(mat.category)+'</td><td>'+esc(mat.unit)+'</td><td>'+esc(mat.unitCost)+' '+esc(mat.currency)+'</td><td>'+esc(mat.supplier?mat.supplier.name:'')+'</td><td><b>'+esc(s.stock)+'</b></td></tr>';
    }));
    document.getElementById('mat_tbl').innerHTML = '<tr><th>Code</th><th>Nom</th><th>Cat.</th><th>Unité</th><th>Coût</th><th>Fournisseur</th><th>Stock</th></tr>' + rows.join('');
    fillSelect('mv_mat', items, 'id', function(mat){return mat.code+' — '+mat.name;}, '');
  }
  async function createMaterial(){
    var m=document.getElementById('mat_msg');
    try{ await api('/api/erp/materials','POST',{
        code:val('mat_code'), name:val('mat_name'), category:val('mat_cat'), unit:val('mat_unit')||'unit',
        unitCost:numOrNull('mat_cost'), currency:val('mat_cur')||'EUR', reorderThreshold:numOrNull('mat_thr'),
        supplierId:val('mat_sup')||null });
      clear(['mat_code','mat_name','mat_unit','mat_cost','mat_thr']); m.textContent='Matière ajoutée.'; m.className='msg ok';
      loadMaterials();
    }catch(e){ m.textContent=e.message; m.className='msg err'; }
  }

  // Mouvements
  async function loadMovements(){
    var items = await api('/api/erp/stock-movements');
    document.getElementById('mv_tbl').innerHTML = '<tr><th>Date</th><th>Matière</th><th>Type</th><th>Qté</th><th>Atelier</th><th>Réf</th></tr>' +
      items.map(function(mv){ return '<tr><td>'+esc(new Date(mv.createdAt).toLocaleString())+'</td><td>'+esc(mv.material?mv.material.code:'')+'</td><td>'+esc(mv.type)+'</td><td>'+esc(mv.quantity)+'</td><td>'+esc(mv.workshop?mv.workshop.name:'')+'</td><td>'+esc(mv.reference)+'</td></tr>'; }).join('');
  }
  async function createMovement(){
    var m=document.getElementById('mv_msg');
    try{ await api('/api/erp/stock-movements','POST',{
        materialId:val('mv_mat'), type:val('mv_type'), quantity:numOrNull('mv_qty'),
        workshopId:val('mv_wk')||null, reference:val('mv_ref'), note:val('mv_note') });
      clear(['mv_qty','mv_ref','mv_note']); m.textContent='Mouvement enregistré.'; m.className='msg ok';
      loadMovements(); loadMaterials();
    }catch(e){ m.textContent=e.message; m.className='msg err'; }
  }

  function val(id){ return document.getElementById(id).value.trim(); }
  function numOrNull(id){ var v=document.getElementById(id).value; return v===''? null : Number(v); }
  function clear(ids){ ids.forEach(function(id){ document.getElementById(id).value=''; }); }

  if(TOKEN){ showApp().catch(function(){ logout(); }); }
</script>
</body>
</html>`;

erpUiRouter.get('/', (_req, res) => {
  res.type('html').send(PAGE);
});
