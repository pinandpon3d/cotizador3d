/**
 * CONTROLADOR DE APLICACIÓN — app.js
 *
 * Responsabilidad: estado global, navegación, CRUD (orquesta
 * db.js + ui.js), generación de PDF e inicialización.
 *
 * Depende de: db.js, logic.js, ui.js
 */

'use strict';

/* ----------------------------------------------------------
   Estado global
---------------------------------------------------------- */
let trabajos   = [];
let filamentos = [];
let clientes   = [];
let editingId  = null;
let gastos    = [];
let inversion = { activa: false, items: [] };
let categoriasPago = ['Pendiente', 'Abono', 'Pagado'];
let _dashFiltro    = 'mes-actual';
let seleccionados  = new Set();   // IDs seleccionados para cotización combinada
let _trabajosVista = 'tabla';     // 'tabla' | 'kanban'
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth();  // 0-indexed

/* ----------------------------------------------------------
   Navegación
---------------------------------------------------------- */
const PAGE_LABELS = {
  cotizador:    'Cotizador',
  trabajos:     'Trabajos',
  inventario:   'Inventario',
  configuracion:'Configuración',
  usuarios:     'Usuarios',
  dashboard:    'Dashboard',
  clientes:     'Clientes',
  detalle:      'Al Detalle',
  costos:       'Costos',
  calendario:   'Calendario'
};

/* ─── TABS DE CONFIGURACIÓN ─── */
function switchCfgTab(tab) {
  ['costos','empresa','integraciones'].forEach(t => {
    const panel = el('cfgtab-' + t);
    const btn   = el('cfgtab-btn-' + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
}

/* ─── VISTA KANBAN / TABLA ─── */
function toggleTrabajosVista(vista) {
  _trabajosVista = vista;
  const tWrap   = el('trabajos-table-wrap');
  const kanban  = el('trabajos-kanban');
  const tEmpty  = el('trabajos-empty');
  if (tWrap)  tWrap.style.display  = vista === 'tabla'  ? '' : 'none';
  if (kanban) kanban.style.display = vista === 'kanban' ? '' : 'none';
  if (tEmpty && vista === 'kanban') tEmpty.style.display = 'none';
  document.querySelectorAll('.vista-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.vista === vista)
  );
  renderTrabajos();
}

function navTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg  = el('page-' + page); if (pg)  pg.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`); if (nav) nav.classList.add('active');
  set('breadcrumb-current', PAGE_LABELS[page] || page);
  if (page !== 'trabajos')      limpiarSeleccion();
  if (page === 'trabajos')      cargarTrabajos();
  if (page === 'inventario')    cargarInventario();
  if (page === 'cotizador')     cargarFilamentosYPoblar();
  if (page === 'configuracion') { calcCfg(); actualizarUIUsuario && actualizarUIUsuario(); }
  if (page === 'usuarios')      { if (typeof cargarUsuarios === 'function') cargarUsuarios(); }
  if (page === 'dashboard')     cargarDashboard();
  if (page === 'clientes')      cargarClientes();
  if (page === 'detalle')       cargarVentaDetalle();
  if (page === 'costos')        cargarCostos();
  if (page === 'calendario')    cargarCalendario();
  closeSidebar();
}

function openSidebar()  { el('sidebar').classList.add('open');    el('overlay').classList.add('show'); }
function closeSidebar() { el('sidebar').classList.remove('open'); el('overlay').classList.remove('show'); }

/* ----------------------------------------------------------
   Helper: calcular estado de pago automáticamente
---------------------------------------------------------- */
function calcEstadoPago(precioFinal, montoAbonado) {
  const precio = parseFloat(precioFinal) || 0;
  const abono  = parseFloat(montoAbonado) || 0;
  if (abono <= 0)          return 'Pendiente';
  if (abono >= precio)     return 'Pagado';
  return 'Abono';
}

/* ----------------------------------------------------------
   Cotizaciones — Guardar
---------------------------------------------------------- */
function guardarCotizacion() {
  const pieza   = el('c_pieza').value.trim();
  const cliente = el('c_cliente').value.trim();
  if (!pieza)   { toast('Ingrese el nombre de la pieza',  'error'); return; }
  if (!cliente) { toast('Ingrese el nombre del cliente',  'error'); return; }

  // El preview de material no comprometido no debe entrar al precio guardado
  const savedPreview = _matPreviewCosto;
  _matPreviewCosto = 0;
  const desglose     = calcular();
  _matPreviewCosto = savedPreview;
  const id           = editingId || genId();
  const precioFinal  = desglose.precioTotal;
  const montoAbonado = fv('c_monto_abonado') || 0;

  const data = {
    id, pieza, cliente,
    fecha:        el('c_fecha').value,
    fechaEntrega: el('c_fecha_entrega')?.value || '',
    cantidad:     fv('c_cantidad'),
    placas:       fv('c_placas'),
    categoria:    el('c_categoria').value,
    material:     el('c_material')?.value.trim() || '',
    notas:        el('c_notas').value,
    gramos:       fv('c_gramos'),    horas_imp: fv('c_horas_imp'),
    horas_mo:     fv('c_horas_mo'),  horas_dis: fv('c_horas_dis'),
    costo_dis:    fv('c_costo_dis'), postpro:   fv('c_postpro'),
    otros:        fv('c_otros'),     pFallos:   fv('c_fallos'),
    pMargen:      fv('c_margen'),    pIVA:      fv('c_iva'),
    costo_total:          desglose.costoTotalPlacas,
    precio_final:         precioFinal,
    precio_unitario:      desglose.precioRedondeado,
    ganancia_por_objeto:  desglose.gananciaObjeto,
    estado: editingId
      ? (trabajos.find(t=>t.id===editingId)?.estado || 'Cotizado')
      : 'Cotizado',
    fechaActualizacionEstado: editingId
      ? (trabajos.find(t=>t.id===editingId)?.fechaActualizacionEstado || new Date().toISOString())
      : new Date().toISOString(),
    estadoPago:    calcEstadoPago(precioFinal, montoAbonado),
    metodoPago:    el('c_metodo_pago')?.value || 'Efectivo',
    montoAbonado,
    montoPendiente: Math.max(0, precioFinal - montoAbonado),
    fechaPago:     '',
    materialesAdicionales: materialesAdicionalesCotizacion.map(m => ({...m})),
    _desglose: desglose
  };

  // — Venta al detalle: se activa cuando la categoría es "Venta al Detalle" —
  const esVenta = data.categoria === 'Venta al Detalle';
  const existing = trabajos.find(t => t.id === id);
  data.ventaDetalle = esVenta;
  if (esVenta) {
    data.unidadesVendidas = existing?.unidadesVendidas || 0;
    data.historialVentas  = existing?.historialVentas  || [];
  }

  const idx = trabajos.findIndex(t => t.id === id);
  if (idx >= 0) trabajos[idx] = data; else trabajos.unshift(data);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}

  fbGuardarCotizacion(data)
    .then(() => {})
    .catch(e => { console.error('Firebase error al guardar:', e); });

  const wasEditing = !!editingId;
  if (editingId) {
    editingId = null; el('edit-banner').style.display = 'none';
  }
  mostrarPostGuardado(pieza, wasEditing);
  nuevaCotizacion();
}

/* ----------------------------------------------------------
   Cotizaciones — Cargar
---------------------------------------------------------- */
async function cargarTrabajos() {
  try {
    [trabajos, gastos, inversion] = await Promise.all([
      fbCargarTrabajos(),
      fbCargarGastos(),
      fbCargarInversion()
    ]);
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e){}
  } catch(e) {
    console.error('Error cargando trabajos:', e);
    try {
      const l = localStorage.getItem('trabajos3d');
      trabajos = l ? JSON.parse(l) : [];
      toast('Cargado desde caché local', 'info');
    } catch(e2) { trabajos = []; }
  }
  renderTrabajos();
}

/* ----------------------------------------------------------
   Cotizaciones — Cambiar estado
---------------------------------------------------------- */
async function cambiarEstado(id, estado, selectEl) {
  const ahora = new Date().toISOString();
  const t = trabajos.find(t=>t.id===id);
  if (t) { t.estado = estado; t.fechaActualizacionEstado = ahora; }
  const ec = (typeof ESTADO_COLOR !== 'undefined' ? ESTADO_COLOR[estado] : null) || 'badge-gray';
  if (selectEl) selectEl.className = 'badge ' + ec + ' estado-select';
  try {
    await fbActualizarEstado(id, estado);
    toast('Estado actualizado correctamente ✓', 'success');
    renderTrabajos();
  } catch(e) {
    console.error('Error actualizando estado:', e);
    toast('No se pudo actualizar el estado', 'error');
  }
}

/* ----------------------------------------------------------
   Cotizaciones — Eliminar
---------------------------------------------------------- */
async function eliminarTrabajo(id) {
  const t      = trabajos.find(t=>t.id===id);
  const nombre = t ? `"${t.pieza}" de ${t.cliente}` : 'este trabajo';
  if (!confirm(`¿Seguro que deseas eliminar ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
  trabajos = trabajos.filter(t=>t.id!==id);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e){}
  try {
    await fbEliminarCotizacion(id);
    toast('Trabajo eliminado correctamente ✓', 'success');
  } catch(e) {
    console.error('Error eliminando:', e);
    toast('No se pudo eliminar el registro', 'error');
  }
  renderTrabajos();
}

function pdfTrabajo(id) { const t=trabajos.find(t=>t.id===id); if(t) generarPDFData(t); }

/* ----------------------------------------------------------
   Selección múltiple — Cotización combinada
---------------------------------------------------------- */

function toggleSeleccion(id, checkbox) {
  if (seleccionados.has(id)) seleccionados.delete(id);
  else seleccionados.add(id);
  // sincronizar clase visual en la fila
  if (checkbox) checkbox.closest('tr').classList.toggle('tr-selected', seleccionados.has(id));
  actualizarBarraSeleccion();
}

function seleccionarTodosVisibles(checked) {
  document.querySelectorAll('.sel-check').forEach(cb => {
    const id = cb.dataset.id;
    if (checked) seleccionados.add(id); else seleccionados.delete(id);
    cb.checked = checked;
    cb.closest('tr').classList.toggle('tr-selected', checked);
  });
  actualizarBarraSeleccion();
}

function actualizarBarraSeleccion() {
  const n     = seleccionados.size;
  const barra = el('barra-seleccion');
  if (!barra) return;
  barra.classList.toggle('barra-visible', n > 0);
  const countEl = el('sel-count-text');
  if (countEl) countEl.textContent =
    `${n} cotización${n !== 1 ? 'es' : ''} seleccionada${n !== 1 ? 's' : ''}`;
}

function limpiarSeleccion() {
  seleccionados.clear();
  document.querySelectorAll('.sel-check').forEach(cb => {
    cb.checked = false;
    cb.closest('tr')?.classList.remove('tr-selected');
  });
  const sa = el('sel-all-check'); if (sa) sa.checked = false;
  actualizarBarraSeleccion();
}

function generarPDFCombinado() {
  const ids   = Array.from(seleccionados);
  const items = ids.map(id => trabajos.find(t => t.id === id)).filter(Boolean);
  if (items.length < 2) { toast('Seleccioná al menos 2 cotizaciones', 'error'); return; }

  const clUnicos = [...new Set(items.map(t => t.cliente || '').filter(Boolean))];
  const clienteNombre = clUnicos.length === 1 ? clUnicos[0] : clUnicos.join(' & ');
  generarPDFMultiple(items, clienteNombre);
}

/* ----------------------------------------------------------
   PDF con múltiples ítems (cotización combinada)
---------------------------------------------------------- */
function generarPDFMultiple(items, clienteNombre) {
  const emp        = getEmpresa();
  const base       = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';
  const nombreUrl  = base + 'img/Nombre-PNG.png';

  const ref           = 'COMB-' + Date.now().toString(36).toUpperCase().slice(-6);
  const totalGeneral  = items.reduce((s, t) => s + (t.precio_final || 0), 0);
  const nombreArchivo = `Cotizacion - ${clienteNombre}`;
  const multiCliente  = [...new Set(items.map(t => t.cliente || ''))].length > 1;
  const hoyStr        = new Date().toISOString().split('T')[0];
  const vigenciaDate  = new Date();
  vigenciaDate.setDate(vigenciaDate.getDate() + 7);
  const vigencia = vigenciaDate.toLocaleDateString('es-CR', {day:'numeric',month:'short',year:'numeric'});

  const rowsHtml = items.map(t => {
    const cant       = Math.max(t.cantidad || 1, 1);
    const plas       = Math.max(t.placas   || 1, 1);
    const totalObj   = cant * plas;
    const pUnit      = t.precio_unitario || ((t.precio_final || 0) / totalObj);
    const total      = t.precio_final || 0;
    return `<tr>
      <td>
        <div class="item-name">${escHtml(t.pieza || '—')}</div>
        <div class="item-sub">${escHtml(t.categoria || 'General')}${t.material ? ' · ' + escHtml(t.material) : ''}${multiCliente ? ' · ' + escHtml(t.cliente || '') : ''}</div>
        ${t.notas ? `<div class="item-sub" style="font-style:italic">${escHtml(t.notas)}</div>` : ''}
      </td>
      <td>${totalObj}</td>
      <td>&#8353;&thinsp;${(Math.ceil(pUnit)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
      <td><strong>&#8353;&thinsp;${(Math.ceil(total)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></td>
    </tr>`;
  }).join('');

  const htmlMultiple = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=860"/>
<title>${escHtml(nombreArchivo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:20px 0 80px;display:flex;justify-content:center;align-items:flex-start}
.page{width:min(794px,100vw);background:#fff;overflow:hidden;box-shadow:0 20px 60px -16px rgba(15,42,69,.22),0 4px 16px rgba(15,42,69,.1);display:flex;flex-direction:column}
@media screen and (max-width:820px){
  body{padding:0 0 70px;background:#fff}
  .page{width:100vw;min-height:100dvh;border-radius:0;box-shadow:none}
  .header{padding:24px 20px}
  .client-bar{padding:12px 20px;grid-template-columns:1fr 1fr}
  .cb-field+.cb-field{border-left:none;padding-left:0}
  .cb-field:nth-child(2n){border-left:1px solid #DEE9F3;padding-left:16px}
  .body{padding:20px 20px 8px}
  .tbl thead th,.tbl tbody td{padding:8px}
  .col-unit{display:none}
  .footer-grid{grid-template-columns:1fr}
  .doc-footer{padding:14px 20px}
}
.header{background:linear-gradient(130deg,#0F2A45 0%,#16395A 45%,#235A8C 100%);position:relative;overflow:hidden;padding:32px 48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.header-deco{position:absolute;inset:0;pointer-events:none;z-index:0}
.brand{display:flex;align-items:center;gap:14px;z-index:1}
.brand-mascot{width:54px;height:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.25))}
.brand-text{display:flex;flex-direction:column;gap:4px}
.brand-name{font-size:26px;font-weight:800;color:#fff;line-height:1;letter-spacing:-.02em}
.brand-name .amp{color:#F2C61F;font-style:italic}
.badge-3d{display:inline-block;background:#4A8FCB;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:5px;letter-spacing:.05em;vertical-align:middle}
.brand-sub{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:600}
.title-block{text-align:right;z-index:1}
.title-eyebrow{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#F2C61F}
.title-main{font-size:24px;font-weight:800;color:#fff;line-height:1.1;margin-top:4px;letter-spacing:-.01em}
.title-rule{width:40px;height:2px;background:#F2C61F;margin:8px 0 0 auto;border-radius:1px}
.client-bar{background:#F8FAFB;border-bottom:1px solid #E0EAF4;padding:16px 48px;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0}
.cb-field{display:flex;flex-direction:column;gap:3px;padding-right:20px}
.cb-field+.cb-field{border-left:1px solid #DEE9F3;padding-left:20px;padding-right:0}
.cb-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.2em;color:#8CAFD2;font-weight:700}
.cb-value{font-size:14px;font-weight:700;color:#133658;line-height:1.2}
.cb-tag{display:inline-block;background:#F2C61F;color:#133658;font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.06em;margin-top:3px;width:fit-content}
.body{padding:28px 48px 8px;flex:1;display:flex;flex-direction:column}
.sec-label{font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#133658;display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sec-label::before{content:"";width:18px;height:2px;background:#F2C61F;border-radius:1px;flex-shrink:0}
.tbl{width:100%;border-collapse:collapse}
.tbl thead tr{border-top:2px solid #16395A;border-bottom:1.5px solid #16395A}
.tbl thead th{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#16395A;padding:10px 12px;text-align:left}
.tbl thead th:not(:first-child){text-align:right}
.tbl tbody tr{border-bottom:1px solid #F0F5FB}
.tbl tbody td{padding:12px 12px;font-size:13px;color:#1A2433;vertical-align:top}
.tbl tbody td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.item-name{font-weight:600;color:#133658}
.item-sub{font-size:11px;color:#8CAFD2;margin-top:2px}
.summary{display:flex;justify-content:flex-end;padding:12px 0 16px}
.sum-card{width:280px}
.sum-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;font-size:12.5px;border-bottom:1px solid #F0F5FB}
.sum-label{color:#5B6A7E}
.sum-val{font-weight:600;font-variant-numeric:tabular-nums}
.sum-total{background:#16395A;color:#fff;padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-top:8px;position:relative;overflow:hidden;box-shadow:0 6px 16px -8px rgba(15,42,69,.5)}
.sum-total::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#F2C61F}
.sum-total-label{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:rgba(255,255,255,.8);padding-left:6px}
.sum-total-val{font-size:24px;font-weight:800;letter-spacing:-.02em;white-space:nowrap}
.footer-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;padding:16px 0 0;margin-top:auto}
.fnotes ul{list-style:none;display:flex;flex-direction:column;gap:6px;margin-top:10px}
.fnotes li{font-size:11.5px;color:#5B6A7E;padding-left:14px;position:relative;line-height:1.5}
.fnotes li::before{content:"";position:absolute;left:0;top:6px;width:5px;height:5px;background:#F2C61F;border-radius:50%}
.fnotes li strong{color:#1A2433}
.note-box{background:#F8FAFB;border:1px dashed #DDE6F0;border-radius:6px;padding:9px 12px;font-size:11px;color:#1A2433;margin-top:10px;line-height:1.5}
.pay-card{background:#F8FAFB;border:1px solid #E0EAF4;border-radius:10px;padding:14px 16px}
.pay-item{display:flex;align-items:center;gap:10px;font-size:12.5px;color:#133658;font-weight:500;padding:6px 0}
.pay-item+.pay-item{border-top:1px solid #EEF3F8}
.pay-icon{width:28px;height:28px;border-radius:6px;background:#E8F0F8;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pay-icon svg{width:14px;height:14px;stroke:#16395A}
.doc-footer{padding:16px 48px;border-top:1px solid #EEF3F8;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.thanks-logo{height:24px;width:auto}
.footer-rule{width:48px;height:3px;background:linear-gradient(90deg,#16395A,#4A8FCB,#F2C61F);border-radius:2px}
.print-fab{position:fixed;bottom:24px;right:24px;background:#16395A;color:#fff;border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-family:inherit;font-weight:700;cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(15,42,69,.35)}
@page{size:letter;margin:0}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
@media print{html,body{background:#fff!important;padding:0!important;margin:0!important;display:block!important}.page{width:215.9mm!important;min-height:279.4mm!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important}.header{padding:32px 48px!important}.client-bar{padding:16px 48px!important;grid-template-columns:2fr 1fr 1fr 1fr!important}.body{padding:28px 48px 8px!important}.doc-footer{padding:16px 48px!important}.print-fab{display:none!important}}
</style>
</head>
<body>
<button class="print-fab" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <svg class="header-deco" viewBox="0 0 794 130" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="594,0 814,0 814,130" fill="rgba(255,255,255,0.05)"/>
      <polygon points="654,-50 874,-50 654,180" fill="rgba(255,255,255,0.04)"/>
    </svg>
    <div class="brand">
      <img class="brand-mascot" src="${mascotaUrl}" alt="Pin&amp;Pon 3D">
      <div class="brand-text">
        <div class="brand-name">Pin<span class="amp">&amp;</span>Pon<span class="badge-3d">3D</span></div>
        <div class="brand-sub">Impresión 3D · Costa Rica</div>
      </div>
    </div>
    <div class="title-block">
      <div class="title-eyebrow">Cotización oficial</div>
      <div class="title-main">Cotización combinada</div>
      <div class="title-rule"></div>
    </div>
  </div>

  <!-- CLIENT BAR -->
  <div class="client-bar">
    <div class="cb-field">
      <div class="cb-label">Cliente</div>
      <div class="cb-value">${escHtml(clienteNombre || '—')}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Cotización</div>
      <div class="cb-value">N.° ${ref}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Fecha</div>
      <div class="cb-value">${hoyStr}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Vigencia</div>
      <div class="cb-value">${vigencia}</div>
      <span class="cb-tag">7 DÍAS</span>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">
    <div class="sec-label">Detalle — ${items.length} pieza${items.length !== 1 ? 's' : ''}</div>
    <table class="tbl">
      <thead>
        <tr>
          <th>Pieza / Producto</th>
          <th>Cant.</th>
          <th class="col-unit">P. unitario</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="summary">
      <div class="sum-card">
        <div class="sum-total">
          <span class="sum-total-label">Total general</span>
          <span class="sum-total-val">&#8353;&thinsp;${(Math.ceil(totalGeneral)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
        </div>
      </div>
    </div>

    <div class="footer-grid">
      <div class="fnotes">
        <div class="sec-label">Notas</div>
        <ul>
          <li>La cotización tiene validez de <strong>7 días</strong> a partir de la fecha de emisión.</li>
          <li>El precio puede variar si cambian las características del modelo 3D.</li>
          <li>Para iniciar el trabajo se puede solicitar un <strong>abono del 50%</strong>.</li>
          <li>El tiempo de entrega se confirma al aprobar la cotización.</li>
          <li>Los colores y acabados pueden variar según el material disponible.</li>
        </ul>
        ${emp.nota ? `<div class="note-box">${escHtml(emp.nota)}</div>` : ''}
      </div>
      <div>
        <div class="sec-label">Método de pago</div>
        <div class="pay-card">
          <div class="pay-item"><div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>SINPEMóvil</div>
          <div class="pay-item"><div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>Efectivo</div>
          <div class="pay-item"><div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>Transferencia</div>
        </div>
        ${emp.tel ? `<div style="font-size:11px;color:#8CAFD2;margin-top:10px;display:flex;align-items:center;gap:6px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 8.81A19.79 19.79 0 0 1 2 2.12h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escHtml(emp.tel)}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- DOC FOOTER -->
  <div class="doc-footer">
    <img class="thanks-logo" src="${nombreUrl}" alt="Pin&amp;Pon 3D">
    <div class="footer-rule"></div>
  </div>

</div>

<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;
  const blobM    = new Blob([htmlMultiple], { type: 'text/html; charset=utf-8' });
  const blobUrlM = URL.createObjectURL(blobM);
  const winM     = window.open(blobUrlM, '_blank');
  if (!winM) { URL.revokeObjectURL(blobUrlM); toast('Permita ventanas emergentes para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrlM), 10000);
  toast(`Cotización combinada (${items.length} ítems) — use Ctrl+P para guardar PDF`, 'success');
}

/* ----------------------------------------------------------
   Cotizaciones — Nueva / Limpiar formulario
---------------------------------------------------------- */
function nuevaCotizacion() {
  editingId = null;
  el('edit-banner').style.display = 'none';
  materialesAdicionalesCotizacion = [];
  _matPreviewCosto = 0;
  renderMaterialesListaCotizacion();
  cargarFilamentosYPoblar();
  ['c_pieza','c_cliente','c_notas','c_material'].forEach(f => { if(el(f)) el(f).value = ''; });
  const nums = {
    c_cantidad:1, c_placas:1, c_gramos:0, c_horas_imp:0, c_horas_mo:0,
    c_horas_dis:0, c_costo_dis:0, c_postpro:0, c_otros:0,
    c_fallos:5, c_margen:35, c_iva:0, c_monto_abonado:0
  };
  Object.entries(nums).forEach(([k,v]) => { if(el(k)) el(k).value = v; });
  el('c_fecha').value = today();
  if(el('c_fecha_entrega')) el('c_fecha_entrega').value = '';
  if(el('c_metodo_pago'))   el('c_metodo_pago').value   = 'Efectivo';
  el('c_categoria').value = 'Funcional';
  calcular();
}

/* ----------------------------------------------------------
   Modal de edición rápida de trabajo
---------------------------------------------------------- */
/* Abre el modal de pago (solo campos de cobro — sin recálculo de precios) */
function abrirModalEdicion(id) {
  const t = trabajos.find(t=>t.id===id); if(!t) return;
  el('m_id').value           = id;
  el('m_precio_final').value = t.precio_final || 0;
  set('m_pieza_display',   t.pieza    || '—');
  set('m_cliente_display', t.cliente  || '—');
  set('m_precio_display',  fmt(t.precio_final || 0));
  el('m_monto_abonado').value = t.montoAbonado || 0;
  el('m_metodo_pago').value   = t.metodoPago   || '';
  // Link "abrir en cotizador"
  const linkEl = el('m_edit_link');
  if (linkEl) linkEl.onclick = () => { cerrarModalEdicion(); editarEnCotizador(id); };
  calcularPendienteModal();
  el('modal-editar').style.display = 'flex';
}

function cerrarModalEdicion() {
  const m = el('modal-editar');
  if (m) m.style.display = 'none';
}

function calcularPendienteModal() {
  const precio = parseFloat(el('m_precio_final')?.value) || 0;
  const abono  = parseFloat(el('m_monto_abonado')?.value) || 0;
  const pend   = Math.max(0, precio - abono);
  set('m_monto_pendiente_val', fmt(pend));
  // m_estadoPago es un span (display), se actualiza con textContent
  set('m_estadoPago', calcEstadoPago(precio, abono));
}

/* Guarda solo los campos de pago del modal simplificado */
async function guardarModalEdicion() {
  const id = el('m_id')?.value; if(!id) return;
  const t  = trabajos.find(t=>t.id===id); if(!t) return;

  const precioFinal  = parseFloat(el('m_precio_final')?.value)  || t.precio_final || 0;
  const montoAbonado = parseFloat(el('m_monto_abonado')?.value) || 0;

  const updates = {
    estadoPago:     calcEstadoPago(precioFinal, montoAbonado),
    montoAbonado,
    montoPendiente: Math.max(0, precioFinal - montoAbonado),
    metodoPago:     el('m_metodo_pago')?.value || t.metodoPago || ''
  };

  Object.assign(t, updates);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}
  cerrarModalEdicion();
  renderTrabajos();

  try {
    await db.collection('cotizaciones').doc(String(id)).update(updates);
    toast('Pago actualizado ✓', 'success');
  } catch(e) {
    console.error('Error al actualizar pago:', e);
    toast('No se pudo guardar en Firebase', 'error');
  }
}

/* ----------------------------------------------------------
   Modal historial de abonos
---------------------------------------------------------- */
let _abonoId = null;

function abrirModalAbono(id) {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  _abonoId = id;
  const fechaHoy = new Date().toISOString().split('T')[0];
  if (el('abono-fecha'))  el('abono-fecha').value  = fechaHoy;
  if (el('abono-monto'))  el('abono-monto').value  = '';
  if (el('abono-metodo')) el('abono-metodo').value = '';
  if (el('abono-nota'))   el('abono-nota').value   = '';
  renderHistorialAbonos(t);
  el('modal-abono').style.display = 'flex';
}

function cerrarModalAbono() {
  const m = el('modal-abono');
  if (m) m.style.display = 'none';
  _abonoId = null;
}

async function registrarAbono() {
  const t = trabajos.find(t => t.id === _abonoId);
  if (!t) return;

  const monto  = parseFloat(el('abono-monto')?.value);
  const fecha  = el('abono-fecha')?.value;
  const metodo = el('abono-metodo')?.value || '';
  const nota   = (el('abono-nota')?.value || '').trim();

  if (!monto || monto <= 0) { toast('Ingresá un monto válido', 'error'); return; }
  if (!fecha)               { toast('Ingresá una fecha', 'error'); return; }

  // Migrar legacy: si tiene montoAbonado pero sin abonos[], convertirlo en entrada del historial
  let baseAbonos = t.abonos ? [...t.abonos] : [];
  if (baseAbonos.length === 0 && (t.montoAbonado || 0) > 0) {
    baseAbonos = [{
      fecha:  t.fecha || fecha,
      monto:  t.montoAbonado,
      metodo: t.metodoPago || '',
      nota:   'Pago anterior (migrado)'
    }];
  }

  const nuevoAbono = { fecha, monto };
  if (metodo) nuevoAbono.metodo = metodo;
  if (nota)   nuevoAbono.nota   = nota;

  const abonos       = [...baseAbonos, nuevoAbono];
  const montoAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
  const precioFinal  = t.precio_final || 0;
  const montoPendiente = Math.max(0, precioFinal - montoAbonado);
  const estadoPago   = calcEstadoPago(precioFinal, montoAbonado);

  const updates = { abonos, montoAbonado, montoPendiente, estadoPago };

  try {
    await fbActualizarPago(_abonoId, updates);
    Object.assign(t, updates);
    if (el('abono-monto'))  el('abono-monto').value  = '';
    if (el('abono-metodo')) el('abono-metodo').value = '';
    if (el('abono-nota'))   el('abono-nota').value   = '';
    renderHistorialAbonos(t);
    renderTrabajos();
    toast('Abono registrado ✓', 'success');
  } catch(e) {
    console.error(e);
    toast('Error al registrar abono', 'error');
  }
}

async function eliminarAbono(idx) {
  const t = trabajos.find(t => t.id === _abonoId);
  if (!t || !t.abonos) return;

  const abonos       = t.abonos.filter((_, i) => i !== idx);
  const montoAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
  const precioFinal  = t.precio_final || 0;
  const montoPendiente = Math.max(0, precioFinal - montoAbonado);
  const estadoPago   = calcEstadoPago(precioFinal, montoAbonado);

  const updates = { abonos, montoAbonado, montoPendiente, estadoPago };

  try {
    await fbActualizarPago(_abonoId, updates);
    Object.assign(t, updates);
    renderHistorialAbonos(t);
    renderTrabajos();
    toast('Abono eliminado', 'success');
  } catch(e) {
    console.error(e);
    toast('Error al eliminar abono', 'error');
  }
}

/* ─── EDITAR EN COTIZADOR ─── Carga todos los datos en el formulario de cálculo */
function editarEnCotizador(id) {
  const t = trabajos.find(t => t.id === id); if (!t) return;
  editingId = id;

  const sv = (k, v) => { const e = el(k); if (e) e.value = v ?? ''; };
  sv('c_pieza',        t.pieza       || '');
  sv('c_cliente',      t.cliente     || '');
  sv('c_fecha',        t.fecha       || today());
  sv('c_fecha_entrega',t.fechaEntrega|| '');
  sv('c_material',     t.material    || '');
  sv('c_cantidad',     t.cantidad    || 1);
  sv('c_placas',       t.placas      || 1);
  sv('c_notas',        t.notas       || '');
  if (el('c_categoria')) el('c_categoria').value = t.categoria || 'Funcional';

  sv('c_gramos',    t.gramos    || 0);
  sv('c_horas_imp', t.horas_imp || 0);
  sv('c_horas_mo',  t.horas_mo  || 0);
  sv('c_horas_dis', t.horas_dis || 0);
  sv('c_costo_dis', t.costo_dis || 0);
  sv('c_postpro',   t.postpro   || 0);
  sv('c_otros',     t.otros     || 0);
  sv('c_fallos',        t.pFallos   ?? 5);
  sv('c_margen',        t.pMargen   ?? 35);
  sv('c_iva',           t.pIVA      ?? 0);
  sv('c_precio_manual', '');
  sv('c_monto_abonado', t.montoAbonado || 0);
  if (el('c_metodo_pago')) el('c_metodo_pago').value = t.metodoPago || 'Efectivo';

  el('edit-banner').style.display = 'flex';
  set('edit-banner-text', `Editando: ${t.pieza || 'cotización'} · ${t.cliente || ''}`);

  materialesAdicionalesCotizacion = (t.materialesAdicionales || []).map(m=>({...m}));
  _matPreviewCosto = 0;
  renderMaterialesListaCotizacion();

  ocultarPostSave();
  calcular();
  navTo('cotizador');
}

/* ─── POST-SAVE BANNER ─── Aparece tras guardar en el Cotizador */
function mostrarPostGuardado(pieza, isEdit) {
  const b = el('post-save-banner'); if (!b) return;
  set('post-save-msg', isEdit ? '¡Cotización actualizada!' : '¡Trabajo guardado!');
  set('post-save-sub', `"${pieza}" fue ${isEdit ? 'actualizada' : 'guardada'} correctamente.`);
  b.style.display = 'flex';
  clearTimeout(b._psTimer);
  b._psTimer = setTimeout(ocultarPostSave, 10000);
}

function ocultarPostSave() {
  const b = el('post-save-banner');
  if (b) b.style.display = 'none';
}

/* ----------------------------------------------------------
   Exportar CSV
---------------------------------------------------------- */
function exportarCSV() {
  const search  = el('tr-search')?.value.toLowerCase()  || '';
  const estadoF = el('tr-estado')?.value                || '';
  const catF    = el('tr-categoria')?.value             || '';
  const pagoF   = el('tr-pago')?.value                  || '';

  const list = trabajos.filter(t => {
    const matchSearch = !search  || (t.pieza||'').toLowerCase().includes(search)
                                 || (t.cliente||'').toLowerCase().includes(search);
    const matchEstado = !estadoF || t.estado    === estadoF;
    const matchCat    = !catF    || t.categoria === catF;
    const matchPago   = !pagoF   || (t.estadoPago||'Pendiente') === pagoF;
    return matchSearch && matchEstado && matchCat && matchPago;
  });

  if (!list.length) { toast('No hay trabajos para exportar', 'error'); return; }

  const csvQ = s => `"${String(s||'').replace(/"/g,'""')}"`;
  const heads = ['ID','Fecha','Cliente','Pieza','Categoría','Material',
                 'Gramos','Horas','Costo Total','Precio Final','Gan/Objeto',
                 'Estado','Estado Pago','Monto Abonado','Monto Pendiente',
                 'Fecha Entrega','Notas'];
  const rows = list.map(t => {
    const ganObj = t.ganancia_por_objeto != null
      ? t.ganancia_por_objeto
      : ((t.precio_final||0) - (t.costo_total||0)) / Math.max(t.cantidad||1,1);
    const pendiente = t.montoPendiente != null
      ? t.montoPendiente
      : Math.max(0,(t.precio_final||0)-(t.montoAbonado||0));
    return [
      t.id, t.fecha||'', csvQ(t.cliente), csvQ(t.pieza), t.categoria||'',
      csvQ(t.material), (t.gramos||0).toFixed(1), (t.horas_imp||0).toFixed(1),
      (t.costo_total||0).toFixed(0), (t.precio_final||0).toFixed(0), ganObj.toFixed(0),
      t.estado||'Cotizado', t.estadoPago||'Pendiente',
      (t.montoAbonado||0).toFixed(0), pendiente.toFixed(0),
      t.fechaEntrega||'', csvQ(t.notas)
    ].join(',');
  });

  const csv  = [heads.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `trabajos-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`CSV exportado (${list.length} trabajos)`, 'success');
}

/* ----------------------------------------------------------
   WhatsApp — generador de mensajes
---------------------------------------------------------- */
function generarMensajeWA(t) {
  return (
    `Hola 👋\n\n` +
    `Te compartimos la cotización de tu pieza en 3D:\n\n` +
    `Cliente: ${t.cliente||'—'}\n` +
    `Pieza: ${t.pieza||'—'}\n` +
    `Categoría: ${t.categoria||'—'}\n` +
    `Material: ${t.material||'—'}\n` +
    `Peso estimado: ${(t.gramos||0).toFixed(1)} g\n` +
    `Tiempo estimado de impresión: ${(t.horas_imp||0).toFixed(1)} horas\n` +
    `Precio final: ${fmt(t.precio_final||0)}\n\n` +
    `Estado actual: ${t.estado||'Cotizado'}\n` +
    `Fecha estimada de entrega: ${t.fechaEntrega||'Por confirmar'}\n\n` +
    `El precio incluye material, tiempo de impresión y margen de trabajo.\n\n` +
    `Gracias por cotizar con PinandPon 3D.`
  );
}

async function copiarMensajeWA(id) {
  const t = trabajos.find(t=>t.id===id); if(!t) return;
  const msg = generarMensajeWA(t);
  try {
    await navigator.clipboard.writeText(msg);
    toast('Mensaje copiado al portapapeles ✓', 'success');
  } catch(e) {
    // Fallback para navegadores sin clipboard API
    const ta = document.createElement('textarea');
    ta.value = msg;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('Mensaje copiado al portapapeles ✓', 'success');
  }
}

function abrirWhatsApp(id) {
  const t   = trabajos.find(t=>t.id===id); if(!t) return;
  const msg = encodeURIComponent(generarMensajeWA(t));
  const tel = (t.telefono || '').replace(/\D/g,'');
  const url = tel ? `https://wa.me/506${tel}?text=${msg}` : `https://wa.me/?text=${msg}`;
  window.open(url, '_blank');
}

function abrirWhatsAppCliente(telefono) {
  const num = String(telefono).replace(/\D/g,'');
  window.open(`https://wa.me/506${num}`, '_blank');
}

/* ----------------------------------------------------------
   Inventario
---------------------------------------------------------- */
async function agregarFilamento() {
  const color = el('inv_color').value.trim();
  if (!color) { toast('Ingrese el color del filamento','error'); return; }
  const editId = el('inv-edit-id')?.textContent?.trim();
  const id = editId || genId();
  const data = { id,
    tipo:el('inv_tipo').value, color, marca:el('inv_marca').value.trim(),
    precio_rollo:fv('inv_precio'), peso_rollo:fv('inv_peso')||1000,
    disponibles:fv('inv_disp'), proveedor:el('inv_prov').value.trim(),
    fecha_compra:el('inv_fecha').value, notas:el('inv_notas').value.trim()
  };
  const idx = filamentos.findIndex(f=>f.id===id);
  if(idx>=0) filamentos[idx]=data; else filamentos.push(data);
  try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
  try {
    await fbGuardarFilamento(data);
    toast(editId ? 'Filamento actualizado ✓' : 'Filamento agregado ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar el filamento', 'error');
  }
  cancelarEditFilamento();
  el('inv_color').value=''; el('inv_marca').value=''; el('inv_precio').value=0;
  el('inv_peso').value=1000; el('inv_disp').value=1; el('inv_prov').value='';
  el('inv_notas').value=''; el('inv_fecha').value=today();
  renderInventario();
}

async function _fetchFilamentos() {
  try {
    filamentos = await fbCargarFilamentos();
    try { localStorage.setItem('filamentos3d', JSON.stringify(filamentos)); } catch(e) {}
  } catch(e) {
    try { const l = localStorage.getItem('filamentos3d'); filamentos = l ? JSON.parse(l) : [];
      toast('Filamentos cargados desde caché', 'info');
    } catch(e2) { filamentos = []; }
  }
}

async function cargarInventario() {
  await _fetchFilamentos();
  renderInventario();
  poblarSelectMateriales();
}

async function cargarFilamentosYPoblar() {
  await _fetchFilamentos();
  poblarSelectMateriales();
}

function editarFilamento(id) {
  const f=filamentos.find(f=>f.id===id); if(!f) return;
  el('inv_tipo').value=f.tipo||'PLA'; el('inv_color').value=f.color||'';
  el('inv_marca').value=f.marca||''; el('inv_precio').value=f.precio_rollo||0;
  el('inv_peso').value=f.peso_rollo||1000; el('inv_disp').value=f.disponibles||1;
  el('inv_prov').value=f.proveedor||''; el('inv_fecha').value=f.fecha_compra||today();
  el('inv_notas').value=f.notas||'';
  el('inv-edit-id').textContent=id; el('inv-edit-id').style.display='inline';
  el('inv-cancel-edit').style.display='inline-flex';
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelarEditFilamento() {
  cancelarEditMaterial();
}

// ─── Material helpers ────────────────────────────────────
function getMaterialNombre(m) {
  if (m.nombre) return m.nombre;
  return [m.tipo, m.color, m.marca].filter(Boolean).join(' ');
}
function getMaterialPrecioUnitario(m) {
  if (m.precio_unitario != null) return m.precio_unitario;
  if (m.precio_rollo && m.peso_rollo) return m.precio_rollo / m.peso_rollo;
  return 0;
}
function getMaterialUnidad(m) { return m.unidad || 'g'; }
function getMaterialStock(m) {
  if (m.stock != null) return m.stock;
  return (m.disponibles || 0) * (m.peso_rollo || 1000);
}

// ─── Inventory form toggle ────────────────────────────────
let _invTipoActual = 'Filamento';

function setTipoMaterial(tipo) {
  _invTipoActual = tipo;
  const esFilamento = tipo === 'Filamento';
  if (el('inv-fields-filamento')) el('inv-fields-filamento').style.display = esFilamento ? '' : 'none';
  if (el('inv-fields-general'))   el('inv-fields-general').style.display   = esFilamento ? 'none' : '';
  if (el('inv-categoria-custom-row')) el('inv-categoria-custom-row').style.display = esFilamento ? 'none' : '';
  // Botón activo / inactivo
  el('inv-btn-filamento')?.classList.toggle('btn-primary',   esFilamento);
  el('inv-btn-filamento')?.classList.toggle('btn-secondary', !esFilamento);
  el('inv-btn-otro')?.classList.toggle('btn-primary',   !esFilamento);
  el('inv-btn-otro')?.classList.toggle('btn-secondary',  esFilamento);
}

function toggleInventarioTipo() { setTipoMaterial(_invTipoActual); } // alias legacy

// ─── Save material ────────────────────────────────────────
async function guardarMaterial() {
  const esFilamento = _invTipoActual === 'Filamento';
  const categoria   = esFilamento ? 'Filamento' : (el('inv_categoria_custom')?.value.trim() || 'Otro');
  const editId = el('inv-edit-id')?.textContent?.trim() || '';
  const id     = editId || genId();
  let data = { id, categoria };
  data.marca        = el('inv_marca')?.value.trim() || '';
  data.proveedor    = el('inv_prov')?.value.trim()  || '';
  data.notas        = el('inv_notas')?.value.trim() || '';
  data.fecha_compra = el('inv_fecha')?.value        || today();
  if (esFilamento) {
    const tipo  = el('inv_tipo')?.value || 'PLA';
    const color = el('inv_color')?.value.trim();
    if (!color) { toast('Ingrese el color del filamento', 'error'); return; }
    const precio_rollo = fv('inv_precio');
    const peso_rollo   = Math.max(fv('inv_peso') || 1000, 1);
    const disponibles  = fv('inv_disp') || 1;
    Object.assign(data, { tipo, color, precio_rollo, peso_rollo, disponibles });
    data.nombre          = `${tipo} ${color}${data.marca ? ' '+data.marca : ''}`;
    data.unidad          = 'g';
    data.precio_unitario = precio_rollo / peso_rollo;
    data.stock           = disponibles * peso_rollo;
  } else {
    const nombre = el('inv_nombre')?.value.trim();
    if (!nombre) { toast('Ingrese el nombre del material', 'error'); return; }
    data.nombre          = nombre;
    data.unidad          = el('inv_unidad')?.value    || 'unidades';
    data.precio_unitario = fv('inv_precio_unit')      || 0;
    data.stock           = fv('inv_stock')            || 0;
  }
  const idx = filamentos.findIndex(f => f.id === id);
  if (idx >= 0) filamentos[idx] = data; else filamentos.push(data);
  try { localStorage.setItem('filamentos3d', JSON.stringify(filamentos)); } catch(e){}
  try {
    await fbGuardarFilamento(data);
    toast(editId ? 'Material actualizado ✓' : 'Material agregado ✓', 'success');
  } catch(e) { console.error(e); toast('No se pudo guardar el material','error'); }
  cancelarEditMaterial();
  limpiarFormMaterial();
  renderInventario();
  poblarSelectMateriales();
}

function limpiarFormMaterial() {
  ['inv_color','inv_marca','inv_nombre','inv_prov','inv_notas','inv_categoria_custom'].forEach(id => { if(el(id)) el(id).value=''; });
  if(el('inv_precio'))     el('inv_precio').value=0;
  if(el('inv_peso'))       el('inv_peso').value=1000;
  if(el('inv_disp'))       el('inv_disp').value=1;
  if(el('inv_precio_unit'))el('inv_precio_unit').value=0;
  if(el('inv_stock'))      el('inv_stock').value=0;
  if(el('inv_fecha'))      el('inv_fecha').value=today();
  setTipoMaterial('Filamento');
}

function cancelarEditMaterial() {
  if(el('inv-edit-id'))    { el('inv-edit-id').textContent=''; el('inv-edit-id').style.display='none'; }
  if(el('inv-cancel-edit')) el('inv-cancel-edit').style.display='none';
}

function editarMaterial(id) {
  const m = filamentos.find(f => f.id===id); if(!m) return;
  if(el('inv-edit-id')) { el('inv-edit-id').textContent=id; el('inv-edit-id').style.display='none'; }
  if(el('inv-cancel-edit')) el('inv-cancel-edit').style.display='inline-flex';
  const esFilamento = (m.categoria || 'Filamento') === 'Filamento';
  setTipoMaterial(esFilamento ? 'Filamento' : 'otro');
  if (!esFilamento && el('inv_categoria_custom')) el('inv_categoria_custom').value = m.categoria || '';
  if (esFilamento) {
    if(el('inv_tipo'))   el('inv_tipo').value   = m.tipo  || 'PLA';
    if(el('inv_color'))  el('inv_color').value  = m.color || '';
    if(el('inv_marca'))  el('inv_marca').value  = m.marca || '';
    if(el('inv_precio')) el('inv_precio').value = m.precio_rollo || 0;
    if(el('inv_peso'))   el('inv_peso').value   = m.peso_rollo   || 1000;
    if(el('inv_disp'))   el('inv_disp').value   = m.disponibles !== undefined ? m.disponibles : Math.round((m.stock||0)/(m.peso_rollo||1000)*10)/10;
  } else {
    if(el('inv_nombre'))      el('inv_nombre').value      = m.nombre          || '';
    if(el('inv_unidad'))      el('inv_unidad').value      = m.unidad          || 'unidades';
    if(el('inv_precio_unit')) el('inv_precio_unit').value = m.precio_unitario || 0;
    if(el('inv_stock'))       el('inv_stock').value       = m.stock           || 0;
    if(el('inv_marca'))       el('inv_marca').value       = m.marca           || '';
  }
  if(el('inv_prov'))  el('inv_prov').value  = m.proveedor    || '';
  if(el('inv_notas')) el('inv_notas').value = m.notas        || '';
  if(el('inv_fecha')) el('inv_fecha').value = m.fecha_compra || '';
  document.getElementById('page-inventario')?.querySelector('.card')?.scrollIntoView({behavior:'smooth'});
}

// ─── Materiales en cotizador ──────────────────────────────
let materialesAdicionalesCotizacion = [];
let _matPreviewCosto = 0;

function poblarSelectMateriales() {
  const sel = el('mat_select'); if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  [...filamentos]
    .filter(m => (m.categoria || 'Filamento') !== 'Filamento' && getMaterialPrecioUnitario(m) > 0)
    .sort((a,b) => getMaterialNombre(a).localeCompare(getMaterialNombre(b)))
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const pu = getMaterialPrecioUnitario(m);
      const cat = m.categoria || '';
      opt.textContent = `${cat ? '['+cat+'] ' : ''}${getMaterialNombre(m)} — ₡${pu.toFixed(2)}/${getMaterialUnidad(m)}`;
      if(m.id===cur) opt.selected=true;
      sel.appendChild(opt);
    });
}

function actualizarCostoMaterial() {
  const sel = el('mat_select');
  const qty = parseFloat(el('mat_cantidad')?.value||0);
  const m = sel?.value ? filamentos.find(f=>f.id===sel.value) : null;
  if(m) {
    const pu = getMaterialPrecioUnitario(m);
    if(el('mat_unidad_label')) el('mat_unidad_label').textContent = getMaterialUnidad(m);
    _matPreviewCosto = pu * qty;
    if(el('mat_costo_preview')) el('mat_costo_preview').textContent = fmt(_matPreviewCosto);
  } else {
    _matPreviewCosto = 0;
    if(el('mat_unidad_label'))  el('mat_unidad_label').textContent  = 'und.';
    if(el('mat_costo_preview')) el('mat_costo_preview').textContent = '₡0';
  }
  calcular();
}

function agregarMaterialCotizacion() {
  const sel = el('mat_select');
  const qty = parseFloat(el('mat_cantidad')?.value||0);
  if(!sel?.value) { toast('Seleccioná un material', 'error'); return; }
  if(qty<=0)      { toast('Ingresá una cantidad mayor a 0', 'error'); return; }
  const m = filamentos.find(f=>f.id===sel.value);
  if(!m) { toast('Material no encontrado en inventario', 'error'); return; }
  const pu = getMaterialPrecioUnitario(m);
  materialesAdicionalesCotizacion.push({
    materialId: m.id, nombre: getMaterialNombre(m),
    unidad: getMaterialUnidad(m), precio_unitario: pu, cantidad: qty, costo: pu*qty
  });
  _matPreviewCosto = 0;
  sel.value='';
  if(el('mat_cantidad')) el('mat_cantidad').value=0;
  if(el('mat_unidad_label'))  el('mat_unidad_label').textContent='und.';
  if(el('mat_costo_preview')) el('mat_costo_preview').textContent='₡0';
  renderMaterialesListaCotizacion();
  calcular();
}

function eliminarMaterialCotizacion(idx) {
  materialesAdicionalesCotizacion.splice(idx,1);
  renderMaterialesListaCotizacion();
  calcular();
}

function renderMaterialesListaCotizacion() {
  const cont = el('mat-lista-cotizacion'); if(!cont) return;
  if(!materialesAdicionalesCotizacion.length) { cont.innerHTML=''; return; }
  cont.innerHTML = materialesAdicionalesCotizacion.map((item,i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border-radius:6px;margin-bottom:6px;font-size:.85rem;gap:8px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <strong>${escHtml(item.nombre)}</strong> — ${item.cantidad} ${escHtml(item.unidad)}
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <strong style="color:var(--primary)">${fmt(item.costo)}</strong>
        <button class="btn btn-danger btn-icon btn-sm" onclick="eliminarMaterialCotizacion(${i})" title="Quitar">
          <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </span>
    </div>`).join('');
}

function calcularTotalMaterialesAdicionales() {
  return materialesAdicionalesCotizacion.reduce((s,m)=>s+m.costo, 0) + (_matPreviewCosto || 0);
}

async function eliminarFilamento(id) {
  if (!confirm('¿Eliminar este filamento?')) return;
  filamentos=filamentos.filter(f=>f.id!==id);
  try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
  try { await fbEliminarFilamento(id); toast('Filamento eliminado ✓','success'); }
  catch(e) { console.error(e); toast('No se pudo eliminar el filamento', 'error'); }
  renderInventario();
}

/* ----------------------------------------------------------
   Clientes
---------------------------------------------------------- */
async function cargarClientes() {
  try {
    clientes = await fbCargarClientes();
    try { localStorage.setItem('clientes3d',JSON.stringify(clientes)); } catch(e){}
  } catch(e) {
    console.error('Error cargando clientes:', e);
    try { const l=localStorage.getItem('clientes3d'); clientes=l?JSON.parse(l):[]; }
    catch(e2) { clientes=[]; }
  }
  renderClientes(clientes);
}

async function guardarCliente() {
  const nombre = el('cl_nombre')?.value.trim();
  if (!nombre) { toast('Ingrese el nombre del cliente','error'); return; }

  const editId  = el('cl-edit-id')?.textContent?.trim();
  const telNuevo = el('cl_tel')?.value.trim() || '';

  // Detectar duplicados (por nombre o teléfono)
  const dup = clientes.find(c =>
    c.id !== editId &&
    (c.nombre.toLowerCase() === nombre.toLowerCase() ||
     (telNuevo && c.telefono && c.telefono === telNuevo))
  );
  if (dup) { toast('Ya existe un cliente con ese nombre o teléfono','error'); return; }

  const id  = editId || genId();
  const old = clientes.find(c=>c.id===editId);
  const data = {
    id, nombre,
    telefono:    telNuevo,
    correo:      el('cl_correo')?.value.trim()    || '',
    instagram:   el('cl_instagram')?.value.trim().replace(/^@/,'') || '',
    direccion:   el('cl_direccion')?.value.trim() || '',
    notas:       el('cl_notas')?.value.trim()     || '',
    fechaCreacion: old?.fechaCreacion || new Date().toISOString(),
    totalPedidos:  old?.totalPedidos  || 0,
    totalComprado: old?.totalComprado || 0
  };

  const idx = clientes.findIndex(c=>c.id===id);
  if(idx>=0) clientes[idx]=data; else clientes.push(data);
  try { localStorage.setItem('clientes3d',JSON.stringify(clientes)); } catch(e){}

  try {
    await fbGuardarCliente(data);
    toast(editId ? 'Cliente actualizado correctamente ✓' : 'Cliente guardado correctamente ✓', 'success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar el cliente','error');
  }
  cancelarEditCliente();
  renderClientes(clientes);
}

function editarCliente(id) {
  const c = clientes.find(c=>c.id===id); if(!c) return;
  const sv = (k,v) => { const e=el(k); if(e) e.value = v ?? ''; };
  sv('cl_nombre',    c.nombre);
  sv('cl_tel',       c.telefono);
  sv('cl_correo',    c.correo);
  sv('cl_instagram', c.instagram);
  sv('cl_direccion', c.direccion);
  sv('cl_notas',     c.notas);
  el('cl-edit-id').textContent = id;
  el('cl-edit-id').style.display = 'inline';
  el('cl-cancel-edit').style.display = 'inline-flex';
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelarEditCliente() {
  ['cl_nombre','cl_tel','cl_correo','cl_instagram','cl_direccion','cl_notas']
    .forEach(f => { if(el(f)) el(f).value = ''; });
  if(el('cl-edit-id'))      { el('cl-edit-id').textContent=''; el('cl-edit-id').style.display='none'; }
  if(el('cl-cancel-edit'))    el('cl-cancel-edit').style.display='none';
}

async function eliminarCliente(id) {
  const c      = clientes.find(c=>c.id===id);
  const nombre = c ? `"${c.nombre}"` : 'este cliente';
  if (!confirm(`¿Seguro que deseas eliminar el cliente ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
  clientes = clientes.filter(c=>c.id!==id);
  try { localStorage.setItem('clientes3d',JSON.stringify(clientes)); } catch(e){}
  try {
    await fbEliminarCliente(id);
    toast('Cliente eliminado correctamente ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo eliminar el cliente','error');
  }
  renderClientes(clientes);
}

/* ----------------------------------------------------------
   Venta al Detalle
---------------------------------------------------------- */

async function cargarVentaDetalle() {
  try {
    // Siempre recargar desde Firestore para tener datos frescos
    if (!trabajos.length) trabajos = await fbCargarTrabajos();
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e){}

    // Incluir tanto los que tienen ventaDetalle:true como los que
    // tienen categoria "Venta al Detalle" (registros creados antes del flag)
    const esLote = t => t.ventaDetalle === true || t.categoria === 'Venta al Detalle';
    const lotes  = trabajos.filter(esLote);

    // Auto-corregir agotados: los que tienen todas las unidades vendidas
    // y todavía no están marcados como Entregado + Pagado
    const agotados = lotes.filter(l =>
      (l.unidadesVendidas || 0) >= Math.max(l.cantidad || 1, 1) &&
      (l.estado !== 'Entregado' || l.estadoPago !== 'Pagado')
    );

    if (agotados.length) {
      for (const l of agotados) {
        const fix = {
          ventaDetalle:    true,
          estado:          'Entregado',
          estadoPago:      'Pagado',
          montoAbonado:    l.precio_final || 0,
          montoPendiente:  0,
          fechaActualizacionEstado: new Date().toISOString()
        };
        try {
          await db.collection('cotizaciones').doc(String(l.id)).update(fix);
          Object.assign(l, fix);
        } catch(e) { console.error('Fix agotado:', l.id, e); }
      }
      toast(`${agotados.length} lote${agotados.length > 1 ? 's' : ''} agotado${agotados.length > 1 ? 's' : ''} actualizado${agotados.length > 1 ? 's' : ''} ✓`, 'success');
    }

    renderVentaDetalle(lotes);
  } catch(e) {
    console.error(e);
    toast('Error al cargar ventas al detalle', 'error');
  }
}

function abrirModalVenta(id, tipo = 'venta') {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  const esDevolucion = tipo === 'devolucion';
  const vendidas     = t.unidadesVendidas || 0;
  const disponibles  = Math.max((t.cantidad || 1) - vendidas, 0);
  const maxUnidades  = esDevolucion ? vendidas : disponibles;
  if (maxUnidades <= 0) {
    toast(esDevolucion ? 'No hay unidades vendidas que devolver' : 'No hay unidades disponibles', 'error');
    return;
  }
  const mv = el('modal-venta');
  if (!mv) return;
  el('mv-id').value              = id;
  el('mv-tipo').value            = tipo;
  el('mv-pieza-lbl').textContent = t.pieza || '—';
  el('mv-ref-lbl').textContent   = esDevolucion ? 'Vendidas' : 'Disponibles';
  el('mv-disp-num').textContent  = maxUnidades;
  el('mv-cantidad').value        = 1;
  el('mv-cantidad').max          = maxUnidades;
  el('mv-nota').value            = '';
  set('mv-cant-lbl', esDevolucion ? 'Cantidad a devolver *' : 'Cantidad a vender *');
  set('mv-btn-lbl',  esDevolucion ? 'Registrar devolución'  : 'Registrar venta');
  el('mv-btn-guardar').className = esDevolucion ? 'btn btn-danger' : 'btn btn-primary';
  mv.style.display = 'flex';
}

function abrirModalDevolucion(id) { abrirModalVenta(id, 'devolucion'); }

function cerrarModalVenta() {
  const mv = el('modal-venta');
  if (mv) mv.style.display = 'none';
}

async function guardarVenta() {
  const id        = el('mv-id')?.value;
  const tipo      = el('mv-tipo')?.value || 'venta';
  const cantidad  = parseInt(el('mv-cantidad')?.value) || 1;
  const nota      = el('mv-nota')?.value?.trim() || '';
  const t         = trabajos.find(t => t.id === id);
  if (!t) return;

  const esDevolucion = tipo === 'devolucion';
  const vendidas     = t.unidadesVendidas || 0;
  const disponibles  = Math.max((t.cantidad || 1) - vendidas, 0);

  if (esDevolucion) {
    if (cantidad < 1 || cantidad > vendidas) {
      toast(`Cantidad inválida. Vendidas: ${vendidas}`, 'error'); return;
    }
  } else {
    if (cantidad < 1 || cantidad > disponibles) {
      toast(`Cantidad inválida. Disponibles: ${disponibles}`, 'error'); return;
    }
  }

  const delta   = esDevolucion ? -cantidad : cantidad;
  const idx     = trabajos.findIndex(t => t.id === id);
  const entrada = { fecha: new Date().toISOString(), cantidad: delta, nota: nota || (esDevolucion ? 'Devolución' : '') };

  const prevEstado     = t.estado;
  const prevEstadoPago = t.estadoPago;
  const prevAbonado    = t.montoAbonado;
  const prevPendiente  = t.montoPendiente;

  // Actualización optimista local
  if (idx >= 0) {
    trabajos[idx].unidadesVendidas = Math.max(0, vendidas + delta);
    trabajos[idx].historialVentas  = [...(trabajos[idx].historialVentas || []), entrada];
  }

  const totalUnidades = t.cantidad || 1;
  const nuevasVendidas = trabajos[idx]?.unidadesVendidas || 0;
  const ahoraAgotado  = !esDevolucion && nuevasVendidas >= totalUnidades;
  const yaNoAgotado   = esDevolucion && prevEstado === 'Entregado' && nuevasVendidas < totalUnidades;

  if (ahoraAgotado && idx >= 0) {
    trabajos[idx].estado         = 'Entregado';
    trabajos[idx].estadoPago     = 'Pagado';
    trabajos[idx].montoAbonado   = trabajos[idx].precio_final || 0;
    trabajos[idx].montoPendiente = 0;
    trabajos[idx].fechaActualizacionEstado = new Date().toISOString();
  }
  if (yaNoAgotado && idx >= 0) {
    trabajos[idx].estado         = 'Aprobado';
    trabajos[idx].estadoPago     = 'Pendiente';
    trabajos[idx].montoAbonado   = 0;
    trabajos[idx].montoPendiente = trabajos[idx].precio_final || 0;
    trabajos[idx].fechaActualizacionEstado = new Date().toISOString();
  }

  cerrarModalVenta();
  renderVentaDetalle(trabajos.filter(t => t.ventaDetalle === true));

  try {
    const updateData = {
      unidadesVendidas: firebase.firestore.FieldValue.increment(delta),
      historialVentas:  firebase.firestore.FieldValue.arrayUnion(entrada)
    };
    if (ahoraAgotado) {
      Object.assign(updateData, {
        estado: 'Entregado', estadoPago: 'Pagado',
        montoAbonado: t.precio_final || 0, montoPendiente: 0,
        fechaActualizacionEstado: new Date().toISOString()
      });
    } else if (yaNoAgotado) {
      Object.assign(updateData, {
        estado: 'Aprobado', estadoPago: 'Pendiente',
        montoAbonado: 0, montoPendiente: t.precio_final || 0,
        fechaActualizacionEstado: new Date().toISOString()
      });
    }
    await db.collection('cotizaciones').doc(String(id)).update(updateData);

    if (ahoraAgotado) {
      toast('Lote agotado — Entregado y Pagado ✓', 'success');
    } else if (yaNoAgotado) {
      toast(`${cantidad} unidad${cantidad !== 1 ? 'es' : ''} devuelta${cantidad !== 1 ? 's' : ''} — lote reactivado ✓`, 'success');
    } else if (esDevolucion) {
      toast(`${cantidad} unidad${cantidad !== 1 ? 'es' : ''} devuelta${cantidad !== 1 ? 's' : ''} ✓`, 'success');
    } else {
      const u = cantidad === 1 ? '1 unidad vendida' : `${cantidad} unidades vendidas`;
      toast(`${u} ✓`, 'success');
    }
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(_){}
  } catch(e) {
    console.error(e);
    toast('Error al registrar el movimiento', 'error');
    // Revertir local
    if (idx >= 0) {
      trabajos[idx].unidadesVendidas = vendidas;
      trabajos[idx].historialVentas?.pop();
      trabajos[idx].estado         = prevEstado;
      trabajos[idx].estadoPago     = prevEstadoPago;
      trabajos[idx].montoAbonado   = prevAbonado;
      trabajos[idx].montoPendiente = prevPendiente;
    }
    renderVentaDetalle(trabajos.filter(t => t.ventaDetalle === true));
  }
}

/* ----------------------------------------------------------
   Dashboard
---------------------------------------------------------- */
async function cargarDashboard() {
  try {
    // Usar datos ya cargados si existen, sino recargar
    if (!trabajos.length) {
      trabajos = await fbCargarTrabajos();
    }
  } catch(e) {
    console.error('Error cargando dashboard:', e);
    toast('No se pudo cargar el dashboard','error');
  }
  setDashFiltro(_dashFiltro);
}

function setDashFiltro(filtro) {
  _dashFiltro = filtro;
  document.querySelectorAll('.dash-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filtro === filtro);
  });
  renderDashboard(filtro);
}

/* ----------------------------------------------------------
   Configuración
---------------------------------------------------------- */
async function guardarConfiguracion() {
  const cfg = {
    cfg_costo_g:fv('cfg_costo_g'), cfg_watts:fv('cfg_watts'), cfg_kwh:fv('cfg_kwh'),
    cfg_desgaste_h:fv('cfg_desgaste_h'), cfg_mo_h:fv('cfg_mo_h'), cfg_dis_h:fv('cfg_dis_h'),
    cfg_fallos:fv('cfg_fallos'), cfg_margen:fv('cfg_margen'), cfg_iva:fv('cfg_iva')
  };
  const emp = {
    emp_nombre:el('emp_nombre').value, emp_email:el('emp_email').value,
    emp_tel:el('emp_tel').value, emp_web:el('emp_web').value,
    emp_cedula:el('emp_cedula').value, emp_nota:el('emp_nota').value
  };
  localStorage.setItem('cfg3d',JSON.stringify(cfg));
  localStorage.setItem('emp3d',JSON.stringify(emp));
  try {
    await fbGuardarConfig(cfg); await fbGuardarEmpresa(emp);
    toast('Configuración guardada en Firebase ✓','success');
  } catch(e) {
    console.error(e); toast('Error al guardar la configuración','error');
  }
  calcCfg(); calcular();
}

async function cargarConfiguracion() {
  try {
    const cfg=await fbCargarConfig(); const emp=await fbCargarEmpresa();
    if(cfg) {
      ['cfg_costo_g','cfg_watts','cfg_kwh','cfg_desgaste_h','cfg_mo_h','cfg_dis_h','cfg_fallos','cfg_margen','cfg_iva']
        .forEach(f=>{ if(cfg[f]!==undefined&&el(f)) el(f).value=cfg[f]; });
      localStorage.setItem('cfg3d',JSON.stringify(cfg));
    }
    if(emp) {
      ['emp_nombre','emp_email','emp_tel','emp_web','emp_cedula','emp_nota']
        .forEach(f=>{ if(emp[f]!==undefined&&el(f)) el(f).value=emp[f]; });
      localStorage.setItem('emp3d',JSON.stringify(emp));
    }
    calcCfg(); calcular();
    toast('Configuración cargada desde Firebase ✓','success');
  } catch(e) {
    console.error(e); toast('Error al cargar desde Firebase','error');
  }
}

/* ----------------------------------------------------------
   PDF mejorado
---------------------------------------------------------- */
function getEmpresa() {
  return {
    nombre:  el('emp_nombre')?.value  || 'PinandPon 3D',
    email:   el('emp_email')?.value   || '',
    tel:     el('emp_tel')?.value     || '',
    web:     el('emp_web')?.value     || '',
    cedula:  el('emp_cedula')?.value  || '',
    nota:    el('emp_nota')?.value    || ''
  };
}

function generarPDF() {
  const pieza   = el('c_pieza')?.value?.trim();
  const cliente = el('c_cliente')?.value?.trim();
  if (!pieza||!cliente) { toast('Complete pieza y cliente','error'); return; }
  const desglose = calcular();
  generarPDFData({
    id:             editingId || 'BORRADOR',
    pieza, cliente,
    fecha:          el('c_fecha').value,
    fechaEntrega:   el('c_fecha_entrega')?.value || '',
    cantidad:       fv('c_cantidad'),
    placas:         fv('c_placas'),
    categoria:      el('c_categoria').value,
    material:       el('c_material')?.value || '',
    notas:          el('c_notas').value,
    gramos:         fv('c_gramos'),
    horas_imp:      fv('c_horas_imp'),
    pIVA:           fv('c_iva'),
    costo_total:    desglose.costoTotalPlacas,
    precio_final:   desglose.precioTotal,
    precio_unitario:desglose.precioRedondeado,
    metodoPago:     el('c_metodo_pago')?.value || '',
    montoAbonado:   fv('c_monto_abonado'),
    _desglose:      desglose
  });
}

function generarPDFData(t) {
  const emp          = getEmpresa();
  const d            = t._desglose || {};
  const pIVA         = t.pIVA || d.pIVA || 0;
  const precioFinal  = t.precio_final || 0;
  const antesIVATotal = pIVA > 0 ? precioFinal / (1 + pIVA / 100) : 0;
  const ivaValTotal   = pIVA > 0 ? precioFinal - antesIVATotal : 0;
  const ref          = String(t.id).toUpperCase().slice(0,10);
  const cantidad     = Math.max(t.cantidad||1,1);
  const placas       = Math.max(t.placas||1,1);
  const totalObjetos = cantidad * placas;
  const precioUnit   = t.precio_unitario || (precioFinal / totalObjetos);
  const abono        = Number(t.montoAbonado) || 0;
  const pendiente    = Math.max(precioFinal - abono, 0);
  const metodo       = t.metodoPago || '';

  const base       = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';
  const nombreUrl  = base + 'img/Nombre-PNG.png';

  // Nombre de archivo y fecha de vigencia
  const nombreArchivo = `COTIZACION - ${t.cliente||'Cliente'} - ${t.pieza||'Producto'}`;
  const vigenciaDate  = t.fecha ? new Date(t.fecha + 'T12:00:00') : new Date();
  vigenciaDate.setDate(vigenciaDate.getDate() + 7);
  const vigencia = vigenciaDate.toLocaleDateString('es-CR', { day:'numeric', month:'short', year:'numeric' });
  const hoyStr   = new Date().toISOString().split('T')[0];

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=860"/>
<title>${escHtml(nombreArchivo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:20px 0 80px;display:flex;justify-content:center;align-items:flex-start}
.page{width:min(794px,100vw);min-height:1027px;background:#fff;overflow:hidden;
      box-shadow:0 20px 60px -16px rgba(15,42,69,.22),0 4px 16px rgba(15,42,69,.1);
      display:flex;flex-direction:column}
@media screen and (max-width:820px){
  body{padding:0 0 70px;background:#fff}
  .page{width:100vw;min-height:100dvh;border-radius:0;box-shadow:none}
  .header{padding:24px 20px}
  .client-bar{padding:12px 20px;grid-template-columns:1fr 1fr}
  .body{padding:20px 20px 8px}
  .doc-footer{padding:14px 20px}
}
/* ── HEADER ── */
.header{background:linear-gradient(130deg,#0F2A45 0%,#16395A 45%,#235A8C 100%);
        position:relative;overflow:hidden;padding:32px 48px;
        display:flex;justify-content:space-between;align-items:center}
/* Triángulos decorativos como SVG inline (html2canvas compatible) */
.header-deco{position:absolute;inset:0;pointer-events:none;z-index:0}
.brand{display:flex;align-items:center;gap:14px;z-index:1}
.brand-mascot{width:54px;height:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.25))}
.brand-text{display:flex;flex-direction:column;gap:4px}
.brand-name{font-size:26px;font-weight:800;color:#fff;line-height:1;letter-spacing:-.02em}
.brand-name .amp{color:#F2C61F;font-style:italic}
.badge-3d{display:inline-block;background:#4A8FCB;color:#fff;font-size:10px;font-weight:700;
           padding:2px 6px;border-radius:4px;margin-left:5px;letter-spacing:.05em;vertical-align:middle}
.brand-sub{font-size:10px;letter-spacing:.18em;text-transform:uppercase;
            color:rgba(255,255,255,.55);font-weight:600}
.title-block{text-align:right;z-index:1}
.title-eyebrow{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#F2C61F}
.title-main{font-size:26px;font-weight:800;color:#fff;line-height:1.1;margin-top:4px;letter-spacing:-.01em}
.title-rule{width:40px;height:2px;background:#F2C61F;margin:8px 0 0 auto;border-radius:1px}
/* ── CLIENT BAR ── */
.client-bar{background:#F8FAFB;border-bottom:1px solid #E0EAF4;padding:16px 48px;
            display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0}
.cb-field{display:flex;flex-direction:column;gap:3px;padding-right:20px}
.cb-field+.cb-field{border-left:1px solid #DEE9F3;padding-left:20px;padding-right:0}
.cb-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.2em;color:#8CAFD2;font-weight:700}
.cb-value{font-size:14px;font-weight:700;color:#133658;line-height:1.2}
.cb-tag{display:inline-block;background:#F2C61F;color:#133658;font-size:8.5px;font-weight:700;
         padding:2px 7px;border-radius:4px;letter-spacing:.06em;margin-top:3px;width:fit-content}
/* ── BODY ── */
.body{padding:28px 48px 8px;flex:1;display:flex;flex-direction:column}
.sec-label{font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
            color:#133658;display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sec-label::before{content:"";width:18px;height:2px;background:#F2C61F;border-radius:1px;flex-shrink:0}
/* ── TABLE ── */
.tbl{width:100%;border-collapse:collapse}
.tbl thead tr{border-top:2px solid #16395A;border-bottom:1.5px solid #16395A}
.tbl thead th{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
               color:#16395A;padding:10px 12px;text-align:left}
.tbl thead th:not(:first-child){text-align:right}
.tbl tbody tr{border-bottom:1px solid #F0F5FB}
.tbl tbody td{padding:12px 12px;font-size:13px;color:#1A2433;vertical-align:top}
.tbl tbody td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.item-name{font-weight:600;color:#133658}
.item-sub{font-size:11px;color:#8CAFD2;margin-top:2px}
/* ── SUMMARY ── */
.summary{display:flex;justify-content:flex-end;padding:12px 0 16px}
.sum-card{width:280px}
.sum-row{display:flex;justify-content:space-between;align-items:baseline;
          padding:7px 0;font-size:12.5px;border-bottom:1px solid #F0F5FB}
.sum-label{color:#5B6A7E}
.sum-val{font-weight:600;font-variant-numeric:tabular-nums}
.sum-total{background:#16395A;color:#fff;padding:14px 18px;border-radius:8px;
            display:flex;justify-content:space-between;align-items:center;
            margin-top:8px;position:relative;overflow:hidden;
            box-shadow:0 6px 16px -8px rgba(15,42,69,.5)}
.sum-total::before{content:"";position:absolute;left:0;top:0;bottom:0;
                    width:4px;background:#F2C61F}
.sum-total-label{font-size:10.5px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.2em;color:rgba(255,255,255,.8);padding-left:6px}
.sum-total-val{font-size:24px;font-weight:800;letter-spacing:-.02em;white-space:nowrap}
/* ── FOOTER GRID ── */
.footer-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;
              padding:16px 0 0;margin-top:auto}
.fnotes ul{list-style:none;display:flex;flex-direction:column;gap:6px;margin-top:10px}
.fnotes li{font-size:11.5px;color:#5B6A7E;padding-left:14px;position:relative;line-height:1.5}
.fnotes li::before{content:"";position:absolute;left:0;top:6px;
                    width:5px;height:5px;background:#F2C61F;border-radius:50%}
.fnotes li strong{color:#1A2433}
.note-box{background:#F8FAFB;border:1px dashed #DDE6F0;border-radius:6px;
           padding:9px 12px;font-size:11px;color:#1A2433;margin-top:10px;line-height:1.5}
/* ── PAYMENT METHODS ── */
.pay-card{background:#F8FAFB;border:1px solid #E0EAF4;border-radius:10px;padding:14px 16px}
.pay-item{display:flex;align-items:center;gap:10px;font-size:12.5px;
           color:#133658;font-weight:500;padding:6px 0}
.pay-item+.pay-item{border-top:1px solid #EEF3F8}
.pay-icon{width:28px;height:28px;border-radius:6px;background:#E8F0F8;
           display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pay-icon svg{width:14px;height:14px;stroke:#16395A}
.pay-selected{font-weight:700;color:#059669}
.pay-selected .pay-icon{background:#D1FAE5}
.pay-selected .pay-icon svg{stroke:#059669}
/* ── DOC FOOTER ── */
.doc-footer{padding:16px 48px;border-top:1px solid #EEF3F8;
             display:flex;justify-content:space-between;align-items:center}
.thanks{font-size:13.5px;font-weight:600;color:#133658;
         display:flex;align-items:center;gap:8px}
.thanks-logo{height:24px;width:auto}
.footer-rule{width:48px;height:3px;
              background:linear-gradient(90deg,#16395A,#4A8FCB,#F2C61F);border-radius:2px}
/* ── BOTÓN IMPRIMIR ── */
.print-fab{position:fixed;bottom:24px;right:24px;background:#16395A;color:#fff;
  border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-family:inherit;
  font-weight:700;cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(15,42,69,.35);
  display:flex;align-items:center;gap:8px;letter-spacing:-.01em}
.print-fab:hover{background:#235A8C}
@page{size:letter;margin:0}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
@media print{
  html,body{background:#fff!important;padding:0!important;margin:0!important;display:block!important}
  .page{width:215.9mm!important;min-height:279.4mm!important;box-shadow:none!important;border-radius:0!important;
        border:none!important;overflow:visible!important}
  .header{padding:32px 48px!important}
  .client-bar{padding:16px 48px!important;grid-template-columns:2fr 1fr 1fr 1fr!important}
  .body{padding:28px 48px 8px!important}
  .doc-footer{padding:16px 48px!important}
  .print-btn{display:none!important}}
</style>
</head>
<body>
<button class="print-fab print-btn" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <!-- Triángulos decorativos como SVG (compatible con html2canvas) -->
    <svg class="header-deco" viewBox="0 0 794 130" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="594,0 814,0 814,130" fill="rgba(255,255,255,0.05)"/>
      <polygon points="654,-50 874,-50 654,180" fill="rgba(255,255,255,0.04)"/>
    </svg>
    <div class="brand">
      <img class="brand-mascot" src="${mascotaUrl}" alt="Pin&amp;Pon 3D">
      <div class="brand-text">
        <div class="brand-name">Pin<span class="amp">&amp;</span>Pon<span class="badge-3d">3D</span></div>
        <div class="brand-sub">Impresión 3D · Costa Rica</div>
      </div>
    </div>
    <div class="title-block">
      <div class="title-eyebrow">Cotización oficial</div>
      <div class="title-main">${escHtml(t.categoria || 'Impresión 3D')}</div>
      <div class="title-rule"></div>
    </div>
  </div>

  <!-- CLIENT BAR -->
  <div class="client-bar">
    <div class="cb-field">
      <div class="cb-label">Cliente</div>
      <div class="cb-value">${escHtml(t.cliente || 'Nombre del cliente')}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Cotización</div>
      <div class="cb-value">N.° ${ref}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Fecha</div>
      <div class="cb-value">${t.fecha || hoyStr}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Vigencia</div>
      <div class="cb-value">${vigencia}</div>
      <span class="cb-tag">7 DÍAS</span>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">
    <div class="sec-label">Detalle</div>

    <table class="tbl">
      <thead>
        <tr>
          <th>Pieza / Producto</th>
          <th>Cant.</th>
          <th>Precio unitario</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-name">${escHtml(t.pieza || '—')}</div>
            ${t.notas ? `<div class="item-sub" style="font-style:italic">${escHtml(t.notas)}</div>` : ''}
          </td>
          <td>${totalObjetos}</td>
          <td>&#8353;&thinsp;${(Math.ceil(precioUnit)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
          <td><strong>&#8353;&thinsp;${(Math.ceil(precioFinal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></td>
        </tr>
      </tbody>
    </table>

    <!-- SUMMARY -->
    <div class="summary">
      <div class="sum-card">
        ${pIVA > 0 ? `
        <div class="sum-row"><span class="sum-label">Subtotal (sin IVA)</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(antesIVATotal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>
        <div class="sum-row"><span class="sum-label">IVA (${pIVA}%)</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(ivaValTotal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>` : ''}
        ${abono > 0 ? `
        <div class="sum-row"><span class="sum-label">Abono recibido</span><span class="sum-val" style="color:#059669">&#8722; &#8353;&thinsp;${(Math.ceil(abono)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>
        <div class="sum-row"><span class="sum-label">Saldo pendiente</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(pendiente)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>` : ''}
        <div class="sum-total">
          <span class="sum-total-label">Total final</span>
          <span class="sum-total-val">&#8353;&thinsp;${(Math.ceil(precioFinal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
        </div>
      </div>
    </div>

    <!-- NOTAS + PAGO -->
    <div class="footer-grid">
      <div class="fnotes">
        <div class="sec-label">Notas</div>
        <ul>
          <li>La cotización tiene validez de <strong>7 días</strong> a partir de la fecha de emisión.</li>
          <li>El precio puede variar si cambian las características del modelo 3D.</li>
          <li>Para iniciar el trabajo se puede solicitar un <strong>abono del 50%</strong>.</li>
          <li>El tiempo de entrega se confirma al aprobar la cotización.</li>
          ${t.notas ? `<li>${escHtml(t.notas)}</li>` : ''}
        </ul>
        ${t.fechaEntrega ? `<div class="note-box">⏰ Entrega estimada: <strong>${escHtml(t.fechaEntrega)}</strong></div>` : ''}
        ${emp.nota ? `<div class="note-box">${escHtml(emp.nota)}</div>` : ''}
      </div>
      <div>
        <div class="sec-label">Método de pago</div>
        <div class="pay-card">
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>
            SINPEMóvil
          </div>
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
            Efectivo
          </div>
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            Transferencia
          </div>
        </div>
        ${emp.tel ? `<div style="font-size:11px;color:#8CAFD2;margin-top:10px;display:flex;align-items:center;gap:6px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 8.81A19.79 19.79 0 0 1 2 2.12h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escHtml(emp.tel)}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- DOC FOOTER -->
  <div class="doc-footer">
    <img class="thanks-logo" src="${nombreUrl}" alt="Pin&amp;Pon 3D">
    <div class="footer-rule"></div>
  </div>

</div>

<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;

  const blob    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const win     = window.open(blobUrl, '_blank');
  if (!win) { URL.revokeObjectURL(blobUrl); toast('Permita ventanas emergentes en este sitio para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  toast('Abriendo cotización — use Ctrl+P / Cmd+P para guardar como PDF', 'success');

  // Subir a Google Drive si está conectado
  if (typeof _gDriveToken !== 'undefined' && _gDriveToken && _gDriveFolderId) {
    const fname = `Cotizacion - ${(t.cliente||'Cliente').replace(/[<>:"/\\|?*]/g,'_')}.html`;
    _gDriveSubirHTML(fname, htmlContent);
  }
}

/* ----------------------------------------------------------
   Venta al Detalle — Generar Lista de Precios (PDF)
---------------------------------------------------------- */
function generarListaPrecios() {
  // Filtrar lotes activos (misma lógica que renderVentaDetalle)
  const lotes = trabajos.filter(l =>
    l.categoria === 'Venta al Detalle' &&
    l.estado !== 'Cancelado' &&
    (l.unidadesVendidas || 0) < Math.max(l.cantidad || 1, 1)
  );

  if (!lotes.length) {
    toast('No hay productos disponibles en Venta al Detalle para exportar', 'error');
    return;
  }

  toast('Generando lista de precios…', 'info');

  const emp       = getEmpresa();
  const base      = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';

  const fechaHoy = new Date().toLocaleDateString('es-CR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Contacto en el pie
  const contactParts = [];
  if (emp.empTel)   contactParts.push('📞 ' + emp.empTel);
  if (emp.empEmail) contactParts.push('✉ ' + emp.empEmail);
  if (emp.empWeb)   contactParts.push('🌐 ' + emp.empWeb);
  const contactLine = contactParts.join('  ·  ');

  // Filas de la tabla
  const rowsHtml = lotes.map((l, i) => {
    const total      = Math.max(l.cantidad || 1, 1);
    const vendidas   = Math.min(l.unidadesVendidas || 0, total);
    const disponibles = total - vendidas;
    const precio     = l.precio_unitario || 0;
    const rowBg      = i % 2 === 0 ? '#ffffff' : '#f4f8ff';
    return `
    <tr style="background:${rowBg};border-bottom:1px solid #e8f0f8">
      <td style="padding:14px 12px;font-size:11px;font-weight:700;color:#8cafd2;text-align:center;width:40px">${i+1}</td>
      <td style="padding:14px 14px">
        <div style="font-size:14px;font-weight:700;color:#0f1f33;margin-bottom:3px">${escHtml(l.pieza||'—')}</div>
        ${l.material ? `<div style="font-size:11px;color:#8cafd2">${escHtml(l.material)}</div>` : ''}
      </td>
      <td style="padding:14px 12px;white-space:nowrap">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#eef5fc;color:#1a60a6;border:1px solid #dde6f0">${escHtml(l.categoria||'General')}</span>
      </td>
      <td style="padding:14px 12px;text-align:center">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(5,150,105,0.1);color:#047857">${disponibles} disp.</span>
      </td>
      <td style="padding:14px 18px;text-align:right;white-space:nowrap">
        <div style="font-size:22px;font-weight:800;color:#1a60a6;font-variant-numeric:tabular-nums;line-height:1">₡${(Math.ceil(precio)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
        <div style="font-size:9px;color:#8cafd2;font-weight:500;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">por unidad</div>
      </td>
    </tr>`;
  }).join('');

  const nombreArchivo = 'LISTA DE PRECIOS - Pin&Pon 3D';

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${nombreArchivo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:20px 0 80px;display:flex;justify-content:center;align-items:flex-start}
.page{
  width:min(794px,100vw);
  min-height:1027px;
  background:#fff;
  overflow:hidden;
  box-shadow:0 20px 60px -16px rgba(15,42,69,.22),0 4px 16px rgba(15,42,69,.1);
  display:flex;flex-direction:column;
}
@media screen and (max-width:820px){
  body{padding:0}
  .page{box-shadow:none;border-radius:0;min-height:100vh;width:100%}
}
@media print{
  html,body{padding:0;margin:0;background:#fff}
  .page{box-shadow:none;width:100%;min-height:0}
  @page{size:letter;margin:0!important}
}
.print-fab{position:fixed;bottom:24px;right:24px;background:#133658;color:#fff;border:none;
  border-radius:10px;padding:14px 22px;font-size:14px;font-family:inherit;font-weight:700;
  cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(10,31,61,.35)}
@media print{.print-fab{display:none!important}}
</style>
</head>
<body>
<button class="print-fab" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
<div class="page" id="the-page">

  <!-- ══ ENCABEZADO ══════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#0a1f3d 0%,#1a3a6b 60%,#133658 100%);padding:32px 40px 26px;position:relative;overflow:hidden">

    <!-- Círculos decorativos (SVG inline) -->
    <svg style="position:absolute;right:-20px;top:-20px;width:180px;height:180px;opacity:.07"
         viewBox="0 0 180 180" fill="none">
      <circle cx="90" cy="90" r="80" stroke="white" stroke-width="2"/>
      <circle cx="90" cy="90" r="55" stroke="white" stroke-width="2"/>
      <circle cx="90" cy="90" r="30" fill="white"/>
    </svg>
    <svg style="position:absolute;left:40%;bottom:-30px;width:120px;height:120px;opacity:.04"
         viewBox="0 0 120 120" fill="white">
      <polygon points="60,10 110,90 10,90"/>
    </svg>

    <!-- Contenido del header -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative">

      <!-- Izquierda: logo + títulos -->
      <div style="display:flex;align-items:center;gap:18px">
        <div style="width:64px;height:64px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
          <img src="${mascotaUrl}" alt="Pin&Pon 3D" width="52" height="52" style="object-fit:contain" crossorigin="anonymous"/>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px">Pin&amp;Pon 3D — Impresión 3D Personalizada</div>
          <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-.02em;line-height:1">LISTA DE PRECIOS</div>
          <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:5px;font-weight:400">Precios unitarios al público · Venta al detalle</div>
        </div>
      </div>

      <!-- Derecha: fecha -->
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 20px;text-align:center;flex-shrink:0">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.45);font-weight:600;margin-bottom:5px">Vigente al</div>
        <div style="font-size:15px;font-weight:800;color:#f4c70f;white-space:nowrap">${fechaHoy}</div>
      </div>
    </div>

    <!-- Línea dorada inferior -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f4c70f 0%,#d2ac09 55%,rgba(210,172,9,.1) 100%)"></div>
  </div>

  <!-- ══ CUERPO ════════════════════════════════════════════== -->
  <div style="padding:28px 40px 36px;flex:1">

    <!-- Label sección -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#8cafd2;white-space:nowrap">Catálogo de productos disponibles</div>
      <div style="flex:1;height:1px;background:#dde6f0"></div>
      <div style="font-size:9px;color:#8cafd2">${lotes.length} producto${lotes.length !== 1 ? 's' : ''}</div>
    </div>

    <!-- Tabla -->
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e8f0f8">
      <thead>
        <tr style="background:linear-gradient(90deg,#1a60a6 0%,#133658 100%)">
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:center;width:40px">#</th>
          <th style="padding:11px 14px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:left">Producto</th>
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:left">Categoría</th>
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:center">Disponible</th>
          <th style="padding:11px 18px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:right">Precio unitario</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- ══ PIE DE PÁGINA ═══════════════════════════════════ -->
    <div style="margin-top:28px;padding-top:16px;border-top:2px solid #dde6f0;display:flex;justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:12px;font-weight:800;color:#133658;letter-spacing:.02em">Pin<span style="color:#f4c70f">&amp;</span>Pon 3D — Impresión 3D Personalizada</div>
        ${contactLine ? `<div style="font-size:10px;color:#4e6882">${contactLine}</div>` : ''}
        <div style="font-size:9px;color:#8cafd2;font-style:italic;margin-top:2px">* Precios en colones costarricenses (₡) · Incluye IVA cuando aplica · Sujetos a cambio sin previo aviso</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:10px;color:#8cafd2">Generado el ${fechaHoy}</div>
      </div>
    </div>
  </div>
</div><!-- /.page -->

<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;

  const blobLP    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrlLP = URL.createObjectURL(blobLP);
  const winLP     = window.open(blobUrlLP, '_blank');
  if (!winLP) { URL.revokeObjectURL(blobUrlLP); toast('Permita ventanas emergentes para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrlLP), 10000);
}

/* ----------------------------------------------------------
   Google Drive — guardar cotizaciones en carpeta COTIZACIONES
---------------------------------------------------------- */
let _gDriveToken    = null;
let _gDriveFolderId = null;

/** Actualiza la UI del panel de Drive según estado de conexión. */
function _gDriveActualizarUI(connected) {
  const dot   = el('gdrive-dot');
  const txt   = el('gdrive-status-text');
  const bCon  = el('gdrive-btn-conectar');
  const bDes  = el('gdrive-btn-desconectar');
  const bTest = el('gdrive-btn-test');
  if (dot)   dot.className   = 'status-dot ' + (connected ? 'connected' : '');
  if (txt)   txt.textContent = connected
    ? 'Conectado · carpeta COTIZACIONES lista'
    : 'Sin conexión';
  if (bCon)  bCon.style.display  = connected ? 'none' : '';
  if (bDes)  bDes.style.display  = connected ? '' : 'none';
  if (bTest) bTest.style.display = connected ? '' : 'none';
}

/** Sube un archivo de prueba a la carpeta COTIZACIONES para verificar la conexión. */
async function probarDrive() {
  if (!_gDriveToken || !_gDriveFolderId) {
    toast('Drive no está conectado', 'error'); return;
  }
  const btn = el('gdrive-btn-test');
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
  const ahora   = new Date().toLocaleString('es-CR');
  const nombre  = `TEST-conexion-${new Date().toISOString().split('T')[0]}.html`;
  const contenido = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Prueba Drive — Pin&amp;Pon 3D</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f0f5fc;display:flex;
       align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#fff;border-radius:16px;padding:40px 48px;
        box-shadow:0 8px 32px rgba(19,54,88,.12);text-align:center;max-width:400px}
  h1{color:#133658;font-size:1.4rem;margin:0 0 8px}
  p{color:#4e6882;font-size:.9rem;margin:4px 0}
  .ok{display:inline-block;background:#d1fae5;color:#065f46;
      border-radius:99px;padding:6px 18px;font-weight:700;margin-top:20px;font-size:1rem}
</style></head>
<body>
  <div class="card">
    <div style="font-size:2.5rem">✅</div>
    <h1>¡Conexión exitosa!</h1>
    <p>Google Drive conectado correctamente.</p>
    <p>Carpeta: <strong>COTIZACIONES</strong></p>
    <p style="margin-top:12px;font-size:.8rem;color:#8cafd2">Generado: ${ahora}</p>
    <span class="ok">Pin&amp;Pon 3D · Cotizador</span>
  </div>
</body></html>`;
  await _gDriveSubirHTML(nombre, contenido);
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Probar conexión'; }
}

/** Solicita autorización OAuth de Google Drive. */
async function conectarGDrive() {
  const cid = (el('cfg_gdrive_client_id')?.value?.trim()) || localStorage.getItem('gdrive_client_id');
  if (!cid) { toast('Ingrese el Client ID de Google Cloud', 'error'); return; }
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    toast('Google Identity Services no disponible. Verifique su conexión.', 'error');
    return;
  }
  localStorage.setItem('gdrive_client_id', cid);
  if (el('cfg_gdrive_client_id')) el('cfg_gdrive_client_id').value = cid;
  google.accounts.oauth2.initTokenClient({
    client_id: cid,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (resp) => {
      if (resp.error) { toast('Error al conectar Drive: ' + resp.error, 'error'); return; }
      _gDriveToken = resp.access_token;
      await _gDriveEnsureFolder();
    }
  }).requestAccessToken({ prompt: '' });
}

/** Revoca el token y limpia el estado. */
function desconectarGDrive() {
  if (_gDriveToken && typeof google !== 'undefined') {
    try { google.accounts.oauth2.revoke(_gDriveToken, () => {}); } catch(e) {}
  }
  _gDriveToken = null; _gDriveFolderId = null;
  _gDriveActualizarUI(false);
  toast('Google Drive desconectado', 'info');
}

/** Busca o crea la carpeta COTIZACIONES en Drive. */
async function _gDriveEnsureFolder() {
  if (!_gDriveToken) return;
  try {
    const q = encodeURIComponent(
      `name='COTIZACIONES' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: `Bearer ${_gDriveToken}` } }
    );
    const data = await r.json();
    if (data.files?.length) {
      _gDriveFolderId = data.files[0].id;
      toast('Google Drive conectado · carpeta COTIZACIONES lista ✓', 'success');
    } else {
      const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${_gDriveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'COTIZACIONES', mimeType: 'application/vnd.google-apps.folder' })
      });
      const f = await cr.json();
      if (!f.id) throw new Error('No se pudo crear la carpeta');
      _gDriveFolderId = f.id;
      toast('Google Drive conectado · carpeta COTIZACIONES creada ✓', 'success');
    }
    _gDriveActualizarUI(true);
  } catch(e) {
    console.error('Drive folder error:', e);
    toast('Error al configurar carpeta en Drive: ' + e.message, 'error');
    _gDriveToken = null;
    _gDriveActualizarUI(false);
  }
}

/** Sube un archivo HTML a la carpeta COTIZACIONES. */
async function _gDriveSubirHTML(nombre, htmlStr) {
  if (!_gDriveToken || !_gDriveFolderId) return;
  try {
    const meta = { name: nombre, mimeType: 'text/html', parents: [_gDriveFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file',     new Blob([htmlStr],              { type: 'text/html;charset=utf-8' }));
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${_gDriveToken}` }, body: form }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (err.error?.code === 401) {        // Token expirado
        _gDriveToken = null;
        _gDriveActualizarUI(false);
        toast('Sesión de Drive expirada. Reconecte en Configuración → Integraciones.', 'error', 6000);
        return;
      }
      throw new Error(err.error?.message || r.status);
    }
    toast(`📁 Guardado en Drive → COTIZACIONES/${nombre}`, 'success', 5000);
  } catch(e) {
    console.error('Drive upload error:', e);
    toast('No se pudo guardar en Drive: ' + e.message, 'error');
  }
}

/* ----------------------------------------------------------
   Gestión de Costos
---------------------------------------------------------- */

async function cargarCostos() {
  try {
    [gastos, inversion] = await Promise.all([fbCargarGastos(), fbCargarInversion()]);
    renderCostos();
    renderInversion();
    actualizarDashboardInversion();
  } catch(e) {
    console.error('Error cargando costos:', e);
  }
}

function resetFormGasto() {
  const hoy = new Date().toISOString().split('T')[0];
  el('g_descripcion') && (el('g_descripcion').value = '');
  el('g_monto')       && (el('g_monto').value = '');
  el('g_fecha')       && (el('g_fecha').value = hoy);
}

async function guardarGasto() {
  const descripcion = (el('g_descripcion')?.value || '').trim();
  const categoria   = el('g_categoria')?.value || 'Otro';
  const monto       = parseFloat(el('g_monto')?.value || 0);
  const fecha       = el('g_fecha')?.value || new Date().toISOString().split('T')[0];
  const notas       = (el('g_notas')?.value || '').trim();
  if (!descripcion || !monto) { toast('Completa descripción y monto', 'error'); return; }
  const data = { id: Date.now().toString(), descripcion, categoria, monto, fecha, notas };
  try {
    await fbGuardarGasto(data);
    gastos.unshift(data);
    resetFormGasto();
    renderCostos();
    toast('Gasto registrado ✓', 'success');
  } catch(e) {
    toast('Error guardando gasto', 'error');
  }
}

async function eliminarGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  try {
    await fbEliminarGasto(id);
    gastos = gastos.filter(g => g.id !== id);
    renderCostos();
    toast('Gasto eliminado', 'success');
  } catch(e) {
    toast('Error eliminando gasto', 'error');
  }
}

async function toggleGastoPagado(id) {
  const idx = gastos.findIndex(g => g.id === id);
  if (idx < 0) return;
  gastos[idx].pagado = !gastos[idx].pagado;
  try {
    await db.collection('gastos').doc(String(id)).update({ pagado: gastos[idx].pagado });
    renderCostos();
    if (typeof renderTrabajos === 'function') renderTrabajos();
    toast(gastos[idx].pagado ? 'Gasto marcado como pagado' : 'Gasto marcado como pendiente', 'success');
  } catch(e) {
    gastos[idx].pagado = !gastos[idx].pagado; // revert
    renderCostos();
    toast('Error al actualizar', 'error');
  }
}

async function toggleInversionItemPagado(itemId) {
  const item = (inversion.items || []).find(i => i.id === itemId);
  if (!item) return;
  item.pagado = !item.pagado;
  try {
    await fbGuardarInversion(inversion);
    renderInversion();
    if (typeof renderTrabajos === 'function') renderTrabajos();
    actualizarDashboardInversion();
    toast(item.pagado ? 'Item marcado como pagado' : 'Item marcado como pendiente', 'success');
  } catch(e) {
    item.pagado = !item.pagado; // revert
    renderInversion();
    toast('Error al actualizar', 'error');
  }
}

async function toggleInversionActiva() {
  inversion.activa = !inversion.activa;
  try {
    await fbGuardarInversion(inversion);
    renderInversion();
    actualizarDashboardInversion();
    toast(inversion.activa ? 'Inversión visible en dashboard ✓' : 'Inversión oculta del dashboard', 'success');
  } catch(e) {
    toast('Error guardando configuración', 'error');
  }
}

async function guardarItemInversion() {
  const descripcion = (el('inv_descripcion')?.value || '').trim();
  const categoria   = el('invitem_categoria')?.value || 'Otro';
  const monto       = parseFloat(el('inv_monto')?.value || 0);
  if (!descripcion || !monto) { toast('Completa descripción y monto', 'error'); return; }
  const item = { id: Date.now().toString(), descripcion, categoria, monto };
  if (!inversion.items) inversion.items = [];
  inversion.items.push(item);
  try {
    await fbGuardarInversion(inversion);
    el('inv_descripcion').value = '';
    el('inv_monto').value = '';
    renderInversion();
    actualizarDashboardInversion();
    toast('Item de inversión agregado ✓', 'success');
  } catch(e) {
    toast('Error guardando inversión', 'error');
  }
}

async function eliminarItemInversion(id) {
  if (!confirm('¿Eliminar este item de inversión?')) return;
  inversion.items = (inversion.items || []).filter(i => i.id !== id);
  try {
    await fbGuardarInversion(inversion);
    renderInversion();
    actualizarDashboardInversion();
    toast('Item eliminado', 'success');
  } catch(e) {
    toast('Error eliminando item', 'error');
  }
}

function actualizarDashboardInversion() {
  const activa = inversion.activa && (inversion.items?.length > 0);
  const totalInv   = activa ? (inversion.items || []).reduce((s, i) => s + (i.monto || 0), 0) : 0;
  const recuperado = activa
    ? trabajos.filter(t => t.estado !== 'Cancelado').reduce((s, t) => s + ingresosLote(t), 0)
    : 0;
  const pct  = totalInv > 0 ? Math.min(100, (recuperado / totalInv) * 100) : 0;
  const rest = Math.max(0, totalInv - recuperado);
  const barColor = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : 'var(--brand-gold, #F2C61F)';

  // — Tarjeta Dashboard —
  const dashCard = el('dash-inversion-card');
  if (dashCard) {
    dashCard.style.display = activa ? '' : 'none';
    if (activa) {
      set('dash-inv-total',      fmt(totalInv));
      set('dash-inv-recuperado', fmt(recuperado));
      set('dash-inv-faltante',   fmt(rest));
      set('dash-inv-pct',        pct.toFixed(1) + '%');
      const bar = el('dash-inv-bar');
      if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }
    }
  }

  // — Tarjeta Trabajos —
  const trCard = el('tr-inversion-card');
  if (trCard) {
    trCard.style.display = activa ? '' : 'none';
    if (activa) {
      set('tr-inv-total',      fmt(totalInv));
      set('tr-inv-recuperado', fmt(recuperado));
      set('tr-inv-faltante',   fmt(rest));
      set('tr-inv-pct',        pct.toFixed(1) + '%');
      const bar = el('tr-inv-bar');
      if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }
    }
  }
}

/* ----------------------------------------------------------
   Inicialización básica (antes de autenticar)
---------------------------------------------------------- */
/* ----------------------------------------------------------
   Categorías de Pago — gestión
---------------------------------------------------------- */
async function cargarCategoriasPago() {
  try {
    const stored = await fbCargarCategoriasPago();
    if (stored && stored.length) categoriasPago = stored;
  } catch(e) { console.warn('categoriasPago: usando defaults'); }
  actualizarFiltrosPago();
}

function actualizarFiltrosPago() {
  // Reconstruir el filtro #tr-pago
  const sel = el('tr-pago');
  if (sel) {
    sel.innerHTML = `<option value="">Todos los pagos</option>` +
      categoriasPago.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  renderCategoriasPagoConfig();
}

function renderCategoriasPagoConfig() {
  const list = el('cfg-pago-list');
  if (!list) return;
  list.innerHTML = categoriasPago.map((c, i) => `
    <div class="inv-item">
      <div class="inv-item-info">
        <span class="inv-item-desc">${escHtml(c)}</span>
        ${i === 0 ? '<span class="badge badge-pago-pendiente" style="font-size:.65rem">Pendiente base</span>'
          : i === categoriasPago.length-1 ? '<span class="badge badge-pago-pagado" style="font-size:.65rem">Pagado base</span>'
          : '<span class="badge badge-pago-abono" style="font-size:.65rem">Intermedio</span>'}
      </div>
      <div class="inv-item-right">
        ${i === 0 || i === categoriasPago.length-1
          ? '<span style="font-size:.72rem;color:var(--text3)">Requerido</span>'
          : `<button class="btn btn-danger btn-icon btn-sm" onclick="eliminarCategoriaPago(${i})">
               <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
             </button>`
        }
      </div>
    </div>`).join('');
}

async function agregarCategoriaPago() {
  const input = el('cfg-pago-nueva');
  const nombre = (input?.value || '').trim();
  if (!nombre) { toast('Escribe un nombre', 'error'); return; }
  if (categoriasPago.includes(nombre)) { toast('Ya existe esa categoría', 'error'); return; }
  // Insertar antes del último (antes de "Pagado")
  categoriasPago.splice(categoriasPago.length - 1, 0, nombre);
  if (input) input.value = '';
  try {
    await fbGuardarCategoriasPago(categoriasPago);
    actualizarFiltrosPago();
    toast(`Categoría "${nombre}" agregada ✓`, 'success');
  } catch(e) { toast('Error guardando', 'error'); }
}

async function eliminarCategoriaPago(idx) {
  if (idx === 0 || idx === categoriasPago.length - 1) return; // no eliminar primera/última
  const nombre = categoriasPago[idx];
  if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
  categoriasPago.splice(idx, 1);
  try {
    await fbGuardarCategoriasPago(categoriasPago);
    actualizarFiltrosPago();
    toast(`Categoría eliminada ✓`, 'success');
  } catch(e) { toast('Error eliminando', 'error'); }
}

function getPagoClass(estado) {
  const cats = categoriasPago.length ? categoriasPago : ['Pendiente','Abono','Pagado'];
  const i = cats.indexOf(estado);
  if (i < 0 || i === 0) return 'badge-pago-pendiente';
  if (i === cats.length - 1) return 'badge-pago-pagado';
  return 'badge-pago-abono';
}

async function cambiarPago(id, pago, selectEl) {
  const t = trabajos.find(x => x.id === id);
  if (t) t.estadoPago = pago;
  const cls = getPagoClass(pago);
  if (selectEl) selectEl.className = `badge ${cls} pago-select`;
  try {
    await fbActualizarPago(id, { estadoPago: pago });
    toast('Pago actualizado ✓', 'success');
    renderTrabajos();
  } catch(e) {
    toast('Error actualizando pago', 'error');
  }
}

/* ─── AUTOCOMPLETADO DE CLIENTES ─── */
function initClienteAutocomplete() {
  const input = el('c_cliente');
  const list  = el('cs-suggest');
  if (!input || !list) return;

  const mostrar = () => {
    const q = input.value.trim().toLowerCase();
    if (!q || !clientes.length) { list.classList.remove('cs-open'); return; }

    const matches = clientes
      .filter(c => (c.nombre || '').toLowerCase().includes(q))
      .slice(0, 7);

    if (!matches.length) { list.classList.remove('cs-open'); return; }

    list.innerHTML = matches.map(c => {
      const meta = [c.telefono, c.correo].filter(Boolean).join(' · ');
      return `<div class="cs-item" onmousedown="seleccionarCliente(${JSON.stringify(c.nombre)})">
        <span class="cs-nombre">${escHtml(c.nombre || '')}</span>
        ${meta ? `<span class="cs-meta">${escHtml(meta)}</span>` : ''}
      </div>`;
    }).join('');
    list.classList.add('cs-open');
  };

  input.addEventListener('input', mostrar);
  input.addEventListener('focus', mostrar);
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('cs-open'), 160));
}

function seleccionarCliente(nombre) {
  const input = el('c_cliente'); if (input) input.value = nombre;
  const list  = el('cs-suggest'); if (list) list.classList.remove('cs-open');
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  applyThemeLabels();
  if (el('c_fecha'))   el('c_fecha').value   = today();
  if (el('inv_fecha')) el('inv_fecha').value = today();
  cargarCfgLocal();
  calcCfg();
  calcular();
  initClienteAutocomplete();
  cargarCategoriasPago();
  // Restaurar Client ID de Drive (predeterminado + localStorage)
  const DEFAULT_GDRIVE_CID = '1087662880090-o7ammg0cc2sofe5r3hoq4ur5dcf11j6j.apps.googleusercontent.com';
  const savedCid = localStorage.getItem('gdrive_client_id') || DEFAULT_GDRIVE_CID;
  if (savedCid) {
    localStorage.setItem('gdrive_client_id', savedCid);
    if (el('cfg_gdrive_client_id')) el('cfg_gdrive_client_id').value = savedCid;
  }
  // Cerrar modales con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModalEdicion(); cerrarModalAbono(); }
  });
});

/* ----------------------------------------------------------
   Toggle filtros en móvil
---------------------------------------------------------- */
function toggleFiltrosMobile() {
  const extras = document.getElementById('filter-extras');
  const btn    = document.getElementById('btn-toggle-filters');
  if (!extras) return;
  const isOpen = extras.classList.toggle('fe-open');
  if (btn) {
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = isOpen ? 'Cerrar' : 'Filtros';
    btn.classList.toggle('btn-primary', isOpen);
    btn.classList.toggle('btn-secondary', !isOpen);
  }
}

/* ----------------------------------------------------------
   Callback post-autenticación (llamado desde auth.js)
---------------------------------------------------------- */
/* ----------------------------------------------------------
   Calendario de Producción
---------------------------------------------------------- */
async function cargarCalendario() {
  try {
    if (!trabajos.length) trabajos = await fbCargarTrabajos();
  } catch(e) { console.error('Error cargando calendario:', e); }
  renderCalendario(_calYear, _calMonth);
}

function calCambiarMes(delta) {
  _calMonth += delta;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderCalendario(_calYear, _calMonth);
}

function calHoy() {
  _calYear  = new Date().getFullYear();
  _calMonth = new Date().getMonth();
  renderCalendario(_calYear, _calMonth);
}

function onAuthSuccess() {
  testFirebase();
  try { const l=localStorage.getItem('trabajos3d');   if(l) trabajos=JSON.parse(l);   } catch(e){}
  try { const l=localStorage.getItem('filamentos3d'); if(l) filamentos=JSON.parse(l); } catch(e){}
  try { const l=localStorage.getItem('clientes3d');   if(l) clientes=JSON.parse(l);  } catch(e){}
  navTo('dashboard');
  cargarConfiguracion();
}

/* ----------------------------------------------------------
   Exportar datos a CSV — un ZIP con todos los archivos
---------------------------------------------------------- */
function _csvStr(filas) {
  const BOM = '﻿';
  return BOM + filas.map(f =>
    f.map(v => {
      const s = String(v ?? '');
      return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\r\n');
}

function _filaCot(t) {
  return [
    t.id, t.fecha||'', t.cliente||'', t.pieza||'',
    t.categoria||'', t.material||'',
    t.estado||'', t.estadoPago||'', t.metodoPago||'',
    t.cantidad||0, t.placas||0, t.gramos||0,
    t.horas_imp||0, t.horas_mo||0, t.horas_dis||0,
    t.pFallos||0, t.pMargen||0, t.pIVA||0,
    t.costo_total||0, t.precio_final||0,
    t.precio_unitario||0, t.ganancia_por_objeto||0,
    t.montoAbonado||0, t.montoPendiente||0,
    t.fechaEntrega||'',
    t.fechaActualizacionEstado ? t.fechaActualizacionEstado.split('T')[0] : '',
    t.ventaDetalle ? 1 : 0, t.unidadesVendidas||0, t.notas||''
  ];
}

const _HDR_COT = ['id','fecha','cliente','pieza','categoria','material',
  'estado','estadoPago','metodoPago',
  'cantidad','placas','gramos','horas_imp','horas_mo','horas_dis',
  'pFallos','pMargen','pIVA',
  'costo_total','precio_final','precio_unitario','ganancia_por_objeto',
  'montoAbonado','montoPendiente',
  'fechaEntrega','fechaActualizacion','ventaDetalle','unidadesVendidas','notas'];

async function exportarTodosCSV() {
  if (typeof JSZip === 'undefined') {
    toast('JSZip no cargó aún, reintentá en un momento', 'error'); return;
  }
  const zip = new JSZip();
  const hoy = new Date().toISOString().split('T')[0];

  /* 1 — Todos los trabajos (filtrar por estado/estadoPago en Power BI) */
  zip.file('trabajos.csv', _csvStr([_HDR_COT, ...trabajos.map(_filaCot)]));

  /* 2 — Historial de ventas al detalle */
  const filasVentas = [['cotizacion_id','pieza','cliente','categoria','fecha_venta','cantidad','es_devolucion','nota']];
  trabajos.filter(t => (t.historialVentas||[]).length).forEach(t => {
    (t.historialVentas||[]).forEach(v => filasVentas.push([
      t.id, t.pieza||'', t.cliente||'', t.categoria||'',
      v.fecha ? new Date(v.fecha).toISOString().split('T')[0] : '',
      Math.abs(v.cantidad||0), (v.cantidad||0) < 0 ? 1 : 0, v.nota||''
    ]));
  });
  zip.file('historial_ventas.csv', _csvStr(filasVentas));

  /* 5 — Abonos */
  const filasAbonos = [['cotizacion_id','pieza','cliente','fecha_pago','monto','metodo','nota']];
  trabajos.forEach(t => {
    const ab = t.abonos || [];
    if (ab.length) {
      ab.forEach(a => filasAbonos.push([t.id, t.pieza||'', t.cliente||'', a.fecha||'', a.monto||0, a.metodo||'', a.nota||'']));
    } else if ((t.montoAbonado||0) > 0) {
      filasAbonos.push([t.id, t.pieza||'', t.cliente||'', t.fechaPago||'', t.montoAbonado||0, t.metodoPago||'', 'Pago legacy']);
    }
  });
  zip.file('abonos.csv', _csvStr(filasAbonos));

  /* 6 — Gastos */
  zip.file('gastos.csv', _csvStr([
    ['id','fecha','descripcion','categoria','monto','notas'],
    ...gastos.map(g => [g.id, g.fecha||'', g.descripcion||'', g.categoria||'', g.monto||0, g.notas||''])
  ]));

  /* 7 — Clientes */
  zip.file('clientes.csv', _csvStr([
    ['id','nombre','telefono','correo','instagram','totalPedidos','totalComprado','notas'],
    ...clientes.map(c => [c.id, c.nombre||'', c.telefono||'', c.correo||'', c.instagram||'', c.totalPedidos||0, c.totalComprado||0, c.notas||''])
  ]));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `cotizador3d_${hoy}.zip`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  toast('ZIP descargado con 5 archivos CSV ✓', 'success', 4000);
}
