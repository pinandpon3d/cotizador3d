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
const fmt   = n  => new Intl.NumberFormat('es-CR', { style:'currency', currency:'CRC', minimumFractionDigits:2 }).format(n || 0);
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

/* ----------------------------------------------------------
   Cálculo principal de cotización
---------------------------------------------------------- */

/**
 * Lee todos los inputs, calcula los componentes de costo y
 * actualiza el desglose en pantalla. Devuelve el objeto de valores.
 *
 * Fórmula:
 *   material  = gramos × costo_g
 *   elec      = horas_imp × (watts/1000 × kwh)
 *   desgaste  = horas_imp × desgaste_h
 *   mo        = horas_mo  × mo_h
 *   dis       = horas_dis × dis_h + costo_fijo_dis
 *   subtotal  = Σ anteriores + postpro + otros
 *   +fallos   = subtotal × (pFallos/100)
 *   +margen   = (subtotal+fallos) × (pMargen/100)
 *   +IVA      = antesIVA × (pIVA/100)
 *   precioFinal redondeado al 100 más cercano
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

  const costoG    = fv('cfg_costo_g')    || 8;
  const watts     = fv('cfg_watts')      || 200;
  const kwh       = fv('cfg_kwh')        || 130;
  const desgasteH = fv('cfg_desgaste_h') || 150;
  const moH       = fv('cfg_mo_h')       || 3000;
  const disH      = fv('cfg_dis_h')      || 5000;

  const elecH    = (watts / 1000) * kwh;
  const material = gramos * costoG;
  const elec     = horasImp * elecH;
  const desgaste = horasImp * desgasteH;
  const mo       = horasMO * moH;
  const dis      = horasDis * disH + costoDisFijo;
  const subtotal = material + elec + desgaste + mo + dis + postpro + otros;

  const fallosVal        = subtotal * (pFallos / 100);
  const costoFallos      = subtotal + fallosVal;
  const margenVal        = costoFallos * (pMargen / 100);
  const antesIVA         = costoFallos + margenVal;
  const ivaVal           = antesIVA * (pIVA / 100);
  const precioFinal      = antesIVA + ivaVal;
  const precioRedondeado = Math.round(precioFinal / 100) * 100;

  set('b_material',     fmt(material));
  set('b_elec',         fmt(elec));
  set('b_desgaste',     fmt(desgaste));
  set('b_mo',           fmt(mo));
  set('b_dis',          fmt(dis));
  set('b_post',         fmt(postpro));
  set('b_otros',        fmt(otros));
  set('b_sub',          fmt(subtotal));
  set('b_fallos_label', `+ Fallos (${pFallos}%)`);
  set('b_fallos_val',   fmt(fallosVal));
  set('b_costo_fallos', fmt(costoFallos));
  set('b_margen_label', `+ Ganancia (${pMargen}%)`);
  set('b_margen_val',   fmt(margenVal));
  set('b_antes_iva',    fmt(antesIVA));
  set('b_iva_label',    `+ IVA (${pIVA}%)`);
  set('b_iva_val',      fmt(ivaVal));
  set('b_final',        fmt(precioRedondeado));

  return { material, elec, desgaste, mo, dis, postpro, otros,
           subtotal, fallosVal, costoFallos, margenVal,
           antesIVA, ivaVal, precioFinal, precioRedondeado };
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
