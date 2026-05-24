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
let _dashFiltro    = 'mes-actual';
let seleccionados  = new Set();   // IDs seleccionados para cotización combinada
let _trabajosVista = 'tabla';     // 'tabla' | 'kanban'

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
  detalle:      'Al Detalle'
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
  if (page === 'configuracion') { calcCfg(); actualizarUIUsuario && actualizarUIUsuario(); }
  if (page === 'usuarios')      { if (typeof cargarUsuarios === 'function') cargarUsuarios(); }
  if (page === 'dashboard')     cargarDashboard();
  if (page === 'clientes')      cargarClientes();
  if (page === 'detalle')       cargarVentaDetalle();
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

  const desglose     = calcular();
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
}

/* ----------------------------------------------------------
   Cotizaciones — Cargar
---------------------------------------------------------- */
async function cargarTrabajos() {
  try {
    trabajos = await fbCargarTrabajos();
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
  } catch(e) {
    console.error('Error actualizando estado:', e);
    toast('No se pudo actualizar el estado', 'error');
  }
  renderTrabajos();
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

  const fechaHoy       = today();
  const ref            = 'COMB-' + Date.now().toString(36).toUpperCase().slice(-6);
  const totalGeneral   = items.reduce((s, t) => s + (t.precio_final || 0), 0);
  const nombreArchivo  = `Cotizacion - ${clienteNombre}`;
  const multiCliente   = [...new Set(items.map(t => t.cliente || ''))].length > 1;

  const win = window.open('','_blank');
  if (!win) { toast('Permita ventanas emergentes','error'); return; }

  const rowsHtml = items.map(t => {
    const cant      = Math.max(t.cantidad || 1, 1);
    const pUnit     = t.precio_unitario || ((t.precio_final || 0) / cant);
    const total     = t.precio_final || 0;
    return `<div class="trow">
      <div class="col-name">
        <strong>${escHtml(t.pieza || '—')}</strong>
        ${t.material ? `<span style="color:var(--ink-soft);font-size:11px"> · ${escHtml(t.material)}</span>` : ''}
        <br><span class="item-badge">${escHtml(t.categoria || 'General')}</span>
        ${multiCliente ? `<span class="item-badge" style="background:#f0fdf4;color:#16a34a;margin-left:4px">${escHtml(t.cliente || '')}</span>` : ''}
        ${(t.gramos || t.horas_imp) ? `<div class="item-note">${Number(t.gramos||0).toFixed(1)} g · ${Number(t.horas_imp||0).toFixed(1)} h</div>` : ''}
        ${t.notas ? `<div class="item-note">${escHtml(t.notas)}</div>` : ''}
      </div>
      <div class="col-qty">${cant}</div>
      <div class="col-price">₡&thinsp;${pUnit.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      <div class="col-total">₡&thinsp;${total.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(nombreArchivo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet"/>
<style>
:root{--navy:#16395A;--navy-deep:#0F2A45;--navy-2:#235A8C;--sky:#4A8FCB;--pale:#E8F0F8;--yellow:#F2C61F;--ink:#1A2433;--ink-soft:#5B6A7E;--line:#DEE5EE;--line-soft:#EEF2F7;--paper:#FFFFFF;--paper-tint:#FBFCFE;--accent:#F2C61F;--radius:10px}
*{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:var(--ink);background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:40px 20px 80px;display:flex;justify-content:center;align-items:flex-start}
button{font-family:inherit;cursor:pointer}
.page{width:794px;min-height:1123px;background:var(--paper);position:relative;overflow:hidden;box-shadow:0 20px 60px -20px rgba(15,42,69,.25),0 4px 16px -4px rgba(15,42,69,.12);border-radius:4px;display:flex;flex-direction:column}
.watermark{position:absolute;right:-60px;bottom:180px;width:360px;opacity:.025;pointer-events:none;z-index:0}
.doc-header{position:relative;color:white;overflow:hidden}
.solid-band{position:absolute;inset:0;background:linear-gradient(95deg,var(--navy-deep) 0%,var(--navy) 50%,var(--navy-2) 100%)}
.header-inner{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:32px;padding:38px 48px 34px;align-items:center}
.brand{display:flex;align-items:center;gap:16px}
.brand-mascot{width:64px;height:auto;display:block;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}
.brand-text{display:flex;flex-direction:column;gap:4px}
.wordmark{font-weight:800;font-size:28px;letter-spacing:-.02em;color:white;line-height:1;display:inline-flex;align-items:center;gap:2px}
.amp{color:var(--accent);margin:0 2px;font-style:italic;font-weight:700}
.badge-3d{font-size:11px;font-weight:700;letter-spacing:.04em;background:var(--sky);color:white;padding:3px 7px;border-radius:5px;margin-left:6px;align-self:flex-start;margin-top:-4px;box-shadow:0 2px 6px rgba(74,143,203,.4)}
.tagline{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.65);font-weight:600}
.title-block{display:flex;flex-direction:column;gap:6px;text-align:right;align-items:flex-end}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);opacity:.95}
.title{font-size:26px;font-weight:700;margin:0;line-height:1;letter-spacing:-.01em;color:white;display:inline-flex;align-items:baseline;gap:6px}
.title-num{font-weight:800;font-variant-numeric:tabular-nums;padding:0 4px;border-bottom:1px dashed rgba(255,255,255,.3)}
.meta-row{display:inline-flex;align-items:baseline;gap:10px;font-size:12.5px;margin-top:4px}
.meta-label{text-transform:uppercase;font-size:9.5px;letter-spacing:.16em;opacity:.7;font-weight:700}
.meta-value{font-weight:600;border-bottom:1px dashed rgba(255,255,255,.3);padding:0 2px 1px;min-width:120px;text-align:left}
.title-rule{width:48px;height:2px;background:var(--accent);margin-top:6px;border-radius:1px}
.doc-strip{position:relative;z-index:1;margin:28px 48px 8px;padding:18px 22px 18px 26px;background:var(--paper-tint);border:1px solid var(--line);border-radius:var(--radius);display:grid;grid-template-columns:2fr 1fr 1fr 1.1fr;gap:22px;align-items:center}
.doc-strip::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;background:var(--accent);border-radius:0 2px 2px 0}
.strip-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.strip-field+.strip-field{border-left:1px solid var(--line);padding-left:22px}
.strip-label{font-size:9.5px;text-transform:uppercase;letter-spacing:.18em;color:var(--ink-soft);font-weight:700}
.strip-value{font-size:13.5px;font-weight:600;color:var(--ink);line-height:1.25;display:inline-flex;align-items:baseline;gap:4px;flex-wrap:wrap}
.strip-value .hash{color:var(--ink-soft);font-weight:500;font-size:10.5px;letter-spacing:.05em}
.strip-name{color:var(--navy);font-weight:700;font-size:16px}
.strip-vigencia{color:var(--navy)}
.strip-vigencia::after{content:"7 días";display:inline-block;margin-left:6px;font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:var(--accent);color:var(--navy-deep);padding:2px 5px;border-radius:3px;vertical-align:middle}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;padding:0 48px}
.section-head h2{font-size:14px;font-weight:700;color:var(--navy);letter-spacing:.14em;text-transform:uppercase;margin:0;display:flex;align-items:center;gap:10px}
.section-head h2::before{content:"";width:22px;height:2px;background:var(--accent);display:inline-block}
.detail{position:relative;z-index:1;padding:28px 0 8px}
.table{margin:0 48px}
.thead,.trow{display:grid;grid-template-columns:1fr 70px 130px 130px;align-items:center;gap:8px}
.thead{color:var(--navy);padding:10px 16px 8px;border-top:1.5px solid var(--navy);border-bottom:1px solid var(--line);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.thead .col-qty,.thead .col-price,.thead .col-total{text-align:right}
.trow{padding:11px 16px;border-bottom:1px solid var(--line-soft);font-size:13px}
.trow .col-name{color:var(--ink)}
.trow .col-qty,.trow .col-price,.trow .col-total{text-align:right;font-variant-numeric:tabular-nums}
.trow .col-total{font-weight:700;color:var(--navy)}
.item-badge{display:inline-flex;padding:2px 8px;background:var(--pale);color:var(--navy);border-radius:20px;font-size:10px;font-weight:700;margin-top:4px}
.item-note{font-size:11px;color:var(--ink-soft);font-style:italic;margin-top:3px;line-height:1.4}
.summary{position:relative;z-index:1;padding:22px 48px 4px;display:flex;justify-content:flex-end}
.summary-card{width:280px}
.srow{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;font-size:12px;border-bottom:1px solid var(--line-soft)}
.srow:last-child{border-bottom:none}
.slabel{color:var(--ink-soft);font-weight:500;display:inline-flex;align-items:baseline;gap:6px;letter-spacing:.02em}
.sval{font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.total-row{padding:14px 18px;margin-top:8px;background:var(--navy);color:white;border-radius:8px;border-bottom:none!important;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden;box-shadow:0 6px 16px -8px rgba(15,42,69,.5)}
.total-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--accent)}
.total-row .slabel{color:rgba(255,255,255,.85);font-weight:700;text-transform:uppercase;letter-spacing:.22em;font-size:10.5px;padding-left:6px}
.total-row .sval{color:white;font-size:24px;font-weight:800;letter-spacing:-.02em}
.notes-pay{position:relative;z-index:1;display:grid;grid-template-columns:1.5fr 1fr;gap:24px;padding:28px 48px 24px;margin-top:auto;align-items:stretch}
.notes h3,.payment h3{font-size:10px;text-transform:uppercase;letter-spacing:.18em;margin:0 0 12px;color:var(--navy);font-weight:700;display:flex;align-items:center;gap:8px}
.notes h3::before,.payment h3::before{content:"";width:14px;height:1.5px;background:var(--accent)}
.notes ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--ink-soft);line-height:1.5}
.notes li{position:relative;padding-left:14px}
.notes li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;background:var(--accent);transform:rotate(45deg)}
.notes strong{color:var(--ink);font-weight:700}
.note-extra{margin-top:10px;padding:9px 11px;background:var(--paper-tint);border:1px dashed var(--line);border-radius:6px;font-size:11.5px;color:var(--ink);min-height:32px;line-height:1.5}
.payment{background:var(--paper-tint);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.pay-line{display:flex;flex-direction:column;gap:10px;font-size:12.5px;color:var(--ink);font-weight:600}
.pay-item{display:inline-flex;align-items:center;gap:9px;color:var(--navy)}
.pay-item svg{color:var(--sky);flex-shrink:0;width:15px;height:15px}
.doc-footer{position:relative;z-index:1;padding:18px 48px;border-top:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center}
.thanks{font-size:14px;color:var(--navy);font-weight:600;letter-spacing:-.005em;display:inline-flex;align-items:center;gap:8px}
.thanks-logo{height:26px;width:auto;display:inline-block;vertical-align:middle}
.footer-accent{width:60px;height:4px;background:linear-gradient(90deg,var(--navy),var(--sky),var(--accent));border-radius:2px}
.print-btn{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;background:var(--navy);color:white;border:none;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -6px rgba(15,42,69,.3);font-family:inherit;display:inline-flex;align-items:center;gap:8px;z-index:100}
@page{size:A4;margin:0}
@media print{body{background:white;padding:0;display:block}.page{width:210mm;min-height:297mm;box-shadow:none;border-radius:0}.print-btn{display:none}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨&nbsp; Guardar PDF</button>
<div class="page">

  <img class="watermark" src="${mascotaUrl}" alt="">

  <!-- HEADER -->
  <div class="doc-header">
    <div class="solid-band"></div>
    <div class="header-inner">
      <div class="brand">
        <img class="brand-mascot" src="${mascotaUrl}" alt="Pin&amp;Pon 3D">
        <div class="brand-text">
          <div class="wordmark">Pin<span class="amp">&amp;</span>Pon<span class="badge-3d">3D</span></div>
          <div class="tagline">Impresión 3D · Innovación · Calidad</div>
        </div>
      </div>
      <div class="title-block">
        <div class="eyebrow">Cotización oficial</div>
        <h1 class="title">Cotización&nbsp;<span class="title-num">${ref}</span></h1>
        <div class="meta-row">
          <span class="meta-label">Fecha</span>
          <span class="meta-value">${fechaHoy}</span>
        </div>
        <div class="title-rule"></div>
      </div>
    </div>
  </div>

  <!-- DOC STRIP -->
  <div class="doc-strip">
    <div class="strip-field">
      <div class="strip-label">Cliente</div>
      <div class="strip-value strip-name">${escHtml(clienteNombre || '—')}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Referencia</div>
      <div class="strip-value"><span class="hash">#</span>${ref}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Total de ítems</div>
      <div class="strip-value">${items.length} pieza${items.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Vigencia</div>
      <div class="strip-value strip-vigencia">${fechaHoy}&nbsp;</div>
    </div>
  </div>

  <!-- DETAIL TABLE -->
  <div class="detail">
    <div class="section-head"><h2>Detalle de la cotización</h2></div>
    <div class="table">
      <div class="thead">
        <div>Descripción</div>
        <div class="col-qty">Cant.</div>
        <div class="col-price">P. unitario</div>
        <div class="col-total">Total</div>
      </div>
      ${rowsHtml}
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="summary">
    <div class="summary-card">
      <div class="srow total-row"><span class="slabel">TOTAL GENERAL</span><span class="sval">₡&thinsp;${totalGeneral.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
    </div>
  </div>

  <!-- NOTES + PAYMENT -->
  <div class="notes-pay">
    <div class="notes">
      <h3>Condiciones</h3>
      <ul>
        <li>Esta cotización tiene validez de <strong>7 días</strong> a partir de la fecha de emisión.</li>
        <li>El precio puede variar si cambian las características del modelo 3D.</li>
        <li>El tiempo de entrega depende de la carga de trabajo y complejidad de la pieza.</li>
        <li>Se puede solicitar un <strong>abono</strong> para iniciar el trabajo.</li>
        <li>Los colores y acabados pueden variar según el material disponible.</li>
      </ul>
      ${emp.nota?`<div class="note-extra">${escHtml(emp.nota)}</div>`:''}
    </div>
    <div class="payment">
      <h3>Pago</h3>
      <div class="pay-line">
        <div class="pay-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          Total: <strong>₡&thinsp;${totalGeneral.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
        </div>
        ${emp.tel?`<div class="pay-item" style="font-size:11.5px;color:var(--ink-soft);font-weight:500;margin-top:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 012 2.12h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          ${escHtml(emp.tel)}</div>`:''}
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="doc-footer">
    <div class="thanks">
      ¡Gracias por confiar en&nbsp;<img class="thanks-logo" src="${nombreUrl}" alt="Pin&amp;Pon 3D">&nbsp;!
    </div>
    <div class="footer-accent"></div>
  </div>

</div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => { try { win.print(); } catch(e){} }, 900);
  toast(`PDF combinado generado (${items.length} ítems) ✓`, 'success');
}

/* ----------------------------------------------------------
   Cotizaciones — Nueva / Limpiar formulario
---------------------------------------------------------- */
function nuevaCotizacion() {
  editingId = null;
  el('edit-banner').style.display = 'none';
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
  sv('c_fallos',    t.pFallos   ?? 5);
  sv('c_margen',    t.pMargen   ?? 35);
  sv('c_iva',       t.pIVA      ?? 0);
  sv('c_monto_abonado', t.montoAbonado || 0);
  if (el('c_metodo_pago')) el('c_metodo_pago').value = t.metodoPago || 'Efectivo';

  el('edit-banner').style.display = 'flex';
  set('edit-banner-text', `Editando: ${t.pieza || 'cotización'} · ${t.cliente || ''}`);

  ocultarPostSave();
  calcular();
  navTo('cotizador');
}

/* Compatibilidad con botones antiguos que usan editarTrabajo */
function editarTrabajo(id)  { editarEnCotizador(id); }
function verTrabajo(id)     { abrirModalEdicion(id); }

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

async function cargarInventario() {
  try {
    filamentos = await fbCargarFilamentos();
    try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
  } catch(e) {
    try { const l=localStorage.getItem('filamentos3d'); filamentos=l?JSON.parse(l):[];
      toast('Filamentos cargados desde caché','info');
    } catch(e2) { filamentos=[]; }
  }
  renderInventario();
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
  if(el('inv-edit-id'))     { el('inv-edit-id').textContent=''; el('inv-edit-id').style.display='none'; }
  if(el('inv-cancel-edit'))   el('inv-cancel-edit').style.display='none';
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
    trabajos = await fbCargarTrabajos();
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

function abrirModalVenta(id) {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  const disponibles = Math.max((t.cantidad || 1) - (t.unidadesVendidas || 0), 0);
  if (disponibles <= 0) { toast('No hay unidades disponibles', 'error'); return; }
  const mv = el('modal-venta');
  if (!mv) return;
  el('mv-id').value           = id;
  el('mv-pieza-lbl').textContent = t.pieza || '—';
  el('mv-disp-num').textContent  = disponibles;
  el('mv-cantidad').value     = 1;
  el('mv-cantidad').max       = disponibles;
  el('mv-nota').value         = '';
  mv.style.display = 'flex';
}

function cerrarModalVenta() {
  const mv = el('modal-venta');
  if (mv) mv.style.display = 'none';
}

async function guardarVenta() {
  const id       = el('mv-id')?.value;
  const cantidad = parseInt(el('mv-cantidad')?.value) || 1;
  const nota     = el('mv-nota')?.value?.trim() || '';
  const t        = trabajos.find(t => t.id === id);
  if (!t) return;
  const disponibles = Math.max((t.cantidad || 1) - (t.unidadesVendidas || 0), 0);
  if (cantidad < 1 || cantidad > disponibles) {
    toast(`Cantidad inválida. Disponibles: ${disponibles}`, 'error'); return;
  }

  // Actualización optimista local
  const idx    = trabajos.findIndex(t => t.id === id);
  const entrada = { fecha: new Date().toISOString(), cantidad, nota };
  if (idx >= 0) {
    trabajos[idx].unidadesVendidas = (trabajos[idx].unidadesVendidas || 0) + cantidad;
    trabajos[idx].historialVentas  = [...(trabajos[idx].historialVentas || []), entrada];
  }

  // ¿Se agotó el lote con esta venta?
  const totalUnidades   = t.cantidad || 1;
  const totalVendidas   = trabajos[idx]?.unidadesVendidas || 0;
  const ahoraAgotado    = totalVendidas >= totalUnidades;

  if (ahoraAgotado && idx >= 0) {
    trabajos[idx].estado         = 'Entregado';
    trabajos[idx].estadoPago     = 'Pagado';
    trabajos[idx].montoAbonado   = trabajos[idx].precio_final || 0;
    trabajos[idx].montoPendiente = 0;
    trabajos[idx].fechaActualizacionEstado = new Date().toISOString();
  }

  cerrarModalVenta();
  renderVentaDetalle(trabajos.filter(t => t.ventaDetalle === true));

  try {
    await fbRegistrarVenta(id, cantidad, nota);

    if (ahoraAgotado) {
      // Marcar Entregado + Pagado en Firestore
      await db.collection('cotizaciones').doc(String(id)).update({
        estado:          'Entregado',
        estadoPago:      'Pagado',
        montoAbonado:    t.precio_final || 0,
        montoPendiente:  0,
        fechaActualizacionEstado: new Date().toISOString()
      });
      toast('Lote agotado — Entregado y Pagado ✓', 'success');
    } else {
      const u = cantidad === 1 ? '1 unidad vendida' : `${cantidad} unidades vendidas`;
      toast(`${u} ✓`, 'success');
    }
  } catch(e) {
    console.error(e);
    toast('Error al registrar la venta', 'error');
    // Revertir local
    if (idx >= 0) {
      trabajos[idx].unidadesVendidas -= cantidad;
      trabajos[idx].historialVentas.pop();
      if (ahoraAgotado) {
        trabajos[idx].estado         = t.estado         || 'Cotizado';
        trabajos[idx].estadoPago     = t.estadoPago     || 'Pendiente';
        trabajos[idx].montoAbonado   = t.montoAbonado   || 0;
        trabajos[idx].montoPendiente = t.montoPendiente || t.precio_final || 0;
      }
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
  const emp         = getEmpresa();
  const d           = t._desglose || {};
  const pIVA        = t.pIVA || 0;
  const antesIVA    = d.antesIVA   || t.precio_final || 0;
  const ivaVal      = d.ivaVal     || 0;
  const precioFinal = t.precio_final || 0;
  const ref         = String(t.id).toUpperCase().slice(0,10);
  const cantidad    = Math.max(t.cantidad||1,1);
  const placas      = Math.max(t.placas||1,1);
  const precioUnit  = t.precio_unitario || (precioFinal / cantidad);
  const abono       = Number(t.montoAbonado) || 0;
  const pendiente   = Math.max(precioFinal - abono, 0);
  const metodo      = t.metodoPago || '';

  const base       = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';
  const nombreUrl  = base + 'img/Nombre-PNG.png';

  // Nombre de archivo = "Cotizacion - [Cliente]"
  const nombreArchivo = `Cotizacion - ${t.cliente||'Cliente'}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(nombreArchivo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet"/>
<style>
:root{--navy:#16395A;--navy-deep:#0F2A45;--navy-2:#235A8C;--sky:#4A8FCB;--pale:#E8F0F8;--yellow:#F2C61F;--ink:#1A2433;--ink-soft:#5B6A7E;--line:#DEE5EE;--line-soft:#EEF2F7;--paper:#FFFFFF;--paper-tint:#FBFCFE;--accent:#F2C61F;--radius:10px}
*{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:var(--ink);background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:40px 20px 80px;display:flex;justify-content:center;align-items:flex-start}
button{font-family:inherit;cursor:pointer}
.page{width:794px;min-height:1123px;background:var(--paper);position:relative;overflow:hidden;box-shadow:0 20px 60px -20px rgba(15,42,69,.25),0 4px 16px -4px rgba(15,42,69,.12);border-radius:4px;display:flex;flex-direction:column}
.watermark{position:absolute;right:-60px;bottom:180px;width:360px;opacity:.025;pointer-events:none;z-index:0}
.doc-header{position:relative;color:white;overflow:hidden}
.solid-band{position:absolute;inset:0;background:linear-gradient(95deg,var(--navy-deep) 0%,var(--navy) 50%,var(--navy-2) 100%)}
.header-inner{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:32px;padding:38px 48px 34px;align-items:center}
.brand{display:flex;align-items:center;gap:16px}
.brand-mascot{width:64px;height:auto;display:block;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}
.brand-text{display:flex;flex-direction:column;gap:4px}
.wordmark{font-weight:800;font-size:28px;letter-spacing:-.02em;color:white;line-height:1;display:inline-flex;align-items:center;gap:2px}
.amp{color:var(--accent);margin:0 2px;font-style:italic;font-weight:700}
.badge-3d{font-size:11px;font-weight:700;letter-spacing:.04em;background:var(--sky);color:white;padding:3px 7px;border-radius:5px;margin-left:6px;align-self:flex-start;margin-top:-4px;box-shadow:0 2px 6px rgba(74,143,203,.4)}
.tagline{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.65);font-weight:600}
.title-block{display:flex;flex-direction:column;gap:6px;text-align:right;align-items:flex-end}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);opacity:.95}
.title{font-size:26px;font-weight:700;margin:0;line-height:1;letter-spacing:-.01em;color:white;display:inline-flex;align-items:baseline;gap:6px}
.title-num{font-weight:800;font-variant-numeric:tabular-nums;padding:0 4px;border-bottom:1px dashed rgba(255,255,255,.3)}
.meta-row{display:inline-flex;align-items:baseline;gap:10px;font-size:12.5px;margin-top:4px}
.meta-label{text-transform:uppercase;font-size:9.5px;letter-spacing:.16em;opacity:.7;font-weight:700}
.meta-value{font-weight:600;border-bottom:1px dashed rgba(255,255,255,.3);padding:0 2px 1px;min-width:120px;text-align:left}
.title-rule{width:48px;height:2px;background:var(--accent);margin-top:6px;border-radius:1px}
.doc-strip{position:relative;z-index:1;margin:28px 48px 8px;padding:18px 22px 18px 26px;background:var(--paper-tint);border:1px solid var(--line);border-radius:var(--radius);display:grid;grid-template-columns:2fr 1fr 1fr 1.1fr;gap:22px;align-items:center}
.doc-strip::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;background:var(--accent);border-radius:0 2px 2px 0}
.strip-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.strip-field+.strip-field{border-left:1px solid var(--line);padding-left:22px}
.strip-label{font-size:9.5px;text-transform:uppercase;letter-spacing:.18em;color:var(--ink-soft);font-weight:700}
.strip-value{font-size:13.5px;font-weight:600;color:var(--ink);line-height:1.25;display:inline-flex;align-items:baseline;gap:4px;flex-wrap:wrap}
.strip-value .hash{color:var(--ink-soft);font-weight:500;font-size:10.5px;letter-spacing:.05em}
.strip-name{color:var(--navy);font-weight:700;font-size:16px}
.strip-vigencia{color:var(--navy)}
.strip-vigencia::after{content:"7 días";display:inline-block;margin-left:6px;font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:var(--accent);color:var(--navy-deep);padding:2px 5px;border-radius:3px;vertical-align:middle}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;padding:0 48px}
.section-head h2{font-size:14px;font-weight:700;color:var(--navy);letter-spacing:.14em;text-transform:uppercase;margin:0;display:flex;align-items:center;gap:10px}
.section-head h2::before{content:"";width:22px;height:2px;background:var(--accent);display:inline-block}
.detail{position:relative;z-index:1;padding:28px 0 8px}
.table{margin:0 48px}
.thead,.trow{display:grid;grid-template-columns:1fr 70px 130px 130px;align-items:center;gap:8px}
.thead{color:var(--navy);padding:10px 16px 8px;border-top:1.5px solid var(--navy);border-bottom:1px solid var(--line);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.thead .col-qty,.thead .col-price,.thead .col-total{text-align:right}
.trow{padding:11px 16px;border-bottom:1px solid var(--line-soft);font-size:13px}
.trow .col-name{color:var(--ink)}
.trow .col-qty,.trow .col-price,.trow .col-total{text-align:right;font-variant-numeric:tabular-nums}
.trow .col-total{font-weight:700;color:var(--navy)}
.item-badge{display:inline-flex;padding:2px 8px;background:var(--pale);color:var(--navy);border-radius:20px;font-size:10px;font-weight:700;margin-top:4px}
.item-note{font-size:11px;color:var(--ink-soft);font-style:italic;margin-top:3px;line-height:1.4}
.summary{position:relative;z-index:1;padding:22px 48px 4px;display:flex;justify-content:flex-end}
.summary-card{width:280px}
.srow{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;font-size:12px;border-bottom:1px solid var(--line-soft)}
.srow:last-child{border-bottom:none}
.slabel{color:var(--ink-soft);font-weight:500;display:inline-flex;align-items:baseline;gap:6px;letter-spacing:.02em}
.sval{font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.total-row{padding:14px 18px;margin-top:8px;background:var(--navy);color:white;border-radius:8px;border-bottom:none!important;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden;box-shadow:0 6px 16px -8px rgba(15,42,69,.5)}
.total-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--accent)}
.total-row .slabel{color:rgba(255,255,255,.85);font-weight:700;text-transform:uppercase;letter-spacing:.22em;font-size:10.5px;padding-left:6px}
.total-row .sval{color:white;font-size:24px;font-weight:800;letter-spacing:-.02em}
.notes-pay{position:relative;z-index:1;display:grid;grid-template-columns:1.5fr 1fr;gap:24px;padding:28px 48px 24px;margin-top:auto;align-items:stretch}
.notes h3,.payment h3{font-size:10px;text-transform:uppercase;letter-spacing:.18em;margin:0 0 12px;color:var(--navy);font-weight:700;display:flex;align-items:center;gap:8px}
.notes h3::before,.payment h3::before{content:"";width:14px;height:1.5px;background:var(--accent)}
.notes ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--ink-soft);line-height:1.5}
.notes li{position:relative;padding-left:14px}
.notes li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;background:var(--accent);transform:rotate(45deg)}
.notes strong{color:var(--ink);font-weight:700}
.note-extra{margin-top:10px;padding:9px 11px;background:var(--paper-tint);border:1px dashed var(--line);border-radius:6px;font-size:11.5px;color:var(--ink);min-height:32px;line-height:1.5}
.payment{background:var(--paper-tint);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.pay-line{display:flex;flex-direction:column;gap:10px;font-size:12.5px;color:var(--ink);font-weight:600}
.pay-item{display:inline-flex;align-items:center;gap:9px;color:var(--navy)}
.pay-item svg{color:var(--sky);flex-shrink:0;width:15px;height:15px}
.doc-footer{position:relative;z-index:1;padding:18px 48px;border-top:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center}
.thanks{font-size:14px;color:var(--navy);font-weight:600;letter-spacing:-.005em;display:inline-flex;align-items:center;gap:8px}
.thanks-logo{height:26px;width:auto;display:inline-block;vertical-align:middle}
.footer-accent{width:60px;height:4px;background:linear-gradient(90deg,var(--navy),var(--sky),var(--accent));border-radius:2px}
.print-btn{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;background:var(--navy);color:white;border:none;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -6px rgba(15,42,69,.3);font-family:inherit;display:inline-flex;align-items:center;gap:8px;z-index:100}
@page{size:A4;margin:0}
@media print{body{background:white;padding:0;display:block}.page{width:210mm;min-height:297mm;box-shadow:none;border-radius:0}.print-btn{display:none}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨&nbsp; Guardar PDF</button>
<div class="page">

  <img class="watermark" src="${mascotaUrl}" alt="">

  <!-- HEADER -->
  <div class="doc-header">
    <div class="solid-band"></div>
    <div class="header-inner">
      <div class="brand">
        <img class="brand-mascot" src="${mascotaUrl}" alt="Pin&amp;Pon 3D">
        <div class="brand-text">
          <div class="wordmark">Pin<span class="amp">&amp;</span>Pon<span class="badge-3d">3D</span></div>
          <div class="tagline">Impresión 3D · Innovación · Calidad</div>
        </div>
      </div>
      <div class="title-block">
        <div class="eyebrow">Cotización oficial</div>
        <h1 class="title">Cotización&nbsp;<span class="title-num">${ref}</span></h1>
        <div class="meta-row">
          <span class="meta-label">Fecha</span>
          <span class="meta-value">${t.fecha||'—'}</span>
        </div>
        ${t.fechaEntrega?`<div class="meta-row"><span class="meta-label">Entrega est.</span><span class="meta-value">${escHtml(t.fechaEntrega)}</span></div>`:''}
        <div class="title-rule"></div>
      </div>
    </div>
  </div>

  <!-- DOC STRIP -->
  <div class="doc-strip">
    <div class="strip-field">
      <div class="strip-label">Cliente</div>
      <div class="strip-value strip-name">${escHtml(t.cliente||'—')}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Referencia</div>
      <div class="strip-value"><span class="hash">#</span>${ref}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Pieza / Modelo</div>
      <div class="strip-value">${escHtml(t.pieza||'—')}</div>
    </div>
    <div class="strip-field">
      <div class="strip-label">Vigencia</div>
      <div class="strip-value strip-vigencia">${t.fecha||'—'}&nbsp;</div>
    </div>
  </div>

  <!-- DETAIL -->
  <div class="detail">
    <div class="section-head"><h2>Detalle de la cotización</h2></div>
    <div class="table">
      <div class="thead">
        <div>Descripción</div>
        <div class="col-qty">Cant.</div>
        <div class="col-price">P. unitario</div>
        <div class="col-total">Total</div>
      </div>
      <div class="trow">
        <div class="col-name">
          <strong>${escHtml(t.pieza||'—')}</strong>
          ${t.material?`<span style="color:var(--ink-soft);font-size:11px"> · ${escHtml(t.material)}</span>`:''}
          <br><span class="item-badge">${escHtml(t.categoria||'General')}</span>
          ${(t.gramos||t.horas_imp)?`<div class="item-note">${Number(t.gramos||0).toFixed(1)} g · ${Number(t.horas_imp||0).toFixed(1)} h · ${placas} placa${placas!==1?'s':''}</div>`:''}
          ${t.notas?`<div class="item-note">${escHtml(t.notas)}</div>`:''}
        </div>
        <div class="col-qty">${cantidad}</div>
        <div class="col-price">₡&thinsp;${precioUnit.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <div class="col-total">₡&thinsp;${precioFinal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="summary">
    <div class="summary-card">
      <div class="srow"><span class="slabel">Costo de producción</span><span class="sval">₡&thinsp;${(t.costo_total||0).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      <div class="srow"><span class="slabel">Subtotal (sin IVA)</span><span class="sval">₡&thinsp;${antesIVA.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      ${pIVA>0?`<div class="srow"><span class="slabel">IVA (${pIVA}%)</span><span class="sval">₡&thinsp;${ivaVal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>`:''}
      ${abono>0?`<div class="srow"><span class="slabel">Abono recibido</span><span class="sval" style="color:var(--sky)">₡&thinsp;${abono.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>`:''}
      <div class="srow total-row"><span class="slabel">TOTAL</span><span class="sval">₡&thinsp;${precioFinal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
    </div>
  </div>

  <!-- NOTES + PAYMENT -->
  <div class="notes-pay">
    <div class="notes">
      <h3>Condiciones</h3>
      <ul>
        <li>Esta cotización tiene validez de <strong>7 días</strong> a partir de la fecha de emisión.</li>
        <li>El precio puede variar si cambian las características del modelo 3D.</li>
        <li>El tiempo de entrega depende de la carga de trabajo y complejidad de la pieza.</li>
        <li>Se puede solicitar un <strong>abono</strong> para iniciar el trabajo.</li>
        <li>Los colores y acabados pueden variar según el material disponible.</li>
        ${t.notas?`<li><strong>Nota:</strong> ${escHtml(t.notas)}</li>`:''}
      </ul>
      ${emp.nota?`<div class="note-extra">${escHtml(emp.nota)}</div>`:''}
    </div>
    <div class="payment">
      <h3>Pago</h3>
      <div class="pay-line">
        ${metodo?`<div class="pay-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          ${escHtml(metodo)}</div>`:''}
        ${abono>0?`<div class="pay-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Abono: <strong>₡&thinsp;${abono.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
        <div class="pay-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Pendiente: <strong>₡&thinsp;${pendiente.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>`:''}
        <div class="pay-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          Total: <strong>₡&thinsp;${precioFinal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
        ${emp.tel?`<div class="pay-item" style="font-size:11.5px;color:var(--ink-soft);font-weight:500;margin-top:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 012 2.12h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          ${escHtml(emp.tel)}</div>`:''}
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="doc-footer">
    <div class="thanks">
      ¡Gracias por confiar en&nbsp;<img class="thanks-logo" src="${nombreUrl}" alt="Pin&amp;Pon 3D">&nbsp;!
    </div>
    <div class="footer-accent"></div>
  </div>

</div>
</body>
</html>`;

  const win = window.open('','_blank');
  if (!win) { toast('Permita ventanas emergentes','error'); return; }
  win.document.write(htmlContent);
  win.document.close();
  setTimeout(() => { try { win.print(); } catch(e){} }, 900);
  toast('PDF generado ✓', 'success');

  // Subir a Google Drive si está conectado
  if (typeof _gDriveToken !== 'undefined' && _gDriveToken && _gDriveFolderId) {
    const fname = `Cotizacion - ${(t.cliente||'Cliente').replace(/[<>:"/\\|?*]/g,'_')}.html`;
    _gDriveSubirHTML(fname, htmlContent);
  }
}

/* ----------------------------------------------------------
   Google Drive — guardar cotizaciones en carpeta COTIZACIONES
---------------------------------------------------------- */
let _gDriveToken    = null;
let _gDriveFolderId = null;

/** Actualiza la UI del panel de Drive según estado de conexión. */
function _gDriveActualizarUI(connected) {
  const dot  = el('gdrive-dot');
  const txt  = el('gdrive-status-text');
  const bCon = el('gdrive-btn-conectar');
  const bDes = el('gdrive-btn-desconectar');
  if (dot)  dot.className   = 'status-dot ' + (connected ? 'connected' : '');
  if (txt)  txt.textContent = connected
    ? 'Conectado · carpeta COTIZACIONES lista'
    : 'Sin conexión';
  if (bCon) bCon.style.display = connected ? 'none' : '';
  if (bDes) bDes.style.display = connected ? '' : 'none';
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
   Inicialización básica (antes de autenticar)
---------------------------------------------------------- */
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
  // Restaurar Client ID de Drive (predeterminado + localStorage)
  const DEFAULT_GDRIVE_CID = '1087662880090-o7ammg0cc2sofe5r3hoq4ur5dcf11j6j.apps.googleusercontent.com';
  const savedCid = localStorage.getItem('gdrive_client_id') || DEFAULT_GDRIVE_CID;
  if (savedCid) {
    localStorage.setItem('gdrive_client_id', savedCid);
    if (el('cfg_gdrive_client_id')) el('cfg_gdrive_client_id').value = savedCid;
  }
  // Cerrar modal con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModalEdicion();
  });
});

/* ----------------------------------------------------------
   Callback post-autenticación (llamado desde auth.js)
---------------------------------------------------------- */
function onAuthSuccess() {
  testFirebase();
  try { const l=localStorage.getItem('trabajos3d');   if(l) trabajos=JSON.parse(l);   } catch(e){}
  try { const l=localStorage.getItem('filamentos3d'); if(l) filamentos=JSON.parse(l); } catch(e){}
  try { const l=localStorage.getItem('clientes3d');   if(l) clientes=JSON.parse(l);  } catch(e){}
  navTo('dashboard');
  cargarConfiguracion();
}
