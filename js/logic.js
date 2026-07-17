/**
 * CAPA DE LÓGICA DE NEGOCIO — logic.js
 *
 * Responsabilidad: funciones auxiliares y todos los cálculos
 * de cotización. Sin llamadas a Firebase ni renderizado HTML.
 */

'use strict';

/* ----------------------------------------------------------
   Helpers de uso general
---------------------------------------------------------- */

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().split('T')[0];
const fmt   = n  => new Intl.NumberFormat('es-CR', { style:'currency', currency:'CRC', minimumFractionDigits:0, maximumFractionDigits:0 }).format(Math.ceil(n || 0));
const fv    = id => parseFloat(document.getElementById(id)?.value) || 0;
const set   = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
const el    = id => document.getElementById(id);

/* ----------------------------------------------------------
   Cálculo auxiliar: costo de electricidad por hora
---------------------------------------------------------- */

/** Recalcula el campo readonly cfg_elec_h = (watts/1000) × tarifa_kWh */
function calcCfg() {
  const watts = fv('cfg_watts');
  const kwh   = fv('cfg_kwh');
  const inp   = el('cfg_elec_h');
  if (inp) inp.value = ((watts / 1000) * kwh).toFixed(2);
}

/**
 * Costo de electricidad de un trabajo guardado.
 * Usa el valor persistido (costo_electricidad) si existe; para trabajos
 * guardados antes de que ese campo existiera, lo aproxima con la tarifa
 * eléctrica configurada actualmente.
 */
function costoElectricidadTrabajo(t) {
  if (typeof t.costo_electricidad === 'number') return t.costo_electricidad;
  const watts = fv('cfg_watts') || 200;
  const kwh   = fv('cfg_kwh')   || 130;
  const elecH = (watts / 1000) * kwh;
  return (t.horas_imp || 0) * elecH * Math.max(t.placas || 1, 1);
}

/* ----------------------------------------------------------
   Precio manual por objeto ↔ % Margen
   (mientras el precio manual está activo, el % de margen se
   actualiza solo para mostrar el margen efectivo; al vaciar el
   precio manual se restaura el margen que había antes)
---------------------------------------------------------- */
let _margenAntesDeManual = null;

function manejarPrecioManualInput() {
  const manualEl = el('c_precio_manual');
  const margenEl = el('c_margen');
  if (manualEl && margenEl) {
    if (fv('c_precio_manual') > 0) {
      if (_margenAntesDeManual === null) _margenAntesDeManual = margenEl.value;
    } else if (_margenAntesDeManual !== null) {
      margenEl.value = _margenAntesDeManual;
      _margenAntesDeManual = null;
    }
  }
  calcular();
}

function manejarMargenInput() {
  _margenAntesDeManual = null;
  const m = el('c_precio_manual');
  if (m) m.value = '';
  calcular();
}

/* ----------------------------------------------------------
   Cálculo principal de cotización
---------------------------------------------------------- */

/**
 * Flujo del cálculo:
 *
 *  1. costos (material, elec, desgaste, mo, dis, postpro, otros) × placas
 *     → subtotal de las placas
 *  2. subtotal × (1 + pFallos/100)
 *     → costoTotalPlacas
 *  3. costoTotalPlacas ÷ cantidad de objetos
 *     → costoUnitario  (costo por objeto)
 *  4. costoUnitario × (1 + pMargen/100)
 *     → precioAnteIVA  (precio por objeto antes de IVA)
 *  5. precioAnteIVA × (1 + pIVA/100) → redondear al 100 más cercano
 *     → precioObjeto   (precio unitario final)
 *  6. precioObjeto × cantidad
 *     → precioTotal    (lo que se cobra por todo el trabajo)
 */
function calcular() {
  const gramos       = fv('c_gramos');
  const horasImp     = fv('c_horas_imp');
  const horasMO      = fv('c_horas_mo');
  const horasDis     = fv('c_horas_dis');
  const costoDisFijo = fv('c_costo_dis');
  const postpro      = fv('c_postpro');
  const otros        = fv('c_otros');
  const pFallos      = fv('c_fallos');
  const pMargen      = fv('c_margen');
  const pIVA         = fv('c_iva');
  const placas       = Math.max(fv('c_placas'),   1);
  const cantidad     = Math.max(fv('c_cantidad'), 1);
  const totalObjetos = cantidad * placas;

  const costoG    = fv('cfg_costo_g')    || 8;
  const watts     = fv('cfg_watts')      || 200;
  const kwh       = fv('cfg_kwh')        || 130;
  const desgasteH = fv('cfg_desgaste_h') || 150;
  const moH       = fv('cfg_mo_h')       || 3000;
  const disH      = fv('cfg_dis_h')      || 5000;

  const elecH = (watts / 1000) * kwh;

  const costeMateriales = (typeof calcularTotalMaterialesAdicionales === 'function') ? calcularTotalMaterialesAdicionales() : 0;

  // Paso 1: costos × placas (costo fijo de diseño se aplica una sola vez)
  const material = gramos   * costoG    * placas;
  const elec     = horasImp * elecH     * placas;
  const desgaste = horasImp * desgasteH * placas;
  const mo       = horasMO  * moH       * placas;
  const dis      = horasDis * disH      * placas + costoDisFijo;
  const subtotal = material + elec + desgaste + mo + dis + postpro * placas + otros * placas + costeMateriales;

  // Paso 2: fallos → costo total de todas las placas
  const fallosVal        = subtotal * (pFallos / 100);
  const costoTotalPlacas = subtotal + fallosVal;

  // Paso 3: ÷ total de objetos (cantidad × placas) → costo por objeto
  const costoUnitario = costoTotalPlacas / totalObjetos;

  // Paso 4-6: modo automático (margen → precio) o modo manual (precio → margen)
  const precioManual = fv('c_precio_manual');
  let gananciaObjeto, antesIVA, ivaVal, precioRedondeado, precioTotal, margenEfectivo;

  if (precioManual > 0) {
    // Modo manual: el usuario fijó el precio final por objeto → calcular margen implícito
    precioRedondeado = precioManual;
    precioTotal      = precioRedondeado * totalObjetos;
    const precioSinIVA = precioRedondeado / (1 + pIVA / 100);
    antesIVA         = precioSinIVA;
    ivaVal           = precioRedondeado - precioSinIVA;
    gananciaObjeto   = precioSinIVA - costoUnitario;
    margenEfectivo   = costoUnitario > 0 ? (gananciaObjeto / costoUnitario) * 100 : 0;
    // Actualizar campo de margen con el valor calculado
    const margenEl = el('c_margen');
    if (margenEl && document.activeElement !== margenEl) margenEl.value = margenEfectivo.toFixed(1);
    const ind = el('b_modo_precio');
    if (ind) ind.style.display = 'inline';
  } else {
    // Modo automático: el usuario fijó el margen → calcular precio
    gananciaObjeto   = costoUnitario * (pMargen / 100);
    antesIVA         = costoUnitario + gananciaObjeto;
    ivaVal           = antesIVA * (pIVA / 100);
    const precioObjeto = antesIVA + ivaVal;
    precioRedondeado = Math.ceil(precioObjeto / 100) * 100;
    precioTotal      = precioRedondeado * totalObjetos;
    margenEfectivo   = pMargen;
    const ind = el('b_modo_precio');
    if (ind) ind.style.display = 'none';
  }

  // Actualizar desglose en pantalla
  set('b_material',           fmt(material));
  set('b_elec',               fmt(elec));
  set('b_desgaste',           fmt(desgaste));
  set('b_mo',                 fmt(mo));
  set('b_dis',                fmt(dis));
  set('b_post',               fmt(postpro * placas));
  set('b_otros',              fmt(otros   * placas));
  const hayMat = costeMateriales > 0;
  if (el('b_materiales_row')) el('b_materiales_row').style.display = hayMat ? '' : 'none';
  set('b_materiales',         fmt(costeMateriales));
  set('b_sub',                fmt(subtotal));
  set('b_fallos_label',       `+ Fallos (${pFallos}%)`);
  set('b_fallos_val',         fmt(fallosVal));
  set('b_costo_fallos_label', `Costo total (${placas} placa${placas !== 1 ? 's' : ''})`);
  set('b_costo_fallos',       fmt(costoTotalPlacas));
  set('b_costo_obj_label',    `÷ Objetos (${totalObjetos}${placas > 1 ? ` = ${cantidad}×${placas}` : ''})`);
  set('b_costo_obj',          fmt(costoUnitario));
  set('b_margen_label',       `+ Ganancia (${margenEfectivo.toFixed(1)}%)`);
  set('b_margen_val',         fmt(gananciaObjeto));
  set('b_antes_iva',          fmt(antesIVA));
  set('b_iva_label',          `+ IVA (${pIVA}%)`);
  set('b_iva_val',            fmt(ivaVal));
  set('b_unitario_label',     `PRECIO POR OBJETO`);
  set('b_unitario',           fmt(precioRedondeado));
  set('b_total_label',        `PRECIO TOTAL (× ${totalObjetos} objeto${totalObjetos !== 1 ? 's' : ''})`);
  set('b_final',              fmt(precioTotal));

  return { material, elec, desgaste, mo, dis, postpro, otros,
           placas, cantidad, totalObjetos,
           subtotal, fallosVal, costoTotalPlacas, costoUnitario,
           gananciaObjeto, antesIVA, ivaVal,
           precioRedondeado, precioTotal };
}

/* ----------------------------------------------------------
   Carga de configuración desde localStorage
---------------------------------------------------------- */

/**
 * Rellena formularios con los valores guardados en localStorage.
 * Se llama al iniciar, antes de intentar sincronizar con Firebase.
 */
function cargarCfgLocal() {
  const saved = localStorage.getItem('cfg3d');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      const fields = ['cfg_costo_g','cfg_watts','cfg_kwh','cfg_desgaste_h','cfg_mo_h','cfg_dis_h','cfg_fallos','cfg_margen','cfg_iva'];
      fields.forEach(f => { if (cfg[f] !== undefined && el(f)) el(f).value = cfg[f]; });
      if (cfg.cfg_fallos !== undefined && el('c_fallos')) el('c_fallos').value = cfg.cfg_fallos;
      if (cfg.cfg_margen !== undefined && el('c_margen')) el('c_margen').value = cfg.cfg_margen;
      if (cfg.cfg_iva    !== undefined && el('c_iva'))    el('c_iva').value    = cfg.cfg_iva;
    } catch (e) {}
  }
  const savedEmp = localStorage.getItem('emp3d');
  if (savedEmp) {
    try {
      const emp = JSON.parse(savedEmp);
      ['emp_nombre','emp_email','emp_tel','emp_web','emp_cedula','emp_nota'].forEach(f => {
        if (emp[f] !== undefined && el(f)) el(f).value = emp[f];
      });
    } catch (e) {}
  }
}
