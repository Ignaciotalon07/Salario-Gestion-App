// ============================================================
//  proyecto-documentos.js — Documentos de cada proyecto
//  (Implementación → Proyectos → vista "Documentos" del detalle)
//  Archivos en el bucket `cliente-documentos` (carpeta proyectos/<id>/) y
//  links (ej. Google Drive). Tabla: proyecto_documentos (migración 061).
// ============================================================

let proyDocs = {};          // { proyecto_id: [doc, ...] }
let _pdocError = false;     // true si falta correr la migración 061
const PDOC_BUCKET = 'cliente-documentos';
const PDOC_MAX = 50 * 1024 * 1024;

window.addEventListener('app-ready', () => { initProyDocs(); });

async function initProyDocs() {
  try {
    const rows = await dbList('proyecto_documentos', { orderBy: 'created_at', ascending: false });
    proyDocs = {};
    rows.forEach(_pdocAgregar);
    _pdocError = false;
  } catch (e) {
    console.warn('Documentos de proyectos: no se pudieron cargar (¿falta la migración 061?)', e);
    _pdocError = true;
    return;
  }
  sb().channel('proyecto-documentos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proyecto_documentos' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'DELETE') _pdocQuitar(o.id); else _pdocAgregar(n);
      _pdocRefrescar();
    }).subscribe();
  _pdocRefrescar();
}

function _pdocAgregar(row) {
  const l = proyDocs[row.proyecto_id] || (proyDocs[row.proyecto_id] = []);
  const i = l.findIndex(d => d.id === row.id);
  if (i === -1) l.unshift(row); else l[i] = row;
}
function _pdocQuitar(id) { for (const k in proyDocs) proyDocs[k] = proyDocs[k].filter(d => d.id !== id); }
function _pdocRefrescar() { if (window._proyAbierto && typeof renderImplementacion === 'function') renderImplementacion(); }
function _pdocDe(id) { for (const k in proyDocs) { const d = proyDocs[k].find(x => x.id === id); if (d) return d; } return null; }
function pdocCantidad(pid) { return (proyDocs[pid] || []).length; }

// ── Helpers de presentación ──
function _pdEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _pdExt(n) { return (n || '').split('.').pop().toLowerCase(); }
function _pdHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
function _pdBytes(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function _pdFecha(ts) { return ts ? new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }) : ''; }
function _pdIcono(d) {
  if (d.url) return /(^|\.)(drive|docs)\.google\.com$/.test(_pdHost(d.url)) ? '📂' : '🔗';
  const e = _pdExt(d.nombre);
  if (e === 'pdf') return '📄';
  if (['xls', 'xlsx', 'csv'].includes(e)) return '📊';
  if (['doc', 'docx'].includes(e)) return '📝';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return '🖼️';
  if (['zip', 'rar', '7z'].includes(e)) return '🗜️';
  return '📁';
}

// ── Vista "Documentos" (se dibuja dentro del panel derecho del detalle) ──
function proyDocsHtml(p) {
  if (_pdocError) {
    return `<div class="proy-vacio">Todavía no está creada la base de documentos de proyectos.<br>Falta correr la migración <b>061_proyecto_documentos.sql</b> en Supabase → SQL Editor.</div>`;
  }
  const lista = proyDocs[p.id] || [];
  const acciones = '';
  if (!lista.length) {
    return `${acciones}<div class="proy-vacio">Todavía no hay documentos en este proyecto. Tocá <b>＋ Agregar documento</b> para subir un archivo (máx. 50 MB) o pegar el link de una carpeta de Google Drive.</div>`;
  }
  const filas = lista.map(d => {
    const esLink = !!d.url;
    const sub = esLink ? _pdEsc(_pdHost(d.url)) : [_pdBytes(d.tamano_bytes), _pdExt(d.nombre).toUpperCase()].filter(Boolean).join(' · ');
    return `<div class="pdoc-fila${typeof avClase === 'function' ? avClase('proyecto_doc', d.id) : ''}">
      <span class="pdoc-ico">${_pdIcono(d)}</span>
      <div class="pdoc-main">
        <div class="pdoc-nom" title="${_pdEsc(d.nombre)}">${_pdEsc(d.nombre)}</div>
        <div class="pdoc-sub">${sub}${sub ? ' · ' : ''}${_pdEsc(d.subido_por || '')} · ${_pdFecha(d.created_at)}</div>
      </div>
      <div class="pdoc-btns">
        <button onclick="${esLink ? `pdocAbrir('${d.id}')` : `pdocDescargar('${d.id}')`}">${esLink ? '↗ Abrir' : '⬇ Descargar'}</button>
        ${esLink ? `<button onclick="pdocCopiar('${d.id}')" title="Copiar link">📋</button>` : ''}
        ${typeof avBoton === 'function' ? avBoton('proyecto_doc', d.id) : ''}
        <button class="pdoc-del" onclick="pdocEliminar('${d.id}')" title="Eliminar">🗑</button>
      </div>
    </div>`;
  }).join('');
  return `${acciones}<div class="pdoc-lista">${filas}</div>`;
}

// ── Acciones ──
function pdocSubir(pid) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.onchange = e => { const fs = Array.from(e.target.files || []); if (fs.length) _pdocSubirArchivos(pid, fs); };
  input.click();
}

async function _pdocSubirArchivos(pid, files) {
  const quien = (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : 'Equipo';
  let ok = 0;
  for (const f of files) {
    if (f.size > PDOC_MAX) { alert(`"${f.name}" pesa ${(f.size / 1048576).toFixed(1)} MB y supera el límite de 50 MB.\n\nSugerencia: comprimilo con WinRAR o guardalo en Drive y pegá el link.`); continue; }
    try {
      toast(`Subiendo "${f.name}"...`);
      const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `proyectos/${pid}/${Date.now()}_${safe}`;
      const { error } = await sb().storage.from(PDOC_BUCKET).upload(path, f);
      if (error) throw error;
      const row = await dbInsert('proyecto_documentos', { proyecto_id: pid, nombre: f.name, storage_path: path, tipo_mime: f.type || null, tamano_bytes: f.size || null, subido_por: quien });
      if (row) { _pdocAgregar(row); if (typeof avMarcar === 'function') avMarcar('proyecto_doc', row.id, true, false); }
      ok++;
    } catch (e) { console.error(e); toast(`Error al subir "${f.name}": ${e.message || e}`); }
  }
  if (ok) { toast(ok === 1 ? 'Documento subido ✓' : `${ok} documentos subidos ✓`); _pdocRefrescar(); }
}

async function pdocDescargar(id) {
  const d = _pdocDe(id); if (!d) return;
  try {
    const { data, error } = await sb().storage.from(PDOC_BUCKET).createSignedUrl(d.storage_path, 3600, { download: d.nombre });
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
    if (typeof avMarcar === 'function') avMarcar('proyecto_doc', id);
  } catch (e) { toast('Error al generar el link de descarga.'); }
}
function pdocAbrir(id) {
  const d = _pdocDe(id);
  if (d && d.url) { window.open(d.url, '_blank', 'noopener'); if (typeof avMarcar === 'function') avMarcar('proyecto_doc', id); }
}
async function pdocCopiar(id) {
  const d = _pdocDe(id); if (!d || !d.url) return;
  try { await navigator.clipboard.writeText(d.url); toast('Link copiado ✓'); } catch (e) { toast('No se pudo copiar el link.'); }
}

function pdocAbrirLink(pid) {
  cerrarPdocLink();
  const o = document.createElement('div');
  o.id = 'pdoc-link-overlay';
  o.className = 'kb-modal-overlay kb-modal--open';
  o.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:480px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0">🔗 Agregar link</div>
        <button onclick="cerrarPdocLink()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5">Pegá el link de una carpeta o archivo de Google Drive (u otro sitio). Se guarda con los documentos del proyecto.</div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Link *</label>
      <input type="text" id="pdoc-link-url" placeholder="https://drive.google.com/..." style="width:100%;margin:4px 0 12px" autocomplete="off">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Nombre (opcional)</label>
      <input type="text" id="pdoc-link-nombre" placeholder="Ej: Carpeta con las planillas" style="width:100%;margin:4px 0 16px" autocomplete="off">
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-secondary" onclick="cerrarPdocLink()">Cancelar</button>
        <button class="btn-primary" onclick="pdocGuardarLink('${pid}')">Guardar link</button>
      </div>
    </div>`;
  o.onclick = e => { if (e.target === o) cerrarPdocLink(); };
  document.body.appendChild(o);
  setTimeout(() => document.getElementById('pdoc-link-url')?.focus(), 50);
}
function cerrarPdocLink() { document.getElementById('pdoc-link-overlay')?.remove(); }

async function pdocGuardarLink(pid) {
  let url = (document.getElementById('pdoc-link-url').value || '').trim();
  let nombre = (document.getElementById('pdoc-link-nombre').value || '').trim();
  if (!url) { alert('Pegá el link.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch (e) { alert('El link no parece válido.'); return; }
  const host = _pdHost(url);
  if (!nombre) nombre = /(^|\.)(drive|docs)\.google\.com$/.test(host) ? 'Carpeta de Google Drive' : host;
  const quien = (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : 'Equipo';
  try {
    const row = await dbInsert('proyecto_documentos', { proyecto_id: pid, nombre, url, storage_path: null, subido_por: quien });
    if (row && typeof avMarcar === 'function') avMarcar('proyecto_doc', row.id, true, false);
    if (row) _pdocAgregar(row);
    cerrarPdocLink(); _pdocRefrescar(); toast('Link guardado ✓');
  } catch (e) { console.error(e); toast('Error al guardar el link: ' + (e.message || e)); }
}

async function pdocEliminar(id) {
  const d = _pdocDe(id); if (!d) return;
  if (!confirm(`¿Eliminar "${d.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    if (d.storage_path) await sb().storage.from(PDOC_BUCKET).remove([d.storage_path]);
    await dbDelete('proyecto_documentos', id);
    _pdocQuitar(id); _pdocRefrescar(); toast('Documento eliminado.');
  } catch (e) { console.error(e); toast('Error al eliminar el documento.'); }
}

// Botón "＋ Agregar documento": pregunta si es un archivo o un link
function pdocElegirTipo(pid) {
  cerrarPdocTipo();
  const o = document.createElement('div');
  o.id = 'pdoc-tipo-overlay';
  o.className = 'kb-modal-overlay kb-modal--open';
  o.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:420px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0">＋ Agregar documento</div>
        <button onclick="cerrarPdocTipo()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <div class="pdoc-opciones">
        <button onclick="cerrarPdocTipo(); pdocSubir('${pid}')">
          <span>⬆</span><div><b>Subir archivo</b><small>PDF, Excel, Word, imágenes… (máx. 50 MB)</small></div>
        </button>
        <button onclick="cerrarPdocTipo(); pdocAbrirLink('${pid}')">
          <span>🔗</span><div><b>Agregar link</b><small>Carpeta o archivo de Google Drive u otro sitio</small></div>
        </button>
      </div>
    </div>`;
  o.onclick = e => { if (e.target === o) cerrarPdocTipo(); };
  document.body.appendChild(o);
}
function cerrarPdocTipo() { document.getElementById('pdoc-tipo-overlay')?.remove(); }
