// ════════════════════════════════════
// DOCUMENTOS DEL CLIENTE
// Pestaña "Documentos" del detalle de Implementación: archivos propios del
// cliente (logos, firmas, PDF, Excel, Word...) que nos pasan por WhatsApp.
// Funciona como un mini repositorio por cliente.
//
// Tabla:   cliente_documentos (migración 045) — realtime entre el equipo
// Bucket:  cliente-documentos (privado, hay que crearlo a mano en Supabase)
// Límite:  50 MB por archivo (plan free de Supabase)
// ════════════════════════════════════

const DOCS_BUCKET   = 'cliente-documentos';
const DOCS_MAX_BYTES = 50 * 1024 * 1024;

let clienteDocs   = {};   // { cliente_id: [doc, ...] }
let _docsThumbs   = {};   // { doc_id: signedUrl } cache de miniaturas de imágenes
window._docsEmpresa   = window._docsEmpresa   || {};  // cliente_id -> '' (todas) | nombre de empresa | '__sin'
window._docsFiltro    = window._docsFiltro    || {};  // cliente_id -> 'todos' | 'logo' | 'firma' | 'pdf' | ...
window._docsCategoria = window._docsCategoria || 'documento'; // categoría con la que se sube: documento | logo | firma
window._docsBusqueda  = window._docsBusqueda  || {};  // cliente_id -> texto del buscador

// ────────── Carga inicial + realtime ──────────

window.addEventListener('app-ready', () => { initClienteDocs(); });

async function initClienteDocs() {
  try {
    const { data, error } = await sb()
      .from('cliente_documentos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    clienteDocs = {};
    (data || []).forEach(_docsAgregarLocal);
  } catch (e) {
    // Si la tabla todavía no existe (falta correr la migración 045), la app
    // sigue funcionando; solo no se muestran documentos.
    console.warn('No se pudieron cargar los documentos de clientes', e);
  }
  _docsSuscribir();
  // Si ya hay un cliente abierto, refrescar para que aparezca el contador
  if (window._implClienteAbierto && typeof renderImplementacion === 'function') renderImplementacion();
}

function _docsAgregarLocal(row) {
  if (!clienteDocs[row.cliente_id]) clienteDocs[row.cliente_id] = [];
  const lista = clienteDocs[row.cliente_id];
  const idx = lista.findIndex(d => d.id === row.id);
  if (idx === -1) lista.unshift(row); else lista[idx] = row;
}

function _docsQuitarLocal(id) {
  for (const cid in clienteDocs) {
    clienteDocs[cid] = clienteDocs[cid].filter(d => d.id !== id);
  }
  delete _docsThumbs[id];
}

function _docsSuscribir() {
  sb().channel('cliente-documentos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_documentos' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      let clienteId = null;
      if (eventType === 'DELETE') { _docsQuitarLocal(o.id); }
      else { _docsAgregarLocal(n); clienteId = n.cliente_id; }
      // Redibujar solo si está abierto el detalle (el contador de la pestaña cambia)
      if (window._implClienteAbierto && typeof renderImplementacion === 'function'
          && (clienteId === null || clienteId === window._implClienteAbierto)) {
        renderImplementacion();
      }
    }).subscribe();
}

// ────────── Helpers ──────────

function _docEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _docExt(nombre) { return (nombre || '').split('.').pop().toLowerCase(); }

function _docEsLink(d) { return !!d.url; }

// Host legible de un link (ej: "drive.google.com")
function _docHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

function _docEsImagen(d) {
  if (d.url) return false;
  return ['png','jpg','jpeg','gif','webp','svg'].includes(_docExt(d.nombre)) || (d.tipo_mime || '').startsWith('image/');
}
function _docEsPdf(d) { return !d.url && (_docExt(d.nombre) === 'pdf' || (d.tipo_mime || '').includes('pdf')); }
function _docPuedePreview(d) { return !d.url && _docEsPdf(d) || (_docEsImagen(d) && _docExt(d.nombre) !== 'svg'); }

// Tipo para los filtros: logo / firma (los elige el usuario) o por extensión
function _docTipo(d) {
  if (d.url) return 'link';
  // Categorías que elige el usuario al subir (excepto "otro" y el viejo "documento",
  // que se clasifican por extensión)
  if (DOCS_CATS[d.categoria] && d.categoria !== 'otro') return d.categoria;
  const ext = _docExt(d.nombre);
  if (_docEsPdf(d)) return 'pdf';
  if (['xlsx','xls','csv','ods'].includes(ext)) return 'excel';
  if (['docx','doc','odt','rtf'].includes(ext)) return 'word';
  if (_docEsImagen(d)) return 'imagen';
  return 'otro';
}

// Opciones que se ofrecen al subir ("¿Qué estás subiendo?")
const DOCS_CATS = {
  logo:        { label: 'Logo',                  ico: '🏷️', tag: 'Logo' },
  firma:       { label: 'Firma',                 ico: '✍️', tag: 'Firma' },
  liquidacion: { label: 'PDF de liquidación',    ico: '📄', tag: 'Liquidación' },
  control:     { label: 'Excel de control',      ico: '📊', tag: 'Control' },
  explicativo: { label: 'Word explicativo',      ico: '📝', tag: 'Explicativo' },
  otro:        { label: 'Otro documento',        ico: '📁', tag: '' },
};

const DOCS_TIPOS = {
  todos:  { label: 'Todos' },
  logo:   { label: '🏷️ Logos' },
  firma:  { label: '✍️ Firmas' },
  liquidacion: { label: '📄 Liquidaciones' },
  control:     { label: '📊 Controles' },
  explicativo: { label: '📝 Explicativos' },
  pdf:    { label: '📄 PDF' },
  excel:  { label: '📊 Excel' },
  word:   { label: '📝 Word' },
  imagen: { label: '🖼️ Imágenes' },
  link:   { label: '🔗 Links' },
  otro:   { label: '📁 Otros' },
};

function _docIcono(d) {
  const t = _docTipo(d);
  if (t === 'link')  return '🔗';
  if (t === 'liquidacion') return '📄';
  if (t === 'control')     return '📊';
  if (t === 'explicativo') return '📝';
  if (t === 'pdf')   return '📄';
  if (t === 'excel') return '📊';
  if (t === 'word')  return '📝';
  if (t === 'logo' || t === 'firma' || t === 'imagen') return '🖼️';
  if (['zip','rar','7z'].includes(_docExt(d.nombre))) return '🗜️';
  return '📁';
}

function _docFmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function _docFecha(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function getCantDocsCliente(clienteId) {
  return (clienteDocs[clienteId] || []).length;
}

// ────────── Empresa del documento ──────────

function _docEmp(d) { return (d.empresa || '').trim(); }

// Empresas ya usadas en los documentos del cliente (para autocompletar y filtrar)
function _docsEmpresasDe(clienteId) {
  const m = {};
  (clienteDocs[clienteId] || []).forEach(d => { const e = _docEmp(d); if (e) m[e] = (m[e] || 0) + 1; });
  return Object.keys(m).sort((a, b) => a.localeCompare(b, 'es')).map(n => ({ nombre: n, cant: m[n] }));
}

function _docsDatalist(clienteId) {
  return `<datalist id="docs-emp-lista">${_docsEmpresasDe(clienteId).map(e => `<option value="${_docEsc(e.nombre)}">`).join('')}</datalist>`;
}

// Campo "Empresa": desplegable con las empresas ya cargadas + "Nueva empresa…".
// El <input id> (oculto salvo en "Nueva") siempre guarda el valor final, así que se lee con .value.
function _docsCampoEmpresa(clienteId, valor, id) {
  const emps = _docsEmpresasDe(clienteId).map(e => e.nombre);
  valor = (valor || '').trim();
  const esNueva = valor && !emps.includes(valor);
  return `<label style="font-size:12px;font-weight:600;color:var(--text2)">Empresa (opcional)</label>
    <select class="docs-emp-sel" id="${id}-sel" onchange="docsEmpresaSel('${id}')" style="width:100%;margin:4px 0 6px">
      <option value="">Sin empresa</option>
      ${emps.map(n => `<option value="${_docEsc(n)}" ${n === valor ? 'selected' : ''}>${_docEsc(n)}</option>`).join('')}
      <option value="__nueva" ${esNueva ? 'selected' : ''}>＋ Nueva empresa…</option>
    </select>
    <input type="text" id="${id}" value="${_docEsc(valor)}" placeholder="Nombre de la empresa nueva" style="width:100%;margin:0 0 4px;${esNueva ? '' : 'display:none'}" autocomplete="off">`;
}

function docsEmpresaSel(id) {
  const sel = document.getElementById(id + '-sel');
  const inp = document.getElementById(id);
  if (!sel || !inp) return;
  if (sel.value === '__nueva') { inp.value = ''; inp.style.display = ''; inp.focus(); }
  else { inp.value = sel.value; inp.style.display = 'none'; }
}
window._docsUltEmpresa = window._docsUltEmpresa || {};

// ────────── Render de la pestaña ──────────

// Texto sin tildes y en minúsculas, para buscar sin importar acentos ni mayúsculas
function _docNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Archivos del cliente que pasan el filtro de tipo y el buscador.
// El buscador mira el nombre, el tipo (ej: "pdf", "excel", "logo", "firma")
// y quién lo subió. Se pueden poner varias palabras: deben estar todas.
function _docsFiltrados(clienteId) {
  const todos  = clienteDocs[clienteId] || [];
  const filtro = window._docsFiltro[clienteId] || 'todos';
  const palabras = _docNorm(window._docsBusqueda[clienteId] || '').split(/\s+/).filter(Boolean);
  return todos.filter(d => {
    if (filtro !== 'todos' && _docTipo(d) !== filtro) return false;
    const fe = window._docsEmpresa[clienteId] || '';
    if (fe === '__sin' ? !!_docEmp(d) : (fe && _docEmp(d) !== fe)) return false;
    if (palabras.length === 0) return true;
    const pajar = _docNorm(`${d.nombre} ${DOCS_TIPOS[_docTipo(d)].label} ${d.subido_por || ''} ${d.empresa || ''} ${d.url ? _docHost(d.url) : ''}`);
    return palabras.every(p => pajar.includes(p));
  });
}

// Solo la lista de archivos (para refrescarla al tipear sin perder el foco del buscador)
function _docsListaHtml(clienteId) {
  const todos = clienteDocs[clienteId] || [];
  const lista = _docsFiltrados(clienteId);
  const hayBusqueda = (window._docsBusqueda[clienteId] || '').trim() !== '';
  if (lista.length === 0) {
    return `<div class="docs-empty">${todos.length === 0
      ? 'Todavía no hay documentos de este cliente.<br>Subí los archivos que te pasen por WhatsApp.'
      : hayBusqueda ? 'No se encontró ningún archivo con esa búsqueda.' : 'No hay archivos de este tipo.'}</div>`;
  }
  return `
    ${hayBusqueda ? `<div class="docs-count">${lista.length} resultado${lista.length !== 1 ? 's' : ''}</div>` : ''}
    <div class="docs-grid">${lista.map(_renderDocCard).join('')}</div>`;
}

function renderDocumentosCliente(c) {
  const todos  = clienteDocs[c.id] || [];
  const filtro = window._docsFiltro[c.id] || 'todos';
  const busqueda = window._docsBusqueda[c.id] || '';

  // Chips: "Todos" + solo los tipos que tienen al menos un archivo
  const conteo = {};
  todos.forEach(d => { const t = _docTipo(d); conteo[t] = (conteo[t] || 0) + 1; });
  const chips = ['todos', ...Object.keys(DOCS_TIPOS).filter(k => k !== 'todos' && conteo[k])]
    .map(k => `
      <button class="filter-chip ${filtro === k ? 'active' : ''}" onclick="docsSetFiltro('${c.id}','${k}')">
        ${DOCS_TIPOS[k].label}${k === 'todos' ? ` (${todos.length})` : ` (${conteo[k]})`}
      </button>`).join('');

  // Chips de empresa (solo si hay al menos una cargada)
  const emps = _docsEmpresasDe(c.id);
  const fe = window._docsEmpresa[c.id] || '';
  const sinEmp = todos.filter(d => !_docEmp(d)).length;
  const chipsEmp = emps.length === 0 ? '' : `
    <div class="docs-filtros docs-filtros--emp">
      <span class="docs-filtros__lbl">🏢 Empresa</span>
      <button class="filter-chip ${fe === '' ? 'active' : ''}" onclick="docsSetEmpresa('${c.id}','')">Todas</button>
      ${emps.map((e, i) => `<button class="filter-chip ${fe === e.nombre ? 'active' : ''}" onclick="docsSetEmpresa('${c.id}', _docsEmpresasDe('${c.id}')[${i}].nombre)">${_docEsc(e.nombre)} (${e.cant})</button>`).join('')}
      ${sinEmp ? `<button class="filter-chip ${fe === '__sin' ? 'active' : ''}" onclick="docsSetEmpresa('${c.id}','__sin')">Sin empresa (${sinEmp})</button>` : ''}
    </div>`;

  return `
    <div class="docs-panel" id="docs-panel" data-cliente-id="${c.id}">
      <!-- Buscador + subir (también se puede arrastrar archivos sobre toda la sección) -->
      <div class="docs-barra">
        <div class="docs-buscador">
          <span class="docs-buscador__ico">🔍</span>
          <input type="text" id="docs-buscador" placeholder="Buscar documento (ej: liquidación julio, logo, firma, excel...)"
                 value="${_docEsc(busqueda)}" oninput="docsBuscar('${c.id}', this.value)" autocomplete="off">
          <button class="docs-buscador__clear" id="docs-buscador-clear" style="${busqueda ? '' : 'display:none'}"
                  onclick="docsLimpiarBusqueda('${c.id}')" title="Limpiar búsqueda">✕</button>
        </div>
        <div class="docs-subir">
          <button class="docs-subir__btn" onclick="docsAbrirSelector('${c.id}')">
            <span class="docs-subir__ico">↑</span> Subir archivos
          </button>
          <button class="docs-subir__btn" onclick="docsAbrirFormLink('${c.id}')" title="Agregar un link (ej: carpeta de Google Drive)">
            <span class="docs-subir__ico">🔗</span> Agregar link
          </button>
        </div>
      </div>
      ${todos.length > 0 ? `<div class="docs-filtros">${chips}</div>` : ''}
      ${chipsEmp}

      <!-- Archivos -->
      <div id="docs-lista">${_docsListaHtml(c.id)}</div>
    </div>`;
}

// Meta en 2 líneas fijas: (tamaño · fecha) y quién lo subió → todas las tarjetas miden igual
function _docMetaHtml(partes, autor) {
  return `<span class="doc-card__meta-l">${_docEsc(partes.filter(Boolean).join(' · '))}</span><span class="doc-card__meta-l">${_docEsc(autor || '')}</span>`;
}

// Línea de empresa de la tarjeta; al tocarla se edita
function _docEmpHtml(d) {
  const e = _docEmp(d);
  return `<button type="button" class="doc-card__emp${e ? '' : ' doc-card__emp--vacia'}" onclick="docsEditarEmpresa('${d.id}')" title="${e ? 'Cambiar empresa' : 'Asignar empresa'}">${e ? '🏢 ' + _docEsc(e) : '+ Asignar empresa'}</button>`;
}

function _renderDocCard(d) {
  // Link externo (ej: Google Drive): se abre en otra pestaña
  if (d.url) {
    const host = _docHost(d.url);
    const esDrive = /(^|\.)(drive|docs)\.google\.com$/.test(host);
    const meta = _docMetaHtml([_docFecha(d.created_at)], d.subido_por);
    return `
      <div class="doc-card${typeof avClase === 'function' ? avClase('cliente_doc', d.id) : ''}">
        ${typeof avBoton === 'function' ? avBoton('cliente_doc', d.id) : ''}
        <div class="doc-card__thumb doc-card__thumb--link" onclick="docsAbrirLink('${d.id}')" title="Abrir link">
          <span class="doc-card__ico">${esDrive ? '📂' : '🔗'}</span>
          <span class="doc-card__host">${_docEsc(esDrive ? 'Google Drive' : host)}</span>
          <span class="doc-card__tag doc-card__tag--link">Link</span>
        </div>
        <div class="doc-card__name" title="${_docEsc(d.nombre)}">${_docEsc(d.nombre)}</div>
        ${_docEmpHtml(d)}
        <div class="doc-card__meta">${meta}</div>
        <div class="doc-card__actions">
          <button class="doc-act" onclick="docsAbrirLink('${d.id}')">↗ Abrir</button>
          <button class="doc-act doc-act--ico" onclick="docsCopiarLink('${d.id}')" title="Copiar link">⧉</button>
          <button class="doc-act doc-act--del" onclick="docsEliminar('${d.id}')" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }
  const tipo = _docTipo(d);
  const thumb = _docsThumbs[d.id];
  const abrir = _docPuedePreview(d) ? `docsPreview('${d.id}')` : `docsDescargar('${d.id}')`;
  const meta = _docMetaHtml([_docFmtBytes(d.tamano_bytes), _docFecha(d.created_at)], d.subido_por);
  return `
    <div class="doc-card${typeof avClase === 'function' ? avClase('cliente_doc', d.id) : ''}">
      ${typeof avBoton === 'function' ? avBoton('cliente_doc', d.id) : ''}
      <div class="doc-card__thumb" data-doc-thumb="${d.id}" onclick="${abrir}" title="${_docPuedePreview(d) ? 'Ver' : 'Descargar'}">
        ${thumb
          ? `<img src="${thumb}" alt="${_docEsc(d.nombre)}">`
          : `<span class="doc-card__ico">${_docIcono(d)}</span>`}
        ${(DOCS_CATS[tipo] && DOCS_CATS[tipo].tag) ? `<span class="doc-card__tag">${DOCS_CATS[tipo].tag}</span>` : ''}
      </div>
      <div class="doc-card__name" title="${_docEsc(d.nombre)}">${_docEsc(d.nombre)}</div>
      ${_docEmpHtml(d)}
      <div class="doc-card__meta">${meta}</div>
      <div class="doc-card__actions">
        ${_docPuedePreview(d)
          ? `<button class="doc-act" onclick="docsPreview('${d.id}')">👁 Ver</button>
        <button class="doc-act doc-act--ico" onclick="docsDescargar('${d.id}')" title="Descargar">↓</button>`
          : `<button class="doc-act" onclick="docsDescargar('${d.id}')">↓ Descargar</button>
        <button class="doc-act doc-act--ico" style="visibility:hidden" tabindex="-1" aria-hidden="true">·</button>`}
        <button class="doc-act doc-act--del" onclick="docsEliminar('${d.id}')" title="Eliminar">🗑</button>
      </div>
    </div>`;
}

// Después de dibujar la pestaña: conectar el drag&drop y cargar miniaturas
function docsPostRender() {
  // Toda la sección es zona de arrastre
  const drop = document.getElementById('docs-panel');
  if (drop) {
    const cid = drop.dataset.clienteId;
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); drop.classList.add('docs-panel--over');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return;
      drop.classList.remove('docs-panel--over');
    }));
    drop.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) docsPedirTipo(cid, Array.from(files));
    });
  }
  _docsCargarThumbs();
}

// Miniaturas de imágenes (asincrónico): se piden las URLs firmadas y se
// pintan directo en el DOM, sin redibujar toda la pantalla.
async function _docsCargarThumbs() {
  const cid = window._implClienteAbierto;
  if (!cid) return;
  for (const d of (clienteDocs[cid] || [])) {
    if (!_docEsImagen(d) || _docsThumbs[d.id]) continue;
    try {
      const { data } = await sb().storage.from(DOCS_BUCKET).createSignedUrl(d.storage_path, 3600);
      if (data && data.signedUrl) {
        _docsThumbs[d.id] = data.signedUrl;
        const el = document.querySelector(`[data-doc-thumb="${d.id}"]`);
        if (el) {
          const tag = el.querySelector('.doc-card__tag');
          el.innerHTML = `<img src="${data.signedUrl}" alt="${_docEsc(d.nombre)}">` + (tag ? tag.outerHTML : '');
        }
      }
    } catch (e) { /* sin miniatura, queda el ícono */ }
  }
}

// ────────── Acciones ──────────

function docsSetEmpresa(clienteId, emp) {
  window._docsEmpresa[clienteId] = emp;
  renderImplementacion();
}

// Modal para asignar / cambiar la empresa de un documento ya subido
function docsEditarEmpresa(id) {
  const d = _docPorId(id);
  if (!d) return;
  const o0 = document.getElementById('docs-emp-overlay'); if (o0) o0.remove();
  const overlay = document.createElement('div');
  overlay.id = 'docs-emp-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:420px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="card-title" style="margin:0">🏢 Empresa del documento</div>
      <button onclick="document.getElementById('docs-emp-overlay').remove()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
    </div>
    <div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;overflow-wrap:anywhere">${_docEsc(d.nombre)}</div>
    ${_docsCampoEmpresa(d.cliente_id, _docEmp(d), 'docs-emp-input')}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn-secondary" onclick="document.getElementById('docs-emp-overlay').remove()">Cancelar</button>
      <button class="btn-primary" onclick="docsGuardarEmpresa('${d.id}')">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const i = document.getElementById('docs-emp-input');
  if (i) { i.focus(); i.select(); i.onkeydown = (e) => { if (e.key === 'Enter') docsGuardarEmpresa(id); }; }
}

async function docsGuardarEmpresa(id) {
  const d = _docPorId(id);
  if (!d) return;
  const val = (document.getElementById('docs-emp-input').value || '').trim().replace(/\s+/g, ' ');
  try {
    await dbUpdate('cliente_documentos', id, { empresa: val || null });
    d.empresa = val || null;
    window._docsUltEmpresa[d.cliente_id] = val;
    const o = document.getElementById('docs-emp-overlay'); if (o) o.remove();
    renderImplementacion();
    toast(val ? 'Empresa asignada ✓' : 'Empresa quitada.');
  } catch (e) {
    console.error('Error guardando empresa', e);
    toast('Error al guardar la empresa (¿corriste la migración 070?).');
  }
}

function docsSetFiltro(clienteId, tipo) {
  window._docsFiltro[clienteId] = tipo;
  renderImplementacion();
}

// Buscador: solo refresca la lista (no toda la pantalla) para no perder el foco al tipear
function docsBuscar(clienteId, texto) {
  window._docsBusqueda[clienteId] = texto;
  const lista = document.getElementById('docs-lista');
  if (lista) lista.innerHTML = _docsListaHtml(clienteId);
  const clear = document.getElementById('docs-buscador-clear');
  if (clear) clear.style.display = texto ? '' : 'none';
  _docsCargarThumbs();
}

function docsLimpiarBusqueda(clienteId) {
  window._docsBusqueda[clienteId] = '';
  const input = document.getElementById('docs-buscador');
  if (input) { input.value = ''; input.focus(); }
  docsBuscar(clienteId, '');
}

// Leyenda que reemplaza a las fechas en el encabezado cuando se está en la pestaña Documentos
function renderDocsLeyenda(c) {
  return `
    <div class="docs-leyenda">
      <div class="docs-leyenda__ico">📁</div>
      <div class="docs-leyenda__txt">
        <b>Documentos de ${_docEsc(c.nombre)}</b>
        <span>Acá guardamos los archivos propios del cliente que nos pasa por WhatsApp: logos, firmas,
        PDF de liquidaciones, Excel de control de fórmulas, documentos Word explicativos, etc.
        También podés guardar un link (por ejemplo una carpeta de Google Drive). Quedan ordenados y
        disponibles para todo el equipo. Podés arrastrar archivos sobre esta sección.</span>
      </div>
    </div>`;
}

function docsAbrirSelector(clienteId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) docsPedirTipo(clienteId, files);
  };
  input.click();
}

// ────────── "¿Qué estás subiendo?" ──────────
// Antes de subir, se le pregunta al usuario qué tipo de documento es
// (logo, firma, PDF de liquidación, Excel de control, etc.). Se sugiere una
// opción según la extensión, pero se puede cambiar. Aplica a todos los
// archivos elegidos en esa tanda.

window._docsPend = null;  // { clienteId, files, cat }

function _docsSugerirCat(files) {
  const exts = files.map(f => (f.name.split('.').pop() || '').toLowerCase());
  const todosIgual = (lista) => exts.every(e => lista.includes(e));
  if (todosIgual(['pdf']))                         return 'liquidacion';
  if (todosIgual(['xlsx', 'xls', 'csv', 'ods']))   return 'control';
  if (todosIgual(['docx', 'doc', 'odt', 'rtf']))   return 'explicativo';
  if (todosIgual(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])) return 'logo';
  return 'otro';
}

function docsPedirTipo(clienteId, files) {
  cerrarDocsTipo();
  window._docsPend = { clienteId, files, cat: _docsSugerirCat(files), empresa: window._docsUltEmpresa[clienteId] || '' };
  const overlay = document.createElement('div');
  overlay.id = 'docs-tipo-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.onclick = (e) => { if (e.target === overlay) cerrarDocsTipo(); };
  overlay.innerHTML = `<div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:480px">
    <div id="docs-tipo-body"></div>
  </div>`;
  document.body.appendChild(overlay);
  _docsRenderTipo();
}

function _docsRenderTipo() {
  const p = window._docsPend;
  const body = document.getElementById('docs-tipo-body');
  if (!p || !body) return;
  const nombres = p.files.length === 1
    ? _docEsc(p.files[0].name)
    : `${p.files.length} archivos`;
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="card-title" style="margin:0">¿Qué estás subiendo?</div>
      <button onclick="cerrarDocsTipo()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
    </div>
    <div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;overflow-wrap:anywhere">${nombres}</div>
    <div class="docs-tipo-grid">
      ${Object.keys(DOCS_CATS).map(k => `
        <button class="docs-tipo-op ${p.cat === k ? 'docs-tipo-op--sel' : ''}" onclick="docsElegirTipo('${k}')">
          <span class="docs-tipo-op__ico">${DOCS_CATS[k].ico}</span>
          <span>${DOCS_CATS[k].label}</span>
        </button>`).join('')}
    </div>
    <div style="margin-top:16px">${_docsCampoEmpresa(p.clienteId, p.empresa, 'docs-tipo-emp')}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
      <button class="btn-secondary" onclick="cerrarDocsTipo()">Cancelar</button>
      <button class="btn-primary" onclick="docsConfirmarSubida()">Subir</button>
    </div>`;
}

function docsElegirTipo(k) {
  if (!window._docsPend) return;
  const ie = document.getElementById('docs-tipo-emp');
  if (ie) window._docsPend.empresa = ie.value;
  window._docsPend.cat = k;
  _docsRenderTipo();
}

function cerrarDocsTipo() {
  const o = document.getElementById('docs-tipo-overlay');
  if (o) o.remove();
  window._docsPend = null;
}

function docsConfirmarSubida() {
  const p = window._docsPend;
  if (!p) return;
  const { clienteId, files, cat } = p;
  const ie = document.getElementById('docs-tipo-emp');
  const empresa = ((ie ? ie.value : p.empresa) || '').trim().replace(/\s+/g, ' ');
  window._docsUltEmpresa[clienteId] = empresa;
  cerrarDocsTipo();
  docsSubir(clienteId, files, cat, empresa);
}

async function docsSubir(clienteId, files, categoria, empresa) {
  categoria = categoria || 'otro';
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
    ? (currentMember.nombre || currentMember.email) : 'Equipo';
  let ok = 0;
  for (const file of files) {
    if (file.size > DOCS_MAX_BYTES) {
      alert(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y supera el límite de 50 MB.\n\nSugerencia: comprimilo con WinRAR o pedile al cliente una versión más liviana.`);
      continue;
    }
    try {
      toast(`Subiendo "${file.name}"...`);
      // Nombre seguro para Storage (sin tildes ni caracteres raros)
      const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${clienteId}/${Date.now()}_${safeName}`;
      const { error } = await sb().storage.from(DOCS_BUCKET).upload(storagePath, file);
      if (error) throw error;
      const inserted = await dbInsert('cliente_documentos', {
        cliente_id: clienteId, nombre: file.name, categoria, empresa: empresa || null,
        storage_path: storagePath, tipo_mime: file.type || null,
        tamano_bytes: file.size || null, subido_por: subidoPor,
      });
      if (inserted) { _docsAgregarLocal(inserted); }
      ok++;
    } catch (e) {
      console.error('Error subiendo documento', e);
      toast(`Error al subir "${file.name}": ${e.message || e}`);
    }
  }
  if (ok > 0) {
    toast(ok === 1 ? 'Documento subido ✓' : `${ok} documentos subidos ✓`);
    renderImplementacion();
  }
}

function _docPorId(id) {
  for (const cid in clienteDocs) {
    const d = clienteDocs[cid].find(x => x.id === id);
    if (d) return d;
  }
  return null;
}

async function docsDescargar(id) {
  const d = _docPorId(id);
  if (!d) return;
  try {
    const { data, error } = await sb().storage.from(DOCS_BUCKET)
      .createSignedUrl(d.storage_path, 3600, { download: d.nombre });
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
    if (typeof avMarcar === 'function') avMarcar('cliente_doc', id);
  } catch (e) {
    toast('Error al generar el link de descarga.');
  }
}

async function docsPreview(id) {
  const d = _docPorId(id);
  if (!d) return;
  try {
    const { data, error } = await sb().storage.from(DOCS_BUCKET).createSignedUrl(d.storage_path, 3600);
    if (error) throw error;
    const url = data.signedUrl;
    const overlay = document.createElement('div');
    overlay.id = 'docs-preview-overlay';
    overlay.className = 'repo-preview-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) cerrarDocsPreview(); };
    overlay.innerHTML = `
      <div class="repo-preview-sheet" onclick="event.stopPropagation()">
        <div class="repo-preview-header">
          <div class="repo-preview-title">${_docIcono(d)} ${_docEsc(d.nombre)}</div>
          <div class="repo-preview-actions">
            <a class="repo-action-btn" href="${url}" target="_blank" rel="noopener">↓ Descargar</a>
            <button class="repo-action-btn repo-action-btn--danger" onclick="cerrarDocsPreview()">✕</button>
          </div>
        </div>
        <div class="repo-preview-body">
          ${_docEsImagen(d)
            ? `<img src="${url}" alt="${_docEsc(d.nombre)}" class="repo-preview-img"/>`
            : `<iframe src="${url}" class="repo-preview-iframe"></iframe>`}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _docsPreviewEsc);
    if (typeof avMarcar === 'function') avMarcar('cliente_doc', id, true, false);   // sin redibujar: el visor está abierto
  } catch (e) {
    toast('Error al abrir la vista previa.');
  }
}

function cerrarDocsPreview() {
  const o = document.getElementById('docs-preview-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _docsPreviewEsc);
}
function _docsPreviewEsc(e) { if (e.key === 'Escape') cerrarDocsPreview(); }

// ────────── Links (Google Drive u otros) ──────────

function docsAbrirLink(id) {
  const d = _docPorId(id);
  if (d && d.url) {
    window.open(d.url, '_blank', 'noopener');
    if (typeof avMarcar === 'function') avMarcar('cliente_doc', id);
  }
}

async function docsCopiarLink(id) {
  const d = _docPorId(id);
  if (!d || !d.url) return;
  try { await navigator.clipboard.writeText(d.url); toast('Link copiado ✓'); }
  catch (e) { toast('No se pudo copiar el link.'); }
}

// Modal para agregar un link: nombre (opcional) + URL
function docsAbrirFormLink(clienteId) {
  cerrarDocsLink();
  const overlay = document.createElement('div');
  overlay.id = 'docs-link-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:480px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0">🔗 Agregar link</div>
        <button onclick="cerrarDocsLink()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5">
        Pegá el link de una carpeta o archivo de Google Drive (u otro sitio). Se guarda junto a los documentos del cliente.
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Link *</label>
      <input type="text" id="docs-link-url" placeholder="https://drive.google.com/..." style="width:100%;margin:4px 0 12px" autocomplete="off">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Nombre (opcional)</label>
      <input type="text" id="docs-link-nombre" placeholder="Ej: Carpeta de legajos escaneados" style="width:100%;margin:4px 0 12px" autocomplete="off">
      ${_docsCampoEmpresa(clienteId, window._docsUltEmpresa[clienteId], 'docs-link-emp')}
      <div style="height:12px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-secondary" onclick="cerrarDocsLink()">Cancelar</button>
        <button class="btn-primary" onclick="docsGuardarLink('${clienteId}')">Guardar link</button>
      </div>
    </div>`;
  overlay.onclick = (e) => { if (e.target === overlay) cerrarDocsLink(); };
  document.body.appendChild(overlay);
  setTimeout(() => { const i = document.getElementById('docs-link-url'); if (i) i.focus(); }, 50);
}

function cerrarDocsLink() {
  const o = document.getElementById('docs-link-overlay');
  if (o) o.remove();
}

async function docsGuardarLink(clienteId) {
  let url = (document.getElementById('docs-link-url').value || '').trim();
  let nombre = (document.getElementById('docs-link-nombre').value || '').trim();
  if (!url) { alert('Pegá el link.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch (e) { alert('El link no parece válido.'); return; }
  const empresa = ((document.getElementById('docs-link-emp').value || '').trim().replace(/\s+/g, ' ')) || null;
  window._docsUltEmpresa[clienteId] = empresa || '';
  const host = _docHost(url);
  if (!nombre) nombre = /(^|\.)(drive|docs)\.google\.com$/.test(host) ? 'Carpeta de Google Drive' : host;
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
    ? (currentMember.nombre || currentMember.email) : 'Equipo';
  try {
    const inserted = await dbInsert('cliente_documentos', {
      cliente_id: clienteId, nombre, categoria: 'documento', empresa,
      url, storage_path: null, subido_por: subidoPor,
    });
    if (inserted) { _docsAgregarLocal(inserted); }
    cerrarDocsLink();
    renderImplementacion();
    toast('Link guardado ✓');
  } catch (e) {
    console.error('Error guardando link', e);
    toast('Error al guardar el link: ' + (e.message || e));
  }
}

async function docsEliminar(id) {
  const d = _docPorId(id);
  if (!d) return;
  if (!confirm(`¿Eliminar "${d.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    if (d.storage_path) await sb().storage.from(DOCS_BUCKET).remove([d.storage_path]);
    await dbDelete('cliente_documentos', id);
    _docsQuitarLocal(id);
    renderImplementacion();
    toast('Documento eliminado.');
  } catch (e) {
    console.error('Error eliminando documento', e);
    toast('Error al eliminar el documento.');
  }
}
