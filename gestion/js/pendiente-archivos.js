// ════════════════════════════════════════════════════════════════════
// ARCHIVOS ADJUNTOS EN PENDIENTES (migración 065, bucket `pendientes-archivos`)
// - Al crear un pendiente se pueden adjuntar archivos (se suben al guardar).
// - Cada tarjeta de pendiente muestra sus archivos con Descargar / Eliminar.
// Si un pendiente se crea para varios asesores, el archivo se sube UNA vez y
// se referencia desde cada pendiente (misma storage_path).
// ════════════════════════════════════════════════════════════════════

const PEND_ARCH_BUCKET = 'pendientes-archivos';
const PEND_ARCH_MAX = 50 * 1024 * 1024;   // 50 MB (límite del plan gratuito)

let archivosByPendiente = {};      // { pendiente_id: [archivo, ...] }
let _pfArchivosStaged = [];        // File objects elegidos en el formulario, aún sin subir

function _pArchIcono(mime, nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || (mime || '').includes('pdf')) return '📄';
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return '📊';
  if (['docx', 'doc', 'odt'].includes(ext)) return '📝';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || (mime || '').includes('image')) return '🖼️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📎';
}
function _pArchBytes(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function _pArchEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

// ────────── Carga inicial ──────────
async function cargarArchivosPendientes(ids) {
  archivosByPendiente = {};
  if (!ids || !ids.length) return;
  try {
    const { data, error } = await sb().from('pendiente_archivos').select('*').in('pendiente_id', ids).order('created_at');
    if (error) throw error;
    (data || []).forEach(a => { (archivosByPendiente[a.pendiente_id] = archivosByPendiente[a.pendiente_id] || []).push(a); });
  } catch (e) {
    console.warn('No se pudieron cargar los archivos de pendientes (¿falta la migración 065?)', e);
  }
}

// ────────── Formulario "Nuevo pendiente" ──────────
function pfArchivosReset() { _pfArchivosStaged = []; pfArchivosRender(); }

function pfArchivosElegir() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = (e) => {
    for (const f of Array.from(e.target.files || [])) {
      if (f.size > PEND_ARCH_MAX) { toastError(`"${f.name}" supera los 50 MB. Comprimilo con WinRAR y volvé a intentar.`); continue; }
      _pfArchivosStaged.push(f);
    }
    pfArchivosRender();
  };
  input.click();
}
function pfArchivosQuitar(i) { _pfArchivosStaged.splice(i, 1); pfArchivosRender(); }

function pfArchivosRender() {
  const cont = document.getElementById('pf-archivos-lista');
  if (!cont) return;
  cont.innerHTML = _pfArchivosStaged.map((f, i) => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${_pArchIcono(f.type, f.name)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre" title="${_pArchEsc(f.name)}">${_pArchEsc(f.name)}</div>
        <div class="mtm-archivo-meta">${_pArchBytes(f.size)} · se sube al guardar</div>
      </div>
      <div class="mtm-archivo-btns"><button type="button" class="mtm-archivo-del" onclick="pfArchivosQuitar(${i})" title="Quitar">×</button></div>
    </div>`).join('');
}

// Sube los archivos elegidos y los vincula a cada pendiente creado. Devuelve cuántos falló.
async function pfArchivosSubir(pendienteIds) {
  if (!_pfArchivosStaged.length || !pendienteIds.length) return 0;
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : 'Equipo';
  let fallos = 0;
  for (const file of _pfArchivosStaged) {
    try {
      const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${pendienteIds[0]}/${Date.now()}_${safe}`;
      const { error } = await sb().storage.from(PEND_ARCH_BUCKET).upload(path, file);
      if (error) throw error;
      for (const pid of pendienteIds) {
        const ins = await dbInsert('pendiente_archivos', {
          pendiente_id: pid, nombre: file.name, storage_path: path,
          tipo_mime: file.type || null, tamano_bytes: file.size || null, subido_por: subidoPor,
        });
        if (ins && ins.id) (archivosByPendiente[pid] = archivosByPendiente[pid] || []).push(ins);
      }
    } catch (e) {
      console.error('Error subiendo archivo de pendiente', e);
      fallos++;
    }
  }
  _pfArchivosStaged = [];
  return fallos;
}

// ────────── Adjuntar a un pendiente ya creado (como las notas: cualquiera del equipo) ──────────
function pendArchivosAgregar(pid) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    const subidoPor = (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : 'Equipo';
    let ok = 0;
    for (const file of files) {
      if (file.size > PEND_ARCH_MAX) { toastError(`"${file.name}" supera los 50 MB. Comprimilo con WinRAR y volvé a intentar.`); continue; }
      try {
        toast(`Subiendo "${file.name}"...`);
        const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${pid}/${Date.now()}_${safe}`;
        const { error } = await sb().storage.from(PEND_ARCH_BUCKET).upload(path, file);
        if (error) throw error;
        const ins = await dbInsert('pendiente_archivos', {
          pendiente_id: pid, nombre: file.name, storage_path: path,
          tipo_mime: file.type || null, tamano_bytes: file.size || null, subido_por: subidoPor,
        });
        if (ins && ins.id) {
          const l = (archivosByPendiente[pid] = archivosByPendiente[pid] || []);
          if (!l.find(a => a.id === ins.id)) l.push(ins);
        }
        if (typeof logEvento === 'function') logEvento(pid, 'nota', '📎 Archivo: ' + file.name);
        ok++;
      } catch (err) {
        console.error('Error subiendo archivo de pendiente', err);
        toastError(`No se pudo subir "${file.name}".`);
      }
    }
    if (ok) { if (typeof renderPendientes === 'function') renderPendientes(); toast(ok === 1 ? 'Archivo adjuntado ✓' : `${ok} archivos adjuntados ✓`); }
  };
  input.click();
}

// ────────── Tarjeta del pendiente ──────────
function renderArchivosPend(pid) {
  const lista = archivosByPendiente[pid] || [];
  if (!lista.length) return '';
  return `
    <div class="pend-archivos">
      <div class="notas-label">📎 Archivos (${lista.length})</div>
      ${lista.map(a => `
        <div class="mtm-archivo">
          <span class="mtm-archivo-icono">${_pArchIcono(a.tipo_mime, a.nombre)}</span>
          <div class="mtm-archivo-info">
            <div class="mtm-archivo-nombre" title="${_pArchEsc(a.nombre)}">${_pArchEsc(a.nombre)}</div>
            <div class="mtm-archivo-meta">${_pArchEsc(a.subido_por || 'Equipo')} · ${_pArchBytes(a.tamano_bytes)}</div>
          </div>
          <div class="mtm-archivo-btns">
            <button type="button" class="mtm-archivo-dl" onclick="descargarArchivoPend('${a.storage_path.replace(/'/g, "\\'")}')">⬇ Descargar</button>
            <button type="button" class="mtm-archivo-del" onclick="eliminarArchivoPend('${a.id}')" title="Eliminar">×</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function descargarArchivoPend(path) {
  try {
    const { data, error } = await sb().storage.from(PEND_ARCH_BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    console.error('Error generando link', e);
    toastError('No se pudo generar el link de descarga.');
  }
}

async function eliminarArchivoPend(id) {
  if (!confirm('¿Eliminar este archivo?')) return;
  let arch = null, pid = null;
  for (const k in archivosByPendiente) {
    const a = archivosByPendiente[k].find(x => x.id === id);
    if (a) { arch = a; pid = k; break; }
  }
  if (!arch) return;
  try {
    await dbDelete('pendiente_archivos', id);
    archivosByPendiente[pid] = archivosByPendiente[pid].filter(x => x.id !== id);
    // El archivo físico se borra solo si ningún otro pendiente lo usa
    const { count } = await sb().from('pendiente_archivos').select('id', { count: 'exact', head: true }).eq('storage_path', arch.storage_path);
    if (!count) await sb().storage.from(PEND_ARCH_BUCKET).remove([arch.storage_path]);
    if (typeof renderPendientes === 'function') renderPendientes();
    toast('Archivo eliminado.');
  } catch (e) {
    console.error('Error eliminando archivo', e);
    toastError('No se pudo eliminar el archivo.');
  }
}

// ────────── Realtime ──────────
function suscribirArchivosPendientes() {
  if (window._pendArchChannel) return;
  window._pendArchChannel = sb().channel('pendiente-archivos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pendiente_archivos' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'INSERT') {
        if (!n.pendiente_id) return;   // archivo de un registro de implementación sin pendiente
        const l = (archivosByPendiente[n.pendiente_id] = archivosByPendiente[n.pendiente_id] || []);
        if (l.find(a => a.id === n.id)) return;
        l.push(n);
      } else if (eventType === 'DELETE') {
        for (const k in archivosByPendiente) archivosByPendiente[k] = archivosByPendiente[k].filter(a => a.id !== (o && o.id));
      }
      if (typeof renderPendientes === 'function') renderPendientes();
    }).subscribe();
}

// ════════════════════════════════════════════════════════════════════
// Archivos en el historial del cliente (migración 066)
// Al cerrar el pendiente se crea una consulta; los archivos del pendiente se vinculan
// a ella (consulta_id) y se ven en "Detalle de consulta" del cliente.
// ════════════════════════════════════════════════════════════════════

// Vincula los archivos de un pendiente con la consulta creada al cerrarlo
async function pendArchivosVincularAConsulta(pendienteId, consultaId) {
  if (!pendienteId || !consultaId) return;
  const lista = archivosByPendiente[pendienteId] || [];
  if (!lista.length) return;
  try {
    const { error } = await sb().from('pendiente_archivos').update({ consulta_id: consultaId }).eq('pendiente_id', pendienteId);
    if (error) throw error;
  } catch (e) {
    console.warn('No se pudieron vincular los archivos a la consulta (¿falta la migración 066?)', e);
  }
}

// Dibuja en `contId` los archivos de una consulta (detalle de consulta del cliente)
async function pendArchivosMostrarDeConsulta(consultaId, contId) {
  const cont = document.getElementById(contId);
  if (!cont || !consultaId) return;
  try {
    const { data, error } = await sb().from('pendiente_archivos').select('*').eq('consulta_id', consultaId).order('created_at');
    if (error) throw error;
    // El mismo archivo puede estar repetido si el pendiente se creó para varios asesores: se muestra una vez
    const vistos = new Set();
    const lista = (data || []).filter(a => !vistos.has(a.storage_path) && vistos.add(a.storage_path));
    if (!lista.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">📎 Archivos del pendiente (${lista.length})</div>
        <div class="pend-archivos">
          ${lista.map(a => `
            <div class="mtm-archivo">
              <span class="mtm-archivo-icono">${_pArchIcono(a.tipo_mime, a.nombre)}</span>
              <div class="mtm-archivo-info">
                <div class="mtm-archivo-nombre" title="${_pArchEsc(a.nombre)}">${_pArchEsc(a.nombre)}</div>
                <div class="mtm-archivo-meta">${_pArchEsc(a.subido_por || 'Equipo')} · ${_pArchBytes(a.tamano_bytes)}</div>
              </div>
              <div class="mtm-archivo-btns">
                <button type="button" class="mtm-archivo-dl" onclick="descargarArchivoPend('${a.storage_path.replace(/'/g, "\\'")}')">⬇ Descargar</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  } catch (e) {
    console.warn('No se pudieron cargar los archivos de la consulta', e);
  }
}

// Al eliminar una consulta, se borran también sus archivos (y el archivo físico si nadie más lo usa)
async function pendArchivosBorrarDeConsulta(consultaId) {
  try {
    const { data } = await sb().from('pendiente_archivos').select('id, storage_path').eq('consulta_id', consultaId);
    if (!data || !data.length) return;
    await sb().from('pendiente_archivos').delete().eq('consulta_id', consultaId);
    const paths = [...new Set(data.map(a => a.storage_path))];
    for (const path of paths) {
      const { count } = await sb().from('pendiente_archivos').select('id', { count: 'exact', head: true }).eq('storage_path', path);
      if (!count) await sb().storage.from(PEND_ARCH_BUCKET).remove([path]);
    }
  } catch (e) {
    console.warn('No se pudieron borrar los archivos de la consulta', e);
  }
}

// Sube archivos directamente a una consulta (registro de Implementación cargado a mano, sin pendiente).
// Devuelve cuántos fallaron.
async function pendArchivosSubirAConsulta(consultaId, files) {
  const subidoPor = (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : 'Equipo';
  let fallos = 0;
  for (const file of files) {
    try {
      if (file.size > PEND_ARCH_MAX) throw new Error('supera 50 MB');
      const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `consulta-${consultaId}/${Date.now()}_${safe}`;
      const { error } = await sb().storage.from(PEND_ARCH_BUCKET).upload(path, file);
      if (error) throw error;
      await dbInsert('pendiente_archivos', {
        pendiente_id: null, consulta_id: consultaId, nombre: file.name, storage_path: path,
        tipo_mime: file.type || null, tamano_bytes: file.size || null, subido_por: subidoPor,
      });
    } catch (e) {
      console.error('Error subiendo archivo de la consulta', e);
      fallos++;
    }
  }
  return fallos;
}
