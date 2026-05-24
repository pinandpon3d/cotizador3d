/**
 * CAPA DE INTERFAZ GRÁFICA — ui.js
 *
 * Responsabilidad: renderizado del DOM, notificaciones toast y
 * gestión visual del tema. Sin lógica de negocio ni Firebase.
 *
 * Depende de: helpers el/fmt/set (logic.js),
 *             variables globales trabajos/filamentos/clientes (app.js)
 */

'use strict';

/* ----------------------------------------------------------
   Toast / notificaciones
---------------------------------------------------------- */

function toast(msg, type = 'info', dur = 3500) {
  const container = el('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = {
    success: '<polyline points="20 6 9 17 4 12"/>',
    error:   '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  };
  t.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.info}</svg><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut .25s ease forwards';
    setTimeout(() => t.remove(), 260);
  }, dur);
}

/* ----------------------------------------------------------
   Tema claro / oscuro
---------------------------------------------------------- */

function applyThemeLabels() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const sunIcon  = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  const moonIcon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  const icon  = dark ? sunIcon : moonIcon;
  const label = dark ? 'Modo claro' : 'Modo oscuro';
  const ti  = el('theme-icon');
  const tbi = el('topbar-theme-icon');
  if (ti)  ti.innerHTML  = icon;
  if (tbi) tbi.innerHTML = icon;
  const tl = el('theme-label');
  if (tl) tl.textContent = label;
}

function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('theme', dark ? 'light' : 'dark');
  applyThemeLabels();
}

/* ----------------------------------------------------------
   Escapado HTML
---------------------------------------------------------- */

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ----------------------------------------------------------
   Mapas de colores — estados y pagos
---------------------------------------------------------- */

/** Colores para los 7 estados de pedido */
const ESTADO_COLOR = {
  'Cotizado':     'badge-gray',
  'Aprobado':     'badge-blue',
  'En impresión': 'badge-accent',
  'Post-proceso': 'badge-warn',
  'Listo':        'badge-success',
  'Entregado':    'badge-darkgreen',
  'Cancelado':    'badge-danger'
};

/** Colores para los estados de pago */
const PAGO_COLOR = {
  'Pendiente': 'badge-pago-pendiente',
  'Abono':     'badge-pago-abono',
  'Pagado':    'badge-pago-pagado'
};

/* ----------------------------------------------------------
   Tabla de trabajos
---------------------------------------------------------- */

function renderTrabajos() {
  const search  = el('tr-search')?.value.toLowerCase()  || '';
  const estadoF = el('tr-estado')?.value                || '';
  const catF    = el('tr-categoria')?.value             || '';
  const pagoF   = el('tr-pago')?.value                  || '';

  const list = trabajos.filter(t => {
    const matchSearch = !search  || (t.pieza||'').toLowerCase().includes(search)
                                 || (t.cliente||'').toLowerCase().includes(search);
    const matchEstado = !estadoF || t.estado     === estadoF;
    const matchCat    = !catF    || t.categoria  === catF;
    const matchPago   = !pagoF   || (t.estadoPago||'Pendiente') === pagoF;
    return matchSearch && matchEstado && matchCat && matchPago;
  });

  const hoy = new Date().toISOString().split('T')[0];

  // Estadísticas
  const ESTADOS_POR_COBRAR = ['Aprobado', 'En impresión', 'Post-proceso'];
  const total      = trabajos.length;
  const aprobados  = trabajos.filter(t => t.estado === 'Aprobado').length;
  const entregados = trabajos.filter(t => t.estado === 'Entregado').length;
  const ingresos   = trabajos.filter(t => t.estado === 'Entregado' && t.estado !== 'Cancelado').reduce((s,t) => s + (t.precio_final||0), 0);
  const ganancias  = trabajos.filter(t => t.estado === 'Entregado' && t.estado !== 'Cancelado').reduce((s,t) => s + ((t.precio_final||0) - (t.costo_total||0)), 0);
  const pendPago   = trabajos.filter(t => t.estado !== 'Cancelado' && (t.estadoPago||'Pendiente') !== 'Pagado').length;
  const porCobrar  = trabajos
    .filter(t => ESTADOS_POR_COBRAR.includes(t.estado))
    .reduce((s,t) => s + (t.montoPendiente != null
      ? t.montoPendiente
      : Math.max(0,(t.precio_final||0)-(t.montoAbonado||0))), 0);

  set('st-total',      total);
  set('st-aprobados',  aprobados);
  set('st-entregados', entregados);
  set('st-ingresos',   fmt(ingresos));
  set('st-ganancias',  fmt(ganancias));
  set('st-pend-pago',  pendPago);
  set('st-por-cobrar', fmt(porCobrar));

  // Vista kanban: delegar renderizado y salir
  if (typeof _trabajosVista !== 'undefined' && _trabajosVista === 'kanban') {
    renderKanban(list);
    return;
  }

  const tbody = el('trabajos-tbody');
  if (!tbody) return;
  el('trabajos-empty').style.display = list.length ? 'none'  : 'block';
  el('trabajos-table').style.display = list.length ? 'table' : 'none';

  tbody.innerHTML = list.map(t => {
    const ec        = ESTADO_COLOR[t.estado] || 'badge-gray';
    const pagoClass = PAGO_COLOR[t.estadoPago||'Pendiente'] || 'badge-pago-pendiente';
    const ganObj    = t.ganancia_por_objeto != null
                    ? t.ganancia_por_objeto
                    : ((t.precio_final||0) - (t.costo_total||0)) / Math.max(t.cantidad||1, 1);
    const ganClass  = ganObj >= 0 ? 'color:var(--success)' : 'color:var(--danger)';
    const fechaAct  = t.fechaActualizacionEstado
                    ? t.fechaActualizacionEstado.split('T')[0]
                    : (t.fecha || '—');
    const checked      = (typeof seleccionados !== 'undefined' && seleccionados.has(t.id)) ? 'checked' : '';
    const entregaAlerta = t.fechaEntrega && t.estado !== 'Entregado' && t.estado !== 'Cancelado'
      ? (t.fechaEntrega < hoy ? 'overdue' : t.fechaEntrega === hoy ? 'today' : '')
      : '';
    const trClass = [
      checked ? 'tr-selected' : '',
      entregaAlerta ? `tr-entrega-${entregaAlerta}` : ''
    ].filter(Boolean).join(' ');

    return `<tr class="${trClass}">
      <td class="td-check"><input type="checkbox" class="sel-check" data-id="${t.id}" ${checked} onchange="toggleSeleccion('${t.id}', this)"></td>
      <td class="td-mono">${t.fecha||'—'}</td>
      <td>${escHtml(t.cliente||'')}</td>
      <td>
        <strong>${escHtml(t.pieza||'')}</strong>
        ${t.material ? `<br><span style="font-size:.68rem;color:var(--text3)">${escHtml(t.material)}</span>` : ''}
        ${entregaAlerta === 'overdue' ? `<br><span class="badge-entrega urgente">⚠ Entrega vencida: ${t.fechaEntrega}</span>` : ''}
        ${entregaAlerta === 'today'   ? `<br><span class="badge-entrega hoy">📦 Entrega hoy: ${t.fechaEntrega}</span>` : ''}
      </td>
      <td><span class="badge badge-accent">${escHtml(t.categoria||'')}</span></td>
      <td class="td-mono">${(t.gramos||0).toFixed(1)}g / ${(t.horas_imp||0).toFixed(1)}h</td>
      <td class="td-mono">${fmt(t.costo_total||0)}</td>
      <td class="td-mono"><strong>${fmt(t.precio_final||0)}</strong></td>
      <td class="td-mono"><strong style="${ganClass}">${fmt(ganObj)}</strong></td>
      <td>
        <select class="badge ${ec} estado-select" onchange="cambiarEstado('${t.id}',this.value,this)">
          ${['Cotizado','Aprobado','En impresión','Post-proceso','Listo','Entregado','Cancelado']
            .map(s=>`<option value="${s}"${t.estado===s?' selected':''}>${s}</option>`).join('')}
        </select>
        <div style="font-size:.6rem;color:var(--text3);margin-top:2px">${fechaAct}</div>
      </td>
      <td><span class="badge ${pagoClass}">${t.estadoPago||'Pendiente'}</span></td>
      <td><div class="td-actions">
        ${t.categoria === 'Venta' ? '' : `
        <button class="btn btn-ghost btn-icon btn-sm" title="Copiar WhatsApp"
          onclick='copiarMensajeWA("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Generar PDF"
          onclick='pdfTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar en cotizador"
          onclick='editarEnCotizador("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Actualizar pago"
          onclick='abrirModalEdicion("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Eliminar"
          onclick='eliminarTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
        `}
      </div></td>
    </tr>`;
  }).join('');
}

/* ----------------------------------------------------------
   Tabla de inventario
---------------------------------------------------------- */

function renderInventario() {
  const tbody = el('inv-tbody');
  if (!tbody) return;
  el('inv-empty').style.display = filamentos.length ? 'none'  : 'block';
  el('inv-table').style.display = filamentos.length ? 'table' : 'none';

  tbody.innerHTML = filamentos.map(f => {
    const costoG        = f.peso_rollo > 0 ? (f.precio_rollo / f.peso_rollo) : 0;
    const valorRestante = costoG * f.peso_rollo * f.disponibles;
    return `<tr>
      <td><span class="badge badge-accent">${escHtml(f.tipo||'')}</span></td>
      <td>${escHtml(f.color||'')}</td>
      <td>${escHtml(f.marca||'')}</td>
      <td class="td-mono">${fmt(f.precio_rollo||0)}</td>
      <td class="td-mono">${(f.peso_rollo||0).toLocaleString('es-CR')}g</td>
      <td class="td-mono">${fmt(costoG)}/g</td>
      <td class="td-mono">${(f.disponibles||0).toFixed(1)} rollos</td>
      <td class="td-mono">${fmt(valorRestante)}</td>
      <td>${escHtml(f.proveedor||'—')}</td>
      <td class="td-mono">${f.fecha_compra||'—'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick='editarFilamento("${f.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick='eliminarFilamento("${f.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ----------------------------------------------------------
   Tabla de clientes
---------------------------------------------------------- */

function renderClientes(lista) {
  const search = el('cl-search')?.value.toLowerCase() || '';
  const filtered = (lista||[]).filter(c =>
    !search ||
    (c.nombre||'').toLowerCase().includes(search) ||
    (c.telefono||'').includes(search) ||
    (c.correo||'').toLowerCase().includes(search)
  );

  const tbody = el('clientes-tbody');
  if (!tbody) return;
  el('clientes-empty').style.display = filtered.length ? 'none'  : 'block';
  el('clientes-table').style.display = filtered.length ? 'table' : 'none';

  tbody.innerHTML = filtered.map(c => {
    const inicial = (c.nombre||'?').charAt(0).toUpperCase();
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="client-avatar" style="width:34px;height:34px;font-size:.8rem">${inicial}</div>
          <div>
            <div style="font-weight:600;font-size:.85rem">${escHtml(c.nombre||'')}</div>
            ${c.instagram ? `<div style="font-size:.7rem;color:var(--text3)">@${escHtml(c.instagram)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${c.telefono ? `<a href="tel:${escHtml(c.telefono)}" style="color:var(--accent)">${escHtml(c.telefono)}</a>` : '—'}</td>
      <td style="font-size:.8rem">${escHtml(c.correo||'—')}</td>
      <td class="td-mono" style="text-align:center">${c.totalPedidos||0}</td>
      <td class="td-mono">${fmt(c.totalComprado||0)}</td>
      <td style="font-size:.78rem;color:var(--text2);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.notas||'—')}</td>
      <td><div class="td-actions">
        ${c.telefono ? `
        <button class="btn btn-ghost btn-icon btn-sm" title="Abrir WhatsApp"
          onclick="abrirWhatsAppCliente('${escHtml(c.telefono)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </button>` : ''}
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick='editarCliente("${c.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick='eliminarCliente("${c.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ----------------------------------------------------------
   Dashboard con Chart.js
---------------------------------------------------------- */

let _chartEstados  = null;
let _chartIngresos = null;

function renderDashboard(filtro = 'mes-actual') {
  const ahora = new Date();
  const anio  = ahora.getFullYear();
  const mes   = ahora.getMonth(); // 0-indexed

  // Filtrar trabajos según selección
  let lista = trabajos;
  if (filtro === 'mes-actual') {
    lista = trabajos.filter(t => {
      if (!t.fecha) return false;
      const d = new Date(t.fecha + 'T12:00:00');
      return d.getFullYear() === anio && d.getMonth() === mes;
    });
  } else if (filtro === 'mes-anterior') {
    const mesAnt  = mes === 0 ? 11 : mes - 1;
    const anioAnt = mes === 0 ? anio - 1 : anio;
    lista = trabajos.filter(t => {
      if (!t.fecha) return false;
      const d = new Date(t.fecha + 'T12:00:00');
      return d.getFullYear() === anioAnt && d.getMonth() === mesAnt;
    });
  }

  // Calcular KPIs
  const entregados  = lista.filter(t => t.estado === 'Entregado');
  const ventasMes   = entregados.reduce((s,t) => s + (t.precio_final||0), 0);
  const gananciaMes = entregados.reduce((s,t) => s + ((t.precio_final||0) - (t.costo_total||0)), 0);
  const pendPago    = lista.filter(t => (t.estadoPago||'Pendiente') !== 'Pagado').length;

  const countByEstado = {};
  ['Cotizado','Aprobado','En impresión','Post-proceso','Listo','Entregado','Cancelado']
    .forEach(e => { countByEstado[e] = lista.filter(t => t.estado === e).length; });

  // Material más usado
  const matCount = {};
  lista.forEach(t => {
    const m = (t.material||t.categoria||'N/A').trim();
    if (m) matCount[m] = (matCount[m]||0) + 1;
  });
  const matTop     = Object.entries(matCount).sort((a,b) => b[1]-a[1])[0];
  const materialTop = matTop ? `${matTop[0]} (${matTop[1]})` : '—';

  // Cliente con más pedidos
  const clientCount = {};
  lista.forEach(t => {
    const c = (t.cliente||'Desconocido').trim();
    clientCount[c] = (clientCount[c]||0) + 1;
  });
  const clientTop  = Object.entries(clientCount).sort((a,b) => b[1]-a[1])[0];
  const clienteTop = clientTop ? `${clientTop[0]} (${clientTop[1]})` : '—';

  // Monto por cobrar y entregas urgentes
  const ESTADOS_POR_COBRAR_DASH = ['Aprobado', 'En impresión', 'Post-proceso'];
  const montoPorCobrar = lista
    .filter(t => ESTADOS_POR_COBRAR_DASH.includes(t.estado))
    .reduce((s,t) => s + (t.montoPendiente != null
      ? t.montoPendiente
      : Math.max(0,(t.precio_final||0)-(t.montoAbonado||0))), 0);
  const hoyDash = new Date().toISOString().split('T')[0];
  const urgentes = lista.filter(t =>
    t.fechaEntrega && t.fechaEntrega <= hoyDash &&
    t.estado !== 'Entregado' && t.estado !== 'Cancelado'
  ).length;

  // Actualizar DOM
  set('dash-ventas',       fmt(ventasMes));
  set('dash-ganancia',     fmt(gananciaMes));
  set('dash-total-lista',  lista.length);
  set('dash-monto-cobrar', fmt(montoPorCobrar));
  set('dash-urgentes',     urgentes);
  set('dash-cotizados',    countByEstado['Cotizado']     || 0);
  set('dash-aprobados',    countByEstado['Aprobado']     || 0);
  set('dash-enimpresion',  (countByEstado['En impresión']||0) + (countByEstado['Post-proceso']||0));
  set('dash-listos',       countByEstado['Listo']        || 0);
  set('dash-entregados',   countByEstado['Entregado']    || 0);
  set('dash-cancelados',   countByEstado['Cancelado']    || 0);
  set('dash-pend-pago',    pendPago);
  set('dash-material',     materialTop);
  set('dash-cliente',      clienteTop);

  // Mostrar/ocultar sección de gráficos
  const sinDatos    = lista.length === 0;
  const sinDatosEl  = el('dash-sin-datos');
  const dashCharts  = el('dash-charts');
  if (sinDatosEl) sinDatosEl.style.display = sinDatos ? 'block' : 'none';
  if (dashCharts) dashCharts.style.display = sinDatos ? 'none'  : 'block';

  if (!sinDatos) _renderCharts(lista, countByEstado, anio, mes);
}

function _renderCharts(lista, countByEstado, anio, mes) {
  if (typeof Chart === 'undefined') return;

  // Colores de estado
  const estadoColors = {
    'Cotizado':    '#9ca3af', 'Aprobado':     '#2563eb',
    'En impresión':'#7c3aed', 'Post-proceso': '#d97706',
    'Listo':       '#059669', 'Entregado':    '#047857',
    'Cancelado':   '#dc2626'
  };

  // — Gráfico 1: Donut de estados —
  const ctxE = el('chart-estados');
  if (ctxE) {
    if (_chartEstados) { _chartEstados.destroy(); _chartEstados = null; }
    const labels = Object.keys(countByEstado).filter(k => countByEstado[k] > 0);
    const vals   = labels.map(k => countByEstado[k]);
    _chartEstados = new Chart(ctxE, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: labels.map(l => estadoColors[l] || '#9ca3af'),
          borderWidth: 2,
          borderColor: 'transparent'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position:'right', labels:{ font:{size:11}, boxWidth:12, padding:10 } }
        }
      }
    });
  }

  // — Gráfico 2: Barras de ingresos últimos 6 meses —
  const ctxI = el('chart-ingresos');
  if (ctxI) {
    if (_chartIngresos) { _chartIngresos.destroy(); _chartIngresos = null; }
    const meses = [], ingresosPorMes = [];
    for (let i = 5; i >= 0; i--) {
      let m = mes - i, a = anio;
      if (m < 0) { m += 12; a -= 1; }
      const key   = `${a}-${String(m+1).padStart(2,'0')}`;
      const label = new Date(a, m, 1).toLocaleDateString('es-CR', { month:'short', year:'2-digit' });
      meses.push(label);
      const ing = trabajos
        .filter(t => t.estado === 'Entregado' && (t.fecha||'').startsWith(key))
        .reduce((s,t) => s + (t.precio_final||0), 0);
      ingresosPorMes.push(ing);
    }
    _chartIngresos = new Chart(ctxI, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [{
          label: 'Ingresos (₡)',
          data: ingresosPorMes,
          backgroundColor: 'rgba(124,58,237,.72)',
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{ display:false } },
        scales: {
          y: {
            ticks: { callback: v => '₡'+(v/1000).toFixed(0)+'K', font:{size:10} },
            grid: { color:'rgba(0,0,0,.05)' }
          },
          x: { ticks:{ font:{size:10} }, grid:{ display:false } }
        }
      }
    });
  }
}

/* ----------------------------------------------------------
   Venta al Detalle — render de lotes
---------------------------------------------------------- */
function renderVentaDetalle(lotes) {
  const grid    = el('detalle-grid');
  const emptyEl = el('detalle-empty');
  if (!grid) return;

  // Ocultar cancelados y agotados
  const activos = (lotes || []).filter(l =>
    l.estado !== 'Cancelado' &&
    (l.unidadesVendidas || 0) < Math.max(l.cantidad || 1, 1)
  );

  if (!activos.length) {
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  grid.innerHTML = activos.map(l => {
    const total      = Math.max(l.cantidad || 1, 1);
    const vendidas   = Math.min(l.unidadesVendidas || 0, total);
    const disponibles = total - vendidas;
    const pct        = Math.round((vendidas / total) * 100);
    const precioUnit = l.precio_unitario || 0;
    const recaudado  = vendidas * precioUnit;
    const potencial  = total   * precioUnit;
    const agotado    = disponibles === 0;

    const histItems = (l.historialVentas || [])
      .slice()
      .reverse()
      .map(v => `
        <div class="vd-hist-item">
          <span class="vd-hist-fecha">${(v.fecha||'').split('T')[0] || '—'}</span>
          <span class="vd-hist-cant">×${v.cantidad}</span>
          ${v.nota ? `<span class="vd-hist-nota">${escHtml(v.nota)}</span>` : ''}
        </div>
      `).join('');

    const histLen = (l.historialVentas || []).length;

    return `
    <div class="vd-card${agotado ? ' vd-agotado' : ''}">

      <div class="vd-header">
        <div>
          <div class="vd-nombre">${escHtml(l.pieza || '—')}</div>
          <div class="vd-meta">
            <span class="badge badge-gray">${escHtml(l.categoria || 'General')}</span>
            ${l.material ? `<span style="font-size:.74rem;color:var(--text2)">${escHtml(l.material)}</span>` : ''}
            ${l.fecha    ? `<span style="font-size:.74rem;color:var(--text2)">${l.fecha}</span>` : ''}
          </div>
        </div>
        ${agotado
          ? `<span class="badge badge-success" style="align-self:flex-start;white-space:nowrap">Agotado ✓</span>`
          : `<span class="badge badge-accent"  style="align-self:flex-start;white-space:nowrap">${disponibles} disp.</span>`}
      </div>

      <!-- Barra de progreso -->
      <div class="vd-progress-wrap">
        <div class="vd-progress-bar">
          <div class="vd-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="vd-progress-labels">
          <span>${vendidas} vendida${vendidas !== 1 ? 's' : ''}</span>
          <span>${pct}% de ${total}</span>
        </div>
      </div>

      <!-- Stats -->
      <div class="vd-stats">
        <div class="vd-stat">
          <div class="vd-stat-lbl">Precio unitario</div>
          <div class="vd-stat-val">₡${precioUnit.toLocaleString('es-CR')}</div>
        </div>
        <div class="vd-stat">
          <div class="vd-stat-lbl">Recaudado</div>
          <div class="vd-stat-val vd-stat-green">₡${recaudado.toLocaleString('es-CR')}</div>
        </div>
        <div class="vd-stat">
          <div class="vd-stat-lbl">Potencial total</div>
          <div class="vd-stat-val">₡${potencial.toLocaleString('es-CR')}</div>
        </div>
        <div class="vd-stat">
          <div class="vd-stat-lbl">Disponibles</div>
          <div class="vd-stat-val${agotado ? ' vd-stat-gray' : ''}">${disponibles}</div>
        </div>
      </div>

      <!-- Acción -->
      ${agotado
        ? `<div style="text-align:center;font-size:.8rem;color:var(--text2);padding:4px 0">✓ Todas las unidades vendidas</div>`
        : `<button class="btn btn-primary btn-sm" style="width:100%" onclick="abrirModalVenta('${l.id}')">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
             Registrar venta
           </button>`}

      <!-- Historial -->
      ${histLen > 0 ? `
      <div class="vd-hist">
        <div class="vd-hist-title">Historial (${histLen} transacción${histLen !== 1 ? 'es' : ''})</div>
        <div class="vd-hist-list">${histItems}</div>
      </div>` : ''}

    </div>`;
  }).join('');
}

/* ----------------------------------------------------------
   Vista Kanban de Trabajos
---------------------------------------------------------- */

const KANBAN_KEY = {
  'Cotizado':     'Cotizado',
  'Aprobado':     'Aprobado',
  'En impresión': 'EnImpresion',
  'Post-proceso': 'PostProceso',
  'Listo':        'Listo',
  'Entregado':    'Entregado',
  'Cancelado':    'Cancelado'
};

function renderKanban(list) {
  const items = list || trabajos;
  Object.entries(KANBAN_KEY).forEach(([estado, key]) => {
    const body = el('kb-' + key);
    const cnt  = el('kc-' + key);
    if (!body) return;
    const cards = items.filter(t => t.estado === estado);
    if (cnt) cnt.textContent = cards.length;
    body.innerHTML = cards.length
      ? cards.map(t => renderKanbanCard(t)).join('')
      : `<div class="kc-empty">Sin trabajos</div>`;
  });
}

function renderKanbanCard(t) {
  const pagoClass    = PAGO_COLOR[t.estadoPago || 'Pendiente'] || 'badge-pago-pendiente';
  const hoyKc        = new Date().toISOString().split('T')[0];
  const entregaAlerta = t.fechaEntrega && t.estado !== 'Entregado' && t.estado !== 'Cancelado'
    ? (t.fechaEntrega < hoyKc ? 'overdue' : t.fechaEntrega === hoyKc ? 'today' : '')
    : '';
  const entregaLabel = entregaAlerta === 'overdue' ? '⚠ Vencida'
                     : entregaAlerta === 'today'   ? '📦 Hoy'
                     : '📅';
  const entrega   = t.fechaEntrega
    ? `<span class="kc-entrega${entregaAlerta ? ' '+entregaAlerta : ''}">${entregaLabel} ${t.fechaEntrega}</span>` : '';
  const cardClass = entregaAlerta ? ` kc-urgente-${entregaAlerta}` : '';
  return `<div class="kanban-card${cardClass}">
    <div class="kc-top">
      <div class="kc-pieza">${escHtml(t.pieza || '—')}</div>
      <div class="kc-cliente">${escHtml(t.cliente || '')}</div>
      ${t.material ? `<div class="kc-material">${escHtml(t.material)}</div>` : ''}
    </div>
    <div class="kc-mid">
      <span class="badge ${pagoClass}" style="font-size:.66rem;padding:2px 7px">${t.estadoPago || 'Pendiente'}</span>
      <span class="kc-precio">${fmt(t.precio_final || 0)}</span>
    </div>
    <div class="kc-bot">
      <span class="kc-fecha">${t.fecha || '—'}</span>
      ${entrega}
    </div>
    <div class="kc-actions">
      <button class="btn btn-ghost btn-icon btn-sm" title="Generar PDF" onclick='pdfTrabajo("${t.id}")'>
        <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </button>
      <button class="btn btn-ghost btn-icon btn-sm" title="Editar en cotizador" onclick='editarEnCotizador("${t.id}")'>
        <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn btn-ghost btn-icon btn-sm" title="Actualizar pago" onclick='abrirModalEdicion("${t.id}")'>
        <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      </button>
      <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick='eliminarTrabajo("${t.id}")'>
        <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  </div>`;
}
