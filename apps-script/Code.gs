// =====================================================================
//  Cotizador 3D – Google Apps Script Backend
//  Planilla: https://docs.google.com/spreadsheets/d/1BRXafQXA1TPO1NGSs1lqoWOvZwH5et4CZ7exMB0z33I
//
//  INSTRUCCIONES DE DESPLIEGUE:
//  1. Abrí tu planilla de Google Sheets
//  2. Extensiones → Apps Script → eliminá el código existente y pegá este archivo
//  3. Guardá (Ctrl+S)
//  4. Implementar → Nueva implementación
//     - Tipo: Aplicación web
//     - Ejecutar como: Yo
//     - Quién tiene acceso: Cualquier persona
//  5. Hacé clic en "Implementar" y autorizá los permisos
//  6. Copiá la URL generada y pegala en Configuración → URL del script
// =====================================================================

const SS_ID = '1BRXafQXA1TPO1NGSs1lqoWOvZwH5et4CZ7exMB0z33I';

// ── Utilidades ───────────────────────────────────────────────────────

function getSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const hasHeaders = headers.every((h, i) => existing[i] === h);
    if (!hasHeaders) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1a73e8');
      headerRange.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Handlers HTTP ────────────────────────────────────────────────────

function doGet(e) {
  const accion = (e.parameter && e.parameter.accion) || '';
  try {
    switch (accion) {
      case 'ping':          return jsonOut({ status: 'ok', app: 'Cotizador3D' });
      case 'historial':     return jsonOut(getHistorial());
      case 'inventario':    return jsonOut(getInventario());
      case 'configuracion': return jsonOut(getConfiguracion());
      default:              return jsonOut({ error: 'Acción desconocida: ' + accion });
    }
  } catch (err) {
    return jsonOut({ error: err.toString() });
  }
}

function doPost(e) {
  let body = {};
  try {
    if (e.parameter && e.parameter.data) {
      body = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (x) {}
  const accion = (e.parameter && e.parameter.accion) || body.accion || '';
  try {
    switch (accion) {
      case 'ping':
        return jsonOut({ status: 'ok' });
      case 'guardarCotizacion':
        guardarCotizacion(body);
        return jsonOut({ status: 'ok' });
      case 'actualizarCotizacion':
        actualizarCotizacion(body);
        return jsonOut({ status: 'ok' });
      case 'guardarFilamento':
        guardarFilamento(body);
        return jsonOut({ status: 'ok' });
      case 'actualizarFilamento':
        actualizarFilamento(body);
        return jsonOut({ status: 'ok' });
      case 'guardarConfiguracion':
        guardarConfiguracion(body);
        return jsonOut({ status: 'ok' });
      case 'actualizarEstado':
        actualizarEstado(body);
        return jsonOut({ status: 'ok' });
      case 'eliminarCotizacion':
        eliminarCotizacion(body);
        return jsonOut({ status: 'ok' });
      case 'eliminarFilamento':
        eliminarFilamento(body);
        return jsonOut({ status: 'ok' });
      default:
        return jsonOut({ error: 'Acción desconocida: ' + accion });
    }
  } catch (err) {
    return jsonOut({ error: err.toString() });
  }
}

// ── Cotizaciones ─────────────────────────────────────────────────────

const COT_HEADERS = [
  'id', 'fecha', 'cliente', 'pieza', 'categoria',
  'gramos', 'horas', 'costoTotal', 'precioFinal', 'estado', 'notas'
];

function guardarCotizacion(d) {
  const sheet = getSheet('Cotizaciones', COT_HEADERS);
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, COT_HEADERS.length)
       .setValues([COT_HEADERS.map(k => (d[k] !== undefined ? d[k] : ''))]);
}

function actualizarCotizacion(d) {
  const sheet   = getSheet('Cotizaciones', COT_HEADERS);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const iId     = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][iId]) === String(d.id)) {
      sheet.getRange(r + 1, 1, 1, COT_HEADERS.length)
           .setValues([COT_HEADERS.map(k => (d[k] !== undefined ? d[k] : ''))]);
      return;
    }
  }
}

function getHistorial() {
  return sheetToArray(getSheet('Cotizaciones', COT_HEADERS));
}

function eliminarCotizacion(d) {
  const sheet   = getSheet('Cotizaciones', COT_HEADERS);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const iId     = headers.indexOf('id');
  const iFecha  = headers.indexOf('fecha');
  const iPieza  = headers.indexOf('pieza');
  for (let r = 1; r < data.length; r++) {
    const matchById = d.id && String(data[r][iId]) === String(d.id);
    const matchByFechaPieza = !d.id &&
      String(data[r][iFecha]) === String(d.fecha) &&
      String(data[r][iPieza]) === String(d.pieza);
    if (matchById || matchByFechaPieza) {
      sheet.deleteRow(r + 1);
      return;
    }
  }
}

function actualizarEstado(d) {
  const sheet   = getSheet('Cotizaciones', COT_HEADERS);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const iId     = headers.indexOf('id');
  const iFecha  = headers.indexOf('fecha');
  const iPieza  = headers.indexOf('pieza');
  const iEstado = headers.indexOf('estado');
  for (let r = 1; r < data.length; r++) {
    const matchById = d.id && String(data[r][iId]) === String(d.id);
    const matchByFechaPieza = !d.id &&
      String(data[r][iFecha]) === String(d.fecha) &&
      String(data[r][iPieza]) === String(d.pieza);
    if (matchById || matchByFechaPieza) {
      sheet.getRange(r + 1, iEstado + 1).setValue(d.estado);
      return;
    }
  }
}

// ── Inventario ───────────────────────────────────────────────────────

const INV_HEADERS = [
  'id', 'tipo', 'color', 'marca', 'precio', 'peso',
  'disponibles', 'costoGramo', 'valorRestante', 'proveedor', 'fechaCompra', 'notas'
];

function guardarFilamento(d) {
  const sheet = getSheet('Inventario', INV_HEADERS);
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, INV_HEADERS.length)
       .setValues([INV_HEADERS.map(k => (d[k] !== undefined ? d[k] : ''))]);
}

function actualizarFilamento(d) {
  const sheet   = getSheet('Inventario', INV_HEADERS);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const iId     = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][iId]) === String(d.id)) {
      sheet.getRange(r + 1, 1, 1, INV_HEADERS.length)
           .setValues([INV_HEADERS.map(k => (d[k] !== undefined ? d[k] : ''))]);
      return;
    }
  }
}

function getInventario() {
  return sheetToArray(getSheet('Inventario', INV_HEADERS));
}

function eliminarFilamento(d) {
  const sheet  = getSheet('Inventario', INV_HEADERS);
  const data   = sheet.getDataRange().getValues();
  const h      = data[0];
  const iId    = h.indexOf('id');
  const iTipo  = h.indexOf('tipo');
  const iColor = h.indexOf('color');
  const iMarca = h.indexOf('marca');
  const iFecha = h.indexOf('fechaCompra');
  for (let r = 1; r < data.length; r++) {
    const matchById = d.id && String(data[r][iId]) === String(d.id);
    const matchByFields = !d.id &&
      String(data[r][iTipo])  === String(d.tipo)  &&
      String(data[r][iColor]) === String(d.color) &&
      String(data[r][iMarca]) === String(d.marca) &&
      String(data[r][iFecha]) === String(d.fechaCompra);
    if (matchById || matchByFields) {
      sheet.deleteRow(r + 1);
      return;
    }
  }
}

// ── Configuración ────────────────────────────────────────────────────

const CFG_HEADERS = ['clave', 'valor'];
const CFG_KEYS = [
  'precioRollo', 'pesoRollo', 'watts', 'kwhPrecio', 'compraPrint',
  'vidaUtil', 'mantenimiento', 'tarifaMO', 'tarifaDis', 'fallos', 'margen', 'iva'
];

function guardarConfiguracion(d) {
  const sheet = getSheet('Configuracion', CFG_HEADERS);
  sheet.clearContents();
  sheet.appendRow(CFG_HEADERS);
  const hRange = sheet.getRange(1, 1, 1, 2);
  hRange.setFontWeight('bold');
  hRange.setBackground('#1a73e8');
  hRange.setFontColor('#ffffff');
  CFG_KEYS.forEach(k => { if (d[k] !== undefined) sheet.appendRow([k, d[k]]); });
}

function getConfiguracion() {
  const rows = sheetToArray(getSheet('Configuracion', CFG_HEADERS));
  const cfg  = {};
  rows.forEach(r => { if (r.clave) cfg[r.clave] = r.valor; });
  return cfg;
}
