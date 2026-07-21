/**
 * Inventario Productos (ventas al detalle, reabastecimiento) y Pedidos Online de la tienda.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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

