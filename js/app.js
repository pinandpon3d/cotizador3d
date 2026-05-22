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
let editingId  = null;

/* ----------------------------------------------------------
   Navegación
---------------------------------------------------------- */
const PAGE_LABELS = { cotizador:'Cotizador', trabajos:'Trabajos', inventario:'Inventario', configuracion:'Configuración' };

function navTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg  = el('page-' + page); if (pg)  pg.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`); if (nav) nav.classList.add('active');
  set('breadcrumb-current', PAGE_LABELS[page] || page);
  if (page === 'trabajos')      cargarTrabajos();
  if (page === 'inventario')    cargarInventario();
  if (page === 'configuracion') calcCfg();
  closeSidebar();
}

function openSidebar()  { el('sidebar').classList.add('open');    el('overlay').classList.add('show'); }
function closeSidebar() { el('sidebar').classList.remove('open'); el('overlay').classList.remove('show'); }

/* ----------------------------------------------------------
   Cotizaciones — Guardar
---------------------------------------------------------- */
function guardarCotizacion() {
  const pieza   = el('c_pieza').value.trim();
  const cliente = el('c_cliente').value.trim();
  if (!pieza)   { toast('Ingrese el nombre de la pieza',  'error'); return; }
  if (!cliente) { toast('Ingrese el nombre del cliente',  'error'); return; }

  const desglose = calcular();
  const id = editingId || genId();
  const data = {
    id, pieza, cliente,
    fecha:     el('c_fecha').value,
    cantidad:  fv('c_cantidad'),
    categoria: el('c_categoria').value,
    notas:     el('c_notas').value,
    gramos:    fv('c_gramos'),   horas_imp: fv('c_horas_imp'),
    horas_mo:  fv('c_horas_mo'), horas_dis: fv('c_horas_dis'),
    costo_dis: fv('c_costo_dis'),postpro:   fv('c_postpro'),
    otros:     fv('c_otros'),    pFallos:   fv('c_fallos'),
    pMargen:   fv('c_margen'),   pIVA:      fv('c_iva'),
    costo_total:  desglose.costoFallos,
    precio_final: desglose.precioRedondeado,
    estado: editingId ? (trabajos.find(t=>t.id===editingId)?.estado || 'Cotizado') : 'Cotizado',
    _desglose: desglose
  };

  const idx = trabajos.findIndex(t => t.id === id);
  if (idx >= 0) trabajos[idx] = data; else trabajos.unshift(data);
  try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos.map(t => { const {_desglose,...c}=t; return c; }))); } catch(e){}

  fbGuardarCotizacion(data)
    .then(() => toast('Trabajo guardado en Firebase ✓', 'success'))
    .catch(() => toast('Guardado local (Firebase error)', 'info'));

  if (editingId) {
    editingId = null; el('edit-banner').style.display = 'none';
    toast('Cotización actualizada', 'success');
  } else { toast('Cotización guardada', 'success'); }
}

/* ----------------------------------------------------------
   Cotizaciones — Cargar
---------------------------------------------------------- */
async function cargarTrabajos() {
  try {
    trabajos = await fbCargarTrabajos();
    try { localStorage.setItem('trabajos3d', JSON.stringify(trabajos)); } catch(e){}
  } catch(e) {
    try { const l=localStorage.getItem('trabajos3d'); trabajos=l?JSON.parse(l):[];
      toast('Cargado desde caché local', 'info');
    } catch(e2) { trabajos=[]; }
  }
  renderTrabajos();
}

/* ----------------------------------------------------------
   Cotizaciones — Acciones
---------------------------------------------------------- */
async function cambiarEstado(id, estado, selectEl) {
  const t = trabajos.find(t=>t.id===id); if(t) t.estado=estado;
  const colorMap = { Cotizado:'badge-gray', Aprobado:'badge-accent', 'En producción':'badge-warn', Entregado:'badge-success', Cancelado:'badge-danger' };
  if (selectEl) selectEl.className = 'badge ' + (colorMap[estado]||'badge-gray') + ' estado-select';
  try { await fbActualizarEstado(id,estado); toast('Estado actualizado','success'); }
  catch(e) { toast('Estado actualizado localmente','info'); }
  renderTrabajos();
}

function verTrabajo(id) {
  const t = trabajos.find(t=>t.id===id); if(!t) return;
  alert(`Trabajo: ${t.pieza}\nCliente: ${t.cliente}\nFecha: ${t.fecha}\nPrecio final: ${fmt(t.precio_final)}\nEstado: ${t.estado}\n\nNotas: ${t.notas||'—'}`);
}

function editarTrabajo(id) {
  const t = trabajos.find(t=>t.id===id); if(!t) return;
  navTo('cotizador');
  const sv = (k,v) => { const e=el(k); if(e) e.value=v??''; };
  sv('c_pieza',t.pieza); sv('c_cliente',t.cliente); sv('c_fecha',t.fecha);
  sv('c_cantidad',t.cantidad||1); sv('c_categoria',t.categoria||'Funcional'); sv('c_notas',t.notas||'');
  sv('c_gramos',t.gramos||0); sv('c_horas_imp',t.horas_imp||0); sv('c_horas_mo',t.horas_mo||0);
  sv('c_horas_dis',t.horas_dis||0); sv('c_costo_dis',t.costo_dis||0); sv('c_postpro',t.postpro||0);
  sv('c_otros',t.otros||0); sv('c_fallos',t.pFallos??5); sv('c_margen',t.pMargen??35); sv('c_iva',t.pIVA??0);
  editingId=id; el('edit-banner').style.display='flex';
  set('edit-banner-text',`Editando: ${t.pieza} — ${t.cliente}`);
  calcular(); window.scrollTo({top:0,behavior:'smooth'});
}

function pdfTrabajo(id) { const t=trabajos.find(t=>t.id===id); if(t) generarPDFData(t); }

async function eliminarTrabajo(id) {
  if (!confirm('¿Eliminar esta cotización?')) return;
  trabajos = trabajos.filter(t=>t.id!==id);
  try { localStorage.setItem('trabajos3d',JSON.stringify(trabajos)); } catch(e){}
  try { await fbEliminarCotizacion(id); toast('Cotización eliminada','success'); }
  catch(e) { toast('Eliminado localmente','info'); }
  renderTrabajos();
}

function nuevaCotizacion() {
  editingId=null; el('edit-banner').style.display='none';
  ['c_pieza','c_cliente','c_notas'].forEach(f=>{ if(el(f)) el(f).value=''; });
  const nums={c_cantidad:1,c_gramos:0,c_horas_imp:0,c_horas_mo:0,c_horas_dis:0,c_costo_dis:0,c_postpro:0,c_otros:0,c_fallos:5,c_margen:35,c_iva:0};
  Object.entries(nums).forEach(([k,v])=>{ if(el(k)) el(k).value=v; });
  el('c_fecha').value=today(); el('c_categoria').value='Funcional'; calcular();
}

/* ----------------------------------------------------------
   Inventario — Guardar
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
  const idx=filamentos.findIndex(f=>f.id===id);
  if(idx>=0) filamentos[idx]=data; else filamentos.push(data);
  try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
  try { await fbGuardarFilamento(data); toast(editId?'Filamento actualizado ✓':'Filamento agregado ✓','success'); }
  catch(e) { toast('Guardado localmente','info'); }
  cancelarEditFilamento();
  el('inv_color').value=''; el('inv_marca').value=''; el('inv_precio').value=0;
  el('inv_peso').value=1000; el('inv_disp').value=1; el('inv_prov').value='';
  el('inv_notas').value=''; el('inv_fecha').value=today();
  renderInventario();
}

/* ----------------------------------------------------------
   Inventario — Cargar
---------------------------------------------------------- */
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

/* ----------------------------------------------------------
   Inventario — Editar / Eliminar
---------------------------------------------------------- */
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
  if(el('inv-edit-id'))    { el('inv-edit-id').textContent=''; el('inv-edit-id').style.display='none'; }
  if(el('inv-cancel-edit'))  el('inv-cancel-edit').style.display='none';
}

async function eliminarFilamento(id) {
  if (!confirm('¿Eliminar este filamento?')) return;
  filamentos=filamentos.filter(f=>f.id!==id);
  try { localStorage.setItem('filamentos3d',JSON.stringify(filamentos)); } catch(e){}
  try { await fbEliminarFilamento(id); toast('Filamento eliminado','success'); }
  catch(e) { toast('Eliminado localmente','info'); }
  renderInventario();
}

/* ----------------------------------------------------------
   Configuración — Guardar / Cargar
---------------------------------------------------------- */
async function guardarConfiguracion() {
  const cfg = { cfg_costo_g:fv('cfg_costo_g'), cfg_watts:fv('cfg_watts'), cfg_kwh:fv('cfg_kwh'),
    cfg_desgaste_h:fv('cfg_desgaste_h'), cfg_mo_h:fv('cfg_mo_h'), cfg_dis_h:fv('cfg_dis_h'),
    cfg_fallos:fv('cfg_fallos'), cfg_margen:fv('cfg_margen'), cfg_iva:fv('cfg_iva') };
  const emp = { emp_nombre:el('emp_nombre').value, emp_email:el('emp_email').value,
    emp_tel:el('emp_tel').value, emp_web:el('emp_web').value,
    emp_cedula:el('emp_cedula').value, emp_nota:el('emp_nota').value };
  localStorage.setItem('cfg3d',JSON.stringify(cfg));
  localStorage.setItem('emp3d',JSON.stringify(emp));
  try { await fbGuardarConfig(cfg); await fbGuardarEmpresa(emp); toast('Configuración guardada en Firebase ✓','success'); }
  catch(e) { toast('Guardado localmente','info'); }
  calcCfg(); calcular();
}

async function cargarConfiguracion() {
  try {
    const cfg=await fbCargarConfig(); const emp=await fbCargarEmpresa();
    if(cfg) { ['cfg_costo_g','cfg_watts','cfg_kwh','cfg_desgaste_h','cfg_mo_h','cfg_dis_h','cfg_fallos','cfg_margen','cfg_iva'].forEach(f=>{ if(cfg[f]!==undefined&&el(f)) el(f).value=cfg[f]; }); localStorage.setItem('cfg3d',JSON.stringify(cfg)); }
    if(emp) { ['emp_nombre','emp_email','emp_tel','emp_web','emp_cedula','emp_nota'].forEach(f=>{ if(emp[f]!==undefined&&el(f)) el(f).value=emp[f]; }); localStorage.setItem('emp3d',JSON.stringify(emp)); }
    calcCfg(); calcular(); toast('Configuración cargada desde Firebase ✓','success');
  } catch(e) { toast('Error al cargar desde Firebase','error'); }
}

/* ----------------------------------------------------------
   PDF
---------------------------------------------------------- */
function getEmpresa() {
  return { nombre:el('emp_nombre')?.value||'Cotizador 3D Costa Rica',
    email:el('emp_email')?.value||'', tel:el('emp_tel')?.value||'',
    web:el('emp_web')?.value||'', cedula:el('emp_cedula')?.value||'', nota:el('emp_nota')?.value||'' };
}

function generarPDF() {
  const pieza=el('c_pieza')?.value?.trim(), cliente=el('c_cliente')?.value?.trim();
  if(!pieza||!cliente){toast('Complete pieza y cliente','error');return;}
  const desglose=calcular();
  generarPDFData({ id:editingId||'BORRADOR', pieza, cliente, fecha:el('c_fecha').value,
    cantidad:fv('c_cantidad'), categoria:el('c_categoria').value, notas:el('c_notas').value,
    gramos:fv('c_gramos'), horas_imp:fv('c_horas_imp'), pIVA:fv('c_iva'),
    costo_total:desglose.costoFallos, precio_final:desglose.precioRedondeado, _desglose:desglose });
}

function generarPDFData(t) {
  const emp=getEmpresa(), d=t._desglose||{}, pIVA=t.pIVA||0;
  const antesIVA=d.antesIVA||t.precio_final||0, ivaVal=d.ivaVal||0;
  const precioFinal=t.precio_final||0, ref=String(t.id).toUpperCase();
  const win=window.open('','_blank');
  if(!win){toast('Permita ventanas emergentes','error');return;}
  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Cotización ${ref}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;font-size:13px;color:#1a1a2e;background:#fff}
.page{max-width:780px;margin:0 auto;padding:40px 48px;min-height:100vh;display:flex;flex-direction:column}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #ede9fe}
.brand-name{font-size:1.4rem;font-weight:700;color:#7c3aed}
.brand-sub{font-size:.75rem;color:#6b7280}
.doc-type{text-align:right}
.doc-type h1{font-size:1.6rem;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em}
.ref{font-size:.8rem;color:#6b7280;font-family:monospace}
.meta{display:flex;gap:32px;margin-bottom:28px;background:#f8f9fc;border-radius:10px;padding:16px 20px}
.meta-block{display:flex;flex-direction:column;gap:3px}
.meta-label{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af}
.meta-value{font-size:.88rem;font-weight:600;color:#111827}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead{background:#7c3aed}
thead th{padding:10px 14px;text-align:left;color:#fff;font-size:.75rem;font-weight:600;text-transform:uppercase}
tbody tr:nth-child(even){background:#f9f9fd}
tbody td{padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:.82rem}
.badge-cat{display:inline-flex;padding:2px 8px;background:#ede9fe;color:#7c3aed;border-radius:20px;font-size:.68rem;font-weight:600}
.td-mono{font-family:monospace}
.totals-wrap{display:flex;justify-content:flex-end;margin-bottom:28px}
.totals{width:280px;background:#f8f9fc;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
.totals-row{display:flex;justify-content:space-between;padding:8px 16px;font-size:.82rem;color:#374151}
.totals-row.iva{color:#d97706;font-size:.78rem}
.totals-row.total-final{background:#7c3aed;color:#fff;padding:12px 16px;font-size:.95rem;font-weight:700}
.totals-row .val{font-family:monospace;font-weight:600}
.notes{background:#fff9e6;border-left:3px solid #d97706;border-radius:5px;padding:12px 16px;margin-bottom:24px;font-size:.8rem;color:#374151}
.notes-title{font-size:.7rem;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
.sig-block{text-align:center;width:220px;margin:32px 0 24px auto}
.sig-line{border-top:1px solid #d1d5db;padding-top:8px;font-size:.75rem;color:#6b7280}
footer{margin-top:auto;padding-top:20px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:.72rem;color:#9ca3af}
.print-btn{position:fixed;top:16px;right:16px;padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer}
.print-btn:hover{background:#6d28d9}
@media print{.print-btn{display:none}@page{margin:0;size:A4}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Imprimir / PDF</button>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${escHtml(emp.nombre)}</div>
      ${emp.cedula?`<div class="brand-sub">Cédula: ${escHtml(emp.cedula)}</div>`:''}
      ${emp.web?`<div class="brand-sub">${escHtml(emp.web)}</div>`:''}
    </div>
    <div class="doc-type">
      <h1>Cotización</h1>
      <div class="ref">REF: ${ref}</div>
      <div class="ref">Fecha: ${t.fecha||'—'}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-block"><div class="meta-label">Cliente</div><div class="meta-value">${escHtml(t.cliente||'—')}</div></div>
    <div class="meta-block"><div class="meta-label">Pieza</div><div class="meta-value">${escHtml(t.pieza||'—')}</div></div>
    <div class="meta-block"><div class="meta-label">Estado</div><div class="meta-value">${escHtml(t.estado||'Cotizado')}</div></div>
  </div>
  <table>
    <thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unitario</th><th>Total</th></tr></thead>
    <tbody><tr>
      <td><strong>${escHtml(t.pieza||'—')}</strong><br>
        <span class="badge-cat">${escHtml(t.categoria||'—')}</span><br>
        <span style="color:#6b7280;font-size:.75rem">${(t.gramos||0).toFixed(1)}g · ${(t.horas_imp||0).toFixed(1)}h impresión</span>
        ${t.notas?`<br><span style="color:#6b7280;font-size:.72rem;font-style:italic">${escHtml(t.notas)}</span>`:''}
      </td>
      <td class="td-mono">${t.cantidad||1}</td>
      <td class="td-mono">${fmt(precioFinal/(t.cantidad||1))}</td>
      <td class="td-mono"><strong>${fmt(precioFinal)}</strong></td>
    </tr></tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="totals-row"><span>Subtotal</span><span class="val">${fmt(antesIVA)}</span></div>
    ${pIVA>0?`<div class="totals-row iva"><span>IVA (${pIVA}%)</span><span class="val">${fmt(ivaVal)}</span></div>`:''}
    <div class="totals-row total-final"><span>TOTAL</span><span class="val">${fmt(precioFinal)}</span></div>
  </div></div>
  ${emp.nota?`<div class="notes"><div class="notes-title">Notas</div>${escHtml(emp.nota)}</div>`:''}
  <div class="sig-block"><div style="height:40px"></div><div class="sig-line">Firma autorizada</div></div>
  <footer>
    <div style="display:flex;gap:18px;flex-wrap:wrap">
      ${emp.tel?`<span>📞 ${escHtml(emp.tel)}</span>`:''}
      ${emp.email?`<span>✉ ${escHtml(emp.email)}</span>`:''}
      ${emp.web?`<span>🌐 ${escHtml(emp.web)}</span>`:''}
    </div>
    <div>Generado con Cotizador 3D CR</div>
  </footer>
</div></body></html>`);
  win.document.close();
}

/* ----------------------------------------------------------
   Inicialización
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  applyThemeLabels();
  el('c_fecha').value=today(); el('inv_fecha').value=today();
  cargarCfgLocal(); calcCfg(); calcular(); testFirebase();
  try { const l=localStorage.getItem('trabajos3d');  if(l) trabajos=JSON.parse(l);   } catch(e){}
  try { const l=localStorage.getItem('filamentos3d'); if(l) filamentos=JSON.parse(l); } catch(e){}
});
