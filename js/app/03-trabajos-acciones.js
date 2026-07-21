/**
 * Cotizaciones/Trabajos: selección múltiple, PDF combinado, alta/edición rápida, abonos, exportar CSV, WhatsApp.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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
  const nombreArchivo = nombreArchivoSeguro('Cotizacion', clienteNombre);
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
  toast(`Cotización combinada (${items.length} ítems) — se abrió el PDF "${nombreArchivo}"`, 'success');
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

