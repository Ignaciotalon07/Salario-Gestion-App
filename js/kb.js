// ════════════════════════════════════
// BASE DE SOLUCIONES (Knowledge Base) — Supabase + realtime
// Fuente de verdad: tabla 'soluciones' en Supabase.
// Reemplaza la version anterior basada en data.js hardcoded.
// ════════════════════════════════════

let soluciones    = [];
let kbFiltro      = '';
let kbBuscador    = '';
let kbActiva      = null;
let kbEditId      = null;   // si esta seteado, el form de "Nueva solucion" guarda como edicion
let kbArchivos    = {};     // { solucion_id: [archivo, ...] }
let _kbArchivosStaged = []; // File objects pendientes para una nueva solución

// ────────── Mapeo DB <-> UI ──────────

function dbRowToSolucion(row) {
  return {
    id:        row.id,
    titulo:    row.titulo,
    cat:       row.cat,
    sub:       row.sub || '',
    pasos:     Array.isArray(row.pasos) ? row.pasos : [],
    mat:       row.material || 'Sin material',
    aplica:    row.aplica || 'Todos',
    autor:     row.autor || '',
    usos:      row.usos || 0,
    fecha:     formatFechaCorta(row.updated_at || row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function formatFechaCorta(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// ────────── Init ──────────

async function initKB() {
  kbArchivos = {};
  const { data: archRows } = await sb()
    .from('soluciones_archivos')
    .select('*')
    .order('created_at', { ascending: true });
  (archRows || []).forEach(a => {
    if (!kbArchivos[a.solucion_id]) kbArchivos[a.solucion_id] = [];
    kbArchivos[a.solucion_id].push(a);
  });

  try {
    const rows = await dbList('soluciones', { orderBy: 'usos', ascending: false });
    soluciones = rows.map(dbRowToSolucion);
    renderKBList();
    actualizarMetricasKB();
    suscribirSoluciones();
    if (typeof refreshSolucionesAlertas === 'function') refreshSolucionesAlertas();
  } catch (e) {
    console.error('Error cargando soluciones', e);
    const body = document.getElementById('kb-body');
    if (body) body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px">No se pudieron cargar las soluciones. ${e.message}</td></tr>`;
  }
}

// ────────── Render ──────────

function getVisibleSoluciones() {
  let lista = soluciones.slice();
  if (kbFiltro)   lista = lista.filter(s => s.cat === kbFiltro);
  if (kbBuscador) {
    const q = kbBuscador.toLowerCase();
    lista = lista.filter(s =>
      (s.titulo || '').toLowerCase().includes(q) ||
      ((CATS[s.cat] || {}).label || '').toLowerCase().includes(q) ||
      (s.sub || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => (t || '').toLowerCase().includes(q))
    );
  }
  return lista;
}

function renderKBList() {
  const body = document.getElementById('kb-body');
  if (!body) return;
  const lista = getVisibleSoluciones();

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px">No hay soluciones que coincidan con la busqueda.</td></tr>`;
    return;
  }

  const ahora = new Date();
  body.innerHTML = lista.map(s => {
    const cat  = CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' };
    const dias = s.updatedAt || s.createdAt
      ? Math.floor((ahora - new Date(s.updatedAt || s.createdAt)) / (1000 * 60 * 60 * 24))
      : 0;
    const vencida    = dias > 120;
    const porRevisar = dias > 60 && !vencida;
    const rowStyle   = vencida    ? 'background:rgba(192,57,43,0.06)'
                     : porRevisar ? 'background:rgba(180,83,9,0.05)'
                     : '';
    const badge = vencida
      ? `<span class="badge b-red" style="font-size:10px;margin-left:6px">Desactualizada</span>`
      : porRevisar
      ? `<span class="badge b-amber" style="font-size:10px;margin-left:6px">Revisar</span>`
      : '';
    return `<tr onclick="verKBDetalle('${s.id}')" style="cursor:pointer;${rowStyle}">
      <td style="padding-left:20px;white-space:normal;line-height:1.4;font-weight:500">
        ${escapeHtmlKB(s.titulo)}${badge}
      </td>
      <td><span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span></td>
      <td style="color:var(--text2);white-space:normal;font-size:12px">${escapeHtmlKB(s.sub)}</td>
      <td style="font-weight:600">${s.usos}</td>
      <td style="color:${vencida ? 'var(--red)' : porRevisar ? 'var(--amber)' : 'var(--text3)'}">${s.fecha}</td>
      <td style="color:var(--text3)">${escapeHtmlKB(s.autor)}</td>
      <td><button class="btn-sm" onclick="event.stopPropagation();verKBDetalle('${s.id}')">Ver</button></td>
    </tr>`;
  }).join('');
}

function actualizarMetricasKB() {
  // Total cargadas
  const total = soluciones.length;
  const cards = document.querySelectorAll('#biblioteca .metric-card .metric-value');
  if (cards[0]) cards[0].textContent = total;

  // Mas consultada (mayor 'usos')
  if (cards[1]) {
    const top = soluciones.slice().sort((a, b) => b.usos - a.usos)[0];
    cards[1].textContent = top ? top.titulo : '—';
  }

  // Para revisar: soluciones con más de 60 días sin actualizar y al menos 1 uso
  if (cards[2]) {
    const ahora2 = new Date();
    const paraRevisar = soluciones.filter(s => {
      if (!s.updatedAt && !s.createdAt) return false;
      const dias = Math.floor((ahora2 - new Date(s.updatedAt || s.createdAt)) / (1000 * 60 * 60 * 24));
      return dias > 60 && (s.usos || 0) >= 1;
    });
    cards[2].textContent = paraRevisar.length;
    cards[2].style.color = paraRevisar.length > 0 ? 'var(--amber)' : '';
  }

  // Agregadas este mes
  if (cards[3]) {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const yearActual = ahora.getFullYear();
    const delMes = soluciones.filter(s => {
      if (!s.createdAt) return false;
      const d = new Date(s.createdAt);
      return d.getMonth() === mesActual && d.getFullYear() === yearActual;
    });
    cards[3].textContent = delMes.length;
  }
}

function escapeHtmlKB(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ────────── Detalle / Acciones ──────────

function verKBDetalle(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  const cat = CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' };
  kbActiva = id;

  // Primer cliente al que se le aplicó esta solución
  const todasConsultas = typeof consultas !== 'undefined' ? consultas : [];
  const primerUso = todasConsultas
    .filter(c => (c.solucion_id || c.solucionId) === id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  const primerCliente = primerUso ? (primerUso.cliente || primerUso.cliente_nombre || null) : null;

  const overlay = document.getElementById('kb-detail-overlay');
  const box = document.getElementById('kb-detail');
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <span class="badge" style="background:${cat.bg};color:${cat.text};margin-bottom:6px;display:inline-block">${cat.label} &middot; ${escapeHtmlKB(s.sub)}</span>
        <div style="font-size:15px;font-weight:600;line-height:1.4;color:var(--accent-text)">${escapeHtmlKB(s.titulo)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Por ${escapeHtmlKB(s.autor)} &middot; Actualizado ${s.fecha} &middot; Usado ${s.usos} ${s.usos === 1 ? 'vez' : 'veces'} &middot; ${escapeHtmlKB(s.aplica)}</div>
        ${primerCliente ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">Solución aplicada a: <strong style="color:var(--text2)">${escapeHtmlKB(primerCliente)}</strong></div>` : ''}
      </div>
      <button onclick="cerrarKB()" style="background:none;border:none;font-size:22px;line-height:1;color:var(--text3);cursor:pointer;padding:2px 4px;border-radius:6px;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'">✕</button>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Pasos</div>
      <ol class="step-list">${s.pasos.map((p, i) => `<li><div class="step-num">${i + 1}</div><div>${escapeHtmlKB(p)}</div></li>`).join('')}</ol>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${s.mat !== 'Sin material' ? `<span class="tag">Material: ${escapeHtmlKB(s.mat)}</span>` : ''}
      <button class="btn-sm" onclick="copiarPasosWA('${s.id}')" title="Copiar como mensaje de WhatsApp (numerado, sin formato)">📋 Copiar pasos</button>
      <button class="btn-sm" onclick="editarSolucion('${s.id}')">Editar</button>
      <button class="btn-sm" style="margin-left:auto;color:var(--red)" onclick="eliminarSolucion('${s.id}')">Eliminar</button>
    </div>
    <div id="kb-detail-archivos" style="margin-top:14px">${_renderKbArchivosDetalle(s.id)}</div>`;
  if (overlay) {
    overlay.classList.add('kb-modal--open');
    document.body.style.overflow = 'hidden';
  }
}

function cerrarKB() {
  kbActiva = null;
  const overlay = document.getElementById('kb-detail-overlay');
  if (overlay) overlay.classList.remove('kb-modal--open');
  document.body.style.overflow = '';
}

// ────────── Buscar / Filtrar ──────────

function buscarKB(v) {
  kbBuscador = (v || '').trim();
  cerrarKB();
  renderKBList();
}

function filtKB(btn, cat) {
  document.querySelectorAll('.filter-chip').forEach(b => {
    if (b.closest('#biblioteca')) b.classList.remove('active');
  });
  btn.classList.add('active');
  kbFiltro = cat;
  cerrarKB();
  renderKBList();
}

// ────────── Form: nueva / editar ──────────

function showKbForm() {
  kbEditId = null;
  document.getElementById('kb-titulo').value = '';
  document.getElementById('kb-pasos').value = '';
  const okEl = document.getElementById('kb-ok');
  if (okEl) okEl.style.display = 'none';
  const titleEl = document.getElementById('kb-form-modal-title');
  if (titleEl) titleEl.textContent = 'Nueva solución';
  const submitBtn = document.getElementById('kb-form-submit');
  if (submitBtn) submitBtn.textContent = 'Guardar solución';
  _kbArchivosStaged = [];
  _renderKbArchivosForm(null);
  // Abrir modal
  const overlay = document.getElementById('kb-form-overlay');
  if (overlay) overlay.classList.add('kb-modal--open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('kb-titulo').focus(), 100);
}

function cerrarKbForm() {
  const overlay = document.getElementById('kb-form-overlay');
  if (overlay) overlay.classList.remove('kb-modal--open');
  document.body.style.overflow = '';
  kbEditId = null;
  _kbArchivosStaged = [];
}

function editarSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  kbEditId = id;
  // form es modal, no necesita ref local
  // Pre-cargar valores
  document.getElementById('kb-titulo').value = s.titulo;
  document.getElementById('kb-cat').value = s.cat;
  updateKBSubtemas();
  setTimeout(() => {
    const subSel = document.getElementById('kb-sub');
    if (subSel && s.sub) subSel.value = s.sub;
  }, 0);
  document.getElementById('kb-pasos').value = (s.pasos || []).join('\n');
  // Renderizar archivos del form (modo edición)
  _kbArchivosStaged = [];
  _renderKbArchivosForm(id);

  // Cambiar titulo del form
  const titleEl = document.getElementById('kb-form-modal-title');
  if (titleEl) titleEl.textContent = `Editar: ${s.titulo}`;
  const submitBtn = document.getElementById('kb-form-submit');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';
  // Abrir modal
  const overlay = document.getElementById('kb-form-overlay');
  if (overlay) overlay.classList.add('kb-modal--open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('kb-titulo').focus(), 100);
}

async function guardarKB() {
  const titulo = document.getElementById('kb-titulo').value.trim();
  if (!titulo) { alert('Completá el título de la solución.'); return; }

  const categoria = document.getElementById('kb-cat').value;
  if (!categoria) { alert('Elegí una categoría.'); return; }

  const subtema = (document.getElementById('kb-sub').value || '').trim();
  const pasosRaw = document.getElementById('kb-pasos').value || '';
  const pasos = pasosRaw.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  if (pasos.length === 0) {
    alert('Cargá al menos un paso.');
    return;
  }

  // Material y aplica — campos opcionales sin id en el form, dejamos defaults
  const material = 'Sin material';
  const aplica   = 'Todos';

  const autor = currentMember ? currentMember.nombre : 'Equipo';

  try {
    if (kbEditId) {
      // Edicion: NO sobreescribimos autor para mantener al original
      const patch = {
        titulo,
        cat: categoria,
        sub: subtema,
        pasos,
        material,
        aplica
      };
      await dbUpdate('soluciones', kbEditId, patch);
      toast('Solución actualizada');
    } else {
      // Creacion
      const row = {
        titulo,
        cat: categoria,
        sub: subtema,
        pasos,
        material,
        aplica,
        autor,
        usos: 0
      };
      const inserted = await dbInsert('soluciones', row);
      // Subir archivos staged si los hay
      if (_kbArchivosStaged.length > 0 && inserted && inserted.id) {
        for (const file of _kbArchivosStaged) {
          await _subirArchivoKB(inserted.id, file);
        }
        _kbArchivosStaged = [];
      }
      toast('Solución agregada a la base');
    }

    // Reset y cerrar
    document.getElementById('kb-titulo').value = '';
    document.getElementById('kb-pasos').value = '';
    cerrarKbForm();

    // Mostrar confirmacion ok-box (compatible con el HTML existente)
    const ok = document.getElementById('kb-ok');
    if (ok) {
      ok.style.display = 'flex';
      setTimeout(() => { ok.style.display = 'none'; }, 3000);
    }
  } catch (e) {
    console.error('Error guardando solucion', e);
    alert('No se pudo guardar la solución: ' + e.message);
  }
}

async function eliminarSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Eliminar la solución "${s.titulo}"?\n\nEsto la borra para todo el equipo. La accion no se puede deshacer.`)) return;
  try {
    await dbDelete('soluciones', id);
    cerrarKB();
    toast('Solución eliminada');
  } catch (e) {
    console.error('Error eliminando solucion', e);
    alert('No se pudo eliminar: ' + e.message);
  }
}

// Incrementa el contador de usos. Llamada desde el detalle ("+1 Use esta")
// y desde pendientes.js cuando se aplica una solucion sugerida.
async function incrementarUsoSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  try {
    // Increment optimista en local (la realtime confirma despues)
    const nuevoTotal = (s.usos || 0) + 1;
    await dbUpdate('soluciones', id, { usos: nuevoTotal });
    s.usos = nuevoTotal;
    if (kbActiva === id) verKBDetalle(id); // refrescar detalle
    renderKBList();
    actualizarMetricasKB();
    toast(`+1 uso registrado en "${s.titulo}"`);
  } catch (e) {
    console.error('Error incrementando uso', e);
    // No alert: la accion es secundaria, no debe interrumpir al usuario
  }
}

// ────────── Copiar pasos al portapapeles ──────────

async function copiarPasosWA(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  // Formato pensado para WhatsApp: numerado, plain text, con encabezado.
  const texto = `*${s.titulo}*\n\n` +
    s.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    toast('Pasos copiados al portapapeles');
  } catch (e) {
    console.error('Clipboard error', e);
    // Fallback: prompt para copiar manual
    prompt('Copia el texto manualmente (Ctrl+C):', texto);
  }
}

// Cuando cambia la categoria, llenar las opciones del subtema
function updateKBSubtemas() {
  const cat = document.getElementById('kb-cat').value;
  const sel = document.getElementById('kb-sub');
  if (!sel) return;
  if (cat && CATS[cat]) {
    sel.innerHTML = CATS[cat].sub.map(s => `<option>${s}</option>`).join('');
  } else {
    sel.innerHTML = '<option>Primero elegí categoría</option>';
  }
}

// ────────── Realtime ──────────

let _solucionesChannel = null;
function suscribirSoluciones() {
  // Realtime para archivos de soluciones
  sb().channel('soluciones-archivos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'soluciones_archivos' },
      handleSolucionArchivoChange)
    .subscribe();

  if (_solucionesChannel) return;
  _solucionesChannel = sb()
    .channel('soluciones-realtime')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'soluciones' },
        (payload) => handleSolucionChange(payload))
    .subscribe();
}

function handleSolucionChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    if (!soluciones.find(s => s.id === newRow.id)) {
      soluciones.unshift(dbRowToSolucion(newRow));
      renderKBList();
      actualizarMetricasKB();
    }
  } else if (eventType === 'UPDATE') {
    const idx = soluciones.findIndex(s => s.id === newRow.id);
    if (idx !== -1) {
      soluciones[idx] = dbRowToSolucion(newRow);
      renderKBList();
      actualizarMetricasKB();
      if (kbActiva === newRow.id) verKBDetalle(newRow.id);
    }
  } else if (eventType === 'DELETE') {
    soluciones = soluciones.filter(s => s.id !== oldRow.id);
    if (kbActiva === oldRow.id) cerrarKB();
    renderKBList();
    actualizarMetricasKB();
  }
}

window.addEventListener('app-ready', initKB);


// ────────── Archivos adjuntos en soluciones ───────────────────────────────

const _iconoArchivoKB = (mime, nombre) => {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || (mime||'').includes('pdf'))                                               return '📄';
  if (['xlsx','xls','csv','ods'].includes(ext) || (mime||'').includes('sheet') || (mime||'').includes('excel')) return '📊';
  if (['docx','doc','odt'].includes(ext) || (mime||'').includes('word') || (mime||'').includes('document'))     return '📝';
  if (['pptx','ppt','odp'].includes(ext) || (mime||'').includes('presentation'))                 return '📑';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext) || (mime||'').includes('image'))     return '🖼️';
  if (['zip','rar','7z'].includes(ext))                                                           return '🗜️';
  if (['txt','md'].includes(ext))                                                                 return '📃';
  return '📎';
};

const _fmtBytesKB = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Renderiza el panel de archivos en el form (creación o edición) */
function _renderKbArchivosForm(solucionId) {
  const container = document.getElementById('kb-archivos-form');
  if (!container) return;

  const archivos = solucionId ? (kbArchivos[solucionId] || []) : [];
  const isEditing = !!solucionId;

  const listaHTML = archivos.map(a => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_iconoArchivoKB(a.tipo_mime, a.nombre)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre" title="${escapeHtmlKB(a.nombre)}">${escapeHtmlKB(a.nombre)}</div>
        <div class="mtm-archivo-meta">${escapeHtmlKB(a.subido_por || 'Equipo')} · ${_fmtBytesKB(a.tamano_bytes)}</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-dl" onclick="descargarArchivoKB('${a.id}', '${escapeHtmlKB(a.storage_path)}')">⬇ Descargar</button>
        <button class="mtm-archivo-del" onclick="eliminarArchivoKB('${a.id}', '${escapeHtmlKB(a.storage_path)}', '${a.solucion_id}')">×</button>
      </div>
    </div>`).join('');

  // Archivos staged (solo para nueva solución)
  const stagedHTML = !isEditing ? _kbArchivosStaged.map((f, i) => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_iconoArchivoKB(f.type, f.name)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre">${escapeHtmlKB(f.name)}</div>
        <div class="mtm-archivo-meta">${_fmtBytesKB(f.size)} · Pendiente de guardar</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-del" onclick="_kbRemoveStaged(${i})">×</button>
      </div>
    </div>`).join('') : '';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
      ${listaHTML}${stagedHTML}
      ${archivos.length === 0 && _kbArchivosStaged.length === 0
        ? '<div style="font-size:12px;color:var(--text3)">Sin archivos adjuntos.</div>' : ''}
    </div>
    <button type="button" class="btn-sm" onclick="_abrirSelectorArchivoKB()">+ Adjuntar archivo</button>`;
}

/** Renderiza la sección de archivos en el detalle de la solución */
function _renderKbArchivosDetalle(solucionId) {
  const archivos = kbArchivos[solucionId] || [];
  if (archivos.length === 0) return '';

  const listaHTML = archivos.map(a => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_iconoArchivoKB(a.tipo_mime, a.nombre)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre" title="${escapeHtmlKB(a.nombre)}">${escapeHtmlKB(a.nombre)}</div>
        <div class="mtm-archivo-meta">${escapeHtmlKB(a.subido_por || 'Equipo')} · ${_fmtBytesKB(a.tamano_bytes)}</div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-dl" onclick="descargarArchivoKB('${a.id}', '${escapeHtmlKB(a.storage_path)}')">⬇ Descargar</button>
      </div>
    </div>`).join('');

  return `
    <div style="border-top:1px solid var(--border);padding-top:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin-bottom:8px">
        📎 Archivos (${archivos.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${listaHTML}</div>
    </div>`;
}

function _abrirSelectorArchivoKB() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.csv,.txt,.zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (kbEditId) {
      // Edición: subir directo
      await _subirArchivoKB(kbEditId, file);
    } else {
      // Nueva solución: agregar al staging
      _kbArchivosStaged.push(file);
      _renderKbArchivosForm(null);
    }
  };
  input.click();
}

function _kbRemoveStaged(idx) {
  _kbArchivosStaged.splice(idx, 1);
  _renderKbArchivosForm(null);
}

async function _subirArchivoKB(solucionId, file) {
  try {
    // Sanitizar nombre para el path de storage (tildes y espacios rompen Supabase)
    const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${solucionId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await sb().storage
      .from('soluciones-archivos')
      .upload(storagePath, file);
    if (uploadError) throw uploadError;

    const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
      ? (currentMember.nombre || currentMember.email)
      : 'Equipo';

    const inserted = await dbInsert('soluciones_archivos', {
      solucion_id:  solucionId,
      nombre:       file.name,
      storage_path: storagePath,
      tipo_mime:    file.type || null,
      tamano_bytes: file.size || null,
      subido_por:   subidoPor,
    });

    // Actualización local inmediata (sin esperar al realtime)
    if (inserted && inserted.id) {
      if (!kbArchivos[solucionId]) kbArchivos[solucionId] = [];
      if (!kbArchivos[solucionId].find(a => a.id === inserted.id)) {
        kbArchivos[solucionId].push(inserted);
      }
    }
    // Re-renderizar form y detalle
    _renderKbArchivosForm(kbEditId === solucionId ? solucionId : null);
    const detArchivos = document.getElementById('kb-detail-archivos');
    if (detArchivos && kbActiva === solucionId) {
      detArchivos.innerHTML = _renderKbArchivosDetalle(solucionId);
    }
    toast(`Archivo "${file.name}" subido.`);
  } catch (e) {
    console.error('Error subiendo archivo KB', e);
    toast('Error al subir el archivo. Intentá de nuevo.');
  }
}

async function descargarArchivoKB(archivoId, storagePath) {
  try {
    const { data, error } = await sb().storage
      .from('soluciones-archivos')
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    console.error('Error descargando archivo KB', e);
    toast('Error al generar el link de descarga.');
  }
}

async function eliminarArchivoKB(archivoId, storagePath, solucionId) {
  if (!confirm('¿Eliminar este archivo?')) return;
  try {
    const { error: storageError } = await sb().storage
      .from('soluciones-archivos')
      .remove([storagePath]);
    if (storageError) throw storageError;

    await dbDelete('soluciones_archivos', archivoId);

    if (kbArchivos[solucionId]) {
      kbArchivos[solucionId] = kbArchivos[solucionId].filter(a => a.id !== archivoId);
    }
    _renderKbArchivosForm(kbEditId);
    // Refrescar detalle si está abierto
    const detArchivos = document.getElementById('kb-detail-archivos');
    if (detArchivos && kbActiva === solucionId) {
      detArchivos.innerHTML = _renderKbArchivosDetalle(solucionId);
    }
    toast('Archivo eliminado.');
  } catch (e) {
    console.error('Error eliminando archivo KB', e);
    toast('Error al eliminar el archivo.');
  }
}

function handleSolucionArchivoChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    const sid = newRow.solucion_id;
    if (!kbArchivos[sid]) kbArchivos[sid] = [];
    if (!kbArchivos[sid].find(a => a.id === newRow.id)) {
      kbArchivos[sid].push(newRow);
      // Refrescar form si está editando esta solución
      if (kbEditId === sid) _renderKbArchivosForm(sid);
      // Refrescar detalle si está abierto
      const detArchivos = document.getElementById('kb-detail-archivos');
      if (detArchivos && kbActiva === sid) {
        detArchivos.innerHTML = _renderKbArchivosDetalle(sid);
      }
    }
  } else if (eventType === 'DELETE') {
    for (const sid in kbArchivos) {
      kbArchivos[sid] = kbArchivos[sid].filter(a => a.id !== oldRow.id);
    }
  }
}
