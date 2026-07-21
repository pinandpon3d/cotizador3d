/**
 * Cotizaciones/Trabajos: guardar, sincronización en tiempo real, cargar, cambiar estado, eliminar, descuento automático de insumos.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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

