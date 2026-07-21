/**
 * Generación de PDF (cotización individual, lista de precios) y respaldo en Google Drive.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

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
    id:             editingId || 'BORRADOR',
    pieza, cliente,
    fecha:          el('c_fecha').value,
    fechaEntrega:   el('c_fecha_entrega')?.value || '',
    cantidad:       fv('c_cantidad'),
    placas:         fv('c_placas'),
    categoria:      el('c_categoria').value,
    material:       el('c_material')?.value || '',
    notas:          el('c_notas').value,
    gramos:         fv('c_gramos'),
    horas_imp:      fv('c_horas_imp'),
    pIVA:           fv('c_iva'),
    costo_total:    desglose.costoTotalPlacas,
    precio_final:   desglose.precioTotal,
    precio_unitario:desglose.precioRedondeado,
    metodoPago:     el('c_metodo_pago')?.value || '',
    montoAbonado:   fv('c_monto_abonado'),
    _desglose:      desglose
  });
}

function generarPDFData(t) {
  const emp          = getEmpresa();
  const d            = t._desglose || {};
  const pIVA         = t.pIVA || d.pIVA || 0;
  const precioFinal  = t.precio_final || 0;
  const antesIVATotal = pIVA > 0 ? precioFinal / (1 + pIVA / 100) : 0;
  const ivaValTotal   = pIVA > 0 ? precioFinal - antesIVATotal : 0;
  const ref          = String(t.id).toUpperCase().slice(0,10);
  const cantidad     = Math.max(t.cantidad||1,1);
  const placas       = Math.max(t.placas||1,1);
  const totalObjetos = cantidad * placas;
  const precioUnit   = t.precio_unitario || (precioFinal / totalObjetos);
  const abono        = Number(t.montoAbonado) || 0;
  const pendiente    = Math.max(precioFinal - abono, 0);
  const metodo       = t.metodoPago || '';

  const base       = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';
  const nombreUrl  = base + 'img/Nombre-PNG.png';

  // Nombre de archivo y fecha de vigencia
  const nombreArchivo = nombreArchivoSeguro('COTIZACION', t.cliente || 'Cliente', t.pieza || 'Producto');
  const vigenciaDate  = t.fecha ? new Date(t.fecha + 'T12:00:00') : new Date();
  vigenciaDate.setDate(vigenciaDate.getDate() + 7);
  const vigencia = vigenciaDate.toLocaleDateString('es-CR', { day:'numeric', month:'short', year:'numeric' });
  const hoyStr   = new Date().toISOString().split('T')[0];

  const htmlContent = `<!DOCTYPE html>
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
.page{width:min(794px,100vw);min-height:1027px;background:#fff;overflow:hidden;
      box-shadow:0 20px 60px -16px rgba(15,42,69,.22),0 4px 16px rgba(15,42,69,.1);
      display:flex;flex-direction:column}
@media screen and (max-width:820px){
  body{padding:0 0 70px;background:#fff}
  .page{width:100vw;min-height:100dvh;border-radius:0;box-shadow:none}
  .header{padding:24px 20px}
  .client-bar{padding:12px 20px;grid-template-columns:1fr 1fr}
  .body{padding:20px 20px 8px}
  .doc-footer{padding:14px 20px}
}
/* ── HEADER ── */
.header{background:linear-gradient(130deg,#0F2A45 0%,#16395A 45%,#235A8C 100%);
        position:relative;overflow:hidden;padding:32px 48px;
        display:flex;justify-content:space-between;align-items:center}
/* Triángulos decorativos como SVG inline (html2canvas compatible) */
.header-deco{position:absolute;inset:0;pointer-events:none;z-index:0}
.brand{display:flex;align-items:center;gap:14px;z-index:1}
.brand-mascot{width:54px;height:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.25))}
.brand-text{display:flex;flex-direction:column;gap:4px}
.brand-name{font-size:26px;font-weight:800;color:#fff;line-height:1;letter-spacing:-.02em}
.brand-name .amp{color:#F2C61F;font-style:italic}
.badge-3d{display:inline-block;background:#4A8FCB;color:#fff;font-size:10px;font-weight:700;
           padding:2px 6px;border-radius:4px;margin-left:5px;letter-spacing:.05em;vertical-align:middle}
.brand-sub{font-size:10px;letter-spacing:.18em;text-transform:uppercase;
            color:rgba(255,255,255,.55);font-weight:600}
.title-block{text-align:right;z-index:1}
.title-eyebrow{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#F2C61F}
.title-main{font-size:26px;font-weight:800;color:#fff;line-height:1.1;margin-top:4px;letter-spacing:-.01em}
.title-rule{width:40px;height:2px;background:#F2C61F;margin:8px 0 0 auto;border-radius:1px}
/* ── CLIENT BAR ── */
.client-bar{background:#F8FAFB;border-bottom:1px solid #E0EAF4;padding:16px 48px;
            display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0}
.cb-field{display:flex;flex-direction:column;gap:3px;padding-right:20px}
.cb-field+.cb-field{border-left:1px solid #DEE9F3;padding-left:20px;padding-right:0}
.cb-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.2em;color:#8CAFD2;font-weight:700}
.cb-value{font-size:14px;font-weight:700;color:#133658;line-height:1.2}
.cb-tag{display:inline-block;background:#F2C61F;color:#133658;font-size:8.5px;font-weight:700;
         padding:2px 7px;border-radius:4px;letter-spacing:.06em;margin-top:3px;width:fit-content}
/* ── BODY ── */
.body{padding:28px 48px 8px;flex:1;display:flex;flex-direction:column}
.sec-label{font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
            color:#133658;display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sec-label::before{content:"";width:18px;height:2px;background:#F2C61F;border-radius:1px;flex-shrink:0}
/* ── TABLE ── */
.tbl{width:100%;border-collapse:collapse}
.tbl thead tr{border-top:2px solid #16395A;border-bottom:1.5px solid #16395A}
.tbl thead th{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
               color:#16395A;padding:10px 12px;text-align:left}
.tbl thead th:not(:first-child){text-align:right}
.tbl tbody tr{border-bottom:1px solid #F0F5FB}
.tbl tbody td{padding:12px 12px;font-size:13px;color:#1A2433;vertical-align:top}
.tbl tbody td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.item-name{font-weight:600;color:#133658}
.item-sub{font-size:11px;color:#8CAFD2;margin-top:2px}
/* ── SUMMARY ── */
.summary{display:flex;justify-content:flex-end;padding:12px 0 16px}
.sum-card{width:280px}
.sum-row{display:flex;justify-content:space-between;align-items:baseline;
          padding:7px 0;font-size:12.5px;border-bottom:1px solid #F0F5FB}
.sum-label{color:#5B6A7E}
.sum-val{font-weight:600;font-variant-numeric:tabular-nums}
.sum-total{background:#16395A;color:#fff;padding:14px 18px;border-radius:8px;
            display:flex;justify-content:space-between;align-items:center;
            margin-top:8px;position:relative;overflow:hidden;
            box-shadow:0 6px 16px -8px rgba(15,42,69,.5)}
.sum-total::before{content:"";position:absolute;left:0;top:0;bottom:0;
                    width:4px;background:#F2C61F}
.sum-total-label{font-size:10.5px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.2em;color:rgba(255,255,255,.8);padding-left:6px}
.sum-total-val{font-size:24px;font-weight:800;letter-spacing:-.02em;white-space:nowrap}
/* ── FOOTER GRID ── */
.footer-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;
              padding:16px 0 0;margin-top:auto}
.fnotes ul{list-style:none;display:flex;flex-direction:column;gap:6px;margin-top:10px}
.fnotes li{font-size:11.5px;color:#5B6A7E;padding-left:14px;position:relative;line-height:1.5}
.fnotes li::before{content:"";position:absolute;left:0;top:6px;
                    width:5px;height:5px;background:#F2C61F;border-radius:50%}
.fnotes li strong{color:#1A2433}
.note-box{background:#F8FAFB;border:1px dashed #DDE6F0;border-radius:6px;
           padding:9px 12px;font-size:11px;color:#1A2433;margin-top:10px;line-height:1.5}
/* ── PAYMENT METHODS ── */
.pay-card{background:#F8FAFB;border:1px solid #E0EAF4;border-radius:10px;padding:14px 16px}
.pay-item{display:flex;align-items:center;gap:10px;font-size:12.5px;
           color:#133658;font-weight:500;padding:6px 0}
.pay-item+.pay-item{border-top:1px solid #EEF3F8}
.pay-icon{width:28px;height:28px;border-radius:6px;background:#E8F0F8;
           display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pay-icon svg{width:14px;height:14px;stroke:#16395A}
.pay-selected{font-weight:700;color:#059669}
.pay-selected .pay-icon{background:#D1FAE5}
.pay-selected .pay-icon svg{stroke:#059669}
/* ── DOC FOOTER ── */
.doc-footer{padding:16px 48px;border-top:1px solid #EEF3F8;
             display:flex;justify-content:space-between;align-items:center}
.thanks{font-size:13.5px;font-weight:600;color:#133658;
         display:flex;align-items:center;gap:8px}
.thanks-logo{height:24px;width:auto}
.footer-rule{width:48px;height:3px;
              background:linear-gradient(90deg,#16395A,#4A8FCB,#F2C61F);border-radius:2px}
/* ── BOTÓN IMPRIMIR ── */
.print-fab{position:fixed;bottom:24px;right:24px;background:#16395A;color:#fff;
  border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-family:inherit;
  font-weight:700;cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(15,42,69,.35);
  display:flex;align-items:center;gap:8px;letter-spacing:-.01em}
.print-fab:hover{background:#235A8C}
@page{size:letter;margin:0}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
@media print{
  html,body{background:#fff!important;padding:0!important;margin:0!important;display:block!important}
  .page{width:215.9mm!important;min-height:279.4mm!important;box-shadow:none!important;border-radius:0!important;
        border:none!important;overflow:visible!important}
  .header{padding:32px 48px!important}
  .client-bar{padding:16px 48px!important;grid-template-columns:2fr 1fr 1fr 1fr!important}
  .body{padding:28px 48px 8px!important}
  .doc-footer{padding:16px 48px!important}
  .print-btn{display:none!important}}
</style>
</head>
<body>
<button class="print-fab print-btn" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <!-- Triángulos decorativos como SVG (compatible con html2canvas) -->
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
      <div class="title-main">${escHtml(t.categoria || 'Impresión 3D')}</div>
      <div class="title-rule"></div>
    </div>
  </div>

  <!-- CLIENT BAR -->
  <div class="client-bar">
    <div class="cb-field">
      <div class="cb-label">Cliente</div>
      <div class="cb-value">${escHtml(t.cliente || 'Nombre del cliente')}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Cotización</div>
      <div class="cb-value">N.° ${ref}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Fecha</div>
      <div class="cb-value">${t.fecha || hoyStr}</div>
    </div>
    <div class="cb-field">
      <div class="cb-label">Vigencia</div>
      <div class="cb-value">${vigencia}</div>
      <span class="cb-tag">7 DÍAS</span>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">
    <div class="sec-label">Detalle</div>

    <table class="tbl">
      <thead>
        <tr>
          <th>Pieza / Producto</th>
          <th>Cant.</th>
          <th>Precio unitario</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-name">${escHtml(t.pieza || '—')}</div>
            ${t.notas ? `<div class="item-sub" style="font-style:italic">${escHtml(t.notas)}</div>` : ''}
          </td>
          <td>${totalObjetos}</td>
          <td>&#8353;&thinsp;${(Math.ceil(precioUnit)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
          <td><strong>&#8353;&thinsp;${(Math.ceil(precioFinal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></td>
        </tr>
      </tbody>
    </table>

    <!-- SUMMARY -->
    <div class="summary">
      <div class="sum-card">
        ${pIVA > 0 ? `
        <div class="sum-row"><span class="sum-label">Subtotal (sin IVA)</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(antesIVATotal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>
        <div class="sum-row"><span class="sum-label">IVA (${pIVA}%)</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(ivaValTotal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>` : ''}
        ${abono > 0 ? `
        <div class="sum-row"><span class="sum-label">Abono recibido</span><span class="sum-val" style="color:#059669">&#8722; &#8353;&thinsp;${(Math.ceil(abono)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>
        <div class="sum-row"><span class="sum-label">Saldo pendiente</span><span class="sum-val">&#8353;&thinsp;${(Math.ceil(pendiente)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span></div>` : ''}
        <div class="sum-total">
          <span class="sum-total-label">Total final</span>
          <span class="sum-total-val">&#8353;&thinsp;${(Math.ceil(precioFinal)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
        </div>
      </div>
    </div>

    <!-- NOTAS + PAGO -->
    <div class="footer-grid">
      <div class="fnotes">
        <div class="sec-label">Notas</div>
        <ul>
          <li>La cotización tiene validez de <strong>7 días</strong> a partir de la fecha de emisión.</li>
          <li>El precio puede variar si cambian las características del modelo 3D.</li>
          <li>Para iniciar el trabajo se puede solicitar un <strong>abono del 50%</strong>.</li>
          <li>El tiempo de entrega se confirma al aprobar la cotización.</li>
          ${t.notas ? `<li>${escHtml(t.notas)}</li>` : ''}
        </ul>
        ${t.fechaEntrega ? `<div class="note-box">⏰ Entrega estimada: <strong>${escHtml(t.fechaEntrega)}</strong></div>` : ''}
        ${emp.nota ? `<div class="note-box">${escHtml(emp.nota)}</div>` : ''}
      </div>
      <div>
        <div class="sec-label">Método de pago</div>
        <div class="pay-card">
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>
            SINPEMóvil
          </div>
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
            Efectivo
          </div>
          <div class="pay-item">
            <div class="pay-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            Transferencia
          </div>
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

  const blob    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const win     = window.open(blobUrl, '_blank');
  if (!win) { URL.revokeObjectURL(blobUrl); toast('Permita ventanas emergentes en este sitio para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  toast(`Abriendo "${nombreArchivo}" — confirme "Guardar como PDF" en el diálogo de impresión`, 'success');

  // Subir a Google Drive si está conectado
  if (typeof _gDriveToken !== 'undefined' && _gDriveToken && _gDriveFolderId) {
    _gDriveSubirHTML(nombreArchivo + '.html', htmlContent);
  }
}

/* ----------------------------------------------------------
   Inventario Productos — Generar Lista de Precios (PDF)
---------------------------------------------------------- */
function generarListaPrecios() {
  // Filtrar lotes activos (misma lógica que renderVentaDetalle)
  const lotes = trabajos.filter(l =>
    _esDetalle(l) &&
    l.estado !== 'Cancelado' &&
    (l.unidadesVendidas || 0) < _totalUnidadesDetalle(l)
  );

  if (!lotes.length) {
    toast('No hay productos disponibles en Inventario Productos para exportar', 'error');
    return;
  }

  toast('Generando lista de precios…', 'info');

  const emp       = getEmpresa();
  const base      = new URL('.', window.location.href).href;
  const mascotaUrl = base + 'img/Mascota-PNG.png';

  const fechaHoy = new Date().toLocaleDateString('es-CR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Contacto en el pie
  const contactParts = [];
  if (emp.empTel)   contactParts.push('📞 ' + emp.empTel);
  if (emp.empEmail) contactParts.push('✉ ' + emp.empEmail);
  if (emp.empWeb)   contactParts.push('🌐 ' + emp.empWeb);
  const contactLine = contactParts.join('  ·  ');

  // Filas de la tabla
  const rowsHtml = lotes.map((l, i) => {
    const total      = _totalUnidadesDetalle(l);
    const vendidas   = Math.min(l.unidadesVendidas || 0, total);
    const disponibles = total - vendidas;
    const precio     = l.precio_unitario || 0;
    const rowBg      = i % 2 === 0 ? '#ffffff' : '#f4f8ff';
    return `
    <tr style="background:${rowBg};border-bottom:1px solid #e8f0f8">
      <td style="padding:14px 12px;font-size:11px;font-weight:700;color:#8cafd2;text-align:center;width:40px">${i+1}</td>
      <td style="padding:14px 14px">
        <div style="font-size:14px;font-weight:700;color:#0f1f33;margin-bottom:3px">${escHtml(l.pieza||'—')}</div>
        ${l.material ? `<div style="font-size:11px;color:#8cafd2">${escHtml(l.material)}</div>` : ''}
      </td>
      <td style="padding:14px 12px;white-space:nowrap">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#eef5fc;color:#1a60a6;border:1px solid #dde6f0">${escHtml(l.categoria||'General')}</span>
      </td>
      <td style="padding:14px 12px;text-align:center">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(5,150,105,0.1);color:#047857">${disponibles} disp.</span>
      </td>
      <td style="padding:14px 18px;text-align:right;white-space:nowrap">
        <div style="font-size:22px;font-weight:800;color:#1a60a6;font-variant-numeric:tabular-nums;line-height:1">₡${(Math.ceil(precio)).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
        <div style="font-size:9px;color:#8cafd2;font-weight:500;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">por unidad</div>
      </td>
    </tr>`;
  }).join('');

  const nombreArchivo = 'LISTA DE PRECIOS - Pin&Pon 3D';

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${nombreArchivo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#EEF1F5;-webkit-font-smoothing:antialiased}
body{min-height:100vh;padding:20px 0 80px;display:flex;justify-content:center;align-items:flex-start}
.page{
  width:min(794px,100vw);
  min-height:1027px;
  background:#fff;
  overflow:hidden;
  box-shadow:0 20px 60px -16px rgba(15,42,69,.22),0 4px 16px rgba(15,42,69,.1);
  display:flex;flex-direction:column;
}
@media screen and (max-width:820px){
  body{padding:0}
  .page{box-shadow:none;border-radius:0;min-height:100vh;width:100%}
}
@media print{
  html,body{padding:0;margin:0;background:#fff}
  .page{box-shadow:none;width:100%;min-height:0}
  @page{size:letter;margin:0!important}
}
.print-fab{position:fixed;bottom:24px;right:24px;background:#133658;color:#fff;border:none;
  border-radius:10px;padding:14px 22px;font-size:14px;font-family:inherit;font-weight:700;
  cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(10,31,61,.35)}
@media print{.print-fab{display:none!important}}
</style>
</head>
<body>
<button class="print-fab" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
<div class="page" id="the-page">

  <!-- ══ ENCABEZADO ══════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#0a1f3d 0%,#1a3a6b 60%,#133658 100%);padding:32px 40px 26px;position:relative;overflow:hidden">

    <!-- Círculos decorativos (SVG inline) -->
    <svg style="position:absolute;right:-20px;top:-20px;width:180px;height:180px;opacity:.07"
         viewBox="0 0 180 180" fill="none">
      <circle cx="90" cy="90" r="80" stroke="white" stroke-width="2"/>
      <circle cx="90" cy="90" r="55" stroke="white" stroke-width="2"/>
      <circle cx="90" cy="90" r="30" fill="white"/>
    </svg>
    <svg style="position:absolute;left:40%;bottom:-30px;width:120px;height:120px;opacity:.04"
         viewBox="0 0 120 120" fill="white">
      <polygon points="60,10 110,90 10,90"/>
    </svg>

    <!-- Contenido del header -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative">

      <!-- Izquierda: logo + títulos -->
      <div style="display:flex;align-items:center;gap:18px">
        <div style="width:64px;height:64px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
          <img src="${mascotaUrl}" alt="Pin&Pon 3D" width="52" height="52" style="object-fit:contain" crossorigin="anonymous"/>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px">Pin&amp;Pon 3D — Impresión 3D Personalizada</div>
          <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-.02em;line-height:1">LISTA DE PRECIOS</div>
          <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:5px;font-weight:400">Precios unitarios al público · Inventario Productos</div>
        </div>
      </div>

      <!-- Derecha: fecha -->
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 20px;text-align:center;flex-shrink:0">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.45);font-weight:600;margin-bottom:5px">Vigente al</div>
        <div style="font-size:15px;font-weight:800;color:#f4c70f;white-space:nowrap">${fechaHoy}</div>
      </div>
    </div>

    <!-- Línea dorada inferior -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f4c70f 0%,#d2ac09 55%,rgba(210,172,9,.1) 100%)"></div>
  </div>

  <!-- ══ CUERPO ════════════════════════════════════════════== -->
  <div style="padding:28px 40px 36px;flex:1">

    <!-- Label sección -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#8cafd2;white-space:nowrap">Catálogo de productos disponibles</div>
      <div style="flex:1;height:1px;background:#dde6f0"></div>
      <div style="font-size:9px;color:#8cafd2">${lotes.length} producto${lotes.length !== 1 ? 's' : ''}</div>
    </div>

    <!-- Tabla -->
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e8f0f8">
      <thead>
        <tr style="background:linear-gradient(90deg,#1a60a6 0%,#133658 100%)">
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:center;width:40px">#</th>
          <th style="padding:11px 14px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:left">Producto</th>
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:left">Categoría</th>
          <th style="padding:11px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:center">Disponible</th>
          <th style="padding:11px 18px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;text-align:right">Precio unitario</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- ══ PIE DE PÁGINA ═══════════════════════════════════ -->
    <div style="margin-top:28px;padding-top:16px;border-top:2px solid #dde6f0;display:flex;justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:12px;font-weight:800;color:#133658;letter-spacing:.02em">Pin<span style="color:#f4c70f">&amp;</span>Pon 3D — Impresión 3D Personalizada</div>
        ${contactLine ? `<div style="font-size:10px;color:#4e6882">${contactLine}</div>` : ''}
        <div style="font-size:9px;color:#8cafd2;font-style:italic;margin-top:2px">* Precios en colones costarricenses (₡) · Incluye IVA cuando aplica · Sujetos a cambio sin previo aviso</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:10px;color:#8cafd2">Generado el ${fechaHoy}</div>
      </div>
    </div>
  </div>
</div><!-- /.page -->

<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;

  const blobLP    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrlLP = URL.createObjectURL(blobLP);
  const winLP     = window.open(blobUrlLP, '_blank');
  if (!winLP) { URL.revokeObjectURL(blobUrlLP); toast('Permita ventanas emergentes para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrlLP), 10000);
}

/* ----------------------------------------------------------
   Google Drive — guardar cotizaciones en carpeta COTIZACIONES
---------------------------------------------------------- */
let _gDriveToken    = null;
let _gDriveFolderId = null;

/** Actualiza la UI del panel de Drive según estado de conexión. */
function _gDriveActualizarUI(connected) {
  const dot   = el('gdrive-dot');
  const txt   = el('gdrive-status-text');
  const bCon  = el('gdrive-btn-conectar');
  const bDes  = el('gdrive-btn-desconectar');
  const bTest = el('gdrive-btn-test');
  if (dot)   dot.className   = 'status-dot ' + (connected ? 'connected' : '');
  if (txt)   txt.textContent = connected
    ? 'Conectado · carpeta COTIZACIONES lista'
    : 'Sin conexión';
  if (bCon)  bCon.style.display  = connected ? 'none' : '';
  if (bDes)  bDes.style.display  = connected ? '' : 'none';
  if (bTest) bTest.style.display = connected ? '' : 'none';
}

/** Sube un archivo de prueba a la carpeta COTIZACIONES para verificar la conexión. */
async function probarDrive() {
  if (!_gDriveToken || !_gDriveFolderId) {
    toast('Drive no está conectado', 'error'); return;
  }
  const btn = el('gdrive-btn-test');
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
  const ahora   = new Date().toLocaleString('es-CR');
  const nombre  = `TEST-conexion-${new Date().toISOString().split('T')[0]}.html`;
  const contenido = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Prueba Drive — Pin&amp;Pon 3D</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f0f5fc;display:flex;
       align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#fff;border-radius:16px;padding:40px 48px;
        box-shadow:0 8px 32px rgba(19,54,88,.12);text-align:center;max-width:400px}
  h1{color:#133658;font-size:1.4rem;margin:0 0 8px}
  p{color:#4e6882;font-size:.9rem;margin:4px 0}
  .ok{display:inline-block;background:#d1fae5;color:#065f46;
      border-radius:99px;padding:6px 18px;font-weight:700;margin-top:20px;font-size:1rem}
</style></head>
<body>
  <div class="card">
    <div style="font-size:2.5rem">✅</div>
    <h1>¡Conexión exitosa!</h1>
    <p>Google Drive conectado correctamente.</p>
    <p>Carpeta: <strong>COTIZACIONES</strong></p>
    <p style="margin-top:12px;font-size:.8rem;color:#8cafd2">Generado: ${ahora}</p>
    <span class="ok">Pin&amp;Pon 3D · Cotizador</span>
  </div>
</body></html>`;
  await _gDriveSubirHTML(nombre, contenido);
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Probar conexión'; }
}

/** Solicita autorización OAuth de Google Drive. */
async function conectarGDrive() {
  const cid = (el('cfg_gdrive_client_id')?.value?.trim()) || localStorage.getItem('gdrive_client_id');
  if (!cid) { toast('Ingrese el Client ID de Google Cloud', 'error'); return; }
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    toast('Google Identity Services no disponible. Verifique su conexión.', 'error');
    return;
  }
  localStorage.setItem('gdrive_client_id', cid);
  if (el('cfg_gdrive_client_id')) el('cfg_gdrive_client_id').value = cid;
  google.accounts.oauth2.initTokenClient({
    client_id: cid,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (resp) => {
      if (resp.error) { toast('Error al conectar Drive: ' + resp.error, 'error'); return; }
      _gDriveToken = resp.access_token;
      await _gDriveEnsureFolder();
    }
  }).requestAccessToken({ prompt: '' });
}

/** Revoca el token y limpia el estado. */
function desconectarGDrive() {
  if (_gDriveToken && typeof google !== 'undefined') {
    try { google.accounts.oauth2.revoke(_gDriveToken, () => {}); } catch(e) {}
  }
  _gDriveToken = null; _gDriveFolderId = null;
  _gDriveActualizarUI(false);
  toast('Google Drive desconectado', 'info');
}

/** Busca o crea la carpeta COTIZACIONES en Drive. */
async function _gDriveEnsureFolder() {
  if (!_gDriveToken) return;
  try {
    const q = encodeURIComponent(
      `name='COTIZACIONES' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: `Bearer ${_gDriveToken}` } }
    );
    const data = await r.json();
    if (data.files?.length) {
      _gDriveFolderId = data.files[0].id;
      toast('Google Drive conectado · carpeta COTIZACIONES lista ✓', 'success');
    } else {
      const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${_gDriveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'COTIZACIONES', mimeType: 'application/vnd.google-apps.folder' })
      });
      const f = await cr.json();
      if (!f.id) throw new Error('No se pudo crear la carpeta');
      _gDriveFolderId = f.id;
      toast('Google Drive conectado · carpeta COTIZACIONES creada ✓', 'success');
    }
    _gDriveActualizarUI(true);
  } catch(e) {
    console.error('Drive folder error:', e);
    toast('Error al configurar carpeta en Drive: ' + e.message, 'error');
    _gDriveToken = null;
    _gDriveActualizarUI(false);
  }
}

/** Sube un archivo HTML a la carpeta COTIZACIONES. */
async function _gDriveSubirHTML(nombre, htmlStr) {
  if (!_gDriveToken || !_gDriveFolderId) return;
  try {
    const meta = { name: nombre, mimeType: 'text/html', parents: [_gDriveFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file',     new Blob([htmlStr],              { type: 'text/html;charset=utf-8' }));
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${_gDriveToken}` }, body: form }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (err.error?.code === 401) {        // Token expirado
        _gDriveToken = null;
        _gDriveActualizarUI(false);
        toast('Sesión de Drive expirada. Reconecte en Configuración → Integraciones.', 'error', 6000);
        return;
      }
      throw new Error(err.error?.message || r.status);
    }
    toast(`📁 Guardado en Drive → COTIZACIONES/${nombre}`, 'success', 5000);
  } catch(e) {
    console.error('Drive upload error:', e);
    toast('No se pudo guardar en Drive: ' + e.message, 'error');
  }
}

