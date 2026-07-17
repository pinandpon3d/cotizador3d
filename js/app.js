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

/* ----------------------------------------------------------
   Cotizaciones — Guardar
---------------------------------------------------------- */
let _guardandoCotizacion = false;

async function guardarCotizacion() {
  if (_guardandoCotizacion) return; // evita doble envío mientras se guarda
  const pieza    = el('c_pieza').value.trim();
  const cliente  = el('c_cliente').value.trim();
  const esInventarioProductos = el('c_categoria').value === 'Inventario Productos';
  if (!pieza)   { toast('Ingrese el nombre de la pieza',  'error'); return; }
  if (!cliente && !esInventarioProductos) { toast('Ingrese el nombre del cliente',  'error'); return; }

  // El preview de material no comprometido no debe entrar al precio guardado
  const savedPreview = _matPreviewCosto;
  _matPreviewCosto = 0;
  const desglose     = calcular();
  _matPreviewCosto = savedPreview;
  const id              = editingId || genId();
  const precioFinal     = desglose.precioTotal;
  const montoAbonado    = fv('c_monto_abonado') || 0;
  const precioManualVal = fv('c_precio_manual') || 0;

  const data = {
    id, pieza, cliente,
    fecha:        el('c_fecha').value,
    fechaEntrega: el('c_fecha_entrega')?.value || '',
    cantidad:     fv('c_cantidad'),
    placas:       fv('c_placas'),
    categoria:    el('c_categoria').value,
    material:     el('c_material')?.value.trim() || '',
    filamento_id: el('c_filamento_id')?.value || '',
    notas:        el('c_notas').value,
    gramos:       fv('c_gramos'),    horas_imp: fv('c_horas_imp'),
    horas_mo:     fv('c_horas_mo'),  horas_dis: fv('c_horas_dis'),
    costo_dis:    fv('c_costo_dis'), postpro:   fv('c_postpro'),
    otros:        fv('c_otros'),     pFallos:   fv('c_fallos'),
    pMargen:      fv('c_margen'),    pIVA:      fv('c_iva'),
    costo_total:          desglose.costoTotalPlacas,
    costo_electricidad:   desglose.elec,
    precio_final:         precioFinal,
    precio_unitario:      desglose.precioRedondeado,
    ganancia_por_objeto:  desglose.gananciaObjeto,
    estado: editingId
      ? (trabajos.find(t=>t.id===editingId)?.estado || 'Cotizado')
      : (el('c_categoria').value === 'Inventario Productos' ? 'Venta' : 'Cotizado'),
    fechaActualizacionEstado: editingId
      ? (trabajos.find(t=>t.id===editingId)?.fechaActualizacionEstado || new Date().toISOString())
      : new Date().toISOString(),
    estadoPago:    calcEstadoPago(precioFinal, montoAbonado),
    metodoPago:    el('c_metodo_pago')?.value || 'Efectivo',
    montoAbonado,
    montoPendiente: Math.max(0, precioFinal - montoAbonado),
    fechaPago:     '',
    materialesAdicionales: materialesAdicionalesCotizacion.map(m => ({...m})),
    inventarioDescontado: editingId ? (trabajos.find(t=>t.id===editingId)?.inventarioDescontado || false) : false,
    precioManualActivo: precioManualVal > 0,
    precioManualValor:  precioManualVal > 0 ? precioManualVal : 0,
    _desglose: desglose
  };

  // — Inventario de Productos: se activa cuando la categoría es "Inventario Productos" —
  const esVenta = data.categoria === 'Inventario Productos';
  data.ventaDetalle = esVenta;

  // Si es un producto nuevo (no una edición) y ya hay un lote activo del
  // mismo producto, se suma como stock adicional a ese lote en vez de crear
  // un registro (y por lo tanto un producto de catálogo/tienda) duplicado.
  // Se busca primero por catalogoProductoId (estable aunque el producto se
  // haya renombrado en el Catálogo) y solo si no hay match se recurre al
  // nombre como respaldo, para lotes que todavía no quedaron vinculados.
  if (esVenta && !editingId) {
    const norm = s => (s || '').trim().toLowerCase();
    const catExistente = catalogoProductos.find(p => norm(p.nombre) === norm(pieza));
    const loteExistente = trabajos.find(t => {
      if (!_esDetalle(t) || t.estado === 'Cancelado') return false;
      if (catExistente && t.catalogoProductoId && t.catalogoProductoId === catExistente.id) return true;
      return norm(t.pieza) === norm(pieza);
    });
    if (loteExistente) {
      _guardandoCotizacion = true;
      const btnGuardar = el('btn-guardar-cotizacion');
      if (btnGuardar) btnGuardar.disabled = true;
      await _sumarStockAExistente(loteExistente, data);
      _guardandoCotizacion = false;
      if (btnGuardar) btnGuardar.disabled = false;
      return;
    }
  }

  const existing = trabajos.find(t => t.id === id);
  if (esVenta) {
    data.unidadesVendidas   = existing?.unidadesVendidas   || 0;
    data.historialVentas    = existing?.historialVentas    || [];
    data.catalogoProductoId = existing?.catalogoProductoId || '';
    if (!editingId) await _registrarEnCatalogoSiFalta(data);
    else            await _actualizarCatalogoSiVinculado(data);
  }

  const wasEditing = !!editingId;
  const idx        = trabajos.findIndex(t => t.id === id);
  const anterior   = idx >= 0 ? trabajos[idx] : null;

  // Actualización optimista local
  if (idx >= 0) trabajos[idx] = data; else trabajos.unshift(data);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}
  if (typeof renderTrabajos === 'function') renderTrabajos();

  _guardandoCotizacion = true;
  const btnGuardar = el('btn-guardar-cotizacion');
  if (btnGuardar) btnGuardar.disabled = true;

  try {
    await fbGuardarCotizacion(data);
    if (!wasEditing && esVenta && data.filamento_id) await descontarInventario(data);
    if (editingId) {
      editingId = null; el('edit-banner').style.display = 'none';
    }
    mostrarPostGuardado(pieza, wasEditing);
    nuevaCotizacion();
  } catch(e) {
    console.error('Firebase error al guardar:', e);
    // Revertir actualización optimista: la cotización no quedó guardada
    if (idx >= 0) trabajos[idx] = anterior; else trabajos = trabajos.filter(t => t.id !== id);
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e2){}
    if (typeof renderTrabajos === 'function') renderTrabajos();
    toast(`No se pudo guardar: ${e?.message || 'error desconocido'}`, 'error');
  } finally {
    _guardandoCotizacion = false;
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

/** Suma las unidades y el precio de un lote recién calculado a un lote de
 *  Inventario Productos activo que ya existe con el mismo nombre, en vez
 *  de crear un registro (y por lo tanto un producto de catálogo/tienda)
 *  duplicado. Los precios de ambos lotes se combinan para que el precio
 *  unitario resultante siga reflejando el costo real de cada tanda. */
async function _sumarStockAExistente(loteExistente, loteNuevo) {
  const totalExistente = _totalUnidadesDetalle(loteExistente);
  const totalNuevo      = _totalUnidadesDetalle(loteNuevo);
  const nuevoTotal       = totalExistente + totalNuevo;
  const nuevoPrecioFinal = (loteExistente.precio_final || 0) + (loteNuevo.precio_final || 0);
  const vendidas         = loteExistente.unidadesVendidas || 0;
  const yaNoAgotado      = loteExistente.estado === 'Entregado' && vendidas < nuevoTotal;

  const updateData = {
    cantidad:        nuevoTotal,
    placas:          1,
    precio_final:    nuevoPrecioFinal,
    precio_unitario: nuevoTotal > 0 ? Math.round(nuevoPrecioFinal / nuevoTotal) : 0,
    costo_total:     (loteExistente.costo_total || 0) + (loteNuevo.costo_total || 0),
    costo_electricidad: (loteExistente.costo_electricidad || 0) + (loteNuevo.costo_electricidad || 0),
    fechaActualizacionEstado: new Date().toISOString(),
  };
  if (yaNoAgotado) {
    updateData.estado         = 'Venta';
    updateData.estadoPago     = 'Pendiente';
    updateData.montoAbonado   = 0;
    updateData.montoPendiente = 0;
  } else {
    updateData.estadoPago     = calcEstadoPago(nuevoPrecioFinal, loteExistente.montoAbonado || 0);
    updateData.montoPendiente = Math.max(0, nuevoPrecioFinal - (loteExistente.montoAbonado || 0));
  }

  const merged = { ...loteExistente, ...updateData };
  const idx = trabajos.findIndex(t => t.id === loteExistente.id);
  const anterior = idx >= 0 ? trabajos[idx] : null;
  if (idx >= 0) trabajos[idx] = merged;
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}
  if (typeof renderTrabajos === 'function') renderTrabajos();

  try {
    await fbGuardarCotizacion(merged);
    if (loteNuevo.filamento_id) await descontarInventario({ ...loteNuevo, id: loteExistente.id, inventarioDescontado: false });
    await _actualizarCatalogoSiVinculado(merged);
    toast(`Se sumaron ${totalNuevo} unidades al stock de "${merged.pieza}" ✓`, 'success');
    nuevaCotizacion();
  } catch(e) {
    console.error('Error al sumar stock a lote existente:', e);
    if (idx >= 0) trabajos[idx] = anterior;
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e2){}
    if (typeof renderTrabajos === 'function') renderTrabajos();
    toast(`No se pudo sumar el stock: ${e?.message || 'error desconocido'}`, 'error');
  }
}

/* ----------------------------------------------------------
   Sincronización en tiempo real — onSnapshot listeners
---------------------------------------------------------- */
let _unsubs = [];

function iniciarSincronizacion() {
  detenerSincronizacion();

  _unsubs.push(fbSuscribirTrabajos(data => {
    trabajos = data;
    trabajosListos = true;
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e) {}
    if (typeof renderTrabajos === 'function') renderTrabajos();
  }));

  _unsubs.push(fbSuscribirGastos(data => {
    gastos = data;
    if (typeof renderTrabajos === 'function') renderTrabajos();
  }));

  _unsubs.push(fbSuscribirFilamentos(data => {
    filamentos = data;
    try { localStorage.setItem('filamentos3d', JSON.stringify(filamentos)); } catch(e) {}
    if (typeof renderInventario === 'function') renderInventario();
    if (typeof poblarSelectMateriales === 'function') poblarSelectMateriales();
    if (typeof poblarSelectFilamento === 'function') poblarSelectFilamento();
  }));

  _unsubs.push(fbSuscribirInversion(data => {
    inversion = data;
    if (typeof actualizarDashboardInversion === 'function') actualizarDashboardInversion();
    if (typeof renderInversion === 'function') renderInversion();
    if (typeof renderTrabajos === 'function') renderTrabajos();
  }));

  _unsubs.push(fbSuscribirClientes(data => {
    clientes = data;
    try { localStorage.setItem('clientes3d', JSON.stringify(clientes)); } catch(e) {}
    if (typeof renderClientes === 'function') renderClientes();
  }));

  _unsubs.push(fbSuscribirCatalogoProductos(data => {
    catalogoProductos = data;
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e) {}
    if (typeof renderCatalogoProductos     === 'function') renderCatalogoProductos();
    if (typeof cargarCategoriasCatalogo    === 'function') cargarCategoriasCatalogo();
  }));

  _unsubs.push(fbSuscribirCategoriasCatalogo(data => {
    categoriasProductos = data;
    try { localStorage.setItem('categoriasCatalogo3d', JSON.stringify(categoriasProductos)); } catch(e) {}
    if (typeof cargarCategoriasCatalogo === 'function') cargarCategoriasCatalogo();
  }));

  _unsubs.push(fbSuscribirPedidosOnline(data => {
    if (typeof _detectarPedidosNuevos === 'function') _detectarPedidosNuevos(data);
    pedidosOnline = data;
    if (typeof actualizarBadgePedidosOnline === 'function') actualizarBadgePedidosOnline();
    if (typeof renderPedidosOnline === 'function' && detalleVista === 'pedidos') renderPedidosOnline();
  }));
}

function detenerSincronizacion() {
  _unsubs.forEach(fn => { try { fn(); } catch(e) {} });
  _unsubs = [];
}

/* ----------------------------------------------------------
   Cotizaciones — Cargar
---------------------------------------------------------- */
function cargarTrabajos() {
  // Los datos llegan en tiempo real vía onSnapshot; solo re-renderizar
  renderTrabajos();
}

/* ----------------------------------------------------------
   Cotizaciones — Cambiar estado
---------------------------------------------------------- */
async function cambiarEstado(id, estado, selectEl) {
  const ahora = new Date().toISOString();
  const t = trabajos.find(t=>t.id===id);
  if (!t) return;
  const estadoAnterior = t.estado;

  // Los lotes de Inventario Productos acumulan ingresos según unidadesVendidas,
  // no según estado (ver ingresosLote/gananciaLote). Si se marcan "Entregado"
  // desde el tablero de Trabajos en vez de usar "Vender" en Inventario
  // Productos, hay que registrar el stock disponible como vendido aquí
  // también, o esa venta nunca se sumaría en los dashboards ni en Inventario
  // Productos.
  if (_esDetalle(t) && estado === 'Entregado' && estadoAnterior !== 'Entregado') {
    const total       = _totalUnidadesDetalle(t);
    const vendidas     = t.unidadesVendidas || 0;
    const disponibles = Math.max(total - vendidas, 0);
    const entrada = disponibles > 0
      ? { fecha: ahora, cantidad: disponibles, nota: 'Marcado como Entregado desde Trabajos' }
      : null;

    t.estado         = 'Entregado';
    t.estadoPago     = 'Pagado';
    t.montoAbonado   = t.precio_final || 0;
    t.montoPendiente = 0;
    t.fechaActualizacionEstado = ahora;
    if (entrada) {
      t.unidadesVendidas = total;
      t.historialVentas  = [...(t.historialVentas || []), entrada];
    }
    const ec = (typeof ESTADO_COLOR !== 'undefined' ? ESTADO_COLOR['Entregado'] : null) || 'badge-gray';
    if (selectEl) selectEl.className = 'badge ' + ec + ' estado-select';

    try {
      const updateData = {
        estado: 'Entregado', estadoPago: 'Pagado',
        montoAbonado: t.montoAbonado, montoPendiente: 0,
        fechaActualizacionEstado: ahora
      };
      if (entrada) {
        updateData.unidadesVendidas = firebase.firestore.FieldValue.increment(disponibles);
        updateData.historialVentas  = firebase.firestore.FieldValue.arrayUnion(entrada);
      }
      await db.collection('cotizaciones').doc(String(id)).update(updateData);
      toast('Estado actualizado — stock disponible marcado como vendido ✓', 'success');
      renderTrabajos();
    } catch(e) {
      console.error('Error actualizando estado:', e);
      toast('No se pudo actualizar el estado', 'error');
    }
    return;
  }

  t.estado = estado; t.fechaActualizacionEstado = ahora;
  const ec = (typeof ESTADO_COLOR !== 'undefined' ? ESTADO_COLOR[estado] : null) || 'badge-gray';
  if (selectEl) selectEl.className = 'badge ' + ec + ' estado-select';
  try {
    await fbActualizarEstado(id, estado);
    if (estado === 'Entregado' && estadoAnterior !== 'Entregado' && !t.inventarioDescontado) {
      await descontarInventario(t);
    } else if (estado !== 'Entregado' && estadoAnterior === 'Entregado' && t.inventarioDescontado) {
      await revertirInventario(t);
    }
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
  showConfirm('¿Eliminar trabajo?', `¿Seguro que deseas eliminar ${nombre}? Esta acción no se puede deshacer.`, async () => {
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
  });
}

function pdfTrabajo(id) { const t=trabajos.find(t=>t.id===id); if(t) generarPDFData(t); }

/* ----------------------------------------------------------
   Insumos — Descuento automático al entregar
---------------------------------------------------------- */
async function descontarInventario(t) {
  if (t.inventarioDescontado) return;
  const ops      = [];
  const inmemory = [];

  if (t.filamento_id && t.gramos > 0) {
    const gramsToDeduct = (t.gramos || 0) * Math.max(t.placas || 1, 1);
    const filIdx = filamentos.findIndex(f => f.id === t.filamento_id);
    if (filIdx !== -1) {
      const fil = filamentos[filIdx];
      const pesoRollo = fil.peso_rollo || 1000;
      const totalGrams = (fil.disponibles || 0) * pesoRollo;
      const newDisponibles = parseFloat((Math.max(0, totalGrams - gramsToDeduct) / pesoRollo).toFixed(4));
      ops.push(db.collection('filamentos').doc(t.filamento_id).update({ disponibles: newDisponibles }));
      inmemory.push(() => { filamentos[filIdx].disponibles = newDisponibles; });
    }
  }

  if (t.materialesAdicionales && t.materialesAdicionales.length > 0) {
    t.materialesAdicionales.forEach(mat => {
      if (!mat.id) return;
      const filIdx = filamentos.findIndex(f => f.id === mat.id);
      if (filIdx === -1) return;
      const fil = filamentos[filIdx];
      const esFilamento = (fil.categoria || 'Filamento') === 'Filamento';
      if (esFilamento) {
        const pesoRollo = fil.peso_rollo || 1000;
        const totalGrams = (fil.disponibles || 0) * pesoRollo;
        const newDisponibles = parseFloat((Math.max(0, totalGrams - (mat.cantidad || 0)) / pesoRollo).toFixed(4));
        ops.push(db.collection('filamentos').doc(mat.id).update({ disponibles: newDisponibles }));
        inmemory.push(() => { filamentos[filIdx].disponibles = newDisponibles; });
      } else {
        const newStock = Math.max(0, (fil.stock || 0) - (mat.cantidad || 0));
        ops.push(db.collection('filamentos').doc(mat.id).update({ stock: newStock }));
        inmemory.push(() => { filamentos[filIdx].stock = newStock; });
      }
    });
  }

  try {
    if (ops.length > 0) await Promise.all(ops);
    inmemory.forEach(fn => fn());
    await db.collection('cotizaciones').doc(t.id).update({ inventarioDescontado: true });
    const idx = trabajos.findIndex(w => w.id === t.id);
    if (idx !== -1) trabajos[idx].inventarioDescontado = true;
    if (ops.length > 0) {
      if (typeof renderInventario === 'function') renderInventario();
      toast('Insumos actualizados ✓', 'success');
    }
  } catch(e) {
    console.error('Error actualizando insumos:', e);
    toast('Error al actualizar insumos', 'error');
  }
}

async function revertirInventario(t) {
  if (!t.inventarioDescontado) return;
  const ops      = [];
  const inmemory = [];

  if (t.filamento_id && t.gramos > 0) {
    const gramsToAdd = (t.gramos || 0) * Math.max(t.placas || 1, 1);
    const filIdx = filamentos.findIndex(f => f.id === t.filamento_id);
    if (filIdx !== -1) {
      const fil = filamentos[filIdx];
      const pesoRollo = fil.peso_rollo || 1000;
      const newDisponibles = parseFloat(((fil.disponibles || 0) + gramsToAdd / pesoRollo).toFixed(4));
      ops.push(db.collection('filamentos').doc(t.filamento_id).update({ disponibles: newDisponibles }));
      inmemory.push(() => { filamentos[filIdx].disponibles = newDisponibles; });
    }
  }

  if (t.materialesAdicionales && t.materialesAdicionales.length > 0) {
    t.materialesAdicionales.forEach(mat => {
      if (!mat.id) return;
      const filIdx = filamentos.findIndex(f => f.id === mat.id);
      if (filIdx === -1) return;
      const fil = filamentos[filIdx];
      const esFilamento = (fil.categoria || 'Filamento') === 'Filamento';
      if (esFilamento) {
        const pesoRollo = fil.peso_rollo || 1000;
        const newDisponibles = parseFloat(((fil.disponibles || 0) + (mat.cantidad || 0) / pesoRollo).toFixed(4));
        ops.push(db.collection('filamentos').doc(mat.id).update({ disponibles: newDisponibles }));
        inmemory.push(() => { filamentos[filIdx].disponibles = newDisponibles; });
      } else {
        const newStock = (fil.stock || 0) + (mat.cantidad || 0);
        ops.push(db.collection('filamentos').doc(mat.id).update({ stock: newStock }));
        inmemory.push(() => { filamentos[filIdx].stock = newStock; });
      }
    });
  }

  try {
    if (ops.length > 0) await Promise.all(ops);
    inmemory.forEach(fn => fn());
    await db.collection('cotizaciones').doc(t.id).update({ inventarioDescontado: false });
    const idx = trabajos.findIndex(w => w.id === t.id);
    if (idx !== -1) trabajos[idx].inventarioDescontado = false;
    if (ops.length > 0) {
      if (typeof renderInventario === 'function') renderInventario();
      toast('Insumos devueltos al stock ✓', 'success');
    }
  } catch(e) {
    console.error('Error revirtiendo insumos:', e);
    toast('Error al revertir insumos', 'error');
  }
}

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
  _margenAntesDeManual = null;
  el('edit-banner').style.display = 'none';
  materialesAdicionalesCotizacion = [];
  _matPreviewCosto = 0;
  renderMaterialesListaCotizacion();
  cargarFilamentosYPoblar();
  ['c_pieza','c_cliente','c_notas','c_material','c_precio_manual'].forEach(f => { if(el(f)) el(f).value = ''; });
  if (el('c_filamento_id')) el('c_filamento_id').value = '';
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
  _margenAntesDeManual = null;

  const sv = (k, v) => { const e = el(k); if (e) e.value = v ?? ''; };
  sv('c_pieza',        t.pieza       || '');
  sv('c_cliente',      t.cliente     || '');
  sv('c_fecha',        t.fecha       || today());
  sv('c_fecha_entrega',t.fechaEntrega|| '');
  sv('c_material',     t.material    || '');
  poblarSelectFilamento();
  if (el('c_filamento_id')) el('c_filamento_id').value = t.filamento_id || '';
  sv('c_cantidad',     t.cantidad    || 1);
  sv('c_placas',       t.placas      || 1);
  sv('c_notas',        t.notas       || '');
  if (el('c_categoria')) el('c_categoria').value = (t.categoria === 'Venta al Detalle' ? 'Inventario Productos' : t.categoria) || 'Funcional';

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
  sv('c_precio_manual', t.precioManualActivo ? t.precioManualValor : '');
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

/* ─── DUPLICAR COTIZACIÓN ─── Carga los datos de una cotización existente en
   el formulario para crear una nueva a partir de ella, dejando el nombre
   del cliente vacío para que se complete con el cliente correspondiente. */
function duplicarCotizacion(id) {
  const t = trabajos.find(t => t.id === id); if (!t) return;
  editarEnCotizador(id);
  editingId = null;
  el('edit-banner').style.display = 'none';
  el('c_cliente').value = '';
  el('c_fecha').value = today();
  el('c_cliente').focus();
  toast(`Cotización de "${t.pieza}" duplicada — ingrese el cliente`, 'success');
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
      : ((t.precio_final||0) - (t.costo_total||0)) / _totalUnidadesDetalle(t);
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
   Insumos
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

function cargarInventario() {
  // Los datos llegan en tiempo real vía onSnapshot; solo re-renderizar
  renderInventario();
  poblarSelectMateriales();
}

async function cargarFilamentosYPoblar() {
  await _fetchFilamentos();
  poblarSelectMateriales();
  poblarSelectFilamento();
}

function poblarSelectFilamento() {
  const sel = el('c_filamento_id'); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Sin vincular (no descontar) —</option>';
  [...filamentos]
    .filter(m => (m.categoria || 'Filamento') === 'Filamento')
    .sort((a,b) => getMaterialNombre(a).localeCompare(getMaterialNombre(b)))
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const stock = getMaterialStock(m);
      opt.textContent = `${getMaterialNombre(m)} — ${Math.round(stock)}g disponibles`;
      if (m.id === cur) opt.selected = true;
      sel.appendChild(opt);
    });
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
let _guardandoMaterial = false;

async function guardarMaterial() {
  if (_guardandoMaterial) return; // evita doble envío mientras se guarda
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
  _guardandoMaterial = true;
  const btnGuardar = el('btn-guardar-material');
  if (btnGuardar) btnGuardar.disabled = true;
  try {
    await fbGuardarFilamento(data);
    toast(editId ? 'Material actualizado ✓' : 'Material agregado ✓', 'success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar el material','error');
  } finally {
    _guardandoMaterial = false;
    if (btnGuardar) btnGuardar.disabled = false;
  }
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
  if(!m) { toast('Material no encontrado en insumos', 'error'); return; }
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

function eliminarFilamento(id) {
  showConfirm('¿Eliminar filamento?', '¿Seguro que deseas eliminar este filamento? Esta acción no se puede deshacer.', async () => {
    filamentos=filamentos.filter(f=>f.id!==id);
    try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
    try { await fbEliminarFilamento(id); toast('Filamento eliminado ✓','success'); }
    catch(e) { console.error(e); toast('No se pudo eliminar el filamento', 'error'); }
    renderInventario();
  });
}

/* ----------------------------------------------------------
   Clientes
---------------------------------------------------------- */
function cargarClientes() {
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

function eliminarCliente(id) {
  const c      = clientes.find(c=>c.id===id);
  const nombre = c ? `"${c.nombre}"` : 'este cliente';
  showConfirm('¿Eliminar cliente?', `¿Seguro que deseas eliminar el cliente ${nombre}? Esta acción no se puede deshacer.`, async () => {
    clientes = clientes.filter(c=>c.id!==id);
    try { localStorage.setItem('clientes3d',JSON.stringify(clientes)); } catch(e){}
    try {
      await fbEliminarCliente(id);
      toast('Cliente eliminado correctamente ✓','success');
    } catch(e) {
      console.error(e); toast('No se pudo eliminar el cliente','error');
    }
    renderClientes(clientes);
  });
}

/* ----------------------------------------------------------
   Catálogo de Productos — configuración, CRUD e imágenes
---------------------------------------------------------- */
const CATALOGO_DEFAULTS = {
  cover_kicker:  'Impresión 3D · Costa Rica',
  cover_title:   'Catálogo de Productos',
  cover_edition: 'Edición 2026 · Volumen 01',
  cover_contact: '@pinandpon3d · WhatsApp 8411-3321',
  cover_tag:     'Hecho a tu medida · Calidad garantizada',
  back_title:    '¿Tienes una idea? La imprimimos',
  back_text:     'Cuéntanos qué necesitas y lo convertimos en una pieza única, impresa con cuidado y entregada a tiempo.',
  back_wa:       '8411-3321',
  back_ig:       '@pinandpon3d'
};

function cargarCatalogo() {
  const cfg = { ...CATALOGO_DEFAULTS, ...catalogoConfig };
  Object.keys(CATALOGO_DEFAULTS).forEach(k => {
    const e = el('cat_' + k);
    if (e && document.activeElement !== e) e.value = cfg[k];
  });
  cargarCategoriasCatalogo();
  renderCatalogoProductos();
}

async function guardarConfigCatalogo() {
  const data = {};
  Object.keys(CATALOGO_DEFAULTS).forEach(k => { data[k] = el('cat_' + k)?.value.trim() || ''; });
  catalogoConfig = data;
  try { localStorage.setItem('catalogoConfig3d', JSON.stringify(data)); } catch(e){}
  try {
    await fbGuardarCatalogoConfig(data);
    toast('Configuración del catálogo guardada ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar la configuración del catálogo','error');
  }
}

/** Redimensiona y comprime una imagen en el navegador (canvas → JPEG) antes de guardarla. */
function comprimirImagen(file, maxLado = 900, calidadInicial = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > maxLado || height > maxLado) {
          if (width >= height) { height = Math.round(height * maxLado / width); width = maxLado; }
          else                 { width  = Math.round(width  * maxLado / height); height = maxLado; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let calidad = calidadInicial;
        let out = canvas.toDataURL('image/jpeg', calidad);
        while (out.length > 700000 && calidad > 0.35) {
          calidad -= 0.12;
          out = canvas.toDataURL('image/jpeg', calidad);
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function manejarImagenCatalogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Seleccione un archivo de imagen válido','error'); input.value=''; return; }
  comprimirImagen(file)
    .then(dataUrl => { _catImagenPendiente = dataUrl; mostrarPreviewImagenCatalogo(dataUrl); })
    .catch(() => toast('No se pudo procesar la imagen','error'));
}

function quitarImagenCatalogo() {
  _catImagenPendiente = '';
  mostrarPreviewImagenCatalogo('');
  const inp = el('cat_p_imagen_input'); if (inp) inp.value = '';
}

/** Procesa hasta 4 fotos adicionales seleccionadas para el formulario de
 *  producto del catálogo. Se agregan a las ya pendientes (o a las del
 *  producto en edición, si aún no se había tocado nada). */
function manejarImagenesExtraCatalogo(input) {
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const editId = el('cat-edit-id')?.textContent?.trim();
  const old = catalogoProductos.find(p => p.id === editId);
  const actuales = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);

  const disponibles = Math.max(0, 4 - actuales.length);
  if (!disponibles) { toast('Máximo 4 fotos adicionales','warn'); input.value=''; return; }

  Promise.all(files.slice(0, disponibles).map(f => comprimirImagen(f)))
    .then(dataUrls => {
      _catImagenesExtraPendientes = [...actuales, ...dataUrls];
      renderPreviewImagenesExtraCatalogo(_catImagenesExtraPendientes);
    })
    .catch(() => toast('No se pudo procesar alguna imagen','error'))
    .finally(() => { input.value = ''; });
}

function quitarImagenExtraCatalogo(idx) {
  const editId = el('cat-edit-id')?.textContent?.trim();
  const old = catalogoProductos.find(p => p.id === editId);
  const actuales = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);
  _catImagenesExtraPendientes = actuales.filter((_, i) => i !== idx);
  renderPreviewImagenesExtraCatalogo(_catImagenesExtraPendientes);
}

function renderPreviewImagenesExtraCatalogo(lista) {
  const cont = el('cat_p_imagenes_extra_preview');
  if (!cont) return;
  cont.innerHTML = (lista || []).map((src, i) => `
    <div style="position:relative;width:60px;height:60px">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid var(--border)">
      <button type="button" onclick="quitarImagenExtraCatalogo(${i})" title="Quitar"
        style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--danger,#e5484d);color:#fff;cursor:pointer;font-size:.7rem;line-height:1">✕</button>
    </div>`).join('');
}

function mostrarPreviewImagenCatalogo(dataUrl) {
  const img    = el('cat_p_imagen_preview');
  const ph     = el('cat_p_imagen_placeholder');
  const quitar = el('cat_p_imagen_quitar');
  if (dataUrl) {
    if (img) { img.src = dataUrl; img.style.display = 'block'; }
    if (ph)    ph.style.display = 'none';
    if (quitar) quitar.style.display = 'inline-flex';
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (ph)    ph.style.display = 'block';
    if (quitar) quitar.style.display = 'none';
  }
}

/** Persiste la lista de categorías (local + Firebase) y refresca toda la UI
 *  que depende de ella. */
async function _persistirCategoriasCatalogo() {
  categoriasProductos.sort((a, b) => a.localeCompare(b, 'es'));
  try { localStorage.setItem('categoriasCatalogo3d', JSON.stringify(categoriasProductos)); } catch(e) {}
  cargarCategoriasCatalogo();
  try {
    await fbGuardarCategoriasCatalogo(categoriasProductos);
  } catch(e) {
    console.error('Error al guardar categorías:', e);
    toast('No se pudo guardar en Firebase (se guardó localmente)', 'warn');
  }
}

/** Refresca el selector de categoría del formulario de producto, el
 *  filtro del grid y la lista de administración de categorías. Esta
 *  lista es completamente independiente de las demás categorías del
 *  sistema: solo existe para organizar el Catálogo y la Tienda en Línea. */
function cargarCategoriasCatalogo() {
  const selProd = el('cat_p_categoria');
  if (selProd) {
    const prev = selProd.value;
    selProd.innerHTML = categoriasProductos.length
      ? '<option value="">Seleccionar categoría…</option>' + categoriasProductos.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')
      : '<option value="">Sin categorías — agregá una arriba</option>';
    if (categoriasProductos.includes(prev)) selProd.value = prev;
  }

  const sel = el('cat-filter-categoria');
  if (sel) {
    const prevF = sel.value;
    sel.innerHTML = '<option value="">Todas las categorías</option>' +
      categoriasProductos.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    if (categoriasProductos.includes(prevF)) sel.value = prevF;
  }

  const lista = el('cat-categorias-lista');
  if (lista) {
    lista.innerHTML = categoriasProductos.length
      ? categoriasProductos.map(c => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px">
          <span style="flex:1">${escHtml(c)}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="editarCategoriaCatalogo('${escHtml(c).replace(/'/g, "\\'")}')" title="Editar">✎</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="eliminarCategoriaCatalogo('${escHtml(c).replace(/'/g, "\\'")}')" title="Eliminar">🗑</button>
        </div>`).join('')
      : '<div class="page-hdr-sub">Aún no hay categorías. Agregá la primera arriba.</div>';
  }
}

/** Crea una nueva categoría desde el campo de la sección de administración. */
async function crearCategoriaCatalogo() {
  const input  = el('cat_categoria_nueva_input');
  const nombre = (input?.value || '').trim();
  if (!nombre) { input?.focus(); return; }

  if (categoriasProductos.some(c => c.toLowerCase() === nombre.toLowerCase())) {
    toast('Esa categoría ya existe', 'warn');
    return;
  }

  categoriasProductos.push(nombre);
  if (input) input.value = '';
  await _persistirCategoriasCatalogo();
  toast('Categoría agregada ✓', 'success');
}

/** Renombra una categoría existente (prompt simple) y actualiza los
 *  productos que la tuvieran asignada. */
function editarCategoriaCatalogo(nombreActual) {
  showPrompt('Nuevo nombre de la categoría', nombreActual, async (valor) => {
    const nuevo = (valor || '').trim();
    if (!nuevo || nuevo === nombreActual) return;

    if (categoriasProductos.some(c => c.toLowerCase() === nuevo.toLowerCase())) {
      toast('Ya existe una categoría con ese nombre', 'warn');
      return;
    }

    const idx = categoriasProductos.findIndex(c => c === nombreActual);
    if (idx >= 0) categoriasProductos[idx] = nuevo;
    await _persistirCategoriasCatalogo();

    const afectados = catalogoProductos.filter(p => p.categoria === nombreActual);
    for (const p of afectados) {
      p.categoria = nuevo;
      try { await fbGuardarCatalogoProducto(p); } catch(e) { console.error(e); }
    }
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e) {}
    if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
    toast('Categoría actualizada ✓', 'success');
  });
}

/** Elimina una categoría de la lista administrable (no afecta productos
 *  que ya la tengan asignada, solo deja de aparecer en el desplegable). */
function eliminarCategoriaCatalogo(nombre) {
  showConfirm('¿Eliminar categoría?', `¿Seguro que deseas eliminar la categoría "${nombre}"? Los productos que ya la tengan asignada la conservarán como texto, pero dejará de estar disponible en el desplegable.`, async () => {
    categoriasProductos = categoriasProductos.filter(c => c !== nombre);
    await _persistirCategoriasCatalogo();
    toast('Categoría eliminada ✓', 'success');
  });
}

/** Si un nuevo lote de Inventario Productos no coincide con ningún producto
 *  del catálogo (por nombre), la registra automáticamente para que aparezca
 *  en el Catálogo de Productos y pueda editarse / agregarle foto. */
async function _registrarEnCatalogoSiFalta(t) {
  const norm = s => (s || '').trim().toLowerCase();
  const existente = catalogoProductos.find(p => norm(p.nombre) === norm(t.pieza));
  if (existente) { t.catalogoProductoId = existente.id; return; }

  const totalUnidades = Math.max((t.cantidad || 1) * Math.max(t.placas || 1, 1), 1);
  const data = {
    id: genId(),
    nombre: t.pieza,
    categoria: 'Inventario Productos',
    material: t.material || '',
    precio: totalUnidades > 0 ? Math.round((t.precio_final || 0) / totalUnidades) : 0,
    descripcion: t.notas || '',
    imagen: '',
    orden: Date.now()
  };
  catalogoProductos.push(data);
  t.catalogoProductoId = data.id;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  try { await fbGuardarCatalogoProducto(data); } catch(e) { console.error('No se pudo registrar en catálogo:', e); }
}

/** Si un producto de Inventario Productos ya editado tiene un producto
 *  vinculado en el Catálogo, actualiza su nombre y precio para que no
 *  queden desactualizados frente a la tienda pública. No toca material,
 *  descripción ni foto para no perder ediciones manuales del catálogo. */
async function _actualizarCatalogoSiVinculado(t) {
  let prod = t.catalogoProductoId ? catalogoProductos.find(p => p.id === t.catalogoProductoId) : null;

  if (!prod) {
    // Sin vínculo todavía (producto creado antes de esta función) — se
    // busca por nombre, o se registra desde cero si de plano no existe.
    const norm = s => (s || '').trim().toLowerCase();
    prod = catalogoProductos.find(p => norm(p.nombre) === norm(t.pieza));
    if (!prod) { await _registrarEnCatalogoSiFalta(t); return; }
    t.catalogoProductoId = prod.id;
  }

  const totalUnidades = Math.max((t.cantidad || 1) * Math.max(t.placas || 1, 1), 1);
  const nuevoPrecio = totalUnidades > 0 ? Math.round((t.precio_final || 0) / totalUnidades) : 0;
  if (prod.nombre === t.pieza && prod.precio === nuevoPrecio) return; // ya está al día

  prod.nombre = t.pieza;
  prod.precio = nuevoPrecio;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  try { await fbGuardarCatalogoProducto({ ...prod }); } catch(e) { console.error('No se pudo actualizar el catálogo:', e); }
  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
}

/** Recorre todos los lotes de Inventario Productos existentes y registra en el
 *  catálogo los que aún no tengan un producto correspondiente (por nombre).
 *  Útil para productos creados antes de que existiera el auto-registro. */
async function sincronizarCatalogoDesdeVentas() {
  if (!trabajos.length) {
    try { trabajos = await fbCargarTrabajos(); } catch(e) { console.error(e); }
  }
  const lotes = trabajos.filter(_esDetalle);
  if (!lotes.length) { toast('No hay productos de Inventario Productos', 'error'); return; }

  const norm = s => (s || '').trim().toLowerCase();
  const nombresExistentes = new Set(catalogoProductos.map(p => norm(p.nombre)));
  const faltantes = [];
  for (const t of lotes) {
    const n = norm(t.pieza);
    if (!n || nombresExistentes.has(n)) continue;
    nombresExistentes.add(n);
    faltantes.push(t);
  }

  if (!faltantes.length) { toast('El catálogo ya está al día ✓', 'success'); return; }

  for (const t of faltantes) {
    await _registrarEnCatalogoSiFalta(t);
    // Guarda el vínculo en la cotización para que futuras ediciones sepan
    // qué producto del catálogo deben mantener sincronizado.
    if (t.catalogoProductoId) {
      try { await db.collection('cotizaciones').doc(String(t.id)).update({ catalogoProductoId: t.catalogoProductoId }); }
      catch(e) { console.error('No se pudo vincular producto con el catálogo:', t.id, e); }
    }
  }

  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
  toast(`${faltantes.length} producto(s) agregado(s) al catálogo ✓`, 'success');
}

/** Reglas de clasificación automática: categoría → palabras clave que se
 *  buscan (sin distinguir mayúsculas/acentos) en el nombre del producto.
 *  Se evalúan en orden; la primera que coincide gana. */
const _REGLAS_CATEGORIAS_AUTO = [
  { categoria: 'Amigurumis (Crochet)', claves: ['crochet'] },
  { categoria: 'Pokémon',              claves: ['charmander', 'squirtle', 'ditto', 'pokemon', 'pokémon'] },
  { categoria: 'Perros Globo',         claves: ['perro globo'] },
  { categoria: 'Figuras Articuladas',  claves: ['articulado', 'articulada', 'articulados', 'articuladas'] },
  { categoria: 'Llaveros',             claves: ['llavero', 'llaveros'] },
  { categoria: 'Clickers / Fidget Toys', claves: ['clicker'] },
  { categoria: 'Macetas & Hogar',      claves: ['maceta', 'platito'] },
  { categoria: 'Animales & Figuras',   claves: ['dino', 'abeja', 'jirafa', 'pantera', 'pulpito', 'pulpo'] }
];

/** Quita acentos para comparar nombres sin distinguir tildes. */
function _sinAcentos(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Crea las categorías sugeridas (si no existen) y reclasifica los
 *  productos actuales del catálogo según su nombre, usando reglas de
 *  palabras clave. No modifica productos que ya tengan asignada una
 *  categoría distinta de "General" o "Inventario Productos". */
async function clasificarCategoriasAutomaticamente() {
  const nuevasCategorias = [..._REGLAS_CATEGORIAS_AUTO.map(r => r.categoria)];
  let categoriasCreadas = 0;
  nuevasCategorias.forEach(c => {
    if (!categoriasProductos.some(x => x.toLowerCase() === c.toLowerCase())) {
      categoriasProductos.push(c);
      categoriasCreadas++;
    }
  });
  if (categoriasCreadas) await _persistirCategoriasCatalogo();
  else cargarCategoriasCatalogo();

  let reclasificados = 0;
  for (const p of catalogoProductos) {
    const sinCategoriaReal = !p.categoria || ['general', 'venta al detalle', 'inventario productos'].includes(p.categoria.toLowerCase());
    if (!sinCategoriaReal) continue;

    const nombreNorm = _sinAcentos(p.nombre).toLowerCase();
    const regla = _REGLAS_CATEGORIAS_AUTO.find(r => r.claves.some(k => nombreNorm.includes(_sinAcentos(k).toLowerCase())));
    if (!regla) continue;

    p.categoria = regla.categoria;
    try { await fbGuardarCatalogoProducto(p); reclasificados++; } catch(e) { console.error(e); }
  }

  if (reclasificados) {
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e) {}
  }
  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
  toast(`${categoriasCreadas} categoría(s) creada(s), ${reclasificados} producto(s) reclasificado(s) ✓`, 'success');
}

async function guardarProductoCatalogo() {
  const nombre = el('cat_p_nombre')?.value.trim();
  if (!nombre) { toast('Ingrese el nombre del producto','error'); return; }

  const editId = el('cat-edit-id')?.textContent?.trim();
  const old    = catalogoProductos.find(p => p.id === editId);
  const imagen = _catImagenPendiente !== null ? _catImagenPendiente : (old?.imagen || '');
  const imagenesExtra = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);

  const id = editId || genId();
  const data = {
    id, nombre,
    categoria:   el('cat_p_categoria')?.value.trim()   || 'General',
    material:    el('cat_p_material')?.value.trim()    || '',
    precio:      fv('cat_p_precio'),
    descripcion: el('cat_p_descripcion')?.value.trim() || '',
    imagen,
    imagenesExtra,
    oculto: old?.oculto || false,
    orden: old?.orden ?? Date.now()
  };

  const idx = catalogoProductos.findIndex(p => p.id === id);
  if (idx >= 0) catalogoProductos[idx] = data; else catalogoProductos.push(data);
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}

  try {
    await fbGuardarCatalogoProducto(data);
    toast(editId ? 'Producto actualizado ✓' : 'Producto agregado al catálogo ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar el producto','error');
  }
  cancelarEditProductoCatalogo();
  cargarCategoriasCatalogo();
  renderCatalogoProductos();
}

function editarProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id); if (!p) return;
  const sv = (k,v) => { const e = el(k); if (e) e.value = v ?? ''; };
  sv('cat_p_nombre',      p.nombre);
  sv('cat_p_categoria',   p.categoria);
  sv('cat_p_material',    p.material);
  sv('cat_p_precio',      p.precio);
  sv('cat_p_descripcion', p.descripcion);
  el('cat-edit-id').textContent = id;
  el('cat-edit-id').style.display = 'inline';
  el('cat-cancel-edit').style.display = 'inline-flex';
  _catImagenPendiente = null;
  mostrarPreviewImagenCatalogo(p.imagen || '');
  _catImagenesExtraPendientes = null;
  renderPreviewImagenesExtraCatalogo(p.imagenesExtra || []);
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelarEditProductoCatalogo() {
  ['cat_p_nombre','cat_p_categoria','cat_p_material','cat_p_descripcion']
    .forEach(f => { if (el(f)) el(f).value = ''; });
  if (el('cat_p_precio')) el('cat_p_precio').value = 0;
  if (el('cat-edit-id'))     { el('cat-edit-id').textContent=''; el('cat-edit-id').style.display='none'; }
  if (el('cat-cancel-edit'))   el('cat-cancel-edit').style.display='none';
  const inp = el('cat_p_imagen_input'); if (inp) inp.value = '';
  _catImagenPendiente = null;
  mostrarPreviewImagenCatalogo('');
  const inpExtra = el('cat_p_imagenes_extra_input'); if (inpExtra) inpExtra.value = '';
  _catImagenesExtraPendientes = null;
  renderPreviewImagenesExtraCatalogo([]);
}

/** Oculta o muestra un producto en la Tienda en Línea y en el PDF del
 *  catálogo, sin borrarlo: sigue editable desde Catálogo de Productos. */
async function toggleOcultoProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id);
  if (!p) return;
  const anterior = p.oculto || false;
  p.oculto = !anterior;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  renderCatalogoProductos();
  try {
    await fbGuardarCatalogoProducto(p);
    toast(p.oculto ? 'Producto ocultado de la tienda ✓' : 'Producto visible en la tienda ✓', 'success');
  } catch(e) {
    console.error(e);
    p.oculto = anterior;
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e2){}
    renderCatalogoProductos();
    toast('No se pudo cambiar la visibilidad del producto', 'error');
  }
}

/* ----------------------------------------------------------
   Catálogo de Productos — selección de productos para el PDF
---------------------------------------------------------- */
function toggleSeleccionCatalogo(id, checkbox) {
  if (checkbox.checked) catalogoSeleccionados.add(id);
  else catalogoSeleccionados.delete(id);
  if (typeof _actualizarBarraSeleccionCatalogo === 'function') _actualizarBarraSeleccionCatalogo();
}

function seleccionarTodosCatalogo() {
  const filtroCat = el('cat-filter-categoria')?.value || '';
  catalogoProductos
    .filter(p => !p.oculto && (!filtroCat || p.categoria === filtroCat))
    .forEach(p => catalogoSeleccionados.add(p.id));
  renderCatalogoProductos();
}

function limpiarSeleccionCatalogo() {
  catalogoSeleccionados.clear();
  renderCatalogoProductos();
}

function eliminarProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id);
  const nombre = p ? `"${p.nombre}"` : 'este producto';
  showConfirm('¿Eliminar producto?', `¿Seguro que deseas eliminar ${nombre} del catálogo? Esta acción no se puede deshacer.`, async () => {
    catalogoProductos = catalogoProductos.filter(p => p.id !== id);
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
    try {
      await fbEliminarCatalogoProducto(id);
      toast('Producto eliminado ✓','success');
    } catch(e) {
      console.error(e); toast('No se pudo eliminar el producto','error');
    }
    cargarCategoriasCatalogo();
    renderCatalogoProductos();
  });
}

function generarCatalogoPDF() {
  const visibles = catalogoProductos.filter(p => !p.oculto);
  const haySeleccion = catalogoSeleccionados.size > 0;
  const productosVisibles = haySeleccion
    ? visibles.filter(p => catalogoSeleccionados.has(p.id))
    : visibles;
  if (!productosVisibles.length) {
    toast(haySeleccion
      ? 'Los productos seleccionados ya no están visibles en el catálogo'
      : 'Agregue al menos un producto visible al catálogo', 'error');
    return;
  }
  toast('Generando catálogo…', 'info');

  const cfg = { ...CATALOGO_DEFAULTS, ...catalogoConfig };
  const base = new URL('.', window.location.href).href;
  const foxHeadUrl = base + 'img/marca/fox-head.png';

  let empNombre = 'Pin&Pon 3D', empEmail = '';
  try {
    const emp = JSON.parse(localStorage.getItem('emp3d') || '{}');
    if (emp.emp_nombre) empNombre = emp.emp_nombre;
    if (emp.emp_email) empEmail = emp.emp_email;
  } catch (e) {}

  // Logotipo estilizado: colorea el primer "&" del nombre y, si termina en "3D", lo aísla en un chip.
  // Si el nombre no tiene "&", se muestra en texto plano (hereda el color/tipografía navy del contenedor).
  function wordmarkHtml(nombre, opts) {
    opts = opts || {};
    const ampColor = opts.ampColor || '#F0B429';
    const chipBg   = opts.chipBg   || '#2E77B5';
    const str = String(nombre || 'Pin&Pon 3D');
    const ampIdx = str.indexOf('&');
    if (ampIdx === -1) return escHtml(str);
    const left = str.slice(0, ampIdx);
    let right  = str.slice(ampIdx + 1);
    let chip   = '';
    const m = right.match(/\s*(3D)\s*$/i);
    if (m) {
      right = right.slice(0, m.index);
      chip  = `<span class="pp-wm-chip" style="background:${chipBg}">${escHtml(m[1].toUpperCase())}</span>`;
    }
    return `${escHtml(left)}<span class="pp-wm-amp" style="color:${ampColor}">&amp;</span>${escHtml(right)}${chip}`;
  }

  // Acentos de color por categoría (2 tonos por cada color de marca, rotan cada 6)
  const ACCENTS = [
    { accent: '#2E77B5', tint: '#EAF2F9' }, // azul
    { accent: '#C98A00', tint: '#FCF3DE' }, // dorado oscuro
    { accent: '#16324A', tint: '#EAEEF2' }, // navy
    { accent: '#4185C6', tint: '#EAF6FC' }, // celeste (variante clara del azul)
    { accent: '#F0B429', tint: '#FFF6DE' }, // dorado (variante clara del dorado oscuro)
    { accent: '#0D2840', tint: '#E4EAF0' }, // navy profundo (variante oscura del navy)
  ];

  // Agrupar por categoría (orden de primera aparición) y paginar de 4 en 4 (grilla 2×2)
  const porCategoria = new Map();
  productosVisibles.forEach(p => {
    const cat = p.categoria || 'General';
    if (!porCategoria.has(cat)) porCategoria.set(cat, []);
    porCategoria.get(cat).push(p);
  });

  const categorias = [...porCategoria.keys()];
  const paginas = [];
  categorias.forEach((cat, ci) => {
    const items = porCategoria.get(cat);
    const { accent, tint } = ACCENTS[ci % ACCENTS.length];
    for (let i = 0; i < items.length; i += 4) {
      paginas.push({ categoria: cat, catIndex: ci + 1, accent, tint, items: items.slice(i, i + 4) });
    }
  });
  // La numeración de página cuenta el documento completo (portada + categorías + contraportada)
  const totalPaginasFisicas = paginas.length + 2;
  paginas.forEach((pg, i) => { pg.pageNo = i + 2; pg.pageTotal = totalPaginasFisicas; });

  // WhatsApp de pedidos, con respaldo al valor por defecto si el admin lo dejó vacío
  const backWa = cfg.back_wa || CATALOGO_DEFAULTS.back_wa;
  const backIg = cfg.back_ig || CATALOGO_DEFAULTS.back_ig;

  const precioFmt = n => '₡' + Math.ceil(n || 0).toLocaleString('es-CR');

  const itemHtml = (p, idx, accent, tint) => `
    <div class="pp-item">
      <div class="pp-item-bar" style="background:${accent}"></div>
      ${p.imagen
        ? `<img class="pp-item-img" src="${escHtml(p.imagen)}" alt="" style="background:${tint}">`
        : `<div class="pp-item-noimg" style="background:${tint}">Foto del producto</div>`}
      <div class="pp-item-body">
        <div class="pp-item-row">
          <span class="pp-item-num">${idx + 1}</span>
          <span class="pp-item-price" style="background:${accent}">${precioFmt(p.precio)}</span>
        </div>
        <div class="pp-item-name">${escHtml((p.nombre || '').toUpperCase())}</div>
        ${p.material ? `<div class="pp-item-mat">${escHtml(p.material)}</div>` : ''}
        ${p.descripcion ? `<div class="pp-item-desc">${escHtml(p.descripcion)}</div>` : ''}
      </div>
    </div>`;

  const paginaHtml = pg => `
    <div class="pp-page">
      <div class="pp-cat-page">
        <div class="pp-masthead">
          <div class="pp-masthead-brand">
            <img src="${foxHeadUrl}" alt="">
            <span>${escHtml(empNombre)}</span>
          </div>
          <span class="pp-masthead-tag">Catálogo de Productos · ${pg.pageNo}/${pg.pageTotal}</span>
        </div>
        <div class="pp-cat-eyebrow-row">
          <span class="pp-cat-tri" style="color:${pg.accent}"></span>
          <span class="pp-cat-eyebrow" style="color:${pg.accent}">Categoría ${String(pg.catIndex).padStart(2,'0')}</span>
        </div>
        <h1 class="pp-cat-title">${escHtml(pg.categoria)}</h1>
        <div class="pp-cat-rule" style="background:${pg.accent}"></div>
        <div class="pp-grid">
          ${pg.items.map((p, idx) => itemHtml(p, idx, pg.accent, pg.tint)).join('')}
        </div>
        <div class="pp-foot">
          <span>© ${new Date().getFullYear()} ${escHtml(empNombre)} — Pedidos por WhatsApp ${escHtml(backWa)}</span>
          <span>Precios en colones (₡) · sujetos a cambio sin previo aviso</span>
        </div>
      </div>
    </div>`;

  const contactFrags = String(cfg.cover_contact || CATALOGO_DEFAULTS.cover_contact || '')
    .split(/[·|,]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  const pillStyles = [
    { bg: '#16324A', color: '#fff', border: 'none' },
    { bg: '#fff',    color: '#16324A', border: '2px solid #F0B429' },
    { bg: '#fff',    color: '#16324A', border: '2px solid #2E77B5' },
  ];
  const contactPillsHtml = contactFrags.map((frag, i) => {
    const st = pillStyles[i % pillStyles.length];
    return `<span class="pp-cover-pill" style="background:${st.bg};color:${st.color};border:${st.border}">${escHtml(frag)}</span>`;
  }).join('');

  const coverHtml = `
    <div class="pp-page">
      <div class="pp-cover">
        <span class="pp-tri" style="top:56px;left:70px;width:22px;height:22px;background:#2E77B5;transform:rotate(-12deg)"></span>
        <span class="pp-tri" style="top:120px;left:130px;width:14px;height:14px;background:#F0B429;transform:rotate(18deg)"></span>
        <span class="pp-tri" style="top:90px;right:110px;width:18px;height:18px;background:#F0B429;transform:rotate(35deg)"></span>
        <span class="pp-tri" style="top:170px;right:60px;width:26px;height:26px;background:#16324A;transform:rotate(-20deg);opacity:.85"></span>
        <span class="pp-tri" style="bottom:130px;left:60px;width:24px;height:24px;background:#16324A;transform:rotate(8deg);opacity:.85"></span>
        <span class="pp-tri" style="bottom:80px;left:150px;width:15px;height:15px;background:#2E77B5;transform:rotate(-30deg)"></span>
        <span class="pp-tri" style="bottom:150px;right:90px;width:20px;height:20px;background:#2E77B5;transform:rotate(50deg)"></span>
        <span class="pp-tri" style="bottom:70px;right:170px;width:16px;height:16px;background:#F0B429;transform:rotate(-6deg)"></span>

        <span class="pp-cover-badge">${escHtml(cfg.cover_kicker)}</span>

        <div class="pp-cover-medallion">
          <div class="pp-cover-medallion-ring"></div>
          <div class="pp-cover-medallion-circle"><img src="${foxHeadUrl}" alt=""></div>
        </div>

        <div class="pp-cover-wordmark">${wordmarkHtml(empNombre)}</div>
        <div class="pp-cover-subtitle">${escHtml(cfg.cover_title)}</div>
        <div class="pp-cover-edition">${escHtml(cfg.cover_edition)}</div>
        <p class="pp-cover-tag">${escHtml(cfg.cover_tag)}</p>
        ${contactPillsHtml ? `<div class="pp-cover-pills">${contactPillsHtml}</div>` : ''}
      </div>
    </div>`;

  const backContactLines = [];
  if (backWa)   backContactLines.push(`WhatsApp — ${escHtml(backWa)}`);
  if (backIg)   backContactLines.push(`Instagram — ${escHtml(backIg)}`);
  if (empEmail) backContactLines.push(`Correo — ${escHtml(empEmail)}`);

  const backHtml = `
    <div class="pp-page">
      <div class="pp-back">
        <span class="pp-back-tri-tr"></span>
        <span class="pp-back-tri-bl"></span>
        <span class="pp-back-eyebrow">Hagamos tu proyecto</span>
        <h2 class="pp-back-title">${escHtml(cfg.back_title)}</h2>
        <p class="pp-back-text">${escHtml(cfg.back_text)}</p>
        ${backContactLines.length ? `<div class="pp-back-contact">${backContactLines.map(l => `<span>${l}</span>`).join('')}</div>` : ''}
        <div class="pp-back-medallion"><img src="${foxHeadUrl}" alt=""></div>
        <div class="pp-back-word">${wordmarkHtml(empNombre)}</div>
      </div>
    </div>`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo de Productos — ${escHtml(empNombre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#ECEEF3;font-family:"Manrope",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#26333F}
body{min-height:100vh;padding:24px 0 80px;display:flex;flex-direction:column;align-items:center;gap:24px}
.pp-page{width:816px;height:1056px;background:#fff;position:relative;overflow:hidden;box-shadow:0 20px 60px -16px rgba(22,50,74,.22),0 4px 16px rgba(22,50,74,.1);flex-shrink:0}
@page{size:letter;margin:0}
@media screen and (max-width:860px){body{padding:0;gap:0}.pp-page{box-shadow:none;width:100%;height:auto;min-height:100vh}}
@media print{html,body{background:#fff;padding:0;margin:0;gap:0}.pp-page{box-shadow:none;width:100%;height:100vh;page-break-after:always}.pp-page:last-child{page-break-after:auto}.print-fab{display:none!important}}

.print-fab{position:fixed;bottom:24px;right:24px;background:#16324A;color:#fff;border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-family:"Manrope",sans-serif;font-weight:800;cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(10,31,61,.35)}
.print-fab:hover{background:#1f4576}

.pp-wm-amp{font-style:italic}
.pp-wm-chip{display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:"Manrope",sans-serif;font-weight:800;border-radius:8px;margin-left:6px;vertical-align:middle;transform:rotate(6deg)}

/* Portada */
.pp-cover{height:100%;background:#F7F4EE;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:0.6in}
.pp-tri{position:absolute;clip-path:polygon(50% 0%,100% 100%,0% 100%)}
.pp-cover-badge{font-family:"Manrope",sans-serif;font-size:11.5px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#fff;background:#2E77B5;padding:7px 20px;border-radius:20px;transform:rotate(-2deg);box-shadow:0 6px 14px rgba(46,119,181,.3)}
.pp-cover-medallion{position:relative;margin:14px 0 4px}
.pp-cover-medallion-ring{position:absolute;inset:-14px;border:3px dashed #F0B429;border-radius:50%;transform:rotate(-8deg)}
.pp-cover-medallion-circle{position:relative;background:#fff;border-radius:50%;width:230px;height:230px;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 40px rgba(22,50,74,.18)}
.pp-cover-medallion-circle img{width:168px;height:auto}
.pp-cover-wordmark{font-family:"Playfair Display",serif;font-weight:700;font-size:54px;line-height:1;color:#16324A;margin-top:4px}
.pp-cover-wordmark .pp-wm-chip{font-size:19px;padding:4px 11px}
.pp-cover-subtitle{font-family:"Manrope",sans-serif;font-weight:700;font-size:16px;color:#2E77B5}
.pp-cover-edition{font-family:"Manrope",sans-serif;font-weight:600;font-size:13px;color:#16324A;letter-spacing:.06em;opacity:.75}
.pp-cover-tag{font-family:"Playfair Display",serif;font-style:italic;font-size:20px;color:#2E77B5;max-width:440px;line-height:1.45;margin-top:2px}
.pp-cover-pills{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;justify-content:center}
.pp-cover-pill{font-size:12px;font-weight:700;padding:7px 16px;border-radius:20px;font-family:"Manrope",sans-serif}

/* Masthead + página de categoría */
.pp-cat-page{display:flex;flex-direction:column;height:100%;padding:0.6in}
.pp-masthead{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #F0B429;margin-bottom:22px}
.pp-masthead-brand{display:flex;align-items:center;gap:10px}
.pp-masthead-brand img{height:34px;width:auto}
.pp-masthead-brand span{font-family:"Playfair Display",serif;font-weight:700;font-size:15px;color:#16324A}
.pp-masthead-tag{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2E77B5}
.pp-cat-eyebrow-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.pp-cat-tri{width:0;height:0;border-style:solid;border-width:0 8px 14px 8px;border-color:transparent transparent currentColor transparent}
.pp-cat-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.pp-cat-title{font-family:"Playfair Display",serif;font-weight:700;font-size:34px;color:#16324A;margin:0 0 12px}
.pp-cat-rule{height:4px;width:64px;border-radius:2px;margin-bottom:22px}

.pp-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:min-content;align-content:start;gap:22px 22px}
.pp-item{display:flex;flex-direction:column;background:#fff;border:1px solid #eceef1;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(22,50,74,.08)}
.pp-item-bar{height:5px}
.pp-item-img{width:100%;height:190px;object-fit:cover;display:block}
.pp-item-noimg{width:100%;height:190px;display:flex;align-items:center;justify-content:center;color:#8a95a1;font-size:11px;font-family:"Manrope",sans-serif}
.pp-item-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px}
.pp-item-row{display:flex;align-items:center;justify-content:space-between}
.pp-item-num{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#16324A;color:#fff;font-size:10.5px;font-weight:700;font-family:"Manrope",sans-serif;flex-shrink:0}
.pp-item-price{font-size:14px;font-weight:800;color:#fff;padding:4px 12px;border-radius:20px;font-family:"Manrope",sans-serif}
.pp-item-name{font-family:"Playfair Display",serif;font-weight:700;font-size:15.5px;color:#16324A;line-height:1.3;text-transform:uppercase;letter-spacing:.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pp-item-mat{font-family:"Manrope",sans-serif;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9aa7b7}
.pp-item-desc{font-family:"Manrope",sans-serif;font-size:11px;color:#6b7686;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.pp-foot{margin-top:18px;padding-top:12px;border-top:1px solid #dfe3e8;display:flex;justify-content:space-between;font-family:"Manrope",sans-serif;font-size:9.5px;color:#8a95a1}

/* Contraportada */
.pp-back{height:100%;background:#16324A;color:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;padding:0.6in}
.pp-back-tri-tr{position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 200px 200px 0;border-color:transparent #2E77B5 transparent transparent;opacity:.5}
.pp-back-tri-bl{position:absolute;bottom:0;left:0;width:0;height:0;border-style:solid;border-width:0 0 160px 170px;border-color:transparent transparent #F0B429 transparent;opacity:.35}
.pp-back-eyebrow{position:relative;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#F0B429}
.pp-back-title{position:relative;font-family:"Playfair Display",serif;font-weight:700;font-size:32px;margin:0;max-width:480px}
.pp-back-text{position:relative;max-width:420px;font-size:14px;line-height:1.6;color:#cfd9e3;font-family:"Manrope",sans-serif}
.pp-back-contact{position:relative;display:flex;flex-direction:column;gap:10px;margin-top:4px;font-size:14.5px;font-weight:600;font-family:"Manrope",sans-serif}
.pp-back-medallion{position:relative;background:#fff;border-radius:50%;width:104px;height:104px;display:flex;align-items:center;justify-content:center;box-shadow:0 16px 34px rgba(0,0,0,.3);margin-top:14px}
.pp-back-medallion img{width:74px;height:auto}
.pp-back-word{position:relative;font-family:"Playfair Display",serif;font-weight:700;font-size:24px}
.pp-back-word .pp-wm-chip{font-size:11px;border-radius:5px;padding:2px 7px}
</style>
</head>
<body>
<button class="print-fab" onclick="window.print()">🖨️ Descargar / Imprimir PDF</button>
${coverHtml}
${paginas.map(paginaHtml).join('')}
${backHtml}
<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;

  const blobCat    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrlCat = URL.createObjectURL(blobCat);
  const winCat     = window.open(blobUrlCat, '_blank');
  if (!winCat) { URL.revokeObjectURL(blobUrlCat); toast('Permita ventanas emergentes para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrlCat), 10000);
}

/* ----------------------------------------------------------
   Inventario Productos
---------------------------------------------------------- */

/** Lleva al Cotizador listo para dar de alta un producto de Inventario
 *  Productos: limpia el formulario, deja la categoría preseleccionada y
 *  pide el mismo desglose de costos (gramos, horas, fallos, margen, IVA…)
 *  que cualquier otra cotización, para que la ganancia quede bien calculada. */
function agregarProductoDesdeInventario() {
  navTo('cotizador');
  if (typeof nuevaCotizacion === 'function') nuevaCotizacion();
  if (el('c_categoria')) el('c_categoria').value = 'Inventario Productos';
  if (el('c_pieza')) el('c_pieza').focus();
  toast('Completa el producto y su costeo — la categoría ya quedó en "Inventario Productos"', 'info');
}

async function cargarVentaDetalle() {
  try {
    // Siempre recargar desde Firestore para tener datos frescos
    if (!trabajos.length) trabajos = await fbCargarTrabajos();
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e){}

    // Incluye tanto los que tienen ventaDetalle:true como los que tienen
    // categoria "Inventario Productos" (o el nombre legado "Venta al Detalle")
    const lotes = trabajos.filter(_esDetalle);

    // Auto-corregir agotados: los que tienen todas las unidades vendidas
    // y todavía no están marcados como Entregado + Pagado
    const agotados = lotes.filter(l =>
      (l.unidadesVendidas || 0) >= _totalUnidadesDetalle(l) &&
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
    if (detalleVista === 'pedidos') renderPedidosOnline();
  } catch(e) {
    console.error(e);
    toast('Error al cargar Inventario Productos', 'error');
  }
}

function abrirModalVenta(id, tipo = 'venta') {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  const esDevolucion = tipo === 'devolucion';
  const vendidas     = t.unidadesVendidas || 0;
  const disponibles  = Math.max(_totalUnidadesDetalle(t) - vendidas, 0);
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

/** Abre el modal para agregarle más unidades al stock de un producto
 *  (útil tanto para reponer uno agotado como para sumarle más a uno activo). */
function abrirModalReabastecer(id) {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  const disponibles = Math.max(_totalUnidadesDetalle(t) - (t.unidadesVendidas || 0), 0);
  el('rb-id').value              = id;
  el('rb-pieza-lbl').textContent = t.pieza || '—';
  el('rb-actual-num').textContent = disponibles;
  el('rb-cantidad').value        = 1;
  const mv = el('modal-reabastecer');
  if (mv) mv.style.display = 'flex';
}

function cerrarModalReabastecer() {
  const mv = el('modal-reabastecer');
  if (mv) mv.style.display = 'none';
}

/** Suma unidades al total del lote manteniendo el mismo precio unitario,
 *  y si estaba agotado (Entregado/Pagado por venta total) lo reactiva. */
async function guardarReabastecimiento() {
  const id       = el('rb-id')?.value;
  const unidades = parseInt(el('rb-cantidad')?.value) || 0;
  const t        = trabajos.find(t => t.id === id);
  if (!t) return;
  if (unidades < 1) { toast('Ingresá una cantidad mayor a 0', 'error'); return; }

  const placas        = Math.max(t.placas || 1, 1);
  const totalActual    = _totalUnidadesDetalle(t);
  const precioUnitario = totalActual > 0 ? (t.precio_final || 0) / totalActual : 0;
  const nuevaCantidad  = (t.cantidad || 1) + unidades;
  const nuevoTotal     = nuevaCantidad * placas;
  const nuevoPrecioFinal = Math.round(precioUnitario * nuevoTotal);
  const vendidas       = t.unidadesVendidas || 0;
  const yaNoAgotado    = t.estado === 'Entregado' && vendidas < nuevoTotal;

  const updateData = {
    cantidad: nuevaCantidad,
    precio_final: nuevoPrecioFinal,
    fechaActualizacionEstado: new Date().toISOString()
  };
  if (yaNoAgotado) {
    updateData.estado        = 'Venta';
    updateData.estadoPago    = 'Pendiente';
    updateData.montoAbonado  = 0;
    updateData.montoPendiente = 0;
  }

  try {
    await db.collection('cotizaciones').doc(String(id)).update(updateData);
    Object.assign(t, updateData);
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}
    cerrarModalReabastecer();
    toast('Unidades agregadas al stock ✓', 'success');
    if (typeof renderTrabajos === 'function') renderTrabajos();
    cargarVentaDetalle();
  } catch(e) {
    console.error('Error al reabastecer producto:', e);
    toast('No se pudo agregar unidades al stock', 'error');
  }
}

/** Muestra el historial de ventas/devoluciones de un lote de Inventario
 *  Productos (antes se mostraba siempre expandido dentro de la tarjeta). */
function abrirModalHistorialVD(id) {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  set('hvd-pieza', t.pieza || '—');

  const hist  = (t.historialVentas || []).slice().reverse();
  const lista = el('hvd-lista');
  if (lista) {
    lista.innerHTML = hist.map(v => {
      const esDev = (v.cantidad || 0) < 0;
      const cantLabel = esDev
        ? `<span class="vd-hist-cant" style="color:var(--danger,#dc2626)">−${Math.abs(v.cantidad)}</span>`
        : `<span class="vd-hist-cant">+${v.cantidad}</span>`;
      return `<div class="vd-hist-item">
        <span class="vd-hist-fecha">${(v.fecha||'').split('T')[0] || '—'}</span>
        ${cantLabel}
        ${v.nota ? `<span class="vd-hist-nota">${escHtml(v.nota)}</span>` : ''}
      </div>`;
    }).join('');
  }
  const vacio = el('hvd-empty');
  if (vacio) vacio.style.display = hist.length ? 'none' : 'block';

  const mv = el('modal-historial-vd');
  if (mv) mv.style.display = 'flex';
}

function cerrarModalHistorialVD() {
  const mv = el('modal-historial-vd');
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
  const disponibles  = Math.max(_totalUnidadesDetalle(t) - vendidas, 0);

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

  const totalUnidades = _totalUnidadesDetalle(t);
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
    trabajos[idx].estado         = 'Venta';
    trabajos[idx].estadoPago     = 'Pendiente';
    trabajos[idx].montoAbonado   = 0;
    trabajos[idx].montoPendiente = 0;
    trabajos[idx].fechaActualizacionEstado = new Date().toISOString();
  }

  cerrarModalVenta();
  renderVentaDetalle(trabajos.filter(_esDetalle));

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
        estado: 'Venta', estadoPago: 'Pendiente',
        montoAbonado: 0, montoPendiente: 0,
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
    renderVentaDetalle(trabajos.filter(_esDetalle));
  }
}

let detalleVista = 'lotes';

function setDetalleVista(vista) {
  detalleVista = vista;
  const lv = document.getElementById('detalle-vista-lotes');
  const ov = document.getElementById('detalle-vista-pedidos');
  const bl = document.getElementById('btn-vista-lotes');
  const bo = document.getElementById('btn-vista-pedidos');

  if (lv) lv.style.display = vista === 'lotes'   ? 'block' : 'none';
  if (ov) ov.style.display = vista === 'pedidos' ? 'block' : 'none';
  if (bl) bl.classList.toggle('active', vista === 'lotes');
  if (bo) bo.classList.toggle('active', vista === 'pedidos');

  if (vista === 'pedidos') renderPedidosOnline();
}

/* ----------------------------------------------------------
   Pedidos Online (generados desde tienda.html)
---------------------------------------------------------- */

/** Busca el precio oficial vigente de un producto del catálogo administrado,
 *  a partir de un ítem de pedido ({id, nombre}). Los pedidos online se
 *  escriben desde una página pública sin autenticación, así que el precio
 *  que viaja en el pedido NO debe usarse a ciegas: siempre se recalcula
 *  contra el catálogo real al momento de aprobar/mostrar el pedido. Se
 *  busca primero por id (estable aunque el producto se haya renombrado) y
 *  solo se recurre al nombre si no hay id o no hubo match. Retorna null si
 *  el producto ya no existe en el catálogo. También acepta un string
 *  (nombre) por compatibilidad con llamadas antiguas. */
function _precioOficialPorNombre(item) {
  const norm = s => (s || '').trim().toLowerCase();
  const esObjeto = item && typeof item === 'object';
  const id     = esObjeto ? item.id     : null;
  const nombre = esObjeto ? item.nombre : item;
  if (id && !String(id).startsWith('lote_')) {
    const porId = catalogoProductos.find(p => p.id === id);
    if (porId) return porId.precio || 0;
  }
  const p = catalogoProductos.find(p => norm(p.nombre) === norm(nombre));
  return p ? (p.precio || 0) : null;
}

/** Compara los precios declarados en un pedido contra el catálogo real
 *  y devuelve los ítems cuyo precio no coincide (incluye el precio
 *  oficial para mostrarlo/usarlo). */
function _detectarDiscrepanciasPedido(pedido) {
  return (pedido.items || []).reduce((acc, it) => {
    const oficial = _precioOficialPorNombre(it);
    if (oficial !== null && oficial !== it.precio) acc.push({ ...it, precioOficial: oficial });
    return acc;
  }, []);
}

/** Compara el snapshot recién recibido de pedidosOnline contra el set de
 *  IDs ya vistos y avisa al admin (notificación del navegador + sonido)
 *  por cada pedido nuevo. En el primer snapshot solo se registra el
 *  estado inicial, sin avisar (para no notificar pedidos ya existentes
 *  al abrir la app). */
function _detectarPedidosNuevos(data) {
  const idsActuales = new Set(data.map(p => p.id));
  if (_pedidosOnlineIdsConocidos === null) {
    _pedidosOnlineIdsConocidos = idsActuales;
    return;
  }
  const nuevos = data.filter(p => !_pedidosOnlineIdsConocidos.has(p.id));
  _pedidosOnlineIdsConocidos = idsActuales;
  if (!nuevos.length) return;

  nuevos.forEach(p => {
    const cliente = (p.cliente && p.cliente.nombre) || 'Cliente';
    const total = (p.total || 0).toLocaleString('es-CR');
    if (typeof toast === 'function') toast(`🛒 Nuevo pedido de ${cliente} — ₡${total}`, 'info', 6000);
    _notificarPedidoNuevo(cliente, total);
  });
  _sonarAlertaPedido();
}

function _notificarPedidoNuevo(cliente, total) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try { new Notification('Nuevo pedido online', { body: `${cliente} — ₡${total}`, icon: 'icons/icon-192.png' }); } catch(e) {}
  }
}

function _sonarAlertaPedido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.15].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
  } catch(e) {}
}

/** Solicita permiso de notificaciones del navegador. Debe llamarse desde
 *  un gesto del usuario (clic), ya que los navegadores bloquean la
 *  solicitud automática sin interacción. */
function solicitarPermisoNotificaciones() {
  if (typeof Notification === 'undefined') {
    if (typeof toast === 'function') toast('Tu navegador no soporta notificaciones', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    if (typeof toast === 'function') toast('Las notificaciones ya están activadas', 'success');
    return;
  }
  Notification.requestPermission().then(perm => {
    if (typeof toast === 'function') {
      toast(perm === 'granted' ? 'Notificaciones activadas ✓' : 'Notificaciones no activadas', perm === 'granted' ? 'success' : 'info');
    }
  });
}

function actualizarBadgePedidosOnline() {
  const badge = document.getElementById('pedidos-pend-badge');
  if (!badge) return;
  const n = pedidosOnline.filter(p => p.estado !== 'Aprobado' && p.estado !== 'Rechazado').length;
  badge.textContent = n;
  badge.style.display = n > 0 ? 'inline-flex' : 'none';
}

let _mostrarPedidosRechazados = false;

function toggleRechazadosPedidosOnline() {
  _mostrarPedidosRechazados = !_mostrarPedidosRechazados;
  renderPedidosOnline();
}

function renderPedidosOnline() {
  const cont  = document.getElementById('pedidos-online-lista');
  const empty = document.getElementById('pedidos-online-empty');
  if (!cont) return;

  actualizarBadgePedidosOnline();

  if (!pedidosOnline.length) {
    cont.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }

  const rechazados = pedidosOnline.filter(p => p.estado === 'Rechazado');
  const visibles = _mostrarPedidosRechazados ? pedidosOnline : pedidosOnline.filter(p => p.estado !== 'Rechazado');

  const toggleHtml = rechazados.length
    ? `<div style="text-align:right;margin-bottom:10px">
         <button type="button" class="btn btn-ghost btn-sm" onclick="toggleRechazadosPedidosOnline()">
           ${_mostrarPedidosRechazados ? 'Ocultar' : 'Ver'} rechazados (${rechazados.length})
         </button>
       </div>`
    : '';

  if (!visibles.length) {
    cont.innerHTML = toggleHtml;
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  cont.innerHTML = toggleHtml + visibles.map(p => {
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const aprobado  = p.estado === 'Aprobado';
    const rechazado = p.estado === 'Rechazado';
    const discrepancias = _detectarDiscrepanciasPedido(p);
    const itemsHtml = (p.items || []).map(it => {
      const disc = discrepancias.find(d => d.nombre === it.nombre);
      return `
      <div class="pedido-item-row">
        <span>${escHtml(it.nombre)}${it.porEncargo ? ' <em class="pedido-encargo-tag">por encargo</em>' : ''} × ${it.cantidad}</span>
        <span>${disc ? `<span style="color:var(--danger);font-weight:700" title="El precio enviado no coincide con el del catálogo (₡${disc.precioOficial.toLocaleString('es-CR')})">⚠ ₡${(it.cantidad * it.precio).toLocaleString('es-CR')}</span>` : `₡${(it.cantidad * it.precio).toLocaleString('es-CR')}`}</span>
      </div>`;
    }).join('');

    return `
      <div class="card pedido-online-card">
        <div class="pedido-online-hdr">
          <div>
            <div class="pedido-online-cliente">${escHtml(p.cliente || 'Cliente sin nombre')}</div>
            <div class="pedido-online-fecha">${fecha}</div>
          </div>
          <span class="badge ${aprobado ? 'badge-success' : rechazado ? 'badge-danger' : 'badge-warn'}">${aprobado ? 'Aprobado' : rechazado ? 'Rechazado' : 'Pendiente'}</span>
        </div>
        ${discrepancias.length && !aprobado && !rechazado ? `<div style="background:#fef2f2;color:var(--danger);border:1px solid var(--danger);border-radius:6px;padding:8px 10px;font-size:.8125rem;margin:8px 0">⚠ Precio(s) distinto(s) al catálogo actual. Se usará el precio oficial del catálogo al aprobar.</div>` : ''}
        <div class="pedido-online-items">${itemsHtml}</div>
        <div class="pedido-online-footer">
          <span class="pedido-online-total">Total: ₡${(p.total || 0).toLocaleString('es-CR')}</span>
          ${aprobado || rechazado
            ? ''
            : `<div class="btn-group">
                 <button class="btn btn-primary btn-sm" onclick="aprobarPedidoOnline('${p.id}')">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                   Aprobar
                 </button>
                 <button class="btn btn-danger btn-sm" onclick="rechazarPedidoOnline('${p.id}')">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                   Rechazar
                 </button>
               </div>`}
        </div>
      </div>`;
  }).join('');
}

/** Aprueba un pedido online, pidiendo confirmación extra si algún precio
 *  declarado no coincide con el catálogo (posible manipulación desde el
 *  navegador del cliente, ya que la tienda es pública y sin login). */
function aprobarPedidoOnline(id) {
  const pedido = pedidosOnline.find(p => p.id === id);
  if (!pedido || pedido.estado === 'Aprobado') return;

  const discrepancias = _detectarDiscrepanciasPedido(pedido);
  if (discrepancias.length) {
    const detalle = discrepancias.map(d => `• ${d.nombre}: enviado ₡${d.precio.toLocaleString('es-CR')}, catálogo ₡${d.precioOficial.toLocaleString('es-CR')}`).join('\n');
    showConfirm(
      '⚠ Precios distintos al catálogo',
      `Este pedido tiene precios que no coinciden con el catálogo actual:\n${detalle}\n\nSe aprobará usando el precio oficial del catálogo. ¿Continuar?`,
      () => _procesarAprobacionPedido(id),
      'Aprobar con precio del catálogo'
    );
    return;
  }
  _procesarAprobacionPedido(id);
}

async function _procesarAprobacionPedido(id) {
  const pedido = pedidosOnline.find(p => p.id === id);
  if (!pedido || pedido.estado === 'Aprobado') return;

  if (!trabajos.length) {
    try { trabajos = await fbCargarTrabajos(); } catch(e) { console.error(e); }
  }

  const norm = s => (s || '').trim().toLowerCase();

  for (const item of (pedido.items || [])) {
    let restante = item.cantidad;
    const oficial = _precioOficialPorNombre(item);
    const precioConfiable = oficial !== null ? oficial : item.precio;

    // Lotes activos del mismo producto, ordenados por fecha (más antiguos
    // primero). El carrito de la tienda viaja con el id del producto de
    // catálogo (o "lote_<id>" si el producto no estaba en el catálogo), así
    // que se busca primero por ese id — estable aunque el producto se haya
    // renombrado — y solo se recurre al nombre si el pedido es viejo y no
    // trae id, o el lote todavía no quedó vinculado al catálogo.
    let lotes = [];
    if (item.id && String(item.id).startsWith('lote_')) {
      const loteId = String(item.id).slice(5);
      lotes = trabajos.filter(t => t.id === loteId && _esDetalle(t) && t.estado !== 'Cancelado');
    } else if (item.id) {
      lotes = trabajos.filter(t => _esDetalle(t) && t.estado !== 'Cancelado' && t.catalogoProductoId === item.id);
    }
    if (!lotes.length) {
      lotes = trabajos.filter(t => _esDetalle(t) && t.estado !== 'Cancelado' && norm(t.pieza) === norm(item.nombre));
    }
    lotes = lotes.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

    for (const lote of lotes) {
      if (restante <= 0) break;
      const total = _totalUnidadesDetalle(lote);
      const vendidas = lote.unidadesVendidas || 0;
      const disponibles = total - vendidas;
      if (disponibles <= 0) continue;

      const cantidad = Math.min(restante, disponibles);
      const entrada = { fecha: new Date().toISOString(), cantidad, nota: `Pedido online · ${pedido.cliente || ''}`.trim() };
      const nuevasVendidas = vendidas + cantidad;
      const agotado = nuevasVendidas >= total;

      const updateData = {
        unidadesVendidas: firebase.firestore.FieldValue.increment(cantidad),
        historialVentas:  firebase.firestore.FieldValue.arrayUnion(entrada)
      };
      if (agotado) Object.assign(updateData, {
        estado: 'Entregado', estadoPago: 'Pagado',
        montoAbonado: lote.precio_final || 0, montoPendiente: 0,
        fechaActualizacionEstado: new Date().toISOString()
      });

      try {
        await db.collection('cotizaciones').doc(String(lote.id)).update(updateData);
        lote.unidadesVendidas = nuevasVendidas;
        lote.historialVentas  = [...(lote.historialVentas || []), entrada];
        if (agotado) {
          lote.estado = 'Entregado'; lote.estadoPago = 'Pagado';
          lote.montoAbonado = lote.precio_final || 0; lote.montoPendiente = 0;
        }
        restante -= cantidad;
      } catch(e) {
        console.error('Error al descontar stock de pedido online:', lote.id, e);
      }
    }

    // Si quedó cantidad sin cubrir por stock, se crea una cotización para producirla
    if (restante > 0) {
      const precioFinal = restante * precioConfiable;
      const nueva = {
        id: genId(),
        pieza: item.nombre,
        cliente: pedido.cliente || 'Cliente Tienda Online',
        fecha: new Date().toISOString().slice(0, 10),
        fechaEntrega: '',
        cantidad: restante,
        placas: 1,
        categoria: 'Venta en Línea',
        material: '',
        notas: `Pedido online de ${pedido.cliente || 'cliente'} — generado automáticamente al aprobar (sin stock suficiente).`,
        costo_total: 0,
        precio_final: precioFinal,
        precio_unitario: precioConfiable,
        ganancia_por_objeto: 0,
        estado: 'Venta',
        fechaActualizacionEstado: new Date().toISOString(),
        estadoPago: 'Pendiente',
        metodoPago: 'Efectivo',
        montoAbonado: 0,
        montoPendiente: precioFinal,
        fechaPago: '',
        materialesAdicionales: [],
        inventarioDescontado: false,
        precioManualActivo: true,
        precioManualValor: precioConfiable,
        ventaDetalle: false
      };
      try {
        await fbGuardarCotizacion(nueva);
        trabajos.unshift(nueva);
      } catch(e) {
        console.error('Error al crear cotización de pedido online:', e);
      }
    }
  }

  try {
    await fbActualizarEstadoPedidoOnline(id, 'Aprobado', { fechaAprobacion: new Date().toISOString() });
    pedido.estado = 'Aprobado';
  } catch(e) {
    console.error('Error al actualizar estado del pedido:', e);
  }

  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}

  renderPedidosOnline();
  if (typeof renderVentaDetalle === 'function') renderVentaDetalle(trabajos.filter(_esDetalle));
  if (typeof renderTrabajos === 'function') renderTrabajos();
  toast('Pedido aprobado ✓', 'success');
}

/** Rechaza un pedido online. Como un pedido pendiente nunca llegó a
 *  descontar stock ni a generar ventas/cotizaciones (eso solo ocurre al
 *  aprobar), no hay nada que revertir: solo se marca como Rechazado para
 *  que deje de aparecer como pendiente. El registro NO se borra de
 *  Firestore — queda como historial para que el admin pueda consultarlo. */
function rechazarPedidoOnline(id) {
  const pedido = pedidosOnline.find(p => p.id === id);
  if (!pedido || pedido.estado === 'Aprobado' || pedido.estado === 'Rechazado') return;

  showConfirm(
    '¿Rechazar pedido?',
    `¿Seguro que deseas rechazar el pedido de ${pedido.cliente || 'este cliente'}? No se descontará stock ni se generará ninguna venta. El pedido quedará marcado como rechazado (no se elimina).`,
    async () => {
      try {
        await fbActualizarEstadoPedidoOnline(id, 'Rechazado', { fechaRechazo: new Date().toISOString() });
        pedido.estado = 'Rechazado';
        renderPedidosOnline();
        toast('Pedido rechazado', 'success');
      } catch(e) {
        console.error('Error al rechazar el pedido:', e);
        toast('No se pudo rechazar el pedido', 'error');
      }
    },
    'Rechazar pedido'
  );
}

/* ----------------------------------------------------------
   Dashboard
---------------------------------------------------------- */
function cargarDashboard() {
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
    const catCfg = await fbCargarCatalogoConfig();
    if (catCfg) {
      catalogoConfig = catCfg;
      localStorage.setItem('catalogoConfig3d', JSON.stringify(catCfg));
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
   Inventario Productos — Generar Lista de Precios (PDF)
---------------------------------------------------------- */
function generarListaPrecios() {
  // Filtrar lotes activos (misma lógica que renderVentaDetalle)
  const lotes = trabajos.filter(l =>
    _esDetalle(l) &&
    l.estado !== 'Cancelado' &&
    (l.unidadesVendidas || 0) < _totalUnidadesDetalle(l)
  );

  if (!lotes.length) {
    toast('No hay productos disponibles en Inventario Productos para exportar', 'error');
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
    const total      = _totalUnidadesDetalle(l);
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
          <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:5px;font-weight:400">Precios unitarios al público · Inventario Productos</div>
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

let _guardandoGasto = false;

async function guardarGasto() {
  if (_guardandoGasto) return; // evita doble envío mientras se guarda
  const descripcion = (el('g_descripcion')?.value || '').trim();
  const categoria   = el('g_categoria')?.value || 'Otro';
  const monto       = parseFloat(el('g_monto')?.value || 0);
  const fecha       = el('g_fecha')?.value || new Date().toISOString().split('T')[0];
  const notas       = (el('g_notas')?.value || '').trim();
  if (!descripcion || !monto) { toast('Completa descripción y monto', 'error'); return; }
  const data = { id: genId(), descripcion, categoria, monto, fecha, notas };
  gastos.unshift(data);
  resetFormGasto();
  renderCostos();
  _guardandoGasto = true;
  const btnGuardar = el('btn-guardar-gasto');
  if (btnGuardar) btnGuardar.disabled = true;
  try {
    await fbGuardarGasto(data);
    toast('Gasto registrado ✓', 'success');
  } catch(e) {
    toast('Error guardando gasto', 'error');
  } finally {
    _guardandoGasto = false;
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

function eliminarGasto(id) {
  showConfirm('¿Eliminar gasto?', '¿Seguro que deseas eliminar este gasto? Esta acción no se puede deshacer.', async () => {
    try {
      await fbEliminarGasto(id);
      gastos = gastos.filter(g => g.id !== id);
      renderCostos();
      toast('Gasto eliminado', 'success');
    } catch(e) {
      toast('Error eliminando gasto', 'error');
    }
  });
}

/**
 * Detecta gastos repetidos (misma descripción, monto y fecha) — secuela del
 * bug de doble guardado ya corregido, cuyas copias viejas siguen en Firestore.
 * Conserva el más antiguo de cada grupo y elimina el resto, previa confirmación.
 */
function detectarDuplicadosGastos() {
  const grupos = {};
  gastos.forEach(g => {
    const key = `${(g.descripcion||'').trim().toLowerCase()}|${g.monto||0}|${g.fecha||''}`;
    (grupos[key] = grupos[key] || []).push(g);
  });
  const duplicados = Object.values(grupos).filter(grupo => grupo.length > 1);
  if (!duplicados.length) {
    toast('No se encontraron gastos duplicados ✓', 'success');
    return;
  }
  let sobrantes = 0, monto = 0;
  duplicados.forEach(grupo => {
    const ordenado = [...grupo].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ordenado.slice(1).forEach(g => { sobrantes++; monto += (g.monto || 0); });
  });
  showConfirm(
    '¿Eliminar gastos duplicados?',
    `Se encontraron ${duplicados.length} grupo(s) con ${sobrantes} registro(s) repetido(s) (misma descripción, monto y fecha) por un total de ${fmt(monto)}. Se conservará el más antiguo de cada grupo. Esta acción no se puede deshacer.`,
    async () => {
      let eliminados = 0;
      for (const grupo of duplicados) {
        const ordenado = [...grupo].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        for (const g of ordenado.slice(1)) {
          try { await fbEliminarGasto(g.id); eliminados++; } catch(e) { console.error(e); }
        }
      }
      const idsEliminados = new Set();
      duplicados.forEach(grupo => {
        const ordenado = [...grupo].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        ordenado.slice(1).forEach(g => idsEliminados.add(g.id));
      });
      gastos = gastos.filter(g => !idsEliminados.has(g.id));
      renderCostos();
      if (typeof renderTrabajos === 'function') renderTrabajos();
      toast(`${eliminados} gasto(s) duplicado(s) eliminado(s) ✓`, 'success');
    },
    'Eliminar duplicados'
  );
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

let _guardandoItemInversion = false;

async function guardarItemInversion() {
  if (_guardandoItemInversion) return; // evita doble envío mientras se guarda
  const descripcion = (el('inv_descripcion')?.value || '').trim();
  const categoria   = el('invitem_categoria')?.value || 'Otro';
  const monto       = parseFloat(el('inv_monto')?.value || 0);
  if (!descripcion || !monto) { toast('Completa descripción y monto', 'error'); return; }
  const item = { id: genId(), descripcion, categoria, monto };
  if (!inversion.items) inversion.items = [];
  inversion.items.push(item);
  _guardandoItemInversion = true;
  const btnGuardar = el('btn-guardar-item-inversion');
  if (btnGuardar) btnGuardar.disabled = true;
  try {
    await fbGuardarInversion(inversion);
    el('inv_descripcion').value = '';
    el('inv_monto').value = '';
    renderInversion();
    actualizarDashboardInversion();
    toast('Item de inversión agregado ✓', 'success');
  } catch(e) {
    toast('Error guardando inversión', 'error');
  } finally {
    _guardandoItemInversion = false;
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

function eliminarItemInversion(id) {
  showConfirm('¿Eliminar item?', '¿Seguro que deseas eliminar este item de inversión? Esta acción no se puede deshacer.', async () => {
    inversion.items = (inversion.items || []).filter(i => i.id !== id);
    try {
      await fbGuardarInversion(inversion);
      renderInversion();
      actualizarDashboardInversion();
      toast('Item eliminado', 'success');
    } catch(e) {
      toast('Error eliminando item', 'error');
    }
  });
}

/**
 * Detecta items de inversión repetidos (misma descripción, monto y categoría) —
 * secuela del bug de doble guardado ya corregido. Conserva el más antiguo de
 * cada grupo y elimina el resto, previa confirmación.
 */
function detectarDuplicadosInversion() {
  const items = inversion.items || [];
  const grupos = {};
  items.forEach(i => {
    const key = `${(i.descripcion||'').trim().toLowerCase()}|${i.monto||0}|${i.categoria||''}`;
    (grupos[key] = grupos[key] || []).push(i);
  });
  const duplicados = Object.values(grupos).filter(grupo => grupo.length > 1);
  if (!duplicados.length) {
    toast('No se encontraron items de inversión duplicados ✓', 'success');
    return;
  }
  let sobrantes = 0, monto = 0;
  duplicados.forEach(grupo => {
    const ordenado = [...grupo].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ordenado.slice(1).forEach(i => { sobrantes++; monto += (i.monto || 0); });
  });
  showConfirm(
    '¿Eliminar items duplicados?',
    `Se encontraron ${duplicados.length} grupo(s) con ${sobrantes} item(s) repetido(s) (misma descripción, monto y categoría) por un total de ${fmt(monto)}. Se conservará el más antiguo de cada grupo. Esta acción no se puede deshacer.`,
    async () => {
      const idsAEliminar = new Set();
      duplicados.forEach(grupo => {
        const ordenado = [...grupo].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        ordenado.slice(1).forEach(i => idsAEliminar.add(i.id));
      });
      inversion.items = items.filter(i => !idsAEliminar.has(i.id));
      try {
        await fbGuardarInversion(inversion);
        renderInversion();
        actualizarDashboardInversion();
        if (typeof renderTrabajos === 'function') renderTrabajos();
        toast(`${idsAEliminar.size} item(s) duplicado(s) eliminado(s) ✓`, 'success');
      } catch(e) {
        toast('Error eliminando duplicados', 'error');
      }
    },
    'Eliminar duplicados'
  );
}

function abrirEditarItemInversion(id) {
  const item = (inversion.items || []).find(i => i.id === id);
  if (!item) return;
  el('einv-id').value          = id;
  el('einv-descripcion').value = item.descripcion || '';
  el('einv-categoria').value   = item.categoria   || 'Otro';
  el('einv-monto').value       = item.monto       || 0;
  el('modal-editar-inv').style.display = 'flex';
  setTimeout(() => el('einv-descripcion')?.focus(), 50);
}

function cerrarEditarItemInversion() {
  el('modal-editar-inv').style.display = 'none';
}

async function guardarEditarItemInversion() {
  const id          = el('einv-id')?.value;
  const descripcion = (el('einv-descripcion')?.value || '').trim();
  const categoria   = el('einv-categoria')?.value || 'Otro';
  const monto       = parseFloat(el('einv-monto')?.value || 0);
  if (!id || !descripcion || !monto) { toast('Completa descripción y monto', 'error'); return; }
  const item = (inversion.items || []).find(i => i.id === id);
  if (!item) return;
  const orig = { descripcion: item.descripcion, categoria: item.categoria, monto: item.monto };
  item.descripcion = descripcion;
  item.categoria   = categoria;
  item.monto       = monto;
  try {
    await fbGuardarInversion(inversion);
    cerrarEditarItemInversion();
    renderInversion();
    actualizarDashboardInversion();
    if (typeof renderTrabajos === 'function') renderTrabajos();
    toast('Item actualizado ✓', 'success');
  } catch(e) {
    Object.assign(item, orig);
    toast('Error guardando cambios', 'error');
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

function eliminarCategoriaPago(idx) {
  if (idx === 0 || idx === categoriasPago.length - 1) return; // no eliminar primera/última
  const nombre = categoriasPago[idx];
  showConfirm('¿Eliminar categoría?', `¿Seguro que deseas eliminar la categoría "${nombre}"?`, async () => {
    categoriasPago.splice(idx, 1);
    try {
      await fbGuardarCategoriasPago(categoriasPago);
      actualizarFiltrosPago();
      toast(`Categoría eliminada ✓`, 'success');
    } catch(e) { toast('Error eliminando', 'error'); }
  });
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
  // Cargar caché local inmediatamente para UI instantánea
  try { const l=localStorage.getItem('trabajos3d');   if(l) trabajos=JSON.parse(l);   } catch(e){}
  try { const l=localStorage.getItem('filamentos3d'); if(l) filamentos=JSON.parse(l); } catch(e){}
  try { const l=localStorage.getItem('clientes3d');   if(l) clientes=JSON.parse(l);  } catch(e){}
  try { const l=localStorage.getItem('catalogoProductos3d'); if(l) catalogoProductos=JSON.parse(l); } catch(e){}
  try { const l=localStorage.getItem('catalogoConfig3d');    if(l) catalogoConfig=JSON.parse(l);    } catch(e){}
  try { const l=localStorage.getItem('categoriasCatalogo3d'); if(l) categoriasProductos=JSON.parse(l); } catch(e){}
  navTo('dashboard');
  cargarConfiguracion();
  iniciarSincronizacion(); // Sincronización en tiempo real
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

  /* 2 — Historial de ventas de Inventario Productos */
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

/* ----------------------------------------------------------
   Badge de trabajos pendientes en la navegación
---------------------------------------------------------- */
function actualizarBadgeNav() {
  const PENDIENTES = ['Aprobado', 'En impresión', 'Post-proceso', 'Listo'];
  const count = trabajos.filter(t => PENDIENTES.includes(t.estado)).length;
  const badge = el('badge-trabajos');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.add('visible');
  } else {
    badge.textContent = '';
    badge.classList.remove('visible');
  }
}

/* ----------------------------------------------------------
   Modal "Usar como base" — copiar parámetros de cotización anterior
---------------------------------------------------------- */
function abrirModalBase() {
  const lista = el('base-lista');
  if (!lista) return;
  const recientes = [...trabajos]
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
    .slice(0, 30);
  if (!recientes.length) {
    lista.innerHTML = '<p style="text-align:center;color:var(--text3);padding:24px">Sin cotizaciones anteriores</p>';
  } else {
    lista.innerHTML = recientes.map(t => `
      <div class="base-item" onclick="usarComoBase('${t.id}')">
        <div class="base-item-info">
          <div class="base-item-pieza">${escHtml(t.pieza || '—')}</div>
          <div class="base-item-sub">${escHtml(t.cliente || '—')} · ${t.fecha || '—'} · ${fmt(t.precio_final || 0)}</div>
        </div>
      </div>`).join('');
  }
  el('modal-base').style.display = 'flex';
}

function cerrarModalBase() {
  const m = el('modal-base');
  if (m) m.style.display = 'none';
}

function usarComoBase(id) {
  const t = trabajos.find(t => t.id === id);
  if (!t) return;
  cerrarModalBase();
  _margenAntesDeManual = null;
  const campos = {
    c_gramos:    t.gramos    || 0,
    c_horas_imp: t.horas_imp || 0,
    c_horas_mo:  t.horas_mo  || 0,
    c_horas_dis: t.horas_dis || 0,
    c_costo_dis: t.costo_dis || 0,
    c_postpro:   t.postpro   || 0,
    c_otros:     t.otros     || 0,
    c_fallos:    t.pFallos   || 5,
    c_margen:    t.pMargen   || 35,
    c_iva:       t.pIVA      || 0,
    c_cantidad:  t.cantidad  || 1,
    c_placas:    t.placas    || 1,
  };
  Object.entries(campos).forEach(([k, v]) => { if (el(k)) el(k).value = v; });
  if (t.material && el('c_material')) el('c_material').value = t.material;
  calcular();
  toast(`Parámetros copiados de "${t.pieza}"`, 'success');
}
