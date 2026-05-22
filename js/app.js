/* ═══════════════════════════════════════════════════════
   app.js  —  Lógica de aplicación: auth, routing, cotizador,
              inventario, config, PDF, inicialización
   ═══════════════════════════════════════════════════════ */

/* ── Estado global ───────────────────────────────────── */
window.todosLosTrabajos   = [];
window.todosLosFilamentos = [];
window.estadoFilter       = 'todos';
window.invView            = 'grid';
window.cfg                = {};
let editingTrabId = null;
let editingFilId  = null;

/* ── Tema ────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('p3d_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn();
}
function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('p3d_theme', next);
  updateThemeBtn();
}
function updateThemeBtn() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ['themeBtn','themeBtnLogin'].forEach(id => {
    const el = $(id); if (!el) return;
    el.innerHTML = dark
      ? '<svg class="i16"><use href="#i-sun"/></svg>'
      : '<svg class="i16"><use href="#i-moon"/></svg>';
  });
}

/* ── Auth ────────────────────────────────────────────── */
async function tryLogin() {
  const pw = $('login_pw')?.value.trim();
  if (!pw) { showLoginErr('Ingresa tu contraseña'); return; }
  const hash = await sha256(pw);
  if (hash !== localStorage.getItem(AUTH_PW_KEY)) { showLoginErr('Contraseña incorrecta'); return; }
  startSession(localStorage.getItem(AUTH_NAME_KEY) || 'Usuario');
  $('login_pw').value = '';
  hideLoginErr();
  showApp();
}

async function trySetup() {
  const name = $('setup_name')?.value.trim();
  const pw   = $('setup_pw')?.value.trim();
  const pw2  = $('setup_pw2')?.value.trim();
  if (!name)       { showSetupErr('Ingresa tu nombre'); return; }
  if (pw.length<6) { showSetupErr('Contraseña mínimo 6 caracteres'); return; }
  if (pw !== pw2)  { showSetupErr('Las contraseñas no coinciden'); return; }
  const hash = await sha256(pw);
  localStorage.setItem(AUTH_PW_KEY, hash);
  localStorage.setItem(AUTH_NAME_KEY, name);
  startSession(name);
  hideSetupErr();
  showApp();
}

function logout() {
  clearSession();
  const appEl  = document.querySelector('.app');
  const authEl = document.querySelector('.auth-screen');
  if (appEl)  appEl.style.display  = 'none';
  if (authEl) authEl.style.display = 'flex';
  routeAfterLogin();
}

async function cambiarPassword() {
  const current = $('sec_current')?.value.trim();
  const newPw   = $('sec_new')?.value.trim();
  if (!current || !newPw) { toast('Completa ambos campos', 'error'); return; }
  if (newPw.length < 6)   { toast('Mínimo 6 caracteres', 'error'); return; }
  if (await sha256(current) !== localStorage.getItem(AUTH_PW_KEY)) { toast('Contraseña actual incorrecta', 'error'); return; }
  localStorage.setItem(AUTH_PW_KEY, await sha256(newPw));
  $('sec_current').value = '';
  $('sec_new').value     = '';
  toast('Contraseña actualizada', 'success');
}

function showLoginErr(msg) { const el=$('loginErr');    if(el){el.textContent=msg;el.style.display='block';} }
function hideLoginErr()    { const el=$('loginErr');    if(el) el.style.display='none'; }
function showSetupErr(msg) { const el=$('setupErrMsg'); if(el) el.textContent=msg; const e=$('setupErr'); if(e) e.style.display='block'; }
function hideSetupErr()    { const el=$('setupErr');    if(el) el.style.display='none'; }

function routeAfterLogin() {
  const hasPw = !!localStorage.getItem(AUTH_PW_KEY);
  $('loginCard') && ($('loginCard').style.display = hasPw ? '' : 'none');
  $('setupCard') && ($('setupCard').style.display = hasPw ? 'none' : '');
}

function showApp() {
  const authEl = document.querySelector('.auth-screen');
  const appEl  = document.querySelector('.app');
  if (authEl) authEl.style.display = 'none';
  if (appEl)  { appEl.style.display = 'grid'; }
  const name = localStorage.getItem(AUTH_NAME_KEY) || 'Usuario';
  const el = $('sb-display-name'); if(el) el.textContent = name;
  const av = $('sb-avatar');       if(av) av.textContent = name.charAt(0).toUpperCase();
  const cn = $('cfg-display-name');if(cn) cn.textContent = name;
  goPage('dashboard');
  cargarDatos();
}

/* ── Routing ─────────────────────────────────────────── */
function goPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('show');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pageId));
  const labels = {dashboard:'Dashboard',cotizador:'Nueva cotización',trabajos:'Trabajos',inventario:'Inventario',configuracion:'Configuración'};
  const crumb = $('crumb-current'); if(crumb) crumb.textContent = labels[pageId] || pageId;
  closeSidebar();
}
const route = (p) => goPage(p);
function closeSidebar()  { document.querySelector('.sidebar')?.classList.remove('open'); }
function toggleSidebar() { document.querySelector('.sidebar')?.classList.toggle('open'); }

/* ── Carga inicial de datos ──────────────────────────── */
async function cargarDatos() {
  try {
    const [config, empresa, trabajos, filamentos] = await Promise.all([
      dbCargarConfig(),
      dbCargarEmpresa(),
      dbCargarTrabajos(),
      dbCargarFilamentos()
    ]);
    window.cfg               = config;
    window.todosLosTrabajos  = trabajos;
    window.todosLosFilamentos = filamentos;

    /* poblar campos de configuración */
    const cfgMap = {watts:'cfg_watts',kwh:'cfg_kwh',compra:'cfg_compra',vida:'cfg_vida',mant:'cfg_mant',tMO:'cfg_tMO',tDis:'cfg_tDis',fallosDefault:'cfg_fallosDefault',margenDefault:'cfg_margenDefault',ivaDefault:'cfg_ivaDefault'};
    Object.entries(cfgMap).forEach(([k,id]) => { const el=$(id); if(el && config[k]!==undefined) el.value=config[k]; });
    recalcCfg();

    /* poblar campos de empresa */
    ['nombre','cedula','email','tel','web','ig','nota'].forEach(k => {
      const el=$('emp_'+k); if(el && empresa[k]!==undefined) el.value=empresa[k];
    });

    renderDashboard();
    renderTrabajos();
    renderFilamentos();
    populateFilamentSelect();
    actualizarBadges();
  } catch(e) { toast('Error cargando datos','error'); console.error(e); }
}

/* ── Configuración ───────────────────────────────────── */
function recalcCfg() {
  const watts = parseFloat($('cfg_watts')?.value||'0');
  const kwh   = parseFloat($('cfg_kwh')?.value||'0');
  const el = $('cfg_elecHora'); if(el) el.value = (watts*kwh/1000).toFixed(4);
}

async function guardarConfiguracion() {
  const btn = document.querySelector('[onclick="guardarConfiguracion()"]');
  setLoading(btn, true);
  try {
    const data = {
      watts:         parseFloat($('cfg_watts')?.value||'0'),
      kwh:           parseFloat($('cfg_kwh')?.value||'0'),
      compra:        parseFloat($('cfg_compra')?.value||'0'),
      vida:          parseFloat($('cfg_vida')?.value||'0'),
      mant:          parseFloat($('cfg_mant')?.value||'0'),
      tMO:           parseFloat($('cfg_tMO')?.value||'0'),
      tDis:          parseFloat($('cfg_tDis')?.value||'0'),
      fallosDefault: parseFloat($('cfg_fallosDefault')?.value||'5'),
      margenDefault: parseFloat($('cfg_margenDefault')?.value||'20'),
      ivaDefault:    parseFloat($('cfg_ivaDefault')?.value||'13'),
    };
    window.cfg = data;
    await dbGuardarConfig(data);
    toast('Configuración guardada', 'success');
  } catch(e) { toast('Error guardando configuración','error'); console.error(e); }
  setLoading(btn, false);
}

async function guardarEmpresa() {
  const btn = document.querySelector('[onclick="guardarEmpresa()"]');
  setLoading(btn, true);
  try {
    const data = {};
    ['nombre','cedula','email','tel','web','ig','nota'].forEach(k => {
      const el=$('emp_'+k); if(el) data[k]=el.value;
    });
    await dbGuardarEmpresa(data);
    toast('Datos de empresa guardados', 'success');
  } catch(e) { toast('Error guardando empresa','error'); console.error(e); }
  setLoading(btn, false);
}

function cfgGo(section) {
  document.querySelectorAll('.cfg-panel').forEach(p => p.classList.remove('show'));
  const panel = document.getElementById('cfg-'+section);
  if (panel) panel.classList.add('show');
  document.querySelectorAll('.cfg-nav-item').forEach(n => n.classList.toggle('active', n.dataset.section===section));
}

/* ── Trabajos ────────────────────────────────────────── */
function setEstadoFilter(estado) {
  window.estadoFilter = estado;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.estado===estado));
  renderTrabajos();
}

async function cambiarEstado(id, estado) {
  try {
    await dbCambiarEstado(id, estado);
    const t = window.todosLosTrabajos.find(t=>t.id===id);
    if (t) t.estado = estado;
    renderTrabajos();
    renderDashboard();
    toast('Estado actualizado','success');
  } catch(e) { toast('Error actualizando estado','error'); console.error(e); }
}

async function eliminarTrabajo(id) {
  if (!confirm('¿Eliminar este trabajo? Esta acción no se puede deshacer.')) return;
  try {
    await dbEliminarTrabajo(id);
    window.todosLosTrabajos = window.todosLosTrabajos.filter(t => t.id !== id);
    renderTrabajos();
    renderDashboard();
    actualizarBadges();
    toast('Trabajo eliminado','success');
  } catch(e) { toast('Error eliminando trabajo','error'); console.error(e); }
}

/* ── Cotizador ───────────────────────────────────────── */
function getCostoGramo() {
  const sel = $('c_filamento'); if (!sel || !sel.value) return 0;
  return parseFloat(sel.options[sel.selectedIndex]?.dataset?.cg || '0');
}

function recalc() {
  const cfg      = window.cfg || {};
  const gramos   = parseFloat($('c_gramos')?.value||'0');
  const horas    = parseFloat($('c_horas')?.value||'0');
  const horasMO  = parseFloat($('c_horasMO')?.value||'0');
  const horasDis = parseFloat($('c_horasDis')?.value||'0');
  const disFijo  = parseFloat($('c_disFijo')?.value||'0');
  const post     = parseFloat($('c_post')?.value||'0');
  const otros    = parseFloat($('c_otros')?.value||'0');
  const fallos   = parseFloat($('c_fallos')?.value||(cfg.fallosDefault||5).toString());
  const margen   = parseFloat($('c_margen')?.value||(cfg.margenDefault||20).toString());
  const iva      = parseFloat($('c_iva')?.value||(cfg.ivaDefault||0).toString());
  const cant     = Math.max(1, parseInt($('c_cant')?.value||'1'));
  const cg       = getCostoGramo();

  const mat     = gramos * (cg/1000);
  const elec    = horas * (cfg.watts||0) * (cfg.kwh||0) / 1000;
  const des     = ((cfg.compra||0)/(cfg.vida||1)) + ((cfg.mant||0)/12)/720;
  const mo      = horasMO * (cfg.tMO||0);
  const dis     = horasDis * (cfg.tDis||0) + disFijo;
  const extra   = post + otros;
  const sub     = mat+elec+des+mo+dis+extra;
  const fa      = sub * (fallos/100);
  const base    = sub + fa;
  const gan     = base * (margen/100);
  const ivaAbs  = (base+gan) * (iva/100);
  const finalUnit = base+gan+ivaAbs;

  const s = (id, v) => { const el=$(id); if(el) el.textContent=v; };
  s('pv_mat',      fmt(mat));
  s('pv_elec',     fmt(elec));
  s('pv_des',      fmt(des));
  s('pv_mo',       fmt(mo));
  s('pv_dis',      fmt(dis));
  s('pv_extra',    fmt(extra));
  s('pv_sub',      fmt(sub));
  s('pv_fa',       fmt(fa));
  s('pv_gan',      fmt(gan));
  s('pv_ivaAbs',   fmt(ivaAbs));
  s('pv_finalUnit',fmt(finalUnit));
  s('pv_total',    fmt(finalUnit * cant));
  s('pv_costo',    fmt(base * cant));
  s('pv_margenAbs',fmt(gan * cant));
  const cl = $('pv_cantLabel'); if(cl) cl.textContent = cant>1?`× ${cant} unidades`:'';
}

function goStep(n) {
  document.querySelectorAll('.step-panel').forEach((p,i) => p.classList.toggle('show', i+1===n));
  document.querySelectorAll('.step').forEach((d,i) => {
    d.classList.toggle('active', i+1===n);
    d.classList.toggle('done',   i+1 < n);
  });
  recalc();
}

async function guardarCotizacion() {
  const pieza   = $('c_pieza')?.value.trim();
  const cliente = $('c_cliente')?.value.trim();
  if (!pieza)   { toast('Ingresa el nombre de la pieza','error'); return; }
  if (!cliente) { toast('Ingresa el nombre del cliente','error'); return; }

  const btn = $('saveCotBtn');
  setLoading(btn, true);
  try {
    const cfg      = window.cfg || {};
    const cant     = Math.max(1, parseInt($('c_cant')?.value||'1'));
    const gramos   = parseFloat($('c_gramos')?.value||'0');
    const horas    = parseFloat($('c_horas')?.value||'0');
    const horasMO  = parseFloat($('c_horasMO')?.value||'0');
    const horasDis = parseFloat($('c_horasDis')?.value||'0');
    const disFijo  = parseFloat($('c_disFijo')?.value||'0');
    const post     = parseFloat($('c_post')?.value||'0');
    const otros    = parseFloat($('c_otros')?.value||'0');
    const fallos   = parseFloat($('c_fallos')?.value||(cfg.fallosDefault||5).toString());
    const margen   = parseFloat($('c_margen')?.value||(cfg.margenDefault||20).toString());
    const iva      = parseFloat($('c_iva')?.value||(cfg.ivaDefault||0).toString());
    const cg       = getCostoGramo();

    const mat   = gramos*(cg/1000);
    const elec  = horas*(cfg.watts||0)*(cfg.kwh||0)/1000;
    const des   = ((cfg.compra||0)/(cfg.vida||1))+((cfg.mant||0)/12)/720;
    const mo    = horasMO*(cfg.tMO||0);
    const dis   = horasDis*(cfg.tDis||0)+disFijo;
    const extra = post+otros;
    const sub   = mat+elec+des+mo+dis+extra;
    const fa    = sub*(fallos/100);
    const base  = sub+fa;
    const gan   = base*(margen/100);
    const ivaAbs= (base+gan)*(iva/100);
    const finalUnit = base+gan+ivaAbs;

    const data = {
      pieza, cliente,
      fecha:       $('c_fecha')?.value || new Date().toISOString().slice(0,10),
      categoria:   $('c_cat')?.value || '',
      cantidad: cant, gramos, horas, horasMO, horasDis, disFijo, post, otros, fallos, margen, iva,
      filamentoId: $('c_filamento')?.value || '',
      costoTotal:  parseFloat(base.toFixed(2)),
      precioFinal: parseFloat(finalUnit.toFixed(2)),
      estado: 'pendiente',
      notas: $('c_notas')?.value || '',
    };

    const newId = await dbGuardarCotizacion(data, editingTrabId);

    if (editingTrabId) {
      const idx = window.todosLosTrabajos.findIndex(t=>t.id===editingTrabId);
      if (idx>=0) window.todosLosTrabajos[idx] = {...window.todosLosTrabajos[idx], ...data};
      toast('Cotización actualizada','success');
    } else {
      window.todosLosTrabajos.unshift({id: newId, ...data});
      toast('Cotización guardada','success');
    }
    actualizarBadges();
    renderDashboard();
    renderTrabajos();
    resetCotizador();
    goPage('trabajos');
  } catch(e) { toast('Error guardando cotización','error'); console.error(e); }
  setLoading(btn, false);
}

function editarTrabajo(id) {
  const t = window.todosLosTrabajos.find(t=>t.id===id); if (!t) return;
  editingTrabId = id;
  const sets = {c_pieza:t.pieza,c_cliente:t.cliente,c_fecha:t.fecha,c_cat:t.categoria,c_cant:t.cantidad,c_gramos:t.gramos,c_horas:t.horas,c_horasMO:t.horasMO,c_horasDis:t.horasDis,c_disFijo:t.disFijo,c_post:t.post,c_otros:t.otros,c_notas:t.notas,c_fallos:t.fallos,c_margen:t.margen,c_iva:t.iva};
  Object.entries(sets).forEach(([id,v]) => { const el=$(id); if(el&&v!==undefined) el.value=v; });
  if (t.filamentoId) { const sel=$('c_filamento'); if(sel) sel.value=t.filamentoId; }
  const title=$('cot-page-title'), label=$('saveCotLabel'), cancel=$('cancelEditBtn');
  if(title)  title.textContent  = 'Editar cotización';
  if(label)  label.textContent  = 'Actualizar';
  if(cancel) cancel.style.display = '';
  goPage('cotizador'); goStep(1); recalc();
}

function cancelarEdicionTrabajo() { resetCotizador(); }

function resetCotizador() {
  const cfg = window.cfg || {};
  editingTrabId = null;
  ['c_pieza','c_cliente','c_notas','c_gramos','c_horas','c_horasMO','c_horasDis','c_disFijo','c_post','c_otros'].forEach(id => {
    const el=$(id); if(el) el.value='';
  });
  const cf=$('c_fecha'); if(cf) cf.value=new Date().toISOString().slice(0,10);
  $('c_cant')   && ($('c_cant').value   = '1');
  $('c_fallos') && ($('c_fallos').value = cfg.fallosDefault||5);
  $('c_margen') && ($('c_margen').value = cfg.margenDefault||20);
  $('c_iva')    && ($('c_iva').value    = cfg.ivaDefault||0);
  const sel=$('c_filamento'); if(sel) sel.selectedIndex=0;
  const title=$('cot-page-title'), label=$('saveCotLabel'), cancel=$('cancelEditBtn');
  if(title)  title.textContent  = 'Nueva cotización';
  if(label)  label.textContent  = 'Guardar trabajo';
  if(cancel) cancel.style.display = 'none';
  goStep(1);
}

/* ── Inventario drawer ───────────────────────────────── */
function openDrawer() {
  editingFilId = null;
  const title=$('drawerTitle'), label=$('drawerSaveLabel');
  if(title)  title.textContent = 'Agregar filamento';
  if(label)  label.textContent = 'Agregar al inventario';
  ['inv_tipo','inv_color','inv_marca','inv_proveedor','inv_notas'].forEach(id => { const el=$(id); if(el) el.value=''; });
  $('inv_precio')      && ($('inv_precio').value     = '6500');
  $('inv_peso')        && ($('inv_peso').value        = '1000');
  $('inv_disponibles') && ($('inv_disponibles').value = '1000');
  const fi=$('inv_fecha'); if(fi) fi.value=new Date().toISOString().slice(0,10);
  document.querySelector('.drawer')?.classList.add('open');
  document.querySelector('.drawer-back')?.classList.add('open');
}

function editarFilamento(id) {
  const f = window.todosLosFilamentos.find(f=>f.id===id); if(!f) return;
  editingFilId = id;
  const sets={inv_tipo:f.tipo,inv_color:f.color,inv_marca:f.marca,inv_proveedor:f.proveedor,inv_precio:f.precio,inv_peso:f.peso,inv_disponibles:f.disponibles,inv_fecha:f.fechaCompra,inv_notas:f.notas};
  Object.entries(sets).forEach(([id,v]) => { const el=$(id); if(el&&v!==undefined) el.value=v; });
  const title=$('drawerTitle'), label=$('drawerSaveLabel');
  if(title)  title.textContent = 'Editar filamento';
  if(label)  label.textContent = 'Guardar cambios';
  document.querySelector('.drawer')?.classList.add('open');
  document.querySelector('.drawer-back')?.classList.add('open');
}

function closeDrawer() {
  document.querySelector('.drawer')?.classList.remove('open');
  document.querySelector('.drawer-back')?.classList.remove('open');
  editingFilId = null;
}

async function guardarFilamento() {
  const tipo = $('inv_tipo')?.value.trim();
  if (!tipo) { toast('Ingresa el tipo de filamento','error'); return; }
  const btn = $('drawerSaveBtn');
  setLoading(btn, true);
  try {
    const data = {
      tipo,
      color:       $('inv_color')?.value.trim()      || '',
      marca:       $('inv_marca')?.value.trim()      || '',
      proveedor:   $('inv_proveedor')?.value.trim()  || '',
      precio:      parseFloat($('inv_precio')?.value      || '0'),
      peso:        parseFloat($('inv_peso')?.value        || '0'),
      disponibles: parseFloat($('inv_disponibles')?.value || '0'),
      fechaCompra: $('inv_fecha')?.value || '',
      notas:       $('inv_notas')?.value || '',
    };
    const newId = await dbGuardarFilamento(data, editingFilId);
    if (editingFilId) {
      const idx = window.todosLosFilamentos.findIndex(f=>f.id===editingFilId);
      if (idx>=0) window.todosLosFilamentos[idx] = {...window.todosLosFilamentos[idx], ...data};
      toast('Filamento actualizado','success');
    } else {
      window.todosLosFilamentos.push({id: newId, ...data});
      toast('Filamento agregado','success');
    }
    renderFilamentos();
    populateFilamentSelect();
    actualizarBadges();
    closeDrawer();
  } catch(e) { toast('Error guardando filamento','error'); console.error(e); }
  setLoading(btn, false);
}

async function eliminarFilamento(id) {
  if (!confirm('¿Eliminar este filamento?')) return;
  try {
    await dbEliminarFilamento(id);
    window.todosLosFilamentos = window.todosLosFilamentos.filter(f=>f.id!==id);
    renderFilamentos();
    populateFilamentSelect();
    actualizarBadges();
    toast('Filamento eliminado','success');
  } catch(e) { toast('Error eliminando filamento','error'); console.error(e); }
}

function setInvView(view) {
  window.invView = view;
  $('inv-grid-view')?.classList.toggle('active', view==='grid');
  $('inv-list-view')?.classList.toggle('active', view==='list');
  const fg=$('filGrid'), ft=document.querySelector('.fil-table-wrap');
  if(fg) fg.style.display = view==='grid' ? '' : 'none';
  if(ft) ft.style.display = view==='list' ? '' : 'none';
  renderFilamentos();
}

/* ── PDF ─────────────────────────────────────────────── */
function buildPDFHtml(t, emp) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Cotización ${(t.id||'').slice(0,8)}</title>
<style>
  body{font-family:sans-serif;max-width:700px;margin:40px auto;color:#222;font-size:14px}
  h1{font-size:22px;margin:0 0 4px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:2px solid #6C63FF;padding-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee}
  th{background:#f5f4ff;font-weight:600}
  .total-row td{font-size:18px;font-weight:700;color:#6C63FF;border-top:2px solid #6C63FF}
  .chip{padding:3px 10px;border-radius:12px;font-size:12px;background:#e9e8ff;color:#6C63FF}
</style></head><body>
<div class="header">
  <div><h1>${emp.nombre||'Pin&amp;Pon 3D'}</h1><div>${emp.email||''} ${emp.tel?'· '+emp.tel:''}</div><div>${emp.cedula||''}</div></div>
  <div style="text-align:right">
    <div style="font-size:11px;opacity:.6">COT-${(t.id||'').slice(0,8).toUpperCase()}</div>
    <div>${t.fecha||new Date().toISOString().slice(0,10)}</div>
    <span class="chip">${t.estado||'pendiente'}</span>
  </div>
</div>
<table>
  <tr><th colspan="2">Información del trabajo</th></tr>
  <tr><td>Pieza</td><td>${t.pieza||'—'}</td></tr>
  <tr><td>Cliente</td><td>${t.cliente||'—'}</td></tr>
  <tr><td>Categoría</td><td>${t.categoria||'—'}</td></tr>
  <tr><td>Cantidad</td><td>${t.cantidad||1}</td></tr>
  <tr><td>Gramos</td><td>${t.gramos||0} g</td></tr>
  <tr><td>Horas impresión</td><td>${t.horas||0} h</td></tr>
  ${t.notas?`<tr><td>Notas</td><td>${t.notas}</td></tr>`:''}
</table>
<table>
  <tr><th>Concepto</th><th style="text-align:right">Monto</th></tr>
  <tr><td>Costo producción</td><td style="text-align:right">${fmt(t.costoTotal||0)}</td></tr>
  <tr><td>Precio unitario (IVA incl.)</td><td style="text-align:right">${fmt(t.precioFinal||0)}</td></tr>
  <tr class="total-row"><td>TOTAL (${t.cantidad||1} uds)</td><td style="text-align:right">${fmt((t.precioFinal||0)*(t.cantidad||1))}</td></tr>
</table>
${emp.nota?`<p style="margin-top:24px;font-size:12px;opacity:.6">${emp.nota}</p>`:''}
</body></html>`;
}

async function generarPDF(id) {
  const t = window.todosLosTrabajos.find(t=>t.id===id); if(!t) return;
  const emp = await dbCargarEmpresa();
  const w = window.open('','_blank');
  if (w) { w.document.write(buildPDFHtml(t, emp)); w.document.close(); setTimeout(()=>w.print(),500); }
}

async function generarPDFCotizador() {
  const cfg = window.cfg || {};
  const cg  = getCostoGramo();
  const gramos   = parseFloat($('c_gramos')?.value||'0');
  const horas    = parseFloat($('c_horas')?.value||'0');
  const horasMO  = parseFloat($('c_horasMO')?.value||'0');
  const horasDis = parseFloat($('c_horasDis')?.value||'0');
  const disFijo  = parseFloat($('c_disFijo')?.value||'0');
  const post     = parseFloat($('c_post')?.value||'0');
  const otros    = parseFloat($('c_otros')?.value||'0');
  const fallos   = parseFloat($('c_fallos')?.value||(cfg.fallosDefault||5).toString());
  const margen   = parseFloat($('c_margen')?.value||(cfg.margenDefault||20).toString());
  const iva      = parseFloat($('c_iva')?.value||(cfg.ivaDefault||0).toString());
  const cant     = Math.max(1, parseInt($('c_cant')?.value||'1'));
  const mat=gramos*(cg/1000), elec=horas*(cfg.watts||0)*(cfg.kwh||0)/1000;
  const des=((cfg.compra||0)/(cfg.vida||1))+((cfg.mant||0)/12)/720;
  const mo=horasMO*(cfg.tMO||0), dis=horasDis*(cfg.tDis||0)+disFijo, extra=post+otros;
  const sub=mat+elec+des+mo+dis+extra, fa=sub*(fallos/100), base=sub+fa;
  const gan=base*(margen/100), ivaAbs=(base+gan)*(iva/100), finalUnit=base+gan+ivaAbs;
  const t = {id:'preview',pieza:$('c_pieza')?.value||'Sin nombre',cliente:$('c_cliente')?.value||'Sin cliente',fecha:$('c_fecha')?.value||new Date().toISOString().slice(0,10),categoria:$('c_cat')?.value||'',cantidad:cant,gramos,horas,costoTotal:base,precioFinal:finalUnit,estado:'pendiente',notas:$('c_notas')?.value||''};
  const emp = await dbCargarEmpresa();
  const w = window.open('','_blank');
  if (w) { w.document.write(buildPDFHtml(t, emp)); w.document.close(); setTimeout(()=>w.print(),500); }
}

/* ── Global search ───────────────────────────────────── */
function onGlobalSearch(e) {
  const q = e.target.value.toLowerCase().trim(); if(!q) return;
  const found = window.todosLosTrabajos.filter(t=>`${t.pieza} ${t.cliente}`.toLowerCase().includes(q));
  if (found.length) { const tb=$('t_buscar'); if(tb) tb.value=e.target.value; window.estadoFilter='todos'; renderTrabajos(); goPage('trabajos'); }
}

/* ── Inicialización ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  routeAfterLogin();

  const appEl  = document.querySelector('.app');
  const authEl = document.querySelector('.auth-screen');

  /* Verificar que la sesión sea válida Y que exista contraseña configurada */
  if (checkSession() && localStorage.getItem(AUTH_PW_KEY)) {
    showApp();
  } else {
    clearSession();           /* limpiar sesión inválida/expirada */
    if (appEl)  appEl.style.display  = 'none';
    if (authEl) authEl.style.display = 'flex';
  }

  /* enter en login */
  const lp = $('login_pw'); if(lp) lp.addEventListener('keydown', e => { if(e.key==='Enter') tryLogin(); });

  /* recalc en cotizador */
  ['c_gramos','c_horas','c_horasMO','c_horasDis','c_disFijo','c_post','c_otros','c_fallos','c_margen','c_iva','c_cant','c_filamento']
    .forEach(id => { const el=$(id); if(el) el.addEventListener('input', recalc); });

  /* recalc config */
  ['cfg_watts','cfg_kwh'].forEach(id => { const el=$(id); if(el) el.addEventListener('input', recalcCfg); });

  /* búsquedas */
  $('inv_buscar')  && $('inv_buscar').addEventListener('input', renderFilamentos);
  $('t_buscar')    && $('t_buscar').addEventListener('input', renderTrabajos);
  $('globalSearch')&& $('globalSearch').addEventListener('input', onGlobalSearch);

  /* nav principal */
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.addEventListener('click', () => goPage(n.dataset.page)));

  /* nav configuración */
  document.querySelectorAll('.cfg-nav-item[data-section]').forEach(n => n.addEventListener('click', () => cfgGo(n.dataset.section)));

  /* filtros de estado */
  document.querySelectorAll('.filter-chip[data-estado]').forEach(c => c.addEventListener('click', () => setEstadoFilter(c.dataset.estado)));

  /* vista inventario */
  $('inv-grid-view') && $('inv-grid-view').addEventListener('click', () => setInvView('grid'));
  $('inv-list-view') && $('inv-list-view').addEventListener('click', () => setInvView('list'));

  /* estado inicial */
  cfgGo('empresa');
  $('c_fecha') && ($('c_fecha').value = new Date().toISOString().slice(0,10));
  document.querySelectorAll('.step-panel').forEach((p,i) => p.classList.toggle('show', i===0));
  setInvView('grid');
});
