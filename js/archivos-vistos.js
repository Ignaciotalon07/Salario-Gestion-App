// ════════════════════════════════════════════════════════════════════
// ARCHIVOS VISTOS (migración 069)
// Cada persona ve a COLOR los archivos que todavía no abrió/descargó y en GRIS los que ya vio.
// Aplica a: documentos de clientes, documentos de proyectos y adjuntos de tareas de implementación.
// Tipos: 'cliente_doc' | 'proyecto_doc' | 'tarea_archivo'
// ════════════════════════════════════════════════════════════════════

let archivosVistos = new Set();   // claves "tipo:id" de lo que ya vio el usuario logueado
let _avDisponible = true;         // false si falta la migración 069 (no se rompe nada: todo queda a color)

function _avClave(tipo, id) { return tipo + ':' + id; }
function _avUsuario() {
  return (typeof currentMember !== 'undefined' && currentMember) ? (currentMember.nombre || currentMember.email) : null;
}

async function initArchivosVistos() {
  const u = _avUsuario();
  if (!u) return;
  try {
    const { data, error } = await sb().from('archivos_vistos').select('tipo, archivo_id').eq('usuario', u).limit(100000);
    if (error) throw error;
    archivosVistos = new Set((data || []).map(r => _avClave(r.tipo, r.archivo_id)));
    avRefrescar();
  } catch (e) {
    _avDisponible = false;
    console.warn('Archivos vistos no disponible (¿falta la migración 069?)', e);
  }
}
window.addEventListener('app-ready', initArchivosVistos);

function avEsVisto(tipo, id) { return archivosVistos.has(_avClave(tipo, id)); }

// Clase CSS para el contenedor del archivo: gris si ya lo vio, a color si no
function avClase(tipo, id) { return (_avDisponible && avEsVisto(tipo, id)) ? ' av-visto' : ''; }

// Indicador circular: vacío = sin ver, tilde = ya visto. Al tocarlo se marca / desmarca a mano.
function avBoton(tipo, id) {
  if (!_avDisponible) return '';
  const visto = avEsVisto(tipo, id);
  return `<button type="button" class="av-toggle${visto ? ' av-toggle--on' : ''}" onclick="event.stopPropagation();avToggle('${tipo}','${id}')"
    title="${visto ? 'Visto · tocá para marcar como NO visto' : 'Sin ver · tocá para marcar como visto'}" aria-label="${visto ? 'Visto' : 'Sin ver'}">${visto ? '✓' : ''}</button>`;
}

// Redibuja las pantallas que muestran archivos
function avRefrescar() {
  if (typeof renderImplementacion === 'function') { try { renderImplementacion(); } catch (e) { /* se redibuja luego */ } }
  if (window._modalTareaId && typeof _refreshModalNotasArchivos === 'function') {
    try { _refreshModalNotasArchivos(window._modalTareaId); } catch (e) { /* modal cerrado */ }
  }
}

// Marca (o desmarca) un archivo como visto por el usuario actual
async function avMarcar(tipo, id, visto = true, refrescar = true) {
  const u = _avUsuario();
  if (!u || !_avDisponible || !id) return;
  const k = _avClave(tipo, id);
  if (visto === archivosVistos.has(k)) return;
  if (visto) archivosVistos.add(k); else archivosVistos.delete(k);
  if (refrescar) avRefrescar();
  try {
    if (visto) {
      const { error } = await sb().from('archivos_vistos').upsert({ usuario: u, tipo, archivo_id: String(id) }, { onConflict: 'usuario,tipo,archivo_id' });
      if (error) throw error;
    } else {
      const { error } = await sb().from('archivos_vistos').delete().match({ usuario: u, tipo, archivo_id: String(id) });
      if (error) throw error;
    }
  } catch (e) {
    console.warn('No se pudo guardar el estado visto', e);
  }
}

function avToggle(tipo, id) { avMarcar(tipo, id, !avEsVisto(tipo, id)); }
