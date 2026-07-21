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
let trabajosListos = false;
let pedidosOnline = [];
let _pedidosOnlineIdsConocidos = null; // null = aún no se ha recibido el primer snapshot
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
let catalogoProductos   = [];
let catalogoConfig      = {};
let categoriasProductos = [];
let _catImagenPendiente = null;   // null = sin cambios; '' = imagen quitada; dataURL = nueva imagen
let _catImagenesExtraPendientes = null; // null = sin cambios; array = nueva lista de fotos adicionales
let catalogoSeleccionados = new Set(); // ids elegidos para el próximo PDF (vacío = incluir todo el catálogo visible)

/* ----------------------------------------------------------
   Navegación
---------------------------------------------------------- */
const PAGE_LABELS = {
  cotizador:    'Cotizador',
  trabajos:     'Trabajos',
  inventario:   'Insumos',
  configuracion:'Configuración',
  usuarios:     'Usuarios',
  dashboard:    'Dashboard',
  clientes:     'Clientes',
  detalle:      'Inventario Productos',
  costos:       'Costos',
  calendario:   'Calendario',
  catalogo:     'Catálogo de Productos'
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
  if (page === 'catalogo')      cargarCatalogo();
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

