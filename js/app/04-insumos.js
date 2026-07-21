/**
 * Insumos (filamentos/materiales): CRUD e integración con el cotizador.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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

