/**
 * Catálogo de Productos: configuración, CRUD, imágenes y selección de productos para el PDF del catálogo.
 *
 * Parte del controlador de aplicación (antes app.js), dividido en módulos
 * por área funcional para facilitar su mantenimiento.
 */

'use strict';

/* ----------------------------------------------------------
   Catálogo de Productos — configuración, CRUD e imágenes
---------------------------------------------------------- */
const CATALOGO_DEFAULTS = {
  cover_kicker:  'Impresión 3D · Costa Rica',
  cover_title:   'Catálogo de Productos',
  cover_edition: 'Edición 2026 · Volumen 01',
  cover_contact: '@pinandpon3d · WhatsApp 8411-3321',
  cover_tag:     'Hecho a tu medida · Calidad garantizada',
  back_title:    '¿Tienes una idea? La imprimimos',
  back_text:     'Cuéntanos qué necesitas y lo convertimos en una pieza única, impresa con cuidado y entregada a tiempo.',
  back_wa:       '8411-3321',
  back_ig:       '@pinandpon3d'
};

function cargarCatalogo() {
  const cfg = { ...CATALOGO_DEFAULTS, ...catalogoConfig };
  Object.keys(CATALOGO_DEFAULTS).forEach(k => {
    const e = el('cat_' + k);
    if (e && document.activeElement !== e) e.value = cfg[k];
  });
  cargarCategoriasCatalogo();
  renderCatalogoProductos();
}

async function guardarConfigCatalogo() {
  const data = {};
  Object.keys(CATALOGO_DEFAULTS).forEach(k => { data[k] = el('cat_' + k)?.value.trim() || ''; });
  catalogoConfig = data;
  try { localStorage.setItem('catalogoConfig3d', JSON.stringify(data)); } catch(e){}
  try {
    await fbGuardarCatalogoConfig(data);
    toast('Configuración del catálogo guardada ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar la configuración del catálogo','error');
  }
}

/** Redimensiona y comprime una imagen en el navegador (canvas → JPEG) antes de guardarla. */
function comprimirImagen(file, maxLado = 900, calidadInicial = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > maxLado || height > maxLado) {
          if (width >= height) { height = Math.round(height * maxLado / width); width = maxLado; }
          else                 { width  = Math.round(width  * maxLado / height); height = maxLado; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let calidad = calidadInicial;
        let out = canvas.toDataURL('image/jpeg', calidad);
        while (out.length > 700000 && calidad > 0.35) {
          calidad -= 0.12;
          out = canvas.toDataURL('image/jpeg', calidad);
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function manejarImagenCatalogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Seleccione un archivo de imagen válido','error'); input.value=''; return; }
  comprimirImagen(file)
    .then(dataUrl => { _catImagenPendiente = dataUrl; mostrarPreviewImagenCatalogo(dataUrl); })
    .catch(() => toast('No se pudo procesar la imagen','error'));
}

function quitarImagenCatalogo() {
  _catImagenPendiente = '';
  mostrarPreviewImagenCatalogo('');
  const inp = el('cat_p_imagen_input'); if (inp) inp.value = '';
}

/** Procesa hasta 4 fotos adicionales seleccionadas para el formulario de
 *  producto del catálogo. Se agregan a las ya pendientes (o a las del
 *  producto en edición, si aún no se había tocado nada). */
function manejarImagenesExtraCatalogo(input) {
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const editId = el('cat-edit-id')?.textContent?.trim();
  const old = catalogoProductos.find(p => p.id === editId);
  const actuales = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);

  const disponibles = Math.max(0, 4 - actuales.length);
  if (!disponibles) { toast('Máximo 4 fotos adicionales','warn'); input.value=''; return; }

  Promise.all(files.slice(0, disponibles).map(f => comprimirImagen(f)))
    .then(dataUrls => {
      _catImagenesExtraPendientes = [...actuales, ...dataUrls];
      renderPreviewImagenesExtraCatalogo(_catImagenesExtraPendientes);
    })
    .catch(() => toast('No se pudo procesar alguna imagen','error'))
    .finally(() => { input.value = ''; });
}

function quitarImagenExtraCatalogo(idx) {
  const editId = el('cat-edit-id')?.textContent?.trim();
  const old = catalogoProductos.find(p => p.id === editId);
  const actuales = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);
  _catImagenesExtraPendientes = actuales.filter((_, i) => i !== idx);
  renderPreviewImagenesExtraCatalogo(_catImagenesExtraPendientes);
}

function renderPreviewImagenesExtraCatalogo(lista) {
  const cont = el('cat_p_imagenes_extra_preview');
  if (!cont) return;
  cont.innerHTML = (lista || []).map((src, i) => `
    <div style="position:relative;width:60px;height:60px">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid var(--border)">
      <button type="button" onclick="quitarImagenExtraCatalogo(${i})" title="Quitar"
        style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--danger,#e5484d);color:#fff;cursor:pointer;font-size:.7rem;line-height:1">✕</button>
    </div>`).join('');
}

function mostrarPreviewImagenCatalogo(dataUrl) {
  const img    = el('cat_p_imagen_preview');
  const ph     = el('cat_p_imagen_placeholder');
  const quitar = el('cat_p_imagen_quitar');
  if (dataUrl) {
    if (img) { img.src = dataUrl; img.style.display = 'block'; }
    if (ph)    ph.style.display = 'none';
    if (quitar) quitar.style.display = 'inline-flex';
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (ph)    ph.style.display = 'block';
    if (quitar) quitar.style.display = 'none';
  }
}

/** Persiste la lista de categorías (local + Firebase) y refresca toda la UI
 *  que depende de ella. */
async function _persistirCategoriasCatalogo() {
  categoriasProductos.sort((a, b) => a.localeCompare(b, 'es'));
  try { localStorage.setItem('categoriasCatalogo3d', JSON.stringify(categoriasProductos)); } catch(e) {}
  cargarCategoriasCatalogo();
  try {
    await fbGuardarCategoriasCatalogo(categoriasProductos);
  } catch(e) {
    console.error('Error al guardar categorías:', e);
    toast('No se pudo guardar en Firebase (se guardó localmente)', 'warn');
  }
}

/** Refresca el selector de categoría del formulario de producto, el
 *  filtro del grid y la lista de administración de categorías. Esta
 *  lista es completamente independiente de las demás categorías del
 *  sistema: solo existe para organizar el Catálogo y la Tienda en Línea. */
function cargarCategoriasCatalogo() {
  const selProd = el('cat_p_categoria');
  if (selProd) {
    const prev = selProd.value;
    selProd.innerHTML = categoriasProductos.length
      ? '<option value="">Seleccionar categoría…</option>' + categoriasProductos.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')
      : '<option value="">Sin categorías — agregá una arriba</option>';
    if (categoriasProductos.includes(prev)) selProd.value = prev;
  }

  const sel = el('cat-filter-categoria');
  if (sel) {
    const prevF = sel.value;
    sel.innerHTML = '<option value="">Todas las categorías</option>' +
      categoriasProductos.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    if (categoriasProductos.includes(prevF)) sel.value = prevF;
  }

  const lista = el('cat-categorias-lista');
  if (lista) {
    lista.innerHTML = categoriasProductos.length
      ? categoriasProductos.map(c => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px">
          <span style="flex:1">${escHtml(c)}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="editarCategoriaCatalogo('${escHtml(c).replace(/'/g, "\\'")}')" title="Editar">✎</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="eliminarCategoriaCatalogo('${escHtml(c).replace(/'/g, "\\'")}')" title="Eliminar">🗑</button>
        </div>`).join('')
      : '<div class="page-hdr-sub">Aún no hay categorías. Agregá la primera arriba.</div>';
  }
}

/** Crea una nueva categoría desde el campo de la sección de administración. */
async function crearCategoriaCatalogo() {
  const input  = el('cat_categoria_nueva_input');
  const nombre = (input?.value || '').trim();
  if (!nombre) { input?.focus(); return; }

  if (categoriasProductos.some(c => c.toLowerCase() === nombre.toLowerCase())) {
    toast('Esa categoría ya existe', 'warn');
    return;
  }

  categoriasProductos.push(nombre);
  if (input) input.value = '';
  await _persistirCategoriasCatalogo();
  toast('Categoría agregada ✓', 'success');
}

/** Renombra una categoría existente (prompt simple) y actualiza los
 *  productos que la tuvieran asignada. */
function editarCategoriaCatalogo(nombreActual) {
  showPrompt('Nuevo nombre de la categoría', nombreActual, async (valor) => {
    const nuevo = (valor || '').trim();
    if (!nuevo || nuevo === nombreActual) return;

    if (categoriasProductos.some(c => c.toLowerCase() === nuevo.toLowerCase())) {
      toast('Ya existe una categoría con ese nombre', 'warn');
      return;
    }

    const idx = categoriasProductos.findIndex(c => c === nombreActual);
    if (idx >= 0) categoriasProductos[idx] = nuevo;
    await _persistirCategoriasCatalogo();

    const afectados = catalogoProductos.filter(p => p.categoria === nombreActual);
    for (const p of afectados) {
      p.categoria = nuevo;
      try { await fbGuardarCatalogoProducto(p); } catch(e) { console.error(e); }
    }
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e) {}
    if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
    toast('Categoría actualizada ✓', 'success');
  });
}

/** Elimina una categoría de la lista administrable (no afecta productos
 *  que ya la tengan asignada, solo deja de aparecer en el desplegable). */
function eliminarCategoriaCatalogo(nombre) {
  showConfirm('¿Eliminar categoría?', `¿Seguro que deseas eliminar la categoría "${nombre}"? Los productos que ya la tengan asignada la conservarán como texto, pero dejará de estar disponible en el desplegable.`, async () => {
    categoriasProductos = categoriasProductos.filter(c => c !== nombre);
    await _persistirCategoriasCatalogo();
    toast('Categoría eliminada ✓', 'success');
  });
}

/** Si un nuevo lote de Inventario Productos no coincide con ningún producto
 *  del catálogo (por nombre), la registra automáticamente para que aparezca
 *  en el Catálogo de Productos y pueda editarse / agregarle foto. */
async function _registrarEnCatalogoSiFalta(t) {
  const norm = s => (s || '').trim().toLowerCase();
  const existente = catalogoProductos.find(p => norm(p.nombre) === norm(t.pieza));
  if (existente) { t.catalogoProductoId = existente.id; return; }

  const totalUnidades = Math.max((t.cantidad || 1) * Math.max(t.placas || 1, 1), 1);
  const data = {
    id: genId(),
    nombre: t.pieza,
    categoria: 'Inventario Productos',
    material: t.material || '',
    precio: totalUnidades > 0 ? Math.round((t.precio_final || 0) / totalUnidades) : 0,
    descripcion: t.notas || '',
    imagen: '',
    orden: Date.now()
  };
  catalogoProductos.push(data);
  t.catalogoProductoId = data.id;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  try { await fbGuardarCatalogoProducto(data); } catch(e) { console.error('No se pudo registrar en catálogo:', e); }
}

/** Si un producto de Inventario Productos ya editado tiene un producto
 *  vinculado en el Catálogo, actualiza su nombre y precio para que no
 *  queden desactualizados frente a la tienda pública. No toca material,
 *  descripción ni foto para no perder ediciones manuales del catálogo. */
async function _actualizarCatalogoSiVinculado(t) {
  let prod = t.catalogoProductoId ? catalogoProductos.find(p => p.id === t.catalogoProductoId) : null;

  if (!prod) {
    // Sin vínculo todavía (producto creado antes de esta función) — se
    // busca por nombre, o se registra desde cero si de plano no existe.
    const norm = s => (s || '').trim().toLowerCase();
    prod = catalogoProductos.find(p => norm(p.nombre) === norm(t.pieza));
    if (!prod) { await _registrarEnCatalogoSiFalta(t); return; }
    t.catalogoProductoId = prod.id;
  }

  const totalUnidades = Math.max((t.cantidad || 1) * Math.max(t.placas || 1, 1), 1);
  const nuevoPrecio = totalUnidades > 0 ? Math.round((t.precio_final || 0) / totalUnidades) : 0;
  if (prod.nombre === t.pieza && prod.precio === nuevoPrecio) return; // ya está al día

  prod.nombre = t.pieza;
  prod.precio = nuevoPrecio;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  try { await fbGuardarCatalogoProducto({ ...prod }); } catch(e) { console.error('No se pudo actualizar el catálogo:', e); }
  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
}

/** Recorre todos los lotes de Inventario Productos existentes y registra en el
 *  catálogo los que aún no tengan un producto correspondiente (por nombre).
 *  Útil para productos creados antes de que existiera el auto-registro. */
async function sincronizarCatalogoDesdeVentas() {
  if (!trabajos.length) {
    try { trabajos = await fbCargarTrabajos(); } catch(e) { console.error(e); }
  }
  const lotes = trabajos.filter(_esDetalle);
  if (!lotes.length) { toast('No hay productos de Inventario Productos', 'error'); return; }

  const norm = s => (s || '').trim().toLowerCase();
  const nombresExistentes = new Set(catalogoProductos.map(p => norm(p.nombre)));
  const faltantes = [];
  for (const t of lotes) {
    const n = norm(t.pieza);
    if (!n || nombresExistentes.has(n)) continue;
    nombresExistentes.add(n);
    faltantes.push(t);
  }

  if (!faltantes.length) { toast('El catálogo ya está al día ✓', 'success'); return; }

  for (const t of faltantes) {
    await _registrarEnCatalogoSiFalta(t);
    // Guarda el vínculo en la cotización para que futuras ediciones sepan
    // qué producto del catálogo deben mantener sincronizado.
    if (t.catalogoProductoId) {
      try { await db.collection('cotizaciones').doc(String(t.id)).update({ catalogoProductoId: t.catalogoProductoId }); }
      catch(e) { console.error('No se pudo vincular producto con el catálogo:', t.id, e); }
    }
  }

  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
  toast(`${faltantes.length} producto(s) agregado(s) al catálogo ✓`, 'success');
}

/** Reglas de clasificación automática: categoría → palabras clave que se
 *  buscan (sin distinguir mayúsculas/acentos) en el nombre del producto.
 *  Se evalúan en orden; la primera que coincide gana. */
const _REGLAS_CATEGORIAS_AUTO = [
  { categoria: 'Amigurumis (Crochet)', claves: ['crochet'] },
  { categoria: 'Pokémon',              claves: ['charmander', 'squirtle', 'ditto', 'pokemon', 'pokémon'] },
  { categoria: 'Perros Globo',         claves: ['perro globo'] },
  { categoria: 'Figuras Articuladas',  claves: ['articulado', 'articulada', 'articulados', 'articuladas'] },
  { categoria: 'Llaveros',             claves: ['llavero', 'llaveros'] },
  { categoria: 'Clickers / Fidget Toys', claves: ['clicker'] },
  { categoria: 'Macetas & Hogar',      claves: ['maceta', 'platito'] },
  { categoria: 'Animales & Figuras',   claves: ['dino', 'abeja', 'jirafa', 'pantera', 'pulpito', 'pulpo'] }
];

/** Quita acentos para comparar nombres sin distinguir tildes. */
function _sinAcentos(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Crea las categorías sugeridas (si no existen) y reclasifica los
 *  productos actuales del catálogo según su nombre, usando reglas de
 *  palabras clave. No modifica productos que ya tengan asignada una
 *  categoría distinta de "General" o "Inventario Productos". */
async function clasificarCategoriasAutomaticamente() {
  const nuevasCategorias = [..._REGLAS_CATEGORIAS_AUTO.map(r => r.categoria)];
  let categoriasCreadas = 0;
  nuevasCategorias.forEach(c => {
    if (!categoriasProductos.some(x => x.toLowerCase() === c.toLowerCase())) {
      categoriasProductos.push(c);
      categoriasCreadas++;
    }
  });
  if (categoriasCreadas) await _persistirCategoriasCatalogo();
  else cargarCategoriasCatalogo();

  let reclasificados = 0;
  for (const p of catalogoProductos) {
    const sinCategoriaReal = !p.categoria || ['general', 'venta al detalle', 'inventario productos'].includes(p.categoria.toLowerCase());
    if (!sinCategoriaReal) continue;

    const nombreNorm = _sinAcentos(p.nombre).toLowerCase();
    const regla = _REGLAS_CATEGORIAS_AUTO.find(r => r.claves.some(k => nombreNorm.includes(_sinAcentos(k).toLowerCase())));
    if (!regla) continue;

    p.categoria = regla.categoria;
    try { await fbGuardarCatalogoProducto(p); reclasificados++; } catch(e) { console.error(e); }
  }

  if (reclasificados) {
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e) {}
  }
  if (typeof renderCatalogoProductos === 'function') renderCatalogoProductos();
  toast(`${categoriasCreadas} categoría(s) creada(s), ${reclasificados} producto(s) reclasificado(s) ✓`, 'success');
}

async function guardarProductoCatalogo() {
  const nombre = el('cat_p_nombre')?.value.trim();
  if (!nombre) { toast('Ingrese el nombre del producto','error'); return; }

  const editId = el('cat-edit-id')?.textContent?.trim();
  const old    = catalogoProductos.find(p => p.id === editId);
  const imagen = _catImagenPendiente !== null ? _catImagenPendiente : (old?.imagen || '');
  const imagenesExtra = _catImagenesExtraPendientes !== null ? _catImagenesExtraPendientes : (old?.imagenesExtra || []);

  const id = editId || genId();
  const data = {
    id, nombre,
    categoria:   el('cat_p_categoria')?.value.trim()   || 'General',
    material:    el('cat_p_material')?.value.trim()    || '',
    precio:      fv('cat_p_precio'),
    descripcion: el('cat_p_descripcion')?.value.trim() || '',
    imagen,
    imagenesExtra,
    oculto: old?.oculto || false,
    orden: old?.orden ?? Date.now()
  };

  const idx = catalogoProductos.findIndex(p => p.id === id);
  if (idx >= 0) catalogoProductos[idx] = data; else catalogoProductos.push(data);
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}

  try {
    await fbGuardarCatalogoProducto(data);
    toast(editId ? 'Producto actualizado ✓' : 'Producto agregado al catálogo ✓','success');
  } catch(e) {
    console.error(e); toast('No se pudo guardar el producto','error');
  }
  cancelarEditProductoCatalogo();
  cargarCategoriasCatalogo();
  renderCatalogoProductos();
}

function editarProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id); if (!p) return;
  const sv = (k,v) => { const e = el(k); if (e) e.value = v ?? ''; };
  sv('cat_p_nombre',      p.nombre);
  sv('cat_p_categoria',   p.categoria);
  sv('cat_p_material',    p.material);
  sv('cat_p_precio',      p.precio);
  sv('cat_p_descripcion', p.descripcion);
  el('cat-edit-id').textContent = id;
  el('cat-edit-id').style.display = 'inline';
  el('cat-cancel-edit').style.display = 'inline-flex';
  _catImagenPendiente = null;
  mostrarPreviewImagenCatalogo(p.imagen || '');
  _catImagenesExtraPendientes = null;
  renderPreviewImagenesExtraCatalogo(p.imagenesExtra || []);
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelarEditProductoCatalogo() {
  ['cat_p_nombre','cat_p_categoria','cat_p_material','cat_p_descripcion']
    .forEach(f => { if (el(f)) el(f).value = ''; });
  if (el('cat_p_precio')) el('cat_p_precio').value = 0;
  if (el('cat-edit-id'))     { el('cat-edit-id').textContent=''; el('cat-edit-id').style.display='none'; }
  if (el('cat-cancel-edit'))   el('cat-cancel-edit').style.display='none';
  const inp = el('cat_p_imagen_input'); if (inp) inp.value = '';
  _catImagenPendiente = null;
  mostrarPreviewImagenCatalogo('');
  const inpExtra = el('cat_p_imagenes_extra_input'); if (inpExtra) inpExtra.value = '';
  _catImagenesExtraPendientes = null;
  renderPreviewImagenesExtraCatalogo([]);
}

/** Oculta o muestra un producto en la Tienda en Línea y en el PDF del
 *  catálogo, sin borrarlo: sigue editable desde Catálogo de Productos. */
async function toggleOcultoProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id);
  if (!p) return;
  const anterior = p.oculto || false;
  p.oculto = !anterior;
  try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
  renderCatalogoProductos();
  try {
    await fbGuardarCatalogoProducto(p);
    toast(p.oculto ? 'Producto ocultado de la tienda ✓' : 'Producto visible en la tienda ✓', 'success');
  } catch(e) {
    console.error(e);
    p.oculto = anterior;
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e2){}
    renderCatalogoProductos();
    toast('No se pudo cambiar la visibilidad del producto', 'error');
  }
}

/* ----------------------------------------------------------
   Catálogo de Productos — selección de productos para el PDF
---------------------------------------------------------- */
function toggleSeleccionCatalogo(id, checkbox) {
  if (checkbox.checked) catalogoSeleccionados.add(id);
  else catalogoSeleccionados.delete(id);
  if (typeof _actualizarBarraSeleccionCatalogo === 'function') _actualizarBarraSeleccionCatalogo();
}

function seleccionarTodosCatalogo() {
  const filtroCat = el('cat-filter-categoria')?.value || '';
  catalogoProductos
    .filter(p => !p.oculto && (!filtroCat || p.categoria === filtroCat))
    .forEach(p => catalogoSeleccionados.add(p.id));
  renderCatalogoProductos();
}

function limpiarSeleccionCatalogo() {
  catalogoSeleccionados.clear();
  renderCatalogoProductos();
}

function eliminarProductoCatalogo(id) {
  const p = catalogoProductos.find(p => p.id === id);
  const nombre = p ? `"${p.nombre}"` : 'este producto';
  showConfirm('¿Eliminar producto?', `¿Seguro que deseas eliminar ${nombre} del catálogo? Esta acción no se puede deshacer.`, async () => {
    catalogoProductos = catalogoProductos.filter(p => p.id !== id);
    try { localStorage.setItem('catalogoProductos3d', JSON.stringify(catalogoProductos)); } catch(e){}
    try {
      await fbEliminarCatalogoProducto(id);
      toast('Producto eliminado ✓','success');
    } catch(e) {
      console.error(e); toast('No se pudo eliminar el producto','error');
    }
    cargarCategoriasCatalogo();
    renderCatalogoProductos();
  });
}

function generarCatalogoPDF() {
  const visibles = catalogoProductos.filter(p => !p.oculto);
  const haySeleccion = catalogoSeleccionados.size > 0;
  const productosVisibles = haySeleccion
    ? visibles.filter(p => catalogoSeleccionados.has(p.id))
    : visibles;
  if (!productosVisibles.length) {
    toast(haySeleccion
      ? 'Los productos seleccionados ya no están visibles en el catálogo'
      : 'Agregue al menos un producto visible al catálogo', 'error');
    return;
  }
  toast('Generando catálogo…', 'info');

  const cfg = { ...CATALOGO_DEFAULTS, ...catalogoConfig };
  const base = new URL('.', window.location.href).href;
  const foxHeadUrl = base + 'img/marca/fox-head.png';

  let empNombre = 'Pin&Pon 3D', empEmail = '';
  try {
    const emp = JSON.parse(localStorage.getItem('emp3d') || '{}');
    if (emp.emp_nombre) empNombre = emp.emp_nombre;
    if (emp.emp_email) empEmail = emp.emp_email;
  } catch (e) {}

  // Logotipo estilizado: colorea el primer "&" del nombre y, si termina en "3D", lo aísla en un chip.
  // Si el nombre no tiene "&", se muestra en texto plano (hereda el color/tipografía navy del contenedor).
  function wordmarkHtml(nombre, opts) {
    opts = opts || {};
    const ampColor = opts.ampColor || '#F0B429';
    const chipBg   = opts.chipBg   || '#2E77B5';
    const str = String(nombre || 'Pin&Pon 3D');
    const ampIdx = str.indexOf('&');
    if (ampIdx === -1) return escHtml(str);
    const left = str.slice(0, ampIdx);
    let right  = str.slice(ampIdx + 1);
    let chip   = '';
    const m = right.match(/\s*(3D)\s*$/i);
    if (m) {
      right = right.slice(0, m.index);
      chip  = `<span class="pp-wm-chip" style="background:${chipBg}">${escHtml(m[1].toUpperCase())}</span>`;
    }
    return `${escHtml(left)}<span class="pp-wm-amp" style="color:${ampColor}">&amp;</span>${escHtml(right)}${chip}`;
  }

  // Acentos de color por categoría (2 tonos por cada color de marca, rotan cada 6)
  const ACCENTS = [
    { accent: '#2E77B5', tint: '#EAF2F9' }, // azul
    { accent: '#C98A00', tint: '#FCF3DE' }, // dorado oscuro
    { accent: '#16324A', tint: '#EAEEF2' }, // navy
    { accent: '#4185C6', tint: '#EAF6FC' }, // celeste (variante clara del azul)
    { accent: '#F0B429', tint: '#FFF6DE' }, // dorado (variante clara del dorado oscuro)
    { accent: '#0D2840', tint: '#E4EAF0' }, // navy profundo (variante oscura del navy)
  ];

  // Agrupar por categoría (orden de primera aparición) y paginar de 4 en 4 (grilla 2×2)
  const porCategoria = new Map();
  productosVisibles.forEach(p => {
    const cat = p.categoria || 'General';
    if (!porCategoria.has(cat)) porCategoria.set(cat, []);
    porCategoria.get(cat).push(p);
  });

  const categorias = [...porCategoria.keys()];
  const paginas = [];
  categorias.forEach((cat, ci) => {
    const items = porCategoria.get(cat);
    const { accent, tint } = ACCENTS[ci % ACCENTS.length];
    for (let i = 0; i < items.length; i += 4) {
      paginas.push({ categoria: cat, catIndex: ci + 1, accent, tint, items: items.slice(i, i + 4) });
    }
  });
  // La numeración de página cuenta el documento completo (portada + categorías + contraportada)
  const totalPaginasFisicas = paginas.length + 2;
  paginas.forEach((pg, i) => { pg.pageNo = i + 2; pg.pageTotal = totalPaginasFisicas; });

  // WhatsApp de pedidos, con respaldo al valor por defecto si el admin lo dejó vacío
  const backWa = cfg.back_wa || CATALOGO_DEFAULTS.back_wa;
  const backIg = cfg.back_ig || CATALOGO_DEFAULTS.back_ig;

  const precioFmt = n => '₡' + Math.ceil(n || 0).toLocaleString('es-CR');

  const itemHtml = (p, idx, accent, tint) => `
    <div class="pp-item">
      <div class="pp-item-bar" style="background:${accent}"></div>
      ${p.imagen
        ? `<img class="pp-item-img" src="${escHtml(p.imagen)}" alt="" style="background:${tint}">`
        : `<div class="pp-item-noimg" style="background:${tint}">Foto del producto</div>`}
      <div class="pp-item-body">
        <div class="pp-item-row">
          <span class="pp-item-num">${idx + 1}</span>
          <span class="pp-item-price" style="background:${accent}">${precioFmt(p.precio)}</span>
        </div>
        <div class="pp-item-name">${escHtml((p.nombre || '').toUpperCase())}</div>
        ${p.material ? `<div class="pp-item-mat">${escHtml(p.material)}</div>` : ''}
        ${p.descripcion ? `<div class="pp-item-desc">${escHtml(p.descripcion)}</div>` : ''}
      </div>
    </div>`;

  const paginaHtml = pg => `
    <div class="pp-page">
      <div class="pp-cat-page">
        <div class="pp-masthead">
          <div class="pp-masthead-brand">
            <img src="${foxHeadUrl}" alt="">
            <span>${escHtml(empNombre)}</span>
          </div>
          <span class="pp-masthead-tag">Catálogo de Productos · ${pg.pageNo}/${pg.pageTotal}</span>
        </div>
        <div class="pp-cat-eyebrow-row">
          <span class="pp-cat-tri" style="color:${pg.accent}"></span>
          <span class="pp-cat-eyebrow" style="color:${pg.accent}">Categoría ${String(pg.catIndex).padStart(2,'0')}</span>
        </div>
        <h1 class="pp-cat-title">${escHtml(pg.categoria)}</h1>
        <div class="pp-cat-rule" style="background:${pg.accent}"></div>
        <div class="pp-grid">
          ${pg.items.map((p, idx) => itemHtml(p, idx, pg.accent, pg.tint)).join('')}
        </div>
        <div class="pp-foot">
          <span>© ${new Date().getFullYear()} ${escHtml(empNombre)} — Pedidos por WhatsApp ${escHtml(backWa)}</span>
          <span>Precios en colones (₡) · sujetos a cambio sin previo aviso</span>
        </div>
      </div>
    </div>`;

  const contactFrags = String(cfg.cover_contact || CATALOGO_DEFAULTS.cover_contact || '')
    .split(/[·|,]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  const pillStyles = [
    { bg: '#16324A', color: '#fff', border: 'none' },
    { bg: '#fff',    color: '#16324A', border: '2px solid #F0B429' },
    { bg: '#fff',    color: '#16324A', border: '2px solid #2E77B5' },
  ];
  const contactPillsHtml = contactFrags.map((frag, i) => {
    const st = pillStyles[i % pillStyles.length];
    return `<span class="pp-cover-pill" style="background:${st.bg};color:${st.color};border:${st.border}">${escHtml(frag)}</span>`;
  }).join('');

  const coverHtml = `
    <div class="pp-page">
      <div class="pp-cover">
        <span class="pp-tri" style="top:56px;left:70px;width:22px;height:22px;background:#2E77B5;transform:rotate(-12deg)"></span>
        <span class="pp-tri" style="top:120px;left:130px;width:14px;height:14px;background:#F0B429;transform:rotate(18deg)"></span>
        <span class="pp-tri" style="top:90px;right:110px;width:18px;height:18px;background:#F0B429;transform:rotate(35deg)"></span>
        <span class="pp-tri" style="top:170px;right:60px;width:26px;height:26px;background:#16324A;transform:rotate(-20deg);opacity:.85"></span>
        <span class="pp-tri" style="bottom:130px;left:60px;width:24px;height:24px;background:#16324A;transform:rotate(8deg);opacity:.85"></span>
        <span class="pp-tri" style="bottom:80px;left:150px;width:15px;height:15px;background:#2E77B5;transform:rotate(-30deg)"></span>
        <span class="pp-tri" style="bottom:150px;right:90px;width:20px;height:20px;background:#2E77B5;transform:rotate(50deg)"></span>
        <span class="pp-tri" style="bottom:70px;right:170px;width:16px;height:16px;background:#F0B429;transform:rotate(-6deg)"></span>

        <span class="pp-cover-badge">${escHtml(cfg.cover_kicker)}</span>

        <div class="pp-cover-medallion">
          <div class="pp-cover-medallion-ring"></div>
          <div class="pp-cover-medallion-circle"><img src="${foxHeadUrl}" alt=""></div>
        </div>

        <div class="pp-cover-wordmark">${wordmarkHtml(empNombre)}</div>
        <div class="pp-cover-subtitle">${escHtml(cfg.cover_title)}</div>
        <div class="pp-cover-edition">${escHtml(cfg.cover_edition)}</div>
        <p class="pp-cover-tag">${escHtml(cfg.cover_tag)}</p>
        ${contactPillsHtml ? `<div class="pp-cover-pills">${contactPillsHtml}</div>` : ''}
      </div>
    </div>`;

  const backContactLines = [];
  if (backWa)   backContactLines.push(`WhatsApp — ${escHtml(backWa)}`);
  if (backIg)   backContactLines.push(`Instagram — ${escHtml(backIg)}`);
  if (empEmail) backContactLines.push(`Correo — ${escHtml(empEmail)}`);

  const backHtml = `
    <div class="pp-page">
      <div class="pp-back">
        <span class="pp-back-tri-tr"></span>
        <span class="pp-back-tri-bl"></span>
        <span class="pp-back-eyebrow">Hagamos tu proyecto</span>
        <h2 class="pp-back-title">${escHtml(cfg.back_title)}</h2>
        <p class="pp-back-text">${escHtml(cfg.back_text)}</p>
        ${backContactLines.length ? `<div class="pp-back-contact">${backContactLines.map(l => `<span>${l}</span>`).join('')}</div>` : ''}
        <div class="pp-back-medallion"><img src="${foxHeadUrl}" alt=""></div>
        <div class="pp-back-word">${wordmarkHtml(empNombre)}</div>
      </div>
    </div>`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo de Productos — ${escHtml(empNombre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#ECEEF3;font-family:"Manrope",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#26333F}
body{min-height:100vh;padding:24px 0 80px;display:flex;flex-direction:column;align-items:center;gap:24px}
.pp-page{width:816px;height:1056px;background:#fff;position:relative;overflow:hidden;box-shadow:0 20px 60px -16px rgba(22,50,74,.22),0 4px 16px rgba(22,50,74,.1);flex-shrink:0}
@page{size:letter;margin:0}
@media screen and (max-width:860px){body{padding:0;gap:0}.pp-page{box-shadow:none;width:100%;height:auto;min-height:100vh}}
@media print{html,body{background:#fff;padding:0;margin:0;gap:0}.pp-page{box-shadow:none;width:100%;height:100vh;page-break-after:always}.pp-page:last-child{page-break-after:auto}.print-fab{display:none!important}}

.print-fab{position:fixed;bottom:24px;right:24px;background:#16324A;color:#fff;border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-family:"Manrope",sans-serif;font-weight:800;cursor:pointer;z-index:100;box-shadow:0 4px 16px rgba(10,31,61,.35)}
.print-fab:hover{background:#1f4576}

.pp-wm-amp{font-style:italic}
.pp-wm-chip{display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:"Manrope",sans-serif;font-weight:800;border-radius:8px;margin-left:6px;vertical-align:middle;transform:rotate(6deg)}

/* Portada */
.pp-cover{height:100%;background:#F7F4EE;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:0.6in}
.pp-tri{position:absolute;clip-path:polygon(50% 0%,100% 100%,0% 100%)}
.pp-cover-badge{font-family:"Manrope",sans-serif;font-size:11.5px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#fff;background:#2E77B5;padding:7px 20px;border-radius:20px;transform:rotate(-2deg);box-shadow:0 6px 14px rgba(46,119,181,.3)}
.pp-cover-medallion{position:relative;margin:14px 0 4px}
.pp-cover-medallion-ring{position:absolute;inset:-14px;border:3px dashed #F0B429;border-radius:50%;transform:rotate(-8deg)}
.pp-cover-medallion-circle{position:relative;background:#fff;border-radius:50%;width:230px;height:230px;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 40px rgba(22,50,74,.18)}
.pp-cover-medallion-circle img{width:168px;height:auto}
.pp-cover-wordmark{font-family:"Playfair Display",serif;font-weight:700;font-size:54px;line-height:1;color:#16324A;margin-top:4px}
.pp-cover-wordmark .pp-wm-chip{font-size:19px;padding:4px 11px}
.pp-cover-subtitle{font-family:"Manrope",sans-serif;font-weight:700;font-size:16px;color:#2E77B5}
.pp-cover-edition{font-family:"Manrope",sans-serif;font-weight:600;font-size:13px;color:#16324A;letter-spacing:.06em;opacity:.75}
.pp-cover-tag{font-family:"Playfair Display",serif;font-style:italic;font-size:20px;color:#2E77B5;max-width:440px;line-height:1.45;margin-top:2px}
.pp-cover-pills{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;justify-content:center}
.pp-cover-pill{font-size:12px;font-weight:700;padding:7px 16px;border-radius:20px;font-family:"Manrope",sans-serif}

/* Masthead + página de categoría */
.pp-cat-page{display:flex;flex-direction:column;height:100%;padding:0.6in}
.pp-masthead{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #F0B429;margin-bottom:22px}
.pp-masthead-brand{display:flex;align-items:center;gap:10px}
.pp-masthead-brand img{height:34px;width:auto}
.pp-masthead-brand span{font-family:"Playfair Display",serif;font-weight:700;font-size:15px;color:#16324A}
.pp-masthead-tag{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2E77B5}
.pp-cat-eyebrow-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.pp-cat-tri{width:0;height:0;border-style:solid;border-width:0 8px 14px 8px;border-color:transparent transparent currentColor transparent}
.pp-cat-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.pp-cat-title{font-family:"Playfair Display",serif;font-weight:700;font-size:34px;color:#16324A;margin:0 0 12px}
.pp-cat-rule{height:4px;width:64px;border-radius:2px;margin-bottom:22px}

.pp-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:min-content;align-content:start;gap:22px 22px}
.pp-item{display:flex;flex-direction:column;background:#fff;border:1px solid #eceef1;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(22,50,74,.08)}
.pp-item-bar{height:5px}
.pp-item-img{width:100%;height:190px;object-fit:cover;display:block}
.pp-item-noimg{width:100%;height:190px;display:flex;align-items:center;justify-content:center;color:#8a95a1;font-size:11px;font-family:"Manrope",sans-serif}
.pp-item-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px}
.pp-item-row{display:flex;align-items:center;justify-content:space-between}
.pp-item-num{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#16324A;color:#fff;font-size:10.5px;font-weight:700;font-family:"Manrope",sans-serif;flex-shrink:0}
.pp-item-price{font-size:14px;font-weight:800;color:#fff;padding:4px 12px;border-radius:20px;font-family:"Manrope",sans-serif}
.pp-item-name{font-family:"Playfair Display",serif;font-weight:700;font-size:15.5px;color:#16324A;line-height:1.3;text-transform:uppercase;letter-spacing:.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pp-item-mat{font-family:"Manrope",sans-serif;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9aa7b7}
.pp-item-desc{font-family:"Manrope",sans-serif;font-size:11px;color:#6b7686;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.pp-foot{margin-top:18px;padding-top:12px;border-top:1px solid #dfe3e8;display:flex;justify-content:space-between;font-family:"Manrope",sans-serif;font-size:9.5px;color:#8a95a1}

/* Contraportada */
.pp-back{height:100%;background:#16324A;color:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;padding:0.6in}
.pp-back-tri-tr{position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 200px 200px 0;border-color:transparent #2E77B5 transparent transparent;opacity:.5}
.pp-back-tri-bl{position:absolute;bottom:0;left:0;width:0;height:0;border-style:solid;border-width:0 0 160px 170px;border-color:transparent transparent #F0B429 transparent;opacity:.35}
.pp-back-eyebrow{position:relative;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#F0B429}
.pp-back-title{position:relative;font-family:"Playfair Display",serif;font-weight:700;font-size:32px;margin:0;max-width:480px}
.pp-back-text{position:relative;max-width:420px;font-size:14px;line-height:1.6;color:#cfd9e3;font-family:"Manrope",sans-serif}
.pp-back-contact{position:relative;display:flex;flex-direction:column;gap:10px;margin-top:4px;font-size:14.5px;font-weight:600;font-family:"Manrope",sans-serif}
.pp-back-medallion{position:relative;background:#fff;border-radius:50%;width:104px;height:104px;display:flex;align-items:center;justify-content:center;box-shadow:0 16px 34px rgba(0,0,0,.3);margin-top:14px}
.pp-back-medallion img{width:74px;height:auto}
.pp-back-word{position:relative;font-family:"Playfair Display",serif;font-weight:700;font-size:24px}
.pp-back-word .pp-wm-chip{font-size:11px;border-radius:5px;padding:2px 7px}
</style>
</head>
<body>
<button class="print-fab" onclick="window.print()">🖨️ Descargar / Imprimir PDF</button>
${coverHtml}
${paginas.map(paginaHtml).join('')}
${backHtml}
<script>
document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 400); });
</script>
</body>
</html>`;

  const blobCat    = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const blobUrlCat = URL.createObjectURL(blobCat);
  const winCat     = window.open(blobUrlCat, '_blank');
  if (!winCat) { URL.revokeObjectURL(blobUrlCat); toast('Permita ventanas emergentes para generar el PDF','error'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrlCat), 10000);
}

