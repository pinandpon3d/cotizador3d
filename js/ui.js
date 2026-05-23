/**
 * CAPA DE INTERFAZ GRÁFICA — ui.js
 *
 * Responsabilidad: renderizado del DOM, notificaciones toast y
 * gestión visual del tema. Sin lógica de negocio ni Firebase.
 *
 * Depende de: helpers el/fmt/set (logic.js),
 *             variables globales trabajos/filamentos (app.js)
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
   Tabla de trabajos
---------------------------------------------------------- */

function renderTrabajos() {
  const search  = el('tr-search')?.value.toLowerCase()  || '';
  const estadoF = el('tr-estado')?.value                || '';
  const catF    = el('tr-categoria')?.value             || '';

  const list = trabajos.filter(t => {
    const matchSearch = !search  || (t.pieza||'').toLowerCase().includes(search) || (t.cliente||'').toLowerCase().includes(search);
    const matchEstado = !estadoF || t.estado    === estadoF;
    const matchCat    = !catF    || t.categoria === catF;
    return matchSearch && matchEstado && matchCat;
  });

  const total      = trabajos.length;
  const aprobados  = trabajos.filter(t => t.estado === 'Aprobado').length;
  const entregados = trabajos.filter(t => t.estado === 'Entregado').length;
  const ingresos   = trabajos.filter(t => t.estado === 'Entregado').reduce((s,t) => s + (t.precio_final||0), 0);
  const ganancias  = trabajos.filter(t => t.estado === 'Entregado').reduce((s,t) => s + ((t.precio_final||0) - (t.costo_total||0)), 0);
  set('st-total', total); set('st-aprobados', aprobados);
  set('st-entregados', entregados); set('st-ingresos', fmt(ingresos));
  set('st-ganancias', fmt(ganancias));

  const tbody = el('trabajos-tbody');
  if (!tbody) return;
  el('trabajos-empty').style.display = list.length ? 'none'  : 'block';
  el('trabajos-table').style.display = list.length ? 'table' : 'none';

  const colorMap = { Cotizado:'badge-gray', Aprobado:'badge-accent', 'En producción':'badge-warn', Entregado:'badge-success', Cancelado:'badge-danger' };

  tbody.innerHTML = list.map(t => {
    const ec       = colorMap[t.estado] || 'badge-gray';
    const placas   = Math.max(t.placas || 1, 1);
    const ganTotal = (t.precio_final||0) - (t.costo_total||0);
    const ganPlaca = ganTotal / placas;
    const ganClass = ganPlaca >= 0 ? 'color:var(--success,#10b981)' : 'color:var(--danger)';
    const placasSub = placas > 1 ? `<br><span style="font-size:.65rem;color:var(--text3);font-weight:400">${placas} placas</span>` : '';
    return `<tr>
      <td class="td-mono">${t.fecha||'—'}</td>
      <td>${escHtml(t.cliente||'')}</td>
      <td><strong>${escHtml(t.pieza||'')}</strong></td>
      <td><span class="badge badge-accent">${escHtml(t.categoria||'')}</span></td>
      <td class="td-mono">${(t.gramos||0).toFixed(1)}g / ${(t.horas_imp||0).toFixed(1)}h</td>
      <td class="td-mono">${fmt(t.costo_total||0)}</td>
      <td class="td-mono"><strong>${fmt(t.precio_final||0)}</strong></td>
      <td class="td-mono"><strong style="${ganClass}">${fmt(ganPlaca)}</strong>${placasSub}</td>
      <td><select class="badge ${ec} estado-select" onchange="cambiarEstado('${t.id}',this.value,this)">
        ${['Cotizado','Aprobado','En producción','Entregado','Cancelado'].map(s=>`<option value="${s}"${t.estado===s?' selected':''}>${s}</option>`).join('')}
      </select></td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon btn-sm" title="Ver" onclick='verTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="PDF" onclick='pdfTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick='editarTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick='eliminarTrabajo("${t.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
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
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick='eliminarFilamento("${f.id}")'>
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}
