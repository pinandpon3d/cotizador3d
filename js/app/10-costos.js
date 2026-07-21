/**
 * Gestión de Costos operativos e inversión inicial.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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

