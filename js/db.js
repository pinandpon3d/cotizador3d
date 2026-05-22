/* ═══════════════════════════════════════════════════════
   db.js  —  Conexión Firebase + operaciones Firestore
   ═══════════════════════════════════════════════════════ */

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
db.enablePersistence().catch(() => {});

const COL_COT = 'cotizaciones';
const COL_FIL = 'filamentos';

/* ── Auth helpers ───────────────────────────────────── */
const AUTH_PW_KEY   = 'p3d_pw_hash';
const AUTH_SESS_KEY = 'p3d_session';
const AUTH_NAME_KEY = 'p3d_display_name';
const AUTH_SESS_H   = 24;

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function checkSession() {
  try {
    const {exp} = JSON.parse(localStorage.getItem(AUTH_SESS_KEY)||'{}');
    return Date.now() < (exp||0);
  } catch { return false; }
}
function startSession(name) {
  localStorage.setItem(AUTH_SESS_KEY, JSON.stringify({exp: Date.now() + AUTH_SESS_H*3600000}));
  if (name) localStorage.setItem(AUTH_NAME_KEY, name);
}
function clearSession() { localStorage.removeItem(AUTH_SESS_KEY); }

/* ── Trabajos / Cotizaciones ─────────────────────────── */
async function dbCargarTrabajos() {
  const snap = await db.collection(COL_COT).orderBy('fecha','desc').get();
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}
async function dbGuardarCotizacion(data, id = null) {
  if (id) {
    await db.collection(COL_COT).doc(id).update({...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
    return id;
  }
  const ref = await db.collection(COL_COT).add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
  return ref.id;
}
async function dbCambiarEstado(id, estado) {
  await db.collection(COL_COT).doc(id).update({estado, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
}
async function dbEliminarTrabajo(id) {
  await db.collection(COL_COT).doc(id).delete();
}

/* ── Inventario / Filamentos ─────────────────────────── */
async function dbCargarFilamentos() {
  const snap = await db.collection(COL_FIL).orderBy('tipo').get();
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}
async function dbGuardarFilamento(data, id = null) {
  if (id) {
    await db.collection(COL_FIL).doc(id).update({...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
    return id;
  }
  const ref = await db.collection(COL_FIL).add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
  return ref.id;
}
async function dbEliminarFilamento(id) {
  await db.collection(COL_FIL).doc(id).delete();
}

/* ── Configuración ───────────────────────────────────── */
async function dbCargarConfig() {
  const snap = await db.collection('settings').doc('config').get();
  return snap.exists ? snap.data() : {};
}
async function dbGuardarConfig(data) {
  await db.collection('settings').doc('config').set(data);
}
async function dbCargarEmpresa() {
  const snap = await db.collection('settings').doc('empresa').get();
  return snap.exists ? snap.data() : {};
}
async function dbGuardarEmpresa(data) {
  await db.collection('settings').doc('empresa').set(data);
}
