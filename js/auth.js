/**
 * CAPA DE AUTENTICACIÓN — auth.js
 *
 * Responsabilidad: Firebase Auth, gestión de sesión, login/logout,
 * registro de usuarios y control de acceso por rol.
 *
 * Roles:
 *   admin   → cotizador, trabajos, inventario, configuracion, usuarios
 *   usuario → cotizador, trabajos
 *
 * Depende de: db.js (firebase/auth ya inicializado), logic.js (el/toast)
 */

'use strict';

/* ----------------------------------------------------------
   Estado de autenticación
---------------------------------------------------------- */
const auth = firebase.auth();

let currentUser   = null;
let currentRole   = null;
let currentPerfil = null;

const ROLE_PAGES = {
  admin:   ['cotizador', 'trabajos', 'inventario', 'configuracion', 'usuarios', 'dashboard', 'clientes', 'detalle', 'costos'],
  usuario: ['cotizador', 'trabajos', 'dashboard', 'clientes', 'detalle']
};

/* ----------------------------------------------------------
   Inicialización — punto de entrada
---------------------------------------------------------- */
function initAuth() {
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      await cargarPerfilUsuario(user.uid);
      mostrarApp();
    } else {
      currentUser   = null;
      currentRole   = null;
      currentPerfil = null;
      // Decide si mostrar setup inicial o login normal
      try {
        const snap = await db.collection('usuarios').limit(1).get();
        if (snap.empty) {
          mostrarSetupInicial();
        } else {
          mostrarPantallaLogin();
        }
      } catch (e) {
        mostrarPantallaLogin();
      }
    }
  });
}

/* ----------------------------------------------------------
   Perfil de usuario en Firestore
---------------------------------------------------------- */
async function cargarPerfilUsuario(uid) {
  try {
    const snap = await db.collection('usuarios').doc(uid).get();
    if (snap.exists) {
      currentPerfil = snap.data();
      currentRole   = currentPerfil.rol || 'usuario';
    } else {
      currentRole   = 'usuario';
      currentPerfil = { nombre: currentUser.email, email: currentUser.email, rol: 'usuario' };
    }
  } catch (e) {
    currentRole   = 'usuario';
    currentPerfil = { nombre: currentUser.email, email: currentUser.email, rol: 'usuario' };
  }
}

/* ----------------------------------------------------------
   Control de pantallas
---------------------------------------------------------- */
function mostrarSetupInicial() {
  el('auth-screen').style.display  = 'flex';
  el('auth-login').style.display   = 'none';
  el('auth-setup').style.display   = 'block';
  el('app-layout').style.display   = 'none';
}

function mostrarPantallaLogin() {
  el('auth-screen').style.display  = 'flex';
  el('auth-login').style.display   = 'block';
  el('auth-setup').style.display   = 'none';
  el('app-layout').style.display   = 'none';
}

function mostrarApp() {
  el('auth-screen').style.display = 'none';
  el('app-layout').style.display  = 'flex';
  aplicarRol();
  actualizarUIUsuario();
  if (typeof onAuthSuccess === 'function') onAuthSuccess();
}

/* ----------------------------------------------------------
   Aplicar rol — mostrar/ocultar navegación
---------------------------------------------------------- */
function aplicarRol() {
  const pages = ROLE_PAGES[currentRole] || ROLE_PAGES.usuario;

  document.querySelectorAll('.nav-item[data-page]').forEach(navItem => {
    const page = navItem.getAttribute('data-page');
    navItem.style.display = pages.includes(page) ? '' : 'none';
  });

  // Secciones marcadas como solo-admin
  document.querySelectorAll('[data-admin-only]').forEach(s => {
    s.style.display = currentRole === 'admin' ? '' : 'none';
  });
}

/* ----------------------------------------------------------
   Actualizar UI con datos del usuario actual
---------------------------------------------------------- */
function actualizarUIUsuario() {
  if (!currentPerfil) return;
  const nombre  = currentPerfil.nombre || currentUser?.email || '?';
  const email   = currentPerfil.email  || currentUser?.email || '—';
  const inicial = nombre.charAt(0).toUpperCase();
  const esAdmin = currentRole === 'admin';

  const sid = el('sidebar-avatar');    if (sid) sid.textContent = inicial;
  const sn  = el('sidebar-nombre');   if (sn)  sn.textContent  = nombre;
  const se  = el('sidebar-email');    if (se)  se.textContent  = email;
  const srb = el('sidebar-role-badge');
  if (srb) {
    srb.textContent = esAdmin ? 'Admin' : 'Usuario';
    srb.className   = 'role-badge ' + (esAdmin ? 'role-admin' : 'role-user');
  }

  const ta = el('topbar-avatar'); if (ta) ta.textContent = inicial;

  if (el('mi-nombre')) el('mi-nombre').value = nombre;
  if (el('mi-email-val')) el('mi-email-val').textContent = email;
  if (el('mi-rol-val'))   el('mi-rol-val').textContent   = esAdmin ? 'Administrador' : 'Usuario';
}

/* ----------------------------------------------------------
   Login
---------------------------------------------------------- */
async function login() {
  const emailVal = el('auth-email')?.value?.trim();
  const passVal  = el('auth-pass')?.value;
  const errEl    = el('auth-error');
  const btn      = el('auth-login-btn');

  if (!emailVal || !passVal) {
    errEl.textContent = 'Complete todos los campos';
    errEl.style.display = 'block';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
  errEl.style.display = 'none';

  try {
    await auth.signInWithEmailAndPassword(emailVal, passVal);
    // onAuthStateChanged se encarga del resto
  } catch (e) {
    console.error('Login error:', e.code, e.message);
    let msg = 'Error al iniciar sesión';
    if (['auth/user-not-found','auth/wrong-password','auth/invalid-credential',
         'auth/invalid-login-credentials','auth/invalid-email-and-password'].includes(e.code))
      msg = 'Email o contraseña incorrectos';
    else if (e.code === 'auth/too-many-requests')      msg = 'Demasiados intentos. Intente más tarde';
    else if (e.code === 'auth/invalid-email')           msg = 'Email inválido';
    else if (e.code === 'auth/network-request-failed') msg = 'Error de red. Verifique su conexión.';
    else if (e.code === 'auth/user-disabled')           msg = 'Esta cuenta está deshabilitada.';
    errEl.textContent = msg;
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

/* ----------------------------------------------------------
   Registro del primer administrador
---------------------------------------------------------- */
async function registrarPrimerAdmin() {
  const nombre  = el('setup-nombre')?.value?.trim();
  const emailV  = el('setup-email')?.value?.trim();
  const passV   = el('setup-pass')?.value;
  const errEl   = el('setup-error');
  const btn     = el('setup-btn');

  if (!nombre || !emailV || !passV) {
    errEl.textContent = 'Complete todos los campos'; errEl.style.display = 'block'; return;
  }
  if (passV.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta…'; }
  errEl.style.display = 'none';

  try {
    const cred = await auth.createUserWithEmailAndPassword(emailV, passV);
    await fbGuardarPerfil(cred.user.uid, {
      nombre, email: emailV, rol: 'admin',
      creadoEn: new Date().toISOString()
    });
    // onAuthStateChanged handle the rest
  } catch (e) {
    let msg = 'Error al crear la cuenta';
    if (e.code === 'auth/email-already-in-use') msg = 'Este email ya está registrado';
    else if (e.code === 'auth/invalid-email')   msg = 'Email inválido';
    else if (e.code === 'auth/weak-password')   msg = 'Contraseña muy débil (mínimo 6 caracteres)';
    errEl.textContent = msg; errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta'; }
  }
}

/* ----------------------------------------------------------
   Logout
---------------------------------------------------------- */
async function logout() {
  if (!confirm('¿Desea cerrar sesión?')) return;
  try {
    await auth.signOut();
    // onAuthStateChanged → mostrarPantallaLogin
  } catch (e) {
    toast('Error al cerrar sesión', 'error');
  }
}

/* ----------------------------------------------------------
   Recuperar contraseña
---------------------------------------------------------- */
async function recuperarPassword() {
  const emailV = el('auth-email')?.value?.trim();
  const errEl  = el('auth-error');
  if (!emailV) {
    errEl.textContent = 'Ingrese su email para recuperar la contraseña';
    errEl.style.display = 'block'; return;
  }
  try {
    await auth.sendPasswordResetEmail(emailV);
    errEl.style.display = 'none';
    toast('Email de recuperación enviado ✓', 'success');
  } catch (e) {
    errEl.textContent = 'No se pudo enviar el email. Verifique la dirección.';
    errEl.style.display = 'block';
  }
}

/* ----------------------------------------------------------
   Crear usuario (solo admin)
---------------------------------------------------------- */
async function crearUsuario() {
  if (currentRole !== 'admin') return;

  const nombre  = el('nu-nombre')?.value?.trim();
  const emailV  = el('nu-email')?.value?.trim();
  const passV   = el('nu-pass')?.value;
  const rol     = el('nu-rol')?.value || 'usuario';
  const errEl   = el('nu-error');
  const btn     = el('nu-btn');

  if (!nombre || !emailV || !passV) {
    errEl.textContent = 'Complete todos los campos obligatorios';
    errEl.style.display = 'block'; return;
  }
  if (passV.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    errEl.style.display = 'block'; return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  errEl.style.display = 'none';

  try {
    // App secundaria para no cerrar sesión del admin actual
    const appName  = 'temp-' + Date.now();
    const tempApp  = firebase.initializeApp(firebase.app().options, appName);
    const tempAuth = firebase.auth(tempApp);

    const cred = await tempAuth.createUserWithEmailAndPassword(emailV, passV);
    const uid  = cred.user.uid;
    await tempAuth.signOut();
    await tempApp.delete();

    await fbGuardarPerfil(uid, {
      nombre, email: emailV, rol,
      creadoEn: new Date().toISOString()
    });

    toast(`Usuario "${nombre}" creado ✓`, 'success');
    limpiarFormCrearUsuario();
    cargarUsuarios();
  } catch (e) {
    let msg = 'Error al crear el usuario';
    if (e.code === 'auth/email-already-in-use') msg = 'Este email ya está registrado';
    else if (e.code === 'auth/invalid-email')   msg = 'Email inválido';
    else if (e.code === 'auth/weak-password')   msg = 'Contraseña muy débil (mínimo 6 caracteres)';
    errEl.textContent = msg; errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Crear usuario'; }
  }
}

function limpiarFormCrearUsuario() {
  ['nu-nombre','nu-email','nu-pass'].forEach(f => { if (el(f)) el(f).value = ''; });
  if (el('nu-rol'))   el('nu-rol').value = 'usuario';
  if (el('nu-error')) el('nu-error').style.display = 'none';
  const btn = el('nu-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Crear usuario'; }
}

/* ----------------------------------------------------------
   Cambiar mi contraseña
---------------------------------------------------------- */
async function cambiarMiPassword() {
  const actual  = el('mi-pass-actual')?.value;
  const nueva   = el('mi-pass-nueva')?.value;
  const conf    = el('mi-pass-conf')?.value;
  const errEl   = el('mi-pass-error');

  if (!actual || !nueva || !conf) {
    errEl.textContent = 'Complete todos los campos'; errEl.style.display = 'block'; return;
  }
  if (nueva !== conf) {
    errEl.textContent = 'Las contraseñas nuevas no coinciden'; errEl.style.display = 'block'; return;
  }
  if (nueva.length < 6) {
    errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return;
  }

  errEl.style.display = 'none';

  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, actual);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(nueva);
    ['mi-pass-actual','mi-pass-nueva','mi-pass-conf'].forEach(f => { if (el(f)) el(f).value = ''; });
    toast('Contraseña actualizada ✓', 'success');
  } catch (e) {
    let msg = 'Error al cambiar la contraseña';
    if (['auth/wrong-password','auth/invalid-credential'].includes(e.code))
      msg = 'Contraseña actual incorrecta';
    errEl.textContent = msg; errEl.style.display = 'block';
  }
}

/* ----------------------------------------------------------
   Gestión de usuarios (solo admin)
---------------------------------------------------------- */
async function cargarUsuarios() {
  if (currentRole !== 'admin') return;
  try {
    const usuarios = await fbCargarUsuarios();
    renderizarUsuarios(usuarios);
  } catch (e) {
    toast('Error al cargar usuarios', 'error');
  }
}

function renderizarUsuarios(usuarios) {
  const tbody = el('users-tbody');
  if (!tbody) return;

  el('users-empty').style.display = usuarios.length ? 'none'  : 'block';
  el('users-table').style.display = usuarios.length ? 'table' : 'none';

  tbody.innerHTML = usuarios.map(u => {
    const esSelf   = currentUser && u.id === currentUser.uid;
    const rolClass = u.rol === 'admin' ? 'role-admin' : 'role-user';
    const rolLabel = u.rol === 'admin' ? 'Admin' : 'Usuario';
    const inicial  = (u.nombre || u.email || '?').charAt(0).toUpperCase();
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar-sm">${inicial}</div>
          <div>
            <div style="font-size:.82rem;font-weight:600">${escHtml(u.nombre||'—')}</div>
            ${esSelf ? '<span class="user-row-self">Tú mismo</span>' : ''}
          </div>
        </div>
      </td>
      <td style="font-size:.8rem;color:var(--text2)">${escHtml(u.email||'—')}</td>
      <td><span class="role-badge ${rolClass}">${rolLabel}</span></td>
      <td style="font-size:.78rem;color:var(--text2)">${u.creadoEn ? u.creadoEn.split('T')[0] : '—'}</td>
      <td>
        <div class="td-actions">
          ${!esSelf ? `
          <select class="badge ${rolClass}" style="padding:3px 8px;font-size:.72rem;cursor:pointer"
            onchange="cambiarRolUsuario('${u.id}',this.value,'${escHtml(u.nombre||'')}',this)">
            <option value="admin"${u.rol==='admin'?' selected':''}>Admin</option>
            <option value="usuario"${u.rol==='usuario'?' selected':''}>Usuario</option>
          </select>
          <button class="btn btn-danger btn-icon btn-sm" title="Eliminar"
            onclick='eliminarUsuario("${u.id}","${escHtml(u.nombre||u.email||'')}")'>
            <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>` : '<span style="font-size:.72rem;color:var(--text3);font-style:italic">—</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function cambiarRolUsuario(uid, nuevoRol, nombre, selectEl) {
  if (currentRole !== 'admin') return;
  try {
    await db.collection('usuarios').doc(uid).update({ rol: nuevoRol });
    const rolClass = nuevoRol === 'admin' ? 'role-admin' : 'role-user';
    if (selectEl) selectEl.className = 'badge ' + rolClass;
    toast(`Rol de "${nombre}" actualizado a ${nuevoRol} ✓`, 'success');
  } catch (e) {
    toast('Error al cambiar el rol', 'error');
    cargarUsuarios();
  }
}

async function eliminarUsuario(uid, nombre) {
  if (currentRole !== 'admin') return;
  if (!confirm(`¿Eliminar el perfil de "${nombre}"?\n\nNota: esto elimina el perfil en Firestore. Para revocar el acceso de Firebase Auth use la Consola de Firebase.`)) return;
  try {
    await fbEliminarPerfil(uid);
    toast(`Usuario "${nombre}" eliminado ✓`, 'success');
    cargarUsuarios();
  } catch (e) {
    toast('Error al eliminar el usuario', 'error');
  }
}

/* ----------------------------------------------------------
   Inicialización
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', initAuth);
