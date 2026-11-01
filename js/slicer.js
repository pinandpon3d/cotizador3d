/**
 * IMPORTAR DEL SLICER — slicer.js
 *
 * Llena "Gramos de filamento" y "Horas de impresión" del cotizador a partir
 * de lo que exporta el slicer (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura):
 *
 *   • Archivo .gcode.3mf / .3mf laminado → datos exactos (Metadata/slice_info.config)
 *   • Archivo .gcode                      → datos exactos (comentarios del encabezado)
 *   • Captura de pantalla del resultado   → OCR en el navegador (Tesseract.js);
 *                                           los valores quedan marcados para revisar
 *
 * Nada se sube a ningún servidor: todo se procesa en el navegador. Las
 * librerías (Tesseract.js, JSZip) se descargan solo la primera vez que se usan.
 *
 * Depende de: logic.js (el, fv, calcular), ui.js (toast, escHtml)
 */

'use strict';

const _SLICER_LIBS = {
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  jszip:     'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
};
const _TESSERACT_OPTS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  langPath:   'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int'
};
// Gramos por metro de filamento de 1,75 mm con densidad de PLA (para Cura,
// que solo informa metros).
const _G_POR_METRO_PLA = Math.PI * Math.pow(0.0875, 2) * 100 * 1.24;

const _scriptsCargados = {};
function _cargarScript(url) {
  if (!_scriptsCargados[url]) {
    _scriptsCargados[url] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = res;
      s.onerror = () => { delete _scriptsCargados[url]; rej(new Error('No se pudo descargar ' + url.split('/').pop() + '. Revisá la conexión.')); };
      document.head.appendChild(s);
    });
  }
  return _scriptsCargados[url];
}

/* ----------------------------------------------------------
   Parseo de números y duraciones
---------------------------------------------------------- */

/** "201,75" | "201.75" | "1.234,5" | "1,234.5" → número */
function _slNum(str) {
  let s = String(str).replace(/\s/g, '');
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Busca duraciones tipo "9h26m", "9h 26m 16s", "1d 2h", "6m15s" → [{seg, txt, idx}] */
function _slDuraciones(texto) {
  const out = [];
  const re = /(?<![\d.,])(?:(\d+)\s*d\s*)?(?:(\d+)\s*h\s*)?(?:(\d+)\s*m(?:in)?(?![a-z])\s*)?(?:(\d+)\s*s(?![a-z]))?/gi;
  let m;
  while ((m = re.exec(texto))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    const [, d, h, mi, s] = m;
    if (h == null && mi == null) continue;            // "15s" o "2d" sueltos no cuentan
    const seg = (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0);
    if (seg > 0) out.push({ seg, txt: m[0].trim(), idx: m.index });
  }
  return out;
}

/** "9h 26m 16s" → segundos (o NaN) */
function _slDuracionDe(str) {
  const d = _slDuraciones(String(str));
  return d.length ? d[0].seg : NaN;
}

/* ----------------------------------------------------------
   Archivos G-code (texto)
---------------------------------------------------------- */
function _slParsearGcode(texto) {
  let seg = NaN, gramos = NaN, porFilamento = [], aproximado = false, fuente = '';

  // Tiempo
  let m;
  if ((m = texto.match(/total estimated time:\s*([^;\n]+)/i)))                   { seg = _slDuracionDe(m[1]); fuente = 'Bambu Studio'; }
  else if ((m = texto.match(/estimated printing time \(normal mode\)\s*=\s*([^\n]+)/i))) { seg = _slDuracionDe(m[1]); fuente = 'Orca/Prusa'; }
  else if ((m = texto.match(/^;\s*TIME:\s*(\d+)/mi)))                            { seg = +m[1]; fuente = 'Cura'; }
  else if ((m = texto.match(/model printing time:\s*([^;\n]+)/i)))               { seg = _slDuracionDe(m[1]); }

  // Peso
  const lista = s => s.split(',').map(_slNum).filter(Number.isFinite);
  if ((m = texto.match(/total filament weight \[g\]\s*:\s*([\d.,\s]+)/i)))        { porFilamento = lista(m[1]); }
  else if ((m = texto.match(/total filament used \[g\]\s*=\s*([\d.,]+)/i)))       { gramos = _slNum(m[1]); }
  else if ((m = texto.match(/filament used \[g\]\s*=\s*([\d.,\s]+)/i)))           { porFilamento = lista(m[1]); }
  else if ((m = texto.match(/^;\s*Filament used:\s*([\d.,\s]+)m/mi)))             { gramos = lista(m[1]).reduce((a, b) => a + b, 0) * _G_POR_METRO_PLA; aproximado = true; }
  if (porFilamento.length) gramos = porFilamento.reduce((a, b) => a + b, 0);

  return { gramos, seg, porFilamento, aproximado, fuente, placas: 1 };
}

async function _slLeerGcode(file) {
  // El encabezado (Bambu/Cura) está al principio y la configuración
  // (Prusa/Orca) al final: no hace falta leer todo el archivo.
  const MB = 1024 * 1024;
  const partes = file.size <= 4 * MB
    ? [await file.text()]
    : [await file.slice(0, MB).text(), await file.slice(file.size - MB).text()];
  return _slParsearGcode(partes.join('\n'));
}

/* ----------------------------------------------------------
   Proyectos .3mf / .gcode.3mf (zip)
---------------------------------------------------------- */
async function _slLeer3mf(file) {
  await _cargarScript(_SLICER_LIBS.jszip);
  const zip = await JSZip.loadAsync(file);

  const info = zip.file(/slice_info\.config$/i)[0];
  if (info) {
    const xml = new DOMParser().parseFromString(await info.async('string'), 'application/xml');
    const placas = [...xml.getElementsByTagName('plate')].map(pl => {
      const meta = k => { const e = [...pl.getElementsByTagName('metadata')].find(x => x.getAttribute('key') === k); return e ? e.getAttribute('value') : null; };
      const fil = [...pl.getElementsByTagName('filament')].map(f => ({
        g: _slNum(f.getAttribute('used_g') || '0'), tipo: f.getAttribute('type') || '', color: f.getAttribute('color') || ''
      })).filter(f => f.g > 0);
      const peso = _slNum(meta('weight') || 'NaN');
      return {
        seg: _slNum(meta('prediction') || 'NaN'),
        gramos: Number.isFinite(peso) ? peso : fil.reduce((a, f) => a + f.g, 0),
        filamentos: fil
      };
    }).filter(p => p.seg > 0 || p.gramos > 0);

    if (placas.length) {
      const fil = placas.flatMap(p => p.filamentos);
      return {
        gramos: placas.reduce((a, p) => a + (p.gramos || 0), 0),
        seg:    placas.reduce((a, p) => a + (p.seg || 0), 0),
        porFilamento: fil.map(f => f.g),
        tipos: [...new Set(fil.map(f => f.tipo).filter(Boolean))],
        colores: fil.length,
        aproximado: false, fuente: 'proyecto 3MF', placas: placas.length
      };
    }
  }

  // Sin slice_info: probar con el G-code que trae adentro
  const gcodes = zip.file(/\.gcode$/i);
  if (gcodes.length) {
    const r = [];
    for (const g of gcodes) r.push(_slParsearGcode(await g.async('string')));
    return {
      gramos: r.reduce((a, x) => a + (x.gramos || 0), 0),
      seg:    r.reduce((a, x) => a + (x.seg || 0), 0),
      porFilamento: r.flatMap(x => x.porFilamento), aproximado: r.some(x => x.aproximado),
      fuente: 'proyecto 3MF', placas: r.length
    };
  }
  throw new Error('Este 3MF no está laminado. En el slicer tocá "Laminar" y exportá con "Exportar G-code laminado" (.gcode.3mf).');
}

/* ----------------------------------------------------------
   Captura de pantalla (OCR)
---------------------------------------------------------- */

/** Escala y pasa a gris; invierte si el fondo es oscuro (tema oscuro del
 *  slicer). No se binariza: Tesseract lo hace mejor por su cuenta y un umbral
 *  fijo borra las comas decimales. */
async function _slPrepararImagen(file) {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(2, Math.max(1, 1000 / bmp.width));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * escala);
  cv.height = Math.round(bmp.height * escala);
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const img = cx.getImageData(0, 0, cv.width, cv.height);
  const px = img.data;
  let suma = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = y; suma += y;
  }
  const invertir = suma / (px.length / 4) < 128;
  for (let i = 0; i < px.length; i += 4) {
    const y = invertir ? 255 - px[i] : px[i];
    px[i] = px[i + 1] = px[i + 2] = y; px[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return cv;
}

/** Extrae gramos y tiempo del texto reconocido en una captura. */
function _slParsearTextoCaptura(texto) {
  const lineas = texto.split(/\n+/);

  // Gramos. En la tabla de Bambu/Orca los gramos siempre llevan 2 decimales,
  // pero el OCR a veces se come la coma ("8417g" por "84,17 g") o lee la "g"
  // como "9" ("201,759" por "201,75 g"). En modo tabla se corrigen ambos.
  const reG = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:,\d{3})+\.\d{1,2}|\d{1,5}(?:[.,]\d{1,3})?)\s*[¢c]?\s*g(?![a-z])|(?<![\d.,])(\d{1,5}[.,]\d{2})9(?!\d)/gi;
  const crudos = lineas.map(l => [...l.matchAll(reG)].map(m => m[1] ? { t: m[1], g: true } : { t: m[2], g: false }));
  const modoTabla = crudos.some(f => f.length >= 3);
  const aNum = ({ t }) => {
    if (modoTabla && !/[.,]/.test(t) && t.length >= 3) return _slNum(t.slice(0, -2) + '.' + t.slice(-2));
    if (modoTabla && /[.,]\d{3}$/.test(t) && t.endsWith('9')) return _slNum(t.slice(0, -1));
    return _slNum(t);
  };
  const filas = crudos.map(f => f.filter(x => x.g || modoTabla).map(aNum).filter(Number.isFinite));
  const todos = filas.flat();
  let gramos = todos.length ? Math.max(...todos) : NaN;
  const cerca = (a, b) => Math.abs(a - b) <= Math.max(0.06, b * 0.005);

  // El último valor de cada fila de filamento es su total; la fila "Total"
  // tiene el máximo. Solo se da por verificado si las sumas cuadran.
  const porFilamento = filas.filter(f => f.length >= 2 && f[f.length - 1] !== gramos).map(f => f[f.length - 1]);
  const filaSuma = filas.some(f => f.length >= 3 && f[f.length - 1] === gramos && cerca(f.slice(0, -1).reduce((a, b) => a + b, 0), gramos));
  const filamentosSuman = porFilamento.length >= 1 && cerca(porFilamento.reduce((a, b) => a + b, 0), gramos);
  let verificado = gramos > 0 && gramos < 5000
    && (porFilamento.length >= 2 ? filamentosSuman : (filaSuma || filamentosSuman));

  // Control físico con los metros: 1 m de filamento de 1,75 mm pesa unos 3 g
  // (PLA 2,98 · PETG 3,05 · ABS 2,5 · TPU 2,9). Si el OCR se comió la coma,
  // gramos ÷ metros da ~300 en vez de ~3, y se corrige dividiendo entre 100.
  let corregidoPorMetros = false;
  if (!verificado && Number.isFinite(gramos)) {
    const reM = /(?<![\d.,h])(\d{1,5}(?:[.,]\d{1,2})?)\s*m(?![a-z0-9])/gi;
    const metrosTok = lineas
      .filter(l => !/(tiempo|time|prepar|impres|print)/i.test(l))
      .flatMap(l => [...l.matchAll(reM)].map(m => m[1]));
    const opciones = t => /[.,]/.test(t) ? [_slNum(t)] : [_slNum(t), _slNum(t) / 100];
    const metros = metrosTok.flatMap(opciones).filter(v => v > 0);
    // Si ambos perdieron la coma la proporción no cambia: con más de 1 kg se
    // prefiere la versión dividida (una placa casi nunca pesa tanto).
    const gCands = gramos >= 1000 ? [gramos / 100, gramos] : [gramos, gramos / 100];
    const ok = (g) => metros.some(mv => { const r = g / mv; return r >= 2 && r <= 4.2; });
    const elegido = gCands.find(ok);
    if (elegido !== undefined && metros.length) {
      corregidoPorMetros = elegido !== gramos;
      gramos = elegido;
      verificado = true;
    } else if (gramos >= 1000 && !metros.length) {
      // Sin metros para comparar: más de 1 kg por placa es casi seguro una coma perdida
      gramos = gramos / 100;
      corregidoPorMetros = true;
    }
  }

  // Tiempo: primero la línea que dice "total"; si no, la duración más larga.
  let seg = NaN;
  // (la fila "Total" de la tabla tiene metros, por eso se exige "tiempo/time")
  const lineaTotal = lineas.find(l => /(tiempo|time)/i.test(l) && /total/i.test(l) && _slDuraciones(l).length);
  if (lineaTotal) seg = Math.max(..._slDuraciones(lineaTotal).map(d => d.seg));
  else {
    const d = lineas.filter(l => /(tiempo|time|prepar|impres|print)/i.test(l)).flatMap(_slDuraciones);
    if (d.length) seg = Math.max(...d.map(x => x.seg));
  }

  return { gramos, seg, porFilamento: porFilamento.filter(g => g < gramos), verificado, corregidoPorMetros, fuente: 'captura', placas: 1 };
}

async function _slLeerCaptura(file, onProgreso) {
  await _cargarScript(_SLICER_LIBS.tesseract);
  const canvas = await _slPrepararImagen(file);
  const worker = await Tesseract.createWorker('eng', 1, {
    ..._TESSERACT_OPTS,
    logger: m => { if (m.status === 'recognizing text' && onProgreso) onProgreso(Math.round(m.progress * 100)); }
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });   // bloque de texto uniforme (tabla)
    const { data } = await worker.recognize(canvas);
    window._slUltimoTextoOCR = data.text || '';   // útil para diagnosticar desde la consola
    return { ..._slParsearTextoCaptura(data.text || ''), textoOCR: data.text || '' };
  } finally {
    worker.terminate();
  }
}

/* ----------------------------------------------------------
   Interfaz
---------------------------------------------------------- */
let _slDeshacer = null;

function _slEstado(html, tipo = '') {
  const r = el('slicer-result');
  if (!r) return;
  r.className = 'slicer-result' + (tipo ? ' ' + tipo : '');
  r.innerHTML = html;
  r.hidden = false;
}

function _slFormatoHoras(seg) {
  const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
  return (h ? `${h} h ` : '') + `${m} min`;
}

function _slAplicar(r) {
  const okG = Number.isFinite(r.gramos) && r.gramos > 0;
  const okT = Number.isFinite(r.seg) && r.seg > 0;
  if (!okG && !okT) throw new Error('No encontré peso ni tiempo. Probá con una captura más nítida del panel "Resultado del corte" o subí el archivo .gcode.3mf.');

  _slDeshacer = {
    c_gramos: el('c_gramos').value, c_horas_imp: el('c_horas_imp').value,
    c_placas: el('c_placas').value, c_material: el('c_material').value
  };

  const horas = okT ? Math.round((r.seg / 3600) * 100) / 100 : null;
  if (okG) el('c_gramos').value = Math.round(r.gramos * 100) / 100;
  if (okT) el('c_horas_imp').value = horas;
  // Varias placas en un archivo: los totales ya son de todo el trabajo
  if ((r.placas || 1) > 1) el('c_placas').value = 1;
  if (r.tipos?.length && !el('c_material').value.trim()) {
    el('c_material').value = r.tipos.join(' + ') + (r.colores > 1 ? ` (${r.colores} colores)` : '');
  }
  calcular();

  ['c_gramos', 'c_horas_imp'].forEach(id => {
    const e = el(id); if (!e) return;
    e.classList.remove('sl-flash'); void e.offsetWidth; e.classList.add('sl-flash');
  });

  const esFoto = r.fuente === 'captura';
  const partes = [];
  if (okG) partes.push(`<strong>${(Math.round(r.gramos * 100) / 100).toLocaleString('es-CR')} g</strong>`);
  if (okT) partes.push(`<strong>${_slFormatoHoras(r.seg)}</strong> (${horas.toLocaleString('es-CR')} h)`);
  const extras = [];
  if (r.porFilamento?.length > 1) extras.push(`${r.porFilamento.length} filamentos: ${r.porFilamento.map(g => g.toLocaleString('es-CR') + ' g').join(' + ')}`);
  if ((r.placas || 1) > 1) extras.push(`se sumaron ${r.placas} placas — poné en "Cantidad de objetos" el total de piezas`);
  if (r.aproximado) extras.push('peso estimado desde los metros (densidad de PLA)');
  const faltan = [!okG && 'peso', !okT && 'tiempo'].filter(Boolean);
  if (faltan.length) extras.push(`no encontré ${faltan.join(' ni ')} — completalo a mano`);

  const aviso = esFoto && !r.verificado
    ? 'Leído de la foto — revisá que los números coincidan.'
    : esFoto && r.corregidoPorMetros ? 'Leído de la foto; la coma decimal se corrigió comparando con los metros de filamento — revisalo.'
    : esFoto ? 'Leído de la foto y verificado.'
             : `Leído del archivo (${escHtml(r.fuente || 'slicer')}).`;

  _slEstado(`
    <svg viewBox="0 0 24 24" class="sl-ico"><polyline points="20 6 9 17 4 12"/></svg>
    <div class="sl-txt">
      <div>${partes.join(' · ')}</div>
      <small>${aviso}${extras.length ? ' ' + escHtml(extras.join(' · ')) + '.' : ''}</small>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="deshacerImportacionSlicer()">Deshacer</button>`,
    esFoto && (!r.verificado || r.corregidoPorMetros) ? 'warn' : 'ok');
}

function deshacerImportacionSlicer() {
  if (!_slDeshacer) return;
  Object.entries(_slDeshacer).forEach(([k, v]) => { if (el(k)) el(k).value = v; });
  _slDeshacer = null;
  calcular();
  const r = el('slicer-result'); if (r) r.hidden = true;
}

async function importarDesdeSlicer(file) {
  if (!file) return;
  const nombre = (file.name || '').toLowerCase();
  const esImagen = (file.type || '').startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|heic)$/.test(nombre);
  const es3mf = nombre.endsWith('.3mf');
  const esGcode = /\.(gcode|gco|g)$/.test(nombre);
  if (!esImagen && !es3mf && !esGcode) {
    _slEstado('<div class="sl-txt"><div>Formato no reconocido.</div><small>Subí una captura (PNG/JPG) o el archivo .gcode.3mf / .gcode del slicer.</small></div>', 'err');
    return;
  }
  const drop = el('slicer-drop');
  if (drop) drop.classList.add('busy');
  _slEstado(`<span class="sl-spin"></span><div class="sl-txt"><div>${esImagen ? 'Leyendo la captura…' : 'Leyendo el archivo…'}</div><small id="sl-prog">${esImagen ? 'La primera vez descarga el lector de texto (unos segundos).' : ''}</small></div>`);
  try {
    const r = esImagen
      ? await _slLeerCaptura(file, p => { const e = el('sl-prog'); if (e) e.textContent = `Reconociendo texto… ${p}%`; })
      : es3mf ? await _slLeer3mf(file) : await _slLeerGcode(file);
    _slAplicar(r);
  } catch (e) {
    console.error('Importar del slicer:', e);
    _slEstado(`<svg viewBox="0 0 24 24" class="sl-ico"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><div class="sl-txt"><div>No se pudo importar.</div><small>${escHtml(e.message || 'Error desconocido')}</small></div>`, 'err');
  } finally {
    if (drop) drop.classList.remove('busy');
  }
}

function initImportadorSlicer() {
  const drop = el('slicer-drop');
  const input = el('slicer-file');
  if (!drop || !input) return;
  input.addEventListener('change', () => { importarDesdeSlicer(input.files[0]); input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => importarDesdeSlicer(e.dataTransfer?.files?.[0]));

  // Pegar una captura con Ctrl+V estando en el cotizador
  document.addEventListener('paste', e => {
    if (!el('page-cotizador')?.classList.contains('active')) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    importarDesdeSlicer(item.getAsFile());
  });
}

document.addEventListener('DOMContentLoaded', initImportadorSlicer);
