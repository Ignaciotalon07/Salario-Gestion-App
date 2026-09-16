// repositorio.js — Sección Repositorio
// Archivos y recursos compartidos por el equipo, organizados por categoría.

// ── Estado global ─────────────────────────────────────────────────────────────
let repoItems    = [];   // todos los items
let repoArchivos = {};   // { item_id: [archivo, ...] }
let repoThumbs   = {};   // { item_id: signedUrl } cache de thumbnails de imágenes
let repoFiltro   = '';   // categoría activa
let repoBusqueda = '';   // texto del buscador
let repoOrden    = 'recientes'; // recientes | viejos | az | descargas
let repoAutor    = '';   // filtro por quién subió ('' = todos)
let repoEditId   = null; // null = nuevo, uuid = editando
let _repoArchivosStaged = []; // File[] para subir al guardar
let _repoUltimoVisto = null; // timestamptz del último acceso del usuario actual
let _repoNuevosDesdeVisita = []; // ids de items creados después del último acceso (para el flash naranja)
let _repoFlashPending = false;   // true = todavía no se disparó el flash en esta sesión
const REPO_NUEVO_DIAS = 3; // el badge "Nuevo" en la card dura 3 días desde que se creó el item

// ── Config categorías ─────────────────────────────────────────────────────────
const REPO_CATS = {
  actualizacion: { label: 'Actualización',     emoji: '📦', color: '#6366f1', bg: '#eef2ff' },
  modulo:        { label: 'Módulo',             emoji: '🧩', color: '#0891b2', bg: '#ecfeff' },
  convenios:     { label: 'Convenios',          emoji: '📋', color: '#7c3aed', bg: '#f5f3ff' },
  errores:       { label: 'Errores de Salario', emoji: '🐛', color: '#dc2626', bg: '#fef2f2' },
  clientes:      { label: 'Para clientes',      emoji: '📢', color: '#d97706', bg: '#fffbeb' },
};

// Helper defensivo: devuelve la config de una categoría, con fallback para IDs
// legacy ('bug' se muestra como actualizacion, 'manual' como convenios).
function getRepoCatConfig(cat) {
  if (REPO_CATS[cat]) return REPO_CATS[cat];
  if (cat === 'bug')    return REPO_CATS.actualizacion;
  if (cat === 'manual') return REPO_CATS.convenios;
  return { label: cat || 'Sin categoría', emoji: '📁', color: '#64748b', bg: '#f1f5f9' };
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('app-ready', () => {
  initRepositorio();
});

async function initRepositorio() {
  // Cargar último visto del usuario actual
  const uid = sb().auth ? (await sb().auth.getUser()).data?.user?.id : null;
  if (uid) {
    const { data: visto } = await sb()
      .from('repositorio_visto')
      .select('ultimo_visto_at')
      .eq('user_id', uid)
      .maybeSingle();
    _repoUltimoVisto = visto?.ultimo_visto_at || null;
  }

  // Cargar items
  const { data: itemRows } = await sb()
    .from('repositorio_items')
    .select('*')
    .order('created_at', { ascending: false });
  repoItems = (itemRows || []);

  // Snapshot de "nuevos desde la última visita real" — se calcula acá, antes de
  // que marcarRepositorioVisto() (disparada al navegar a la sección) actualice
  // _repoUltimoVisto. Así el flash naranja solo cuenta lo que era nuevo cuando
  // arrancó la sesión, y se dispara una sola vez.
  _repoNuevosDesdeVisita = repoItems
    .filter(i => i.created_at && (!_repoUltimoVisto || new Date(i.created_at) > new Date(_repoUltimoVisto)))
    .map(i => i.id);
  _repoFlashPending = _repoNuevosDesdeVisita.length > 0;

  // Cargar archivos
  repoArchivos = {};
  const { data: archRows } = await sb()
    .from('repositorio_archivos')
    .select('*')
    .order('created_at', { ascending: true });
  (archRows || []).forEach(a => {
    if (!repoArchivos[a.item_id]) repoArchivos[a.item_id] = [];
    repoArchivos[a.item_id].push(a);
  });

  renderRepoAll();
  _updateRepoBadge();
  _cargarThumbnails();
  suscribirRepositorio();
  _initDropZone();

  // Deep-link: si la URL trae #repo-item-uuid al cargar la app, navegar a la
  // sección Repositorio (goTo no se dispara solo con el hash) y luego scrollear al item.
  if (location.hash.startsWith('#repo-item-')) {
    const navBtn = document.querySelector('.nav-item[onclick*="repositorio"]');
    goTo(navBtn, 'repositorio');
    setTimeout(() => {
      const el = document.getElementById('repo-card-' + location.hash.slice(11));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('repo-card--highlight');
        setTimeout(() => el.classList.remove('repo-card--highlight'), 3000);
      }
    }, 500);
  }
}

// Cuenta items nuevos o editados después del último acceso del usuario
function _repoNuevosCount() {
  if (!_repoUltimoVisto) return repoItems.length;
  const limite = new Date(_repoUltimoVisto);
  return repoItems.filter(i => {
    const creado  = i.created_at ? new Date(i.created_at) : null;
    const editado = i.updated_at ? new Date(i.updated_at) : null;
    const masReciente = editado && editado > (creado || 0) ? editado : creado;
    return masReciente && masReciente > limite;
  }).length;
}

// Actualiza el badge naranja en el nav
function _updateRepoBadge() {
  const badge = document.getElementById('repo-nav-badge');
  if (!badge) return;
  const count = _repoNuevosCount();
  if (count > 0) { badge.textContent = count; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

// Marca el repositorio como visto para el usuario actual
async function marcarRepositorioVisto() {
  // Dispara el flash naranja de "items nuevos" ANTES de actualizar _repoUltimoVisto
  // (esta función se llama automáticamente cada vez que se navega a la sección).
  _repoTriggerFlashIfPending();

  const uid = sb().auth ? (await sb().auth.getUser()).data?.user?.id : null;
  if (!uid) return;
  const ahora = new Date().toISOString();
  await sb().from('repositorio_visto').upsert(
    { user_id: uid, ultimo_visto_at: ahora },
    { onConflict: 'user_id' }
  );
  _repoUltimoVisto = ahora;
  _updateRepoBadge();
}

// Pinta de naranja, por unos segundos, las cards que eran nuevas al entrar a la
// sección — pero solo la primera vez en esta sesión (después queda solo el badge
// "Nuevo", que dura 3 días independientemente de las visitas).
function _repoTriggerFlashIfPending() {
  if (!_repoFlashPending) return;
  _repoFlashPending = false;
  if (!_repoNuevosDesdeVisita.length) return;
  const ids = _repoNuevosDesdeVisita.slice();
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.getElementById('repo-card-' + id);
      if (!el) return;
      el.classList.add('repo-card--highlight');
      setTimeout(() => el.classList.remove('repo-card--highlight'), 3000);
    });
  }, 400);
}

// ── Render orquestador ────────────────────────────────────────────────────────
function renderRepoAll() {
  _renderRepoMetrics();
  _renderRepoAutorFilter();
  _renderRepoChips();
  renderRepoList();
}

// ── Header con métricas ───────────────────────────────────────────────────────
function _renderRepoMetrics() {
  const cont = document.getElementById('repo-metrics');
  if (!cont) return;

  const total = repoItems.length;

  // Nuevos esta semana
  const semana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const nuevosSemana = repoItems.filter(i =>
    i.created_at && new Date(i.created_at) > semana
  ).length;

  // Espacio total usado + cantidad de archivos
  let bytesTotal = 0, archivosTotal = 0;
  for (const id in repoArchivos) {
    for (const a of repoArchivos[id]) { bytesTotal += (a.tamano_bytes || 0); archivosTotal++; }
  }

  const stat = (color, val, label) => `
    <span class="repo-metric">
      <span class="repo-metric__dot" style="--dot-color:${color}"></span>
      <span class="repo-metric__num">${val}</span> ${label}
    </span>`;

  cont.innerHTML =
    stat('#6366f1', total, total === 1 ? 'item' : 'items') +
    stat('#f59e0b', nuevosSemana, 'nuevos esta semana') +
    stat('#0891b2', archivosTotal, archivosTotal === 1 ? 'archivo adjunto' : 'archivos adjuntos') +
    stat('#dc2626', _repoFmtBytes(bytesTotal), 'usados');
}

// ── Filtro por autor (dinámico) ───────────────────────────────────────────────
function _renderRepoAutorFilter() {
  const sel = document.getElementById('repo-autor');
  if (!sel) return;
  const autores = [...new Set(repoItems.map(i => i.subido_por).filter(Boolean))].sort();
  const actual = sel.value;
  sel.innerHTML = `<option value="">Todos los autores</option>` +
    autores.map(a => `<option value="${_escRepo(a)}">${_escRepo(a)}</option>`).join('');
  if (actual && autores.includes(actual)) sel.value = actual;
}

// ── Chips con contador por categoría ──────────────────────────────────────────
function _renderRepoChips() {
  const cont = document.getElementById('repo-chips');
  if (!cont) return;
  const counts = { '': repoItems.length };
  for (const k in REPO_CATS) counts[k] = 0;
  repoItems.forEach(i => {
    const k = REPO_CATS[i.categoria] ? i.categoria : (i.categoria === 'manual' ? 'convenios' : (i.categoria === 'bug' ? 'actualizacion' : null));
    if (k && counts[k] !== undefined) counts[k]++;
  });

  const chip = (cat, label, emoji) => {
    const isActive = repoFiltro === cat ? 'active' : '';
    const c = counts[cat] || 0;
    return `<button class="filter-chip ${isActive}" onclick="filtRepo(this,'${cat}')">${emoji ? emoji + ' ' : ''}${label} <span class="filter-chip__count">${c}</span></button>`;
  };

  cont.innerHTML =
    chip('', 'Todos', '') +
    chip('actualizacion', 'Actualizaciones', '📦') +
    chip('modulo', 'Módulos', '🧩') +
    chip('convenios', 'Convenios', '📋') +
    chip('errores', 'Errores de Salario', '🐛') +
    chip('clientes', 'Para clientes', '📢');
}

// ── Render lista ──────────────────────────────────────────────────────────────
function renderRepoList() {
  const container = document.getElementById('repo-list');
  if (!container) return;

  // Filtrado
  let visible = repoItems.slice();
  if (repoFiltro) visible = visible.filter(i => {
    if (i.categoria === repoFiltro) return true;
    if (repoFiltro === 'convenios' && i.categoria === 'manual') return true;
    if (repoFiltro === 'actualizacion' && i.categoria === 'bug') return true;
    return false;
  });
  if (repoAutor) visible = visible.filter(i => i.subido_por === repoAutor);
  if (repoBusqueda.trim()) {
    const q = repoBusqueda.trim().toLowerCase();
    visible = visible.filter(i =>
      (i.titulo || '').toLowerCase().includes(q) ||
      (i.descripcion || '').toLowerCase().includes(q)
    );
  }

  // Ordenamiento
  visible.sort((a, b) => {
    if (repoOrden === 'viejos')    return new Date(a.created_at) - new Date(b.created_at);
    if (repoOrden === 'az')        return (a.titulo || '').localeCompare(b.titulo || '', 'es');
    if (repoOrden === 'descargas') return (b.descargas || 0) - (a.descargas || 0);
    return new Date(b.created_at) - new Date(a.created_at); // recientes (default)
  });

  if (visible.length === 0) {
    container.innerHTML = _repoEmptyState();
    return;
  }

  container.innerHTML = `<div class="repo-grid">${visible.map(renderRepoCard).join('')}</div>`;
}

// ── Empty state ilustrado ─────────────────────────────────────────────────────
function _repoEmptyState() {
  const hayFiltro = repoFiltro || repoBusqueda.trim() || repoAutor;
  const msg = hayFiltro
    ? 'Nada acá con esos filtros'
    : 'El repositorio está vacío';
  const sub = hayFiltro
    ? 'Probá limpiando la búsqueda o cambiando de categoría.'
    : 'Cargá el primer archivo con "+ Nuevo item".';
  return `
    <div class="repo-empty">
      <div class="repo-empty__icon">
        <svg viewBox="0 0 64 64" width="88" height="88" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 18 L8 52 A2 2 0 0 0 10 54 L54 54 A2 2 0 0 0 56 52 L56 22 A2 2 0 0 0 54 20 L28 20 L24 14 L10 14 A2 2 0 0 0 8 16 Z"/>
          <line x1="20" y1="36" x2="44" y2="36" opacity="0.4"/>
          <line x1="20" y1="42" x2="36" y2="42" opacity="0.4"/>
        </svg>
      </div>
      <div class="repo-empty__msg">${msg}</div>
      <div class="repo-empty__sub">${sub}</div>
    </div>`;
}

// ── Render card ───────────────────────────────────────────────────────────────
function renderRepoCard(item) {
  const cat      = getRepoCatConfig(item.categoria);
  const archivos = repoArchivos[item.id] || [];
  const fechaRel = _repoFechaRelativa(item.created_at);
  const fechaAbs = _repoFecha(item.created_at);

  // "Nuevo" ahora es por antigüedad (3 días desde que se creó), no por si ya lo
  // viste — así el badge se mantiene visible aunque ya hayas entrado a la sección.
  const limiteNuevo = new Date(Date.now() - REPO_NUEVO_DIAS * 24 * 60 * 60 * 1000);
  const esNuevo      = !!item.created_at && new Date(item.created_at) > limiteNuevo;

  // "Editado" sigue atado a la última visita: solo importa si lo cambiaron
  // después de la última vez que entraste a mirar el repositorio.
  const limiteVisita = _repoUltimoVisto ? new Date(_repoUltimoVisto) : null;
  const esEditado = !esNuevo && limiteVisita && item.updated_at && new Date(item.updated_at) > limiteVisita;

  // Thumbnail si hay imagen (usa cache _repoThumbs)
  const thumbUrl = repoThumbs[item.id];
  const thumbHTML = thumbUrl
    ? `<div class="repo-card__thumb" style="background-image:url('${thumbUrl}')"></div>`
    : '';

  // Link externo
  const linkExternoHTML = item.url_externa
    ? `<button class="repo-file-pill repo-file-pill--link" onclick="_abrirLinkExterno('${item.id}','${_escRepo(item.url_externa)}')" title="${_escRepo(item.url_externa)}">
         <span class="repo-file-pill__icon">🔗</span>
         <span class="repo-file-pill__name">${_repoHostname(item.url_externa)}</span>
         <span class="repo-file-pill__dl">↗</span>
       </button>`
    : '';

  // Archivos como pills, con botón de preview cuando aplica
  const archivosHTML = archivos.length > 0
    ? `<div class="repo-files-pills">
        ${archivos.map(a => {
          const puedePrev = _puedePreview(a.tipo_mime, a.nombre);
          return `<div class="repo-file-pill-wrap">
            <button class="repo-file-pill" onclick="descargarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}','${item.id}')" title="Descargar ${_escRepo(a.nombre)}">
              <span class="repo-file-pill__icon">${_repoIcono(a.tipo_mime, a.nombre)}</span>
              <span class="repo-file-pill__name">${_escRepo(a.nombre)}</span>
              <span class="repo-file-pill__size">${_repoFmtBytes(a.tamano_bytes)}</span>
              <span class="repo-file-pill__dl">↓</span>
            </button>
            ${puedePrev ? `<button class="repo-file-preview" onclick="previewArchivoRepo('${a.id}','${_escRepo(a.storage_path)}','${_escRepo(a.nombre)}','${a.tipo_mime||''}')" title="Ver">👁</button>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';

  // Descripción con markdown mínimo
  const descHTML = item.descripcion
    ? `<div class="repo-card__desc">${_repoMarkdown(item.descripcion)}</div>`
    : '';

  const descargas = item.descargas || 0;

  return `
    <div class="repo-card" id="repo-card-${item.id}" style="--cat-color:${cat.color}">
      <span class="repo-card__strip" style="background:${cat.color}"></span>
      ${thumbHTML}

      <!-- Top: categoría + badges nuevo/editado -->
      <div class="repo-card__top">
        <span class="repo-cat-badge" style="background:${cat.bg};color:${cat.color}">${cat.emoji} ${cat.label}</span>
        <div class="repo-card__top-badges">
          ${esNuevo   ? '<span class="repo-badge-nuevo">Nuevo</span>'   : ''}
          ${esEditado ? '<span class="repo-badge-editado">Editado</span>' : ''}
        </div>
      </div>

      <!-- Título + descripción -->
      <div class="repo-card__body">
        <div class="repo-card__titulo">${_escRepo(item.titulo)}</div>
        ${descHTML}
      </div>

      <!-- Archivos + link externo -->
      ${linkExternoHTML || archivosHTML ? `<div class="repo-card__files">${linkExternoHTML}${archivosHTML}</div>` : ''}

      <!-- Footer: meta + acciones -->
      <div class="repo-card__footer">
        <span class="repo-card__meta" title="${fechaAbs}">
          👤 ${_escRepo(item.subido_por || 'Equipo')} · ${fechaRel}
          ${descargas > 0 ? ` · ↓ ${descargas}` : ''}
        </span>
        <div class="repo-card__actions">
          <button class="repo-action-btn" onclick="copiarLinkRepo('${item.id}')" title="Copiar link al item">🔗</button>
          <button class="repo-action-btn" onclick="editarItemRepo('${item.id}')">✏️</button>
          <button class="repo-action-btn repo-action-btn--danger" onclick="eliminarItemRepo('${item.id}')">🗑</button>
        </div>
      </div>
    </div>`;
}

// ── Thumbnails para imágenes (asincrónico, se rellena y re-renderiza) ─────────
async function _cargarThumbnails() {
  let hubo = false;
  for (const item of repoItems) {
    const archivos = repoArchivos[item.id] || [];
    const img = archivos.find(a => _esImagen(a.tipo_mime, a.nombre));
    if (img && !repoThumbs[item.id]) {
      try {
        const { data } = await sb().storage.from('repositorio').createSignedUrl(img.storage_path, 3600);
        if (data?.signedUrl) { repoThumbs[item.id] = data.signedUrl; hubo = true; }
      } catch (e) { /* ignoramos */ }
    }
  }
  if (hubo) renderRepoList();
}

function _esImagen(mime, nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  return ['png','jpg','jpeg','gif','webp'].includes(ext) || (mime || '').startsWith('image/');
}

function _puedePreview(mime, nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || (mime || '').includes('pdf')) return true;
  return _esImagen(mime, nombre);
}

// ── Filtros / orden ───────────────────────────────────────────────────────────
function filtRepo(btn, cat) {
  repoFiltro = cat;
  _renderRepoChips();
  renderRepoList();
}

function buscarRepo(texto) {
  repoBusqueda = texto;
  renderRepoList();
}

function ordenarRepo(orden) {
  repoOrden = orden;
  renderRepoList();
}

function filtrarPorAutorRepo(autor) {
  repoAutor = autor;
  renderRepoList();
}

// ── Copiar link al item ───────────────────────────────────────────────────────
function copiarLinkRepo(id) {
  const url = location.origin + location.pathname + '#repo-item-' + id;
  navigator.clipboard.writeText(url)
    .then(() => toast('Link copiado al portapapeles'))
    .catch(() => {
      // Fallback antiguo
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Link copiado'); } catch(e) { toast('No se pudo copiar'); }
      document.body.removeChild(ta);
    });
}

// ── Form nuevo/editar ─────────────────────────────────────────────────────────
function _abrirOverlayRepo() {
  const overlay = document.getElementById('repo-form-overlay');
  if (overlay) overlay.classList.add('kb-modal--open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('repo-titulo').focus(), 100);
}

function abrirFormRepo() {
  repoEditId = null;
  _repoArchivosStaged = [];
  document.getElementById('repo-titulo').value = '';
  document.getElementById('repo-desc').value   = '';
  document.getElementById('repo-cat').value    = 'actualizacion';
  const urlInp = document.getElementById('repo-url'); if (urlInp) urlInp.value = '';
  document.getElementById('repo-form-title').textContent = 'Nuevo item';
  document.getElementById('repo-form-submit').textContent = 'Guardar';
  _renderRepoArchivosForm(null);
  _abrirOverlayRepo();
}

function cerrarFormRepo() {
  const overlay = document.getElementById('repo-form-overlay');
  if (overlay) overlay.classList.remove('kb-modal--open');
  document.body.style.overflow = '';
  repoEditId = null;
  _repoArchivosStaged = [];
}

function editarItemRepo(id) {
  const item = repoItems.find(i => i.id === id);
  if (!item) return;
  repoEditId = id;
  _repoArchivosStaged = [];
  document.getElementById('repo-titulo').value = item.titulo;
  document.getElementById('repo-desc').value   = item.descripcion || '';
  document.getElementById('repo-cat').value    = REPO_CATS[item.categoria] ? item.categoria : 'actualizacion';
  const urlInp = document.getElementById('repo-url'); if (urlInp) urlInp.value = item.url_externa || '';
  document.getElementById('repo-form-title').textContent = 'Editar item';
  document.getElementById('repo-form-submit').textContent = 'Guardar cambios';
  _renderRepoArchivosForm(id);
  _abrirOverlayRepo();
}

async function guardarItemRepo() {
  const titulo = document.getElementById('repo-titulo').value.trim();
  if (!titulo) { alert('Escribí un título.'); return; }
  const categoria = document.getElementById('repo-cat').value;
  const descripcion = document.getElementById('repo-desc').value.trim() || null;
  const urlInp = document.getElementById('repo-url');
  const url_externa = urlInp ? (urlInp.value.trim() || null) : null;
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
    ? (currentMember.nombre || currentMember.email) : 'Equipo';

  const btn = document.getElementById('repo-form-submit');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    let itemId;
    if (repoEditId) {
      await dbUpdate('repositorio_items', repoEditId, {
        titulo, categoria, descripcion, url_externa,
        updated_at: new Date().toISOString()
      });
      itemId = repoEditId;
      toast('Item actualizado');
    } else {
      const inserted = await dbInsert('repositorio_items', {
        titulo, categoria, descripcion, url_externa, subido_por: subidoPor
      });
      itemId = inserted.id;
      repoItems.unshift(inserted);
      toast('Item agregado al repositorio');
    }

    // Subir archivos staged
    for (const file of _repoArchivosStaged) {
      await _subirArchivoRepo(itemId, file);
    }
    _repoArchivosStaged = [];

    _repoUltimoVisto = new Date().toISOString();
    cerrarFormRepo();
    renderRepoAll();
    _cargarThumbnails();
  } catch (e) {
    console.error('Error guardando item repo', e);
    alert('No se pudo guardar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = repoEditId ? 'Guardar cambios' : 'Guardar';
  }
}

async function eliminarItemRepo(id) {
  const item = repoItems.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Eliminar "${item.titulo}"?\nSe borrarán también los archivos adjuntos.`)) return;

  try {
    const archivosItem = repoArchivos[id] || [];
    for (const a of archivosItem) {
      await sb().storage.from('repositorio').remove([a.storage_path]);
    }
    await dbDelete('repositorio_items', id);
    repoItems = repoItems.filter(i => i.id !== id);
    delete repoArchivos[id];
    delete repoThumbs[id];
    renderRepoAll();
    toast('Item eliminado');
  } catch (e) {
    console.error('Error eliminando item repo', e);
    toast('Error al eliminar el item.');
  }
}

// ── Archivos del form ─────────────────────────────────────────────────────────
function _renderRepoArchivosForm(itemId) {
  const container = document.getElementById('repo-archivos-form');
  if (!container) return;

  const existentes = itemId ? (repoArchivos[itemId] || []) : [];

  const existHTML = existentes.map(a => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_repoIcono(a.tipo_mime, a.nombre)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre">${_escRepo(a.nombre)}</div>
        <div class="mtm-archivo-meta">${_repoFmtBytes(a.tamano_bytes)}</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-dl" onclick="descargarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}','${a.item_id}')">⬇</button>
        <button class="mtm-archivo-del" onclick="eliminarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}','${a.item_id}')">×</button>
      </div>
    </div>`).join('');

  const stagedHTML = _repoArchivosStaged.map((f, i) => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_repoIcono(f.type, f.name)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre">${_escRepo(f.name)}</div>
        <div class="mtm-archivo-meta">${_repoFmtBytes(f.size)} · Pendiente</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-del" onclick="_repoRemoveStaged(${i})">×</button>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="repo-form-drop" id="repo-form-drop">
      ${existHTML}${stagedHTML}
      ${existentes.length === 0 && _repoArchivosStaged.length === 0
        ? '<div class="repo-form-drop__hint">Arrastrá archivos acá o usá el botón</div>' : ''}
    </div>
    <button type="button" class="btn-sm" onclick="_abrirSelectorArchivoRepo()">+ Adjuntar archivo</button>`;

  // Wire up drag & drop en la zona
  const drop = document.getElementById('repo-form-drop');
  if (drop) _wireDropZone(drop, (file) => _handleFileDropped(file));
}

function _handleFileDropped(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y supera el límite de 50 MB.\n\nSugerencia: usá el campo "Link externo" (Google Drive / WeTransfer) o dividilo con WinRAR en partes < 45 MB.`);
    return;
  }
  if (repoEditId) {
    _subirArchivoRepo(repoEditId, file);
  } else {
    _repoArchivosStaged.push(file);
    _renderRepoArchivosForm(null);
  }
}

function _wireDropZone(el, onFile) {
  ['dragenter','dragover'].forEach(ev => el.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('repo-form-drop--over');
  }));
  ['dragleave','drop'].forEach(ev => el.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    if (ev === 'dragleave' && el.contains(e.relatedTarget)) return;
    el.classList.remove('repo-form-drop--over');
  }));
  el.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) Array.from(files).forEach(onFile);
  });
}

function _initDropZone() {
  // (reservado por si querés agregar drop global después)
}

function _abrirSelectorArchivoRepo() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.csv,.txt,.zip,.exe,.msi,.rar,.7z';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) _handleFileDropped(file);
  };
  input.click();
}

function _repoRemoveStaged(idx) {
  _repoArchivosStaged.splice(idx, 1);
  _renderRepoArchivosForm(repoEditId);
}

async function _subirArchivoRepo(itemId, file) {
  try {
    const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${itemId}/${Date.now()}_${safeName}`;
    const { error } = await sb().storage.from('repositorio').upload(storagePath, file);
    if (error) throw error;

    const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
      ? (currentMember.nombre || currentMember.email) : 'Equipo';
    const inserted = await dbInsert('repositorio_archivos', {
      item_id: itemId, nombre: file.name, storage_path: storagePath,
      tipo_mime: file.type || null, tamano_bytes: file.size || null, subido_por: subidoPor,
    });

    if (inserted) {
      if (!repoArchivos[itemId]) repoArchivos[itemId] = [];
      if (!repoArchivos[itemId].find(a => a.id === inserted.id)) repoArchivos[itemId].push(inserted);
    }
    _renderRepoArchivosForm(repoEditId === itemId ? itemId : null);
    renderRepoAll();
    _cargarThumbnails();
    toast(`"${file.name}" subido.`);
  } catch (e) {
    console.error('Error subiendo archivo repo', e);
    toast('Error al subir el archivo.');
  }
}

// ── Descargar (incrementa contador) ───────────────────────────────────────────
async function descargarArchivoRepo(archivoId, storagePath, itemId) {
  try {
    const { data, error } = await sb().storage.from('repositorio').createSignedUrl(storagePath, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
    // Contador (best-effort)
    if (itemId) {
      try { await sb().rpc('incrementar_descargas_repo', { item_uuid: itemId }); } catch (e) { /* ignore */ }
      const it = repoItems.find(i => i.id === itemId);
      if (it) { it.descargas = (it.descargas || 0) + 1; renderRepoList(); }
    }
  } catch (e) {
    toast('Error al generar el link de descarga.');
  }
}

async function _abrirLinkExterno(itemId, url) {
  window.open(url, '_blank', 'noopener');
  try { await sb().rpc('incrementar_descargas_repo', { item_uuid: itemId }); } catch (e) { /* ignore */ }
  const it = repoItems.find(i => i.id === itemId);
  if (it) { it.descargas = (it.descargas || 0) + 1; renderRepoList(); }
}

async function eliminarArchivoRepo(archivoId, storagePath, itemId) {
  if (!confirm('¿Eliminar este archivo?')) return;
  try {
    await sb().storage.from('repositorio').remove([storagePath]);
    await dbDelete('repositorio_archivos', archivoId);
    if (repoArchivos[itemId]) repoArchivos[itemId] = repoArchivos[itemId].filter(a => a.id !== archivoId);
    delete repoThumbs[itemId]; // por si era la imagen de thumb
    _renderRepoArchivosForm(repoEditId);
    renderRepoAll();
    _cargarThumbnails();
    toast('Archivo eliminado.');
  } catch (e) {
    toast('Error al eliminar el archivo.');
  }
}

// ── Preview modal (PDF / imagen) ──────────────────────────────────────────────
async function previewArchivoRepo(archivoId, storagePath, nombre, mime) {
  try {
    const { data, error } = await sb().storage.from('repositorio').createSignedUrl(storagePath, 3600);
    if (error) throw error;
    const url = data.signedUrl;
    const esImg = _esImagen(mime, nombre);
    const overlay = document.createElement('div');
    overlay.id = 'repo-preview-overlay';
    overlay.className = 'repo-preview-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) cerrarPreviewRepo(); };
    overlay.innerHTML = `
      <div class="repo-preview-sheet" onclick="event.stopPropagation()">
        <div class="repo-preview-header">
          <div class="repo-preview-title">${_repoIcono(mime, nombre)} ${_escRepo(nombre)}</div>
          <div class="repo-preview-actions">
            <a class="repo-action-btn" href="${url}" target="_blank" rel="noopener">↓ Descargar</a>
            <button class="repo-action-btn repo-action-btn--danger" onclick="cerrarPreviewRepo()">✕</button>
          </div>
        </div>
        <div class="repo-preview-body">
          ${esImg
            ? `<img src="${url}" alt="${_escRepo(nombre)}" class="repo-preview-img"/>`
            : `<iframe src="${url}" class="repo-preview-iframe"></iframe>`}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _repoPreviewEsc);
  } catch (e) {
    toast('Error al abrir la vista previa.');
  }
}

function cerrarPreviewRepo() {
  const o = document.getElementById('repo-preview-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _repoPreviewEsc);
}

function _repoPreviewEsc(e) { if (e.key === 'Escape') cerrarPreviewRepo(); }

// ── Realtime ──────────────────────────────────────────────────────────────────
function suscribirRepositorio() {
  sb().channel('repositorio-items-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'repositorio_items' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'INSERT') {
        if (!repoItems.find(i => i.id === n.id)) repoItems.unshift(n);
      } else if (eventType === 'UPDATE') {
        const idx = repoItems.findIndex(i => i.id === n.id);
        if (idx !== -1) repoItems[idx] = n; else repoItems.unshift(n);
      } else if (eventType === 'DELETE') {
        repoItems = repoItems.filter(i => i.id !== o.id);
        delete repoThumbs[o.id];
      }
      renderRepoAll();
      _updateRepoBadge();
      _cargarThumbnails();
      // Refrescar el cartelito del Panel general (aviso de item nuevo)
      if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
    }).subscribe();

  sb().channel('repositorio-archivos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'repositorio_archivos' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'INSERT') {
        if (!repoArchivos[n.item_id]) repoArchivos[n.item_id] = [];
        if (!repoArchivos[n.item_id].find(a => a.id === n.id)) repoArchivos[n.item_id].push(n);
      } else if (eventType === 'DELETE') {
        for (const id in repoArchivos) repoArchivos[id] = repoArchivos[id].filter(a => a.id !== o.id);
      }
      renderRepoAll();
      _cargarThumbnails();
    }).subscribe();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _escRepo(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markdown mínimo: **bold**, *italic*, `code`, [texto](url), y saltos de línea.
function _repoMarkdown(str) {
  let s = _escRepo(str);
  // Links [texto](url) — solo http(s)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="repo-desc-link">$1</a>');
  // URLs sueltas
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener" class="repo-desc-link">$2</a>');
  // Bold **texto**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *texto*
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Code `texto`
  s = s.replace(/`([^`]+)`/g, '<code class="repo-desc-code">$1</code>');
  // Saltos de línea
  s = s.replace(/\n/g, '<br>');
  return s;
}

function _repoFecha(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// "hace 3 días", "hace 2 h", "ayer", etc.
function _repoFechaRelativa(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const min  = Math.floor(diffMs / 60000);
  const hs   = Math.floor(diffMs / 3600000);
  const dias = Math.floor(diffMs / (24 * 3600000));
  if (min < 1)   return 'recién';
  if (min < 60)  return `hace ${min} min`;
  if (hs < 24)   return `hace ${hs} h`;
  if (dias === 1) return 'ayer';
  if (dias < 7)  return `hace ${dias} días`;
  if (dias < 30) return `hace ${Math.floor(dias/7)} sem`;
  if (dias < 365) return `hace ${Math.floor(dias/30)} m`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function _repoFmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  if (bytes < 1024*1024*1024) return `${(bytes/1024/1024).toFixed(1)} MB`;
  return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
}

function _repoHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch(e) { return url; }
}

function _repoIcono(mime, nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || (mime||'').includes('pdf'))                                          return '📄';
  if (['xlsx','xls','csv','ods'].includes(ext) || (mime||'').includes('sheet'))             return '📊';
  if (['docx','doc','odt'].includes(ext) || (mime||'').includes('word'))                    return '📝';
  if (['pptx','ppt'].includes(ext) || (mime||'').includes('presentation'))                  return '📊';
  if (['zip','rar','7z','tar','gz'].includes(ext))                                          return '🗜️';
  if (['exe','msi'].includes(ext))                                                          return '⚙️';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext) || (mime||'').includes('image')) return '🖼️';
  if (['txt','md'].includes(ext))                                                           return '📃';
  return '📁';
}
