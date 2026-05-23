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
let _dashFiltro = 'mes-actual';

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
  clientes:     'Clientes'
};

function navTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg  = el('page-' + page); if (pg)  pg.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`); if (nav) nav.classList.add('active');
  set('breadcrumb-current', PAGE_LABELS[page] || page);
  if (page === 'trabajos')      cargarTrabajos();
  if (page === 'inventario')    cargarInventario();
  if (page === 'configuracion') { calcCfg(); actualizarUIUsuario && actualizarUIUsuario(); }
  if (page === 'usuarios')      { if (typeof cargarUsuarios === 'function') cargarUsuarios(); }
  if (page === 'dashboard')     cargarDashboard();
  if (page === 'clientes')      cargarClientes();
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

  const idx = trabajos.findIndex(t => t.id === id);
  if (idx >= 0) trabajos[idx] = data; else trabajos.unshift(data);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}

  fbGuardarCotizacion(data)
    .then(() => {})
    .catch(e => { console.error('Firebase error al guardar:', e); });

  if (editingId) {
    editingId = null; el('edit-banner').style.display = 'none';
    toast('Cotización actualizada correctamente ✓', 'success');
  } else {
    toast('Trabajo guardado correctamente ✓', 'success');
  }
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
function abrirModalEdicion(id) {
  const t = trabajos.find(t=>t.id===id); if(!t) return;
  const sv = (k,v) => { const e=el(k); if(e) e.value = v ?? ''; };
  sv('m_id',           id);
  sv('m_pieza',        t.pieza);
  sv('m_cliente',      t.cliente);
  sv('m_categoria',    t.categoria || 'Funcional');
  sv('m_material',     t.material  || '');
  sv('m_gramos',       t.gramos    || 0);
  sv('m_horas_imp',    t.horas_imp || 0);
  sv('m_costo_total',  t.costo_total  || 0);
  sv('m_precio_final', t.precio_final || 0);
  sv('m_estado',       t.estado    || 'Cotizado');
  sv('m_notas',        t.notas     || '');
  sv('m_fecha_entrega',t.fechaEntrega || '');
  // m_estadoPago es un span, no un input
  const epEl = el('m_estadoPago'); if (epEl) epEl.textContent = t.estadoPago || 'Pendiente';
  sv('m_monto_abonado',t.montoAbonado || 0);
  sv('m_metodo_pago',  t.metodoPago   || '');
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

async function guardarModalEdicion() {
  const id = el('m_id')?.value; if(!id) return;
  const t  = trabajos.find(t=>t.id===id); if(!t) return;

  const precioFinal  = parseFloat(el('m_precio_final')?.value)  || 0;
  const montoAbonado = parseFloat(el('m_monto_abonado')?.value) || 0;

  const updates = {
    pieza:         el('m_pieza')?.value.trim()    || t.pieza,
    cliente:       el('m_cliente')?.value.trim()  || t.cliente,
    categoria:     el('m_categoria')?.value       || t.categoria,
    material:      el('m_material')?.value.trim() || '',
    gramos:        parseFloat(el('m_gramos')?.value)    || 0,
    horas_imp:     parseFloat(el('m_horas_imp')?.value) || 0,
    costo_total:   parseFloat(el('m_costo_total')?.value) || 0,
    precio_final:  precioFinal,
    estado:        el('m_estado')?.value     || 'Cotizado',
    notas:         el('m_notas')?.value      || '',
    fechaEntrega:  el('m_fecha_entrega')?.value || '',
    estadoPago:    calcEstadoPago(precioFinal, montoAbonado),
    montoAbonado,
    montoPendiente: Math.max(0, precioFinal - montoAbonado),
    metodoPago:    el('m_metodo_pago')?.value || 'Efectivo',
    fechaActualizacionEstado: new Date().toISOString()
  };

  Object.assign(t, updates);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}

  try {
    await db.collection('cotizaciones').doc(String(id)).update(updates);
    toast('Trabajo actualizado correctamente ✓', 'success');
  } catch(e) {
    console.error('Error al actualizar:', e);
    toast('No se pudo actualizar el trabajo', 'error');
  }

  cerrarModalEdicion();
  renderTrabajos();
}

/* Compatibilidad con botones antiguos que usan editarTrabajo */
function editarTrabajo(id)  { abrirModalEdicion(id); }
function verTrabajo(id)     { abrirModalEdicion(id); }

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
    id:           editingId || 'BORRADOR',
    pieza, cliente,
    fecha:        el('c_fecha').value,
    fechaEntrega: el('c_fecha_entrega')?.value || '',
    cantidad:     fv('c_cantidad'),
    placas:       fv('c_placas'),
    categoria:    el('c_categoria').value,
    material:     el('c_material')?.value || '',
    notas:        el('c_notas').value,
    gramos:       fv('c_gramos'),
    horas_imp:    fv('c_horas_imp'),
    pIVA:         fv('c_iva'),
    costo_total:  desglose.costoTotalPlacas,
    precio_final: desglose.precioTotal,
    precio_unitario: desglose.precioRedondeado,
    _desglose:    desglose
  });
}

function generarPDFData(t) {
  const emp          = getEmpresa();
  const d            = t._desglose || {};
  const pIVA         = t.pIVA || 0;
  const antesIVA     = d.antesIVA    || t.precio_final || 0;
  const ivaVal       = d.ivaVal      || 0;
  const precioFinal  = t.precio_final || 0;
  const ref          = String(t.id).toUpperCase().slice(0,10);
  const cantidad     = Math.max(t.cantidad||1,1);
  const placas       = Math.max(t.placas||1,1);
  const precioUnit   = t.precio_unitario || (Math.round((precioFinal/cantidad)/100)*100);
  const win = window.open('','_blank');
  if (!win) { toast('Permita ventanas emergentes','error'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Cotización — ${escHtml(t.pieza||'')} — ${escHtml(t.cliente||'')}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;font-size:13px;color:#1a1a2e;background:#fff}
.page{max-width:780px;margin:0 auto;padding:40px 48px;min-height:100vh;display:flex;flex-direction:column}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #ede9fe}
.brand-name{font-size:1.4rem;font-weight:700;color:#7c3aed}
.brand-sub{font-size:.75rem;color:#6b7280;margin-top:2px}
.doc-type h1{font-size:1.5rem;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em;text-align:right}
.ref{font-size:.78rem;color:#6b7280;font-family:monospace;text-align:right}
.meta{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:22px;background:#f8f9fc;border-radius:10px;padding:14px 18px}
.meta-block{display:flex;flex-direction:column;gap:3px}
.meta-label{font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af}
.meta-value{font-size:.84rem;font-weight:600;color:#111827}
table{width:100%;border-collapse:collapse;margin-bottom:18px}
thead{background:#7c3aed}
thead th{padding:9px 12px;text-align:left;color:#fff;font-size:.72rem;font-weight:600;text-transform:uppercase}
tbody tr:nth-child(even){background:#f9f9fd}
tbody td{padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:.8rem}
.badge-cat{display:inline-flex;padding:2px 8px;background:#ede9fe;color:#7c3aed;border-radius:20px;font-size:.65rem;font-weight:600}
.td-mono{font-family:monospace}
.totals-wrap{display:flex;justify-content:flex-end;margin-bottom:22px}
.totals{width:280px;background:#f8f9fc;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
.totals-row{display:flex;justify-content:space-between;padding:7px 14px;font-size:.8rem;color:#374151}
.totals-row.iva{color:#d97706;font-size:.76rem}
.totals-row.hi{background:#ede9fe;font-weight:600;color:#7c3aed}
.totals-row.final{background:#7c3aed;color:#fff;padding:12px 14px;font-size:.92rem;font-weight:700}
.totals-row .val{font-family:monospace;font-weight:600}
.conds{background:#f0fdf4;border-left:3px solid #059669;border-radius:5px;padding:12px 16px;margin-bottom:18px;font-size:.76rem;color:#374151}
.conds-title{font-size:.65rem;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:6px}
.conds ul{margin-left:14px} .conds li{margin-bottom:3px;line-height:1.5}
.notes-box{background:#fff9e6;border-left:3px solid #d97706;border-radius:5px;padding:12px 16px;margin-bottom:18px;font-size:.78rem;color:#374151}
.sig-block{text-align:center;width:200px;margin:24px 0 18px auto}
.sig-line{border-top:1px solid #d1d5db;padding-top:8px;font-size:.7rem;color:#6b7280}
footer{margin-top:auto;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:.7rem;color:#9ca3af}
.print-btn{position:fixed;top:16px;right:16px;padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer}
@media print{.print-btn{display:none}@page{margin:0;size:A4}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${escHtml(emp.nombre)}</div>
      ${emp.cedula?`<div class="brand-sub">Cédula: ${escHtml(emp.cedula)}</div>`:''}
      ${emp.web   ?`<div class="brand-sub">🌐 ${escHtml(emp.web)}</div>`:''}
      ${emp.email ?`<div class="brand-sub">✉ ${escHtml(emp.email)}</div>`:''}
      ${emp.tel   ?`<div class="brand-sub">📞 ${escHtml(emp.tel)}</div>`:''}
    </div>
    <div>
      <div class="doc-type"><h1>Cotización</h1></div>
      <div class="ref">REF: ${ref}</div>
      <div class="ref">Fecha: ${t.fecha||'—'}</div>
      ${t.fechaEntrega?`<div class="ref">Entrega estimada: ${t.fechaEntrega}</div>`:''}
    </div>
  </div>
  <div class="meta">
    <div class="meta-block"><div class="meta-label">Cliente</div><div class="meta-value">${escHtml(t.cliente||'—')}</div></div>
    <div class="meta-block"><div class="meta-label">Pieza</div><div class="meta-value">${escHtml(t.pieza||'—')}</div></div>
    <div class="meta-block"><div class="meta-label">Material</div><div class="meta-value">${escHtml(t.material||'—')}</div></div>
    <div class="meta-block"><div class="meta-label">Cantidad</div><div class="meta-value">${cantidad} obj · ${placas} placa${placas!==1?'s':''}</div></div>
    <div class="meta-block"><div class="meta-label">Estado</div><div class="meta-value">${escHtml(t.estado||'Cotizado')}</div></div>
  </div>
  <table>
    <thead><tr><th>Descripción</th><th>Gramos</th><th>Horas imp.</th><th>Cant.</th><th>Precio unitario</th><th>Total</th></tr></thead>
    <tbody><tr>
      <td><strong>${escHtml(t.pieza||'—')}</strong><br>
        <span class="badge-cat">${escHtml(t.categoria||'—')}</span>
        ${t.notas?`<br><span style="color:#6b7280;font-size:.7rem;font-style:italic">${escHtml(t.notas)}</span>`:''}
      </td>
      <td class="td-mono">${(t.gramos||0).toFixed(1)}g</td>
      <td class="td-mono">${(t.horas_imp||0).toFixed(1)}h</td>
      <td class="td-mono">${cantidad}</td>
      <td class="td-mono"><strong>₡${precioUnit.toLocaleString('es-CR')}</strong></td>
      <td class="td-mono">₡${precioFinal.toLocaleString('es-CR')}</td>
    </tr></tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="totals-row"><span>Costo de producción</span><span class="val">₡${(t.costo_total||0).toLocaleString('es-CR')}</span></div>
    <div class="totals-row"><span>Precio antes de IVA</span><span class="val">₡${antesIVA.toLocaleString('es-CR')}</span></div>
    ${pIVA>0?`<div class="totals-row iva"><span>IVA (${pIVA}%)</span><span class="val">₡${ivaVal.toLocaleString('es-CR')}</span></div>`:''}
    <div class="totals-row hi"><span>Precio por objeto</span><span class="val">₡${precioUnit.toLocaleString('es-CR')}</span></div>
    <div class="totals-row final"><span>PRECIO TOTAL</span><span class="val">₡${precioFinal.toLocaleString('es-CR')}</span></div>
  </div></div>
  ${t.notas?`<div class="notes-box"><div class="conds-title">Notas del trabajo</div>${escHtml(t.notas)}</div>`:''}
  <div class="conds">
    <div class="conds-title">Condiciones de la cotización</div>
    <ul>
      <li>La cotización puede variar si cambian las características del modelo.</li>
      <li>El tiempo de entrega depende de la carga de trabajo y complejidad de la pieza.</li>
      <li>Se puede solicitar un abono para iniciar el trabajo.</li>
      <li>Los colores y acabados pueden variar ligeramente según el material disponible.</li>
    </ul>
  </div>
  ${emp.nota?`<div class="notes-box"><div class="conds-title">Nota adicional</div>${escHtml(emp.nota)}</div>`:''}
  <div class="sig-block"><div style="height:40px"></div><div class="sig-line">Firma autorizada</div></div>
  <footer>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${emp.tel  ?`<span>📞 ${escHtml(emp.tel)}</span>`:''}
      ${emp.email?`<span>✉ ${escHtml(emp.email)}</span>`:''}
      ${emp.web  ?`<span>🌐 ${escHtml(emp.web)}</span>`:''}
    </div>
    <div>Generado con Cotizador 3D CR · ${new Date().toLocaleDateString('es-CR')}</div>
  </footer>
</div></body></html>`);
  win.document.close();
  toast('PDF generado correctamente ✓', 'success');
}

/* ----------------------------------------------------------
   Inicialización básica (antes de autenticar)
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  applyThemeLabels();
  if (el('c_fecha'))   el('c_fecha').value   = today();
  if (el('inv_fecha')) el('inv_fecha').value = today();
  cargarCfgLocal();
  calcCfg();
  calcular();
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
  navTo('cotizador');
  cargarConfiguracion();
}
