/**
 * CAPA DE BASE DE DATOS — db.js
 *
 * Responsabilidad: inicialización de Firebase y todas las
 * operaciones CRUD contra Firestore. Ninguna lógica de negocio
 * ni manipulación del DOM debe vivir aquí.
 *
 * Colecciones:
 *   - cotizaciones       → trabajos guardados
 *   - filamentos         → inventario de materiales
 *   - settings/config    → configuración de costos
 *   - settings/empresa   → datos de la empresa
 */

'use strict';

/* ----------------------------------------------------------
   Configuración e inicialización de Firebase
---------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyB2UayVDH7Z6zswyNPmf8c8cOKv9elgxCw",
  authDomain: "cotizador3d-d984c.firebaseapp.com",
  projectId: "cotizador3d-d984c",
  storageBucket: "cotizador3d-d984c.firebasestorage.app",
  messagingSenderId: "549722817821",
  appId: "1:549722817821:web:b307a539e1eac9a4cb4df4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ----------------------------------------------------------
   Cotizaciones
---------------------------------------------------------- */

/** Carga todos los trabajos desde Firestore, ordenados por fecha desc. */
async function fbCargarTrabajos() {
  const snap = await db.collection('cotizaciones').get();
  const arr = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  arr.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return arr;
}

/** Guarda o actualiza una cotización (excluye _desglose temporal). */
async function fbGuardarCotizacion(data) {
  const { _desglose, ...clean } = data;
  await db.collection('cotizaciones').doc(String(data.id)).set(clean);
}

/** Actualiza el estado y registra la fecha de actualización. */
async function fbActualizarEstado(id, estado) {
  await db.collection('cotizaciones').doc(String(id)).update({
    estado,
    fechaActualizacionEstado: new Date().toISOString()
  });
}

/** Elimina una cotización. */
async function fbEliminarCotizacion(id) {
  await db.collection('cotizaciones').doc(String(id)).delete();
}

/* ----------------------------------------------------------
   Inventario de filamentos
---------------------------------------------------------- */

/** Carga todos los filamentos. */
async function fbCargarFilamentos() {
  const snap = await db.collection('filamentos').get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/** Guarda o actualiza un filamento. */
async function fbGuardarFilamento(data) {
  await db.collection('filamentos').doc(String(data.id)).set(data);
}

/** Elimina un filamento. */
async function fbEliminarFilamento(id) {
  await db.collection('filamentos').doc(String(id)).delete();
}

/* ----------------------------------------------------------
   Configuración de costos
---------------------------------------------------------- */

/** Persiste la configuración de costos. */
async function fbGuardarConfig(data) {
  await db.collection('settings').doc('config').set(data);
}

/** Lee la configuración de costos. */
async function fbCargarConfig() {
  const snap = await db.collection('settings').doc('config').get();
  return snap.exists ? snap.data() : null;
}

/* ----------------------------------------------------------
   Datos de empresa
---------------------------------------------------------- */

/** Persiste los datos de empresa. */
async function fbGuardarEmpresa(data) {
  await db.collection('settings').doc('empresa').set(data);
}

/** Lee los datos de empresa. */
async function fbCargarEmpresa() {
  const snap = await db.collection('settings').doc('empresa').get();
  return snap.exists ? snap.data() : null;
}

/* ----------------------------------------------------------
   Usuarios / Perfiles
---------------------------------------------------------- */

/** Guarda o reemplaza el perfil de un usuario en Firestore. */
async function fbGuardarPerfil(uid, data) {
  await db.collection('usuarios').doc(uid).set(data);
}

/** Lee el perfil de un usuario. */
async function fbCargarPerfil(uid) {
  const snap = await db.collection('usuarios').doc(uid).get();
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

/** Carga todos los perfiles de usuario. */
async function fbCargarUsuarios() {
  const snap = await db.collection('usuarios').get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/** Elimina el perfil de un usuario. */
async function fbEliminarPerfil(uid) {
  await db.collection('usuarios').doc(uid).delete();
}

/* ----------------------------------------------------------
   Diagnóstico de conexión
---------------------------------------------------------- */

/** Verifica conectividad y actualiza el indicador de estado. */
async function testFirebase() {
  try {
    await db.collection('settings').limit(1).get();
    document.getElementById('fb-dot').className = 'status-dot connected';
    document.getElementById('fb-status-text').textContent = 'Firebase conectado';
  } catch (e) {
    document.getElementById('fb-dot').className = 'status-dot error';
    document.getElementById('fb-status-text').textContent = 'Sin conexión';
  }
}

/* ----------------------------------------------------------
   Clientes
   Colección: clientes
   Campos: nombre, telefono, correo, instagram, direccion,
           notas, fechaCreacion, totalPedidos, totalComprado
---------------------------------------------------------- */

/** Guarda o actualiza un cliente. */
async function fbGuardarCliente(data) {
  await db.collection('clientes').doc(String(data.id)).set(data);
}

/** Carga todos los clientes, ordenados por nombre. */
async function fbCargarClientes() {
  const snap = await db.collection('clientes').get();
  const arr = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  return arr;
}

/** Elimina un cliente. */
async function fbEliminarCliente(id) {
  await db.collection('clientes').doc(String(id)).delete();
}

/** Actualiza datos de pago de una cotización. */
async function fbActualizarPago(id, pago) {
  await db.collection('cotizaciones').doc(String(id)).update(pago);
}
