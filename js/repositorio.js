// repositorio.js — Sección Repositorio
// Archivos y recursos compartidos por el programador,
// con asignación de pendientes al equipo.

// ── Estado global ─────────────────────────────────────────────────────────────
let repoItems    = [];   // todos los items
let repoArchivos = {};   // { item_id: [archivo, ...] }
let repoFiltro   = '';   // categoría activa
let repoEditId   = null; // null = nuevo, uuid = editando
let _repoArchivosStaged = []; // File[] para subir al guardar

// ── Config categorías ─────────────────────────────────────────────────────────
const REPO_CATS = {
  actualizacion: { label: 'Actualización',     emoji: '📦', color: '#6366f1', bg: '#eef2ff' },
  modulo:        { label: 'Nuevo módulo',       emoji: '🧩', color: '#0891b2', bg: '#ecfeff' },
  bug:           { label: 'Solución de bug',    emoji: '🐛', color: '#dc2626', bg: '#fef2f2' },
  manual:        { label: 'Manual / Docs',      emoji: '📄', color: '#7c3aed', bg: '#f5f3ff' },
  clientes:      { label: 'Para clientes',      emoji: '📢', color: '#d97706', bg: '#fffbeb' },
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('app-ready', () => {
  initRepositorio();
});

async function initRepositorio() {
  // Cargar items
  const { data: itemRows } = await sb()
    .from('repositorio_items')
    .select('*')
    .order('created_at', { ascending: false });
  repoItems = (itemRows || []);

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

  renderRepoList();
  suscribirRepositorio();
}

// ── Render lista ──────────────────────────────────────────────────────────────
function renderRepoList() {
  const container = document.getElementById('repo-list');
  if (!container) return;

  const visible = repoFiltro
    ? repoItems.filter(i => i.categoria === repoFiltro)
    : repoItems;

  if (visible.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay items en esta categoría todavía.</div>';
    return;
  }

  container.innerHTML = visible.map(renderRepoCard).join('');
}

function renderRepoCard(item) {
  const cat     = REPO_CATS[item.categoria] || { label: item.categoria, emoji: '📁', color: '#666', bg: '#f5f5f5' };
  const archivos = repoArchivos[item.id] || [];
  const fecha   = _repoFecha(item.created_at);

  const archivosHTML = archivos.length > 0
    ? archivos.map(a => `
        <div class="repo-archivo">
          <span class="repo-archivo-icono">${_repoIcono(a.tipo_mime, a.nombre)}</span>
          <span class="repo-archivo-nombre" title="${_escRepo(a.nombre)}">${_escRepo(a.nombre)}</span>
          <span class="repo-archivo-meta">${_repoFmtBytes(a.tamano_bytes)}</span>
          <button class="mtm-archivo-dl" onclick="descargarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}')">⬇ Descargar</button>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--text3)">Sin archivos adjuntos.</div>';

  return `
    <div class="repo-card ${item.revisado ? 'repo-card--revisado' : ''}" id="repo-card-${item.id}">
      <div class="repo-card-header">
        <span class="repo-cat-badge" style="background:${cat.bg};color:${cat.color}">
          ${cat.emoji} ${cat.label}
        </span>
        <span class="repo-card-meta">${_escRepo(item.subido_por || 'Equipo')} · ${fecha}</span>
        <div class="repo-card-actions">
          ${item.revisado
            ? '<span class="repo-revisado-badge">✓ Revisado</span>'
            : `<button class="btn-sm" onclick="marcarRevisadoRepo('${item.id}')">Marcar revisado</button>`}
          <button class="btn-sm" onclick="editarItemRepo('${item.id}')">Editar</button>
          <button class="btn-sm repo-asignar-btn" onclick="abrirModalAsignarRepo('${item.id}')">📤 Asignar</button>
          <button class="btn-sm" style="color:var(--red)" onclick="eliminarItemRepo('${item.id}')">Eliminar</button>
        </div>
      </div>
      <div class="repo-card-titulo">${_escRepo(item.titulo)}</div>
      ${item.descripcion ? `<div class="repo-card-desc">${_escRepo(item.descripcion)}</div>` : ''}
      <div class="repo-archivos-lista">${archivosHTML}</div>
    </div>`;
}

// ── Filtro ────────────────────────────────────────────────────────────────────
function filtRepo(btn, cat) {
  document.querySelectorAll('#repositorio .filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  repoFiltro = cat;
  renderRepoList();
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
  document.getElementById('repo-cat').value    = item.categoria;
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
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
    ? (currentMember.nombre || currentMember.email) : 'Equipo';

  const btn = document.getElementById('repo-form-submit');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    let itemId;
    if (repoEditId) {
      await dbUpdate('repositorio_items', repoEditId, { titulo, categoria, descripcion, updated_at: new Date().toISOString() });
      itemId = repoEditId;
      toast('Item actualizado');
    } else {
      const inserted = await dbInsert('repositorio_items', { titulo, categoria, descripcion, subido_por: subidoPor });
      itemId = inserted.id;
      // Actualizar local
      repoItems.unshift(inserted);
      toast('Item agregado al repositorio');
    }

    // Subir archivos staged
    for (const file of _repoArchivosStaged) {
      await _subirArchivoRepo(itemId, file);
    }
    _repoArchivosStaged = [];

    cerrarFormRepo();
    renderRepoList(); // ya actualizado por realtime o local
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
    // Borrar archivos del storage
    const archivosItem = repoArchivos[id] || [];
    for (const a of archivosItem) {
      await sb().storage.from('repositorio').remove([a.storage_path]);
    }
    await dbDelete('repositorio_items', id);
    repoItems = repoItems.filter(i => i.id !== id);
    delete repoArchivos[id];
    renderRepoList();
    toast('Item eliminado');
  } catch (e) {
    console.error('Error eliminando item repo', e);
    toast('Error al eliminar el item.');
  }
}

async function marcarRevisadoRepo(id) {
  try {
    await dbUpdate('repositorio_items', id, { revisado: true });
    const item = repoItems.find(i => i.id === id);
    if (item) item.revisado = true;
    renderRepoList();
    toast('Marcado como revisado');
  } catch (e) {
    toast('Error al marcar como revisado');
  }
}

// ── Modal asignación de pendientes ────────────────────────────────────────────
let _repoAsignarItemId = null;

function abrirModalAsignarRepo(itemId) {
  _repoAsignarItemId = itemId;
  const item = repoItems.find(i => i.id === itemId);
  if (!item) return;

  const miembros = [
    { nombre: 'Ignacio Talon',   email: 'ignaciotalon07@gmail.com' },
    { nombre: 'Matías Ferro',    email: 'matias@salario.local' },
    { nombre: 'Daniel Colomer',  email: 'daniel@salario.local' },
    { nombre: 'Daniel Ferro',    email: 'danielferro@salario.local' },
    { nombre: 'Renzo Moretti',   email: 'renzo@salario.local' },
    { nombre: 'Alfredo Cesar',   email: 'Alfredo.Cesar@consultoraferro.com.ar' },
  ];

  const opciones = miembros.map(m => `
    <label class="repo-asignar-opcion">
      <input type="checkbox" value="${m.nombre}" checked> ${m.nombre}
    </label>`).join('');

  // Crear overlay
  const overlay = document.createElement('div');
  overlay.id = 'repo-asignar-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.onclick = (e) => { if (e.target === overlay) cerrarModalAsignarRepo(); };
  overlay.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700;color:var(--text)">Asignar pendiente</div>
        <button onclick="cerrarModalAsignarRepo()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer">✕</button>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:4px">Item:</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:16px">${_escRepo(item.titulo)}</div>

      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">Asignar a:</div>
      <div id="repo-asignar-miembros" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${opciones}
      </div>
      <div class="form-group">
        <label class="fl">Prioridad</label>
        <select id="repo-asignar-prioridad">
          <option value="alta">Alta</option>
          <option value="media" selected>Media</option>
          <option value="baja">Baja</option>
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn-primary" onclick="confirmarAsignarRepo()">Asignar pendientes</button>
        <button class="btn-secondary" onclick="cerrarModalAsignarRepo()">Cancelar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function cerrarModalAsignarRepo() {
  const overlay = document.getElementById('repo-asignar-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  _repoAsignarItemId = null;
}

async function confirmarAsignarRepo() {
  const item = repoItems.find(i => i.id === _repoAsignarItemId);
  if (!item) return;

  const checks = document.querySelectorAll('#repo-asignar-miembros input[type=checkbox]:checked');
  const seleccionados = Array.from(checks).map(c => c.value);
  if (seleccionados.length === 0) { alert('Elegí al menos un asesor.'); return; }

  const prioridad = document.getElementById('repo-asignar-prioridad').value;
  const cat = REPO_CATS[item.categoria] || { emoji: '📁', label: item.categoria };
  const descripcion = `${cat.emoji} [Repositorio] ${item.titulo}${item.descripcion ? '\n\n' + item.descripcion : ''}`;

  const btn = document.querySelector('#repo-asignar-overlay .btn-primary');
  btn.disabled = true; btn.textContent = 'Asignando...';

  try {
    for (const asesor of seleccionados) {
      await dbInsert('pendientes', {
        cliente_nombre: 'Repositorio',
        asesor,
        prioridad,
        descripcion,
        tipo_pendiente: 'repositorio',
        resuelto: false,
      });
    }
    cerrarModalAsignarRepo();
    toast(`Pendiente asignado a ${seleccionados.length === 1 ? seleccionados[0] : seleccionados.length + ' asesores'}`);
  } catch (e) {
    console.error('Error asignando pendiente', e);
    btn.disabled = false; btn.textContent = 'Asignar pendientes';
    alert('Error al crear los pendientes: ' + e.message);
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
        <button class="mtm-archivo-dl" onclick="descargarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}')">⬇ Descargar</button>
        <button class="mtm-archivo-del" onclick="eliminarArchivoRepo('${a.id}','${_escRepo(a.storage_path)}','${a.item_id}')">×</button>
      </div>
    </div>`).join('');

  const stagedHTML = _repoArchivosStaged.map((f, i) => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_repoIcono(f.type, f.name)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre">${f.name}</div>
        <div class="mtm-archivo-meta">${_repoFmtBytes(f.size)} · Pendiente</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-del" onclick="_repoRemoveStaged(${i})">×</button>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
      ${existHTML}${stagedHTML}
      ${existentes.length === 0 && _repoArchivosStaged.length === 0
        ? '<div style="font-size:12px;color:var(--text3)">Sin archivos todavía.</div>' : ''}
    </div>
    <button type="button" class="btn-sm" onclick="_abrirSelectorArchivoRepo()">+ Adjuntar archivo</button>`;
}

function _abrirSelectorArchivoRepo() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.csv,.txt,.zip,.exe,.msi,.rar,.7z';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Límite de Supabase Free: 50 MB
    if (file.size > 50 * 1024 * 1024) {
      alert(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y supera el límite de 50 MB de Supabase.\n\nSugerencia: dividilo en dos partes con WinRAR (clic derecho → Agregar al archivo → Dividir en volúmenes de 45 MB) y subí cada parte por separado.`);
      return;
    }
    if (repoEditId) {
      _subirArchivoRepo(repoEditId, file);
    } else {
      _repoArchivosStaged.push(file);
      _renderRepoArchivosForm(null);
    }
  };
  input.click();
}

function _repoRemoveStaged(idx) {
  _repoArchivosStaged.splice(idx, 1);
  _renderRepoArchivosForm(repoEditId);
}

async function _subirArchivoRepo(itemId, file) {
  try {
    // Sanitizar nombre para el path de storage (tildes y espacios rompen Supabase)
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
    renderRepoList();
    toast(`"${file.name}" subido.`);
  } catch (e) {
    console.error('Error subiendo archivo repo', e);
    toast('Error al subir el archivo.');
  }
}

async function descargarArchivoRepo(archivoId, storagePath) {
  try {
    const { data, error } = await sb().storage.from('repositorio').createSignedUrl(storagePath, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    toast('Error al generar el link de descarga.');
  }
}

async function eliminarArchivoRepo(archivoId, storagePath, itemId) {
  if (!confirm('¿Eliminar este archivo?')) return;
  try {
    await sb().storage.from('repositorio').remove([storagePath]);
    await dbDelete('repositorio_archivos', archivoId);
    if (repoArchivos[itemId]) repoArchivos[itemId] = repoArchivos[itemId].filter(a => a.id !== archivoId);
    _renderRepoArchivosForm(repoEditId);
    renderRepoList();
    toast('Archivo eliminado.');
  } catch (e) {
    toast('Error al eliminar el archivo.');
  }
}

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
      }
      renderRepoList();
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
      renderRepoList();
    }).subscribe();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _escRepo(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _repoFecha(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
}

function _repoFmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function _repoIcono(mime, nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || (mime||'').includes('pdf'))                                          return '📄';
  if (['xlsx','xls','csv','ods'].includes(ext) || (mime||'').includes('sheet'))             return '📊';
  if (['docx','doc','odt'].includes(ext) || (mime||'').includes('word'))                    return '📝';
  if (['pptx','ppt'].includes(ext) || (mime||'').includes('presentation'))                return '📊';
  if (['zip','rar','7z','tar','gz'].includes(ext))                                        return '🗜️';
  if (['exe','msi'].includes(ext))                                                        return '⚙️';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext) || (mime||'').includes('image')) return '🖼️';
  if (['txt','md'].includes(ext))                                                         return '📃';
  return '📁';
}

function _escRepo(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _repoFecha(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
