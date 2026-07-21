/**
 * Categorías de pago, calendario de producción, exportación completa a CSV y utilidades finales de inicialización.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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
