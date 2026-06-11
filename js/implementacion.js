// IMPLEMENTACION (Supabase + realtime)
// Cada cliente con area='impl' tiene 23 tareas (las etapas estandar de
// onboarding). El equipo va marcando cada una con: estado (pendiente /
// en_progreso / completada / demorada), asesor responsable, fecha, notas.
//
// Tabla principal: implementacion_tareas
// Plantilla: implementacion_plantilla (las 23 etapas seed)

let implTareas = [];          // todas las tareas de todos los clientes impl
let implTareaNotas    = {};   // { tarea_id: [nota, nota, ...] }
let implTareaArchivos = {};   // { tarea_id: [archivo, ...] }
let implFasesExtra   = {};    // { cliente_id: [{id, nombre, icono, orden}] } — fases custom por cliente
let implActividadLog = {};    // { cliente_id: [evento, ...] } — cargado lazy
let _actividadAbierta = {};   // { cliente_id: bool }
let implFiltroNombre = '';    // buscador de cliente
let implFiltroAsesor = '';    // '' | 'mis'
let implFiltroEstado = '';    // '' | 'pendiente' | 'en_progreso' | 'completada' | 'vencida'
let implFiltroResp   = '';    // '' | 'cliente' | 'equipo'

// Vista (lista/gantt) y escala (dia/semana/mes) ahora son PER CLIENTE.
// Se mantienen en memoria entre re-renders pero no persisten al reload.
window._implClienteVista  = window._implClienteVista  || {};  // cid -> 'lista' | 'gantt'
window._implClienteEscala = window._implClienteEscala || {};  // cid -> 'dia' | 'semana' | 'mes'
function getVistaCliente(cid)  { return window._implClienteVista[cid]  || 'lista'; }
function getEscalaCliente(cid) { return window._implClienteEscala[cid] || 'semana'; }

// Estado de cards expandidas (cliente id → true). Por default, TODAS
// las cards arrancan colapsadas (solo se ve el header del cliente).
// El usuario hace click para expandir y ver las tareas.
window._implClienteExpanded = window._implClienteExpanded || {};
window._implEditMode        = window._implEditMode        || {}; // cid -> true cuando está en modo edición de plantilla

const IMPL_TEAM = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Daniel Ferro', 'Renzo Moretti', 'Alfredo Cesar'];

// ────────── Panel "¿Qué hago hoy?" ──────────

let _panelHoyExpandido = false;

function renderPanelHoy() {
  const cont = document.getElementById('impl-panel-hoy');
  if (!cont) return;

  const me  = getCurrentUserName();
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const enSieteDias = new Date(hoy); enSieteDias.setDate(hoy.getDate() + 7);

  // ── 1. Mis tareas urgentes: vencidas o que vencen esta semana, asignadas a mí ──
  const urgentes = implTareas.filter(t => {
    if (t.asesor !== me) return false;
    if (t.estado === 'completada') return false;
    if (!t.fecha_estimada) return false;
    const fecha = new Date(t.fecha_estimada); fecha.setHours(0,0,0,0);
    return fecha <= enSieteDias;
  }).sort((a, b) => new Date(a.fecha_estimada) - new Date(b.fecha_estimada));

  // ── 2. Esperando al cliente: tareas responsable_tipo='cliente' no completadas ──
  const esperandoCliente = implTareas.filter(t => {
    if (t.estado === 'completada') return false;
    if (t.responsable_tipo !== 'cliente') return false;
    // Solo de mis clientes (asesor del cliente = yo)
    const cli = (typeof clientes !== 'undefined') ? clientes.find(c => c.id === t.cliente_id) : null;
    return cli && cli.asesor === me;
  });

  // ── 3. En progreso: mis tareas activas ahora ──
  const enProgreso = implTareas.filter(t =>
    t.asesor === me && t.estado === 'en_progreso'
  );

  if (!me || (urgentes.length === 0 && esperandoCliente.length === 0 && enProgreso.length === 0)) {
    cont.innerHTML = '';
    return;
  }

  const seccion = (titulo, icono, tareas, colorAcento) => {
    if (tareas.length === 0) return '';
    const items = tareas.slice(0, 4).map(t => {
      const cli = (typeof clientes !== 'undefined') ? clientes.find(c => c.id === t.cliente_id) : null;
      const nombreCli = cli ? cli.nombre : '—';
      const fecha = t.fecha_estimada
        ? `<span style="font-size:10px;color:${isTareaVencida(t) ? 'var(--red)' : 'var(--text3)'}">
            ${isTareaVencida(t) ? '⏰' : '📅'} ${formatFechaImpl(new Date(t.fecha_estimada))}
           </span>`
        : '';
      return `<div class="hoy-item">
        <span class="hoy-item__cliente">${escapeHtmlImpl(nombreCli)}</span>
        <span class="hoy-item__tarea">${escapeHtmlImpl(t.tarea)}</span>
        ${fecha}
      </div>`;
    }).join('');
    const mas = tareas.length > 4 ? `<div style="font-size:11px;color:var(--text3);padding:4px 0">+${tareas.length - 4} más</div>` : '';
    return `<div class="hoy-seccion">
      <div class="hoy-seccion__titulo" style="color:${colorAcento}">${icono} ${titulo} <span class="hoy-count">${tareas.length}</span></div>
      ${_panelHoyExpandido ? items + mas : ''}
    </div>`;
  };

  cont.innerHTML = `
    <div class="card hoy-panel" style="margin-bottom:16px">
      <div class="hoy-header" onclick="_panelHoyExpandido=!_panelHoyExpandido;renderPanelHoy()">
        <div class="hoy-header__left">
          <span class="hoy-titulo">🎯 ¿Qué hacés hoy?</span>
          <span style="font-size:11px;color:var(--text3)">${me}</span>
        </div>
        <div class="hoy-header__chips">
          ${urgentes.length > 0        ? `<span class="hoy-chip hoy-chip--red">⏰ ${urgentes.length} urgente${urgentes.length !== 1 ? 's' : ''}</span>` : ''}
          ${esperandoCliente.length > 0 ? `<span class="hoy-chip hoy-chip--amber">👤 ${esperandoCliente.length} esperando cliente</span>` : ''}
          ${enProgreso.length > 0       ? `<span class="hoy-chip hoy-chip--blue">▶ ${enProgreso.length} en progreso</span>` : ''}
          <span class="hoy-chevron">${_panelHoyExpandido ? '▴' : '▾'}</span>
        </div>
      </div>
      ${_panelHoyExpandido ? `
        <div class="hoy-body">
          ${seccion('Urgentes esta semana', '⏰', urgentes, 'var(--red)')}
          ${seccion('Esperando al cliente', '👤', esperandoCliente, 'var(--amber)')}
          ${seccion('En progreso', '▶', enProgreso, 'var(--accent)')}
        </div>` : ''}
    </div>`;
}

// ────────── Semáforo de salud del proyecto ──────────
// Compara el ritmo actual de avance con el deadline.
// Si no hay deadline, compara % completado vs % de tiempo transcurrido.
//
// Devuelve: { color, emoji, label, detalle }
function calcularSemaforo(c, tareasCliente, progreso) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // Si el proyecto ya terminó → siempre verde
  if (progreso === 100) {
    return { color: 'var(--green)', emoji: '🟢', label: 'Completado', detalle: 'Todas las tareas finalizadas' };
  }

  // Con deadline: comparar ETA vs objetivo
  if (c.fecha_fin_objetivo) {
    const objetivo  = new Date(c.fecha_fin_objetivo); objetivo.setHours(0,0,0,0);
    const eta       = calcularETACliente(tareasCliente);
    const etaFecha  = eta?.fechaFin;

    if (!etaFecha) {
      return { color: 'var(--text3)', emoji: '⚪', label: 'Sin datos', detalle: 'Configurá las fechas para ver el estado' };
    }

    const diasDiff = diasEntre(objetivo, etaFecha); // positivo = tarde
    if (diasDiff <= 0) {
      return { color: 'var(--green)', emoji: '🟢', label: 'En tiempo', detalle: `ETA: ${formatFechaImpl(etaFecha)}` };
    } else if (diasDiff <= 7) {
      return { color: 'var(--amber)', emoji: '🟡', label: 'Justo', detalle: `${diasDiff}d sobre el objetivo` };
    } else {
      return { color: 'var(--red)', emoji: '🔴', label: 'En riesgo', detalle: `${diasDiff}d de demora estimada` };
    }
  }

  // Sin deadline: comparar % completado vs % de tiempo transcurrido desde inicio
  if (c.fecha_inicio_implementacion) {
    const inicio    = new Date(c.fecha_inicio_implementacion); inicio.setHours(0,0,0,0);
    const diasTotal = 60; // estimado estándar de 60 días para una implementación
    const diasPasados = Math.max(0, diasEntre(inicio, hoy));  // días transcurridos... wait, diasEntre devuelve diasEntre(a,b) = b - a
    const pctTiempo = Math.min(100, Math.round((diasPasados / diasTotal) * 100));
    const diff = progreso - pctTiempo; // positivo = adelantado, negativo = atrasado

    if (diff >= -10) {
      return { color: 'var(--green)', emoji: '🟢', label: 'Buen ritmo', detalle: `${progreso}% completado` };
    } else if (diff >= -25) {
      return { color: 'var(--amber)', emoji: '🟡', label: 'Ritmo lento', detalle: `${progreso}% completado` };
    } else {
      return { color: 'var(--red)', emoji: '🔴', label: 'Atrasado', detalle: `${progreso}% completado` };
    }
  }

  return { color: 'var(--text3)', emoji: '⚪', label: 'Sin fechas', detalle: 'Configurá fecha de inicio' };
}

// ────────── Fases de implementación ──────────
// Cada fase agrupa etapas por número de orden.
// Se usa para el progreso visual y el semáforo de salud.
const IMPL_FASES = [
  { key: 'relevamiento',  nombre: 'Relevamiento', icono: '🔍' },
  { key: 'analisis',      nombre: 'Análisis',      icono: '📊' },
  { key: 'configuracion', nombre: 'Configuración', icono: '⚙️' },
  { key: 'pruebas',       nombre: 'Pruebas',       icono: '✅' },
  { key: 'golive',        nombre: 'Go-live',       icono: '🚀' },
];

// Orden implícito de las fases base (1000 entre cada una — deja margen para insertar custom en el medio)
const IMPL_FASES_ORDEN = { relevamiento: 1000, analisis: 2000, configuracion: 3000, pruebas: 4000, golive: 5000 };

// Devuelve las fases de un cliente: las 5 base + cualquier fase custom, ordenadas por _orden.
// Las fases custom llevan _isBase=false y _id para poder reordenarlas / eliminarlas.
function getFasesParaCliente(clienteId) {
  const baseFases = IMPL_FASES.map(f => ({
    ...f,
    _orden:  IMPL_FASES_ORDEN[f.key] || 5000,
    _isBase: true,
  }));
  const extras = (implFasesExtra[clienteId] || []).map(f => ({
    key:     f.id,
    nombre:  f.nombre,
    icono:   f.icono || '📋',
    _orden:  f.orden,
    _isBase: false,
    _id:     f.id,
  }));
  return [...baseFases, ...extras].sort((a, b) => a._orden - b._orden);
}

// Devuelve el estado de cada fase para un cliente:
// { completas, total, pct, estado: 'completa'|'activa'|'pendiente' }
// Acepta un array de fases opcional; si no se pasa, usa IMPL_FASES.
function calcularFases(tareasCliente, fases = IMPL_FASES) {
  const faseActiva = fases.findIndex(f => {
    const tareasFase = tareasCliente.filter(t => (t.fase || 'relevamiento') === f.key);
    if (tareasFase.length === 0) return false;
    return tareasFase.some(t => t.estado !== 'completada');
  });

  return fases.map((f, i) => {
    const tareasFase = tareasCliente.filter(t => (t.fase || 'relevamiento') === f.key);
    const total    = tareasFase.length;
    const completas = tareasFase.filter(t => t.estado === 'completada').length;
    const pct      = total > 0 ? Math.round((completas / total) * 100) : 0;
    const estado   = completas === total && total > 0 ? 'completa'
                   : i === faseActiva ? 'activa'
                   : completas > 0 ? 'activa'
                   : 'pendiente';
    return { ...f, total, completas, pct, estado };
  });
}

// ────────── Helpers de filtros ──────────

function filterImplementacion(value) {
  implFiltroNombre = (value || '').trim().toLowerCase();
  renderImplementacion();
}

function setImplFiltroAsesor(btn, val) {
  implFiltroAsesor = val;
  _activarChip(btn, 'asesor');
  renderImplementacion();
}
function setImplFiltroAsesorMobile(val) {
  implFiltroAsesor = val;
  document.querySelectorAll('[data-impl-filter="asesor"]').forEach(b => b.classList.toggle('active', b.dataset.value === val));
  renderImplementacion();
}
function setImplFiltroEstado(btn, val) {
  implFiltroEstado = val;
  _activarChip(btn, 'estado');
  // Sincronizar el select mobile
  const sel = document.getElementById('impl-filtro-estado-sel');
  if (sel) sel.value = val;
  renderImplementacion();
}
// Versión para el select mobile (no recibe btn)
function setImplFiltroEstadoMobile(val) {
  implFiltroEstado = val;
  // Sincronizar chips de desktop
  document.querySelectorAll('[data-impl-filter="estado"]').forEach(b => {
    b.classList.toggle('active', b.dataset.value === val);
  });
  renderImplementacion();
}
function setImplFiltroResp(btn, val) {
  implFiltroResp = val;
  _activarChip(btn, 'resp');
  renderImplementacion();
}
function setImplFiltroRespMobile(val) {
  implFiltroResp = val;
  document.querySelectorAll('[data-impl-filter="resp"]').forEach(b => b.classList.toggle('active', b.dataset.value === val));
  renderImplementacion();
}
function _activarChip(btn, grupo) {
  document.querySelectorAll(`.filter-chip[data-impl-filter="${grupo}"]`).forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// Vista/escala por cliente: cada card mantiene su propio estado
function toggleEditModeCliente(clienteId, event) {
  if (event) event.stopPropagation();
  window._implEditMode[clienteId] = !window._implEditMode[clienteId];
  renderImplementacion();
}

async function confirmarEdicionCliente(clienteId, event) {
  if (event) event.stopPropagation();
  window._implEditMode[clienteId] = false;
  toast('Recalculando fechas...');
  await recalcularGanttCliente(clienteId);
  renderImplementacion();
  toast('Plantilla actualizada y fechas recalculadas ✓');
}

function setVistaCliente(clienteId, vista) {
  window._implClienteVista[clienteId] = vista;
  renderImplementacion();
}
function setEscalaCliente(clienteId, escala) {
  window._implClienteEscala[clienteId] = escala;
  renderImplementacion();
}

// ────────── Helpers de fechas / vencimiento ──────────

// Una tarea esta "vencida" si tiene fecha_estimada en el pasado y no esta completada
function isTareaVencida(t) {
  if (!t.fecha_estimada) return false;
  if (t.estado === 'completada') return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = _parseDate(t.fecha_estimada);
  return fecha < hoy;
}

function diasDesdeVencimiento(t) {
  if (!isTareaVencida(t)) return 0;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = _parseDate(t.fecha_estimada);
  return Math.floor((hoy - fecha) / (24 * 60 * 60 * 1000));
}

// ────────── ETA por cliente ──────────

function calcularETACliente(tareasCliente) {
  if (tareasCliente.length === 0) return null;
  const conFecha = tareasCliente.filter(t => t.fecha_estimada);
  const noCompletadas = conFecha.filter(t => t.estado !== 'completada');

  // Fecha de inicio: la mas vieja entre createdAt o la primera fecha_estimada
  const createdDates = tareasCliente.map(t => t.createdAt).filter(Boolean).map(d => new Date(d));
  const fechaInicio = createdDates.length > 0 ? new Date(Math.min(...createdDates)) : null;

  // Fecha de fin estimada: la mas lejana de las no completadas (o de las completadas si ya esta todo listo)
  let fechaFin = null;
  if (noCompletadas.length > 0) {
    const fechas = noCompletadas.map(t => new Date(t.fecha_estimada));
    fechaFin = new Date(Math.max(...fechas));
  } else if (conFecha.length > 0) {
    // Todas completadas, mostrar la ultima fecha_completada si existe
    const completadas = tareasCliente.filter(t => t.estado === 'completada' && t.fecha_completada);
    if (completadas.length > 0) {
      const fechas = completadas.map(t => new Date(t.fecha_completada));
      fechaFin = new Date(Math.max(...fechas));
    }
  }

  return { fechaInicio, fechaFin };
}

function diasEntre(a, b) {
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// ────────── Propagación de fechas (forward pass, estilo Gantt) ──────────
//
// Para cada tarea de un cliente, calcula fecha_inicio_calc y fecha_estimada
// en base a:
//   - fecha_inicio_implementacion del cliente (cuando arranca el proyecto)
//   - duracion_dias de cada tarea
//   - predecesoras_ids (que tareas deben terminar antes)
//
// Regla:
//   - Sin predecesoras → arranca en fecha_inicio_implementacion
//   - Con predecesoras → arranca al día siguiente del FIN más tardío de sus predecesoras
//                        (fin = fecha_completada si esta completada, sino fecha_estimada)
//   - fecha_estimada (fin) = inicio + duracion_dias
//     (ej: 5 días desde el 20/06 → fin 25/06)
//
// Persiste los cambios en DB y actualiza el cache local.

// Parsea 'YYYY-MM-DD' como fecha LOCAL (evita el offset UTC que desplaza 1 día en Argentina)
function _parseDate(str) {
  if (!str) return null;
  const s = str.substring(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _toISODate(d) {
  const dt = (d instanceof Date) ? d : _parseDate(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _addDays(d, dias) {
  const r = (d instanceof Date) ? new Date(d) : _parseDate(d);
  r.setDate(r.getDate() + dias);
  return r;
}

async function recalcularGanttCliente(clienteId) {
  const cliente = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === clienteId);
  if (!cliente) return;

  // Ordenar por fase primero (respetando el orden de fases del cliente, incluidas las custom),
  // luego por t.orden dentro de cada fase. Así mover una fase al principio reordena las fechas.
  const fasesCliente = getFasesParaCliente(clienteId);
  const faseOrden = {};
  fasesCliente.forEach((f, i) => { faseOrden[f.key] = i; });

  const tareasCli = implTareas
    .filter(t => t.cliente_id === clienteId)
    .sort((a, b) => {
      const fA = faseOrden[a.fase || 'relevamiento'] ?? 999;
      const fB = faseOrden[b.fase || 'relevamiento'] ?? 999;
      if (fA !== fB) return fA - fB;
      return a.orden - b.orden;
    });

  if (tareasCli.length === 0) return;

  // Fecha base del proyecto: si el cliente no la tiene, usamos hoy
  const inicioProyectoStr = cliente.fecha_inicio_implementacion || _toISODate(new Date());
  const inicioProyecto = _parseDate(inicioProyectoStr);

  // Scheduling serial simple: tarea N+1 arranca el día después que termina la N.
  // La fecha de fin calculada = inicio_proyecto + suma_de_duraciones.
  // Las tareas ya completadas usan su fecha_completada real (si es válida)
  // para que el resto de la cadena arranque desde ahí.
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let cursor = _parseDate(_toISODate(inicioProyecto)); // posición actual en el timeline

  for (const t of tareasCli) {
    const duracion = Math.max(1, t.duracion_dias || 1);

    if (t.estado === 'completada' && t.fecha_completada) {
      const fc = _parseDate(t.fecha_completada);
      if (fc <= hoy) {
        // Tarea realmente completada: anclar en su fecha real
        t.fecha_inicio_calc = _toISODate(cursor);
        t.fecha_estimada    = _toISODate(fc);
        cursor = _addDays(fc, 1); // la siguiente empieza el día después
        continue;
      }
    }

    // Tarea pendiente/en progreso: arrancar donde dejó el cursor
    // fecha_fin = inicio + duracion_dias (ej: 5 días desde el 20/06 → fin 25/06)
    const fechaFin = _addDays(cursor, duracion);
    t.fecha_inicio_calc = _toISODate(cursor);
    t.fecha_estimada    = _toISODate(fechaFin);
    cursor = _addDays(fechaFin, 1);
  }

  const updates = tareasCli.map(t => ({
    id: t.id,
    fecha_inicio_calc: t.fecha_inicio_calc,
    fecha_estimada:    t.fecha_estimada
  }));

  // Persistir (uno por uno, sin transacción pero asume baja contención)
  for (const u of updates) {
    try {
      await dbUpdate('implementacion_tareas', u.id, {
        fecha_inicio_calc: u.fecha_inicio_calc,
        fecha_estimada:    u.fecha_estimada
      });
    } catch (e) {
      console.warn('No se pudo persistir recálculo para tarea', u.id, e);
    }
  }

  renderImplementacion();
}

// ────────── GANTT visual (HTML/CSS puro) ──────────
//
// Renderiza el diagrama por cliente: timeline horizontal con barras
// posicionadas por fecha_inicio_calc y duracion_dias.
// Escala: dia / semana / mes (cantidad de pixels por dia varia).

const GANTT_LABEL_WIDTH = 220;  // ancho de la columna de tareas (izquierda)
const GANTT_ROW_HEIGHT  = 30;   // alto de cada fila

function pixelsPerDay(escala) {
  return ({ dia: 32, semana: 14, mes: 5 })[escala] || 14;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d) {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Dom, 1=Lun, ...
  const diff = (dow === 0 ? -6 : 1 - dow);
  x.setDate(x.getDate() + diff);
  return x;
}

function firstOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function _formatMesAno(d) {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

function renderGanttCliente(tareasCli, cliente, escala) {
  if (!tareasCli || tareasCli.length === 0) {
    return '<div style="text-align:center;color:var(--text3);padding:20px">Sin tareas para mostrar en el Gantt.</div>';
  }
  // Si no se pasa escala explícita, usamos la del cliente (o 'semana' por default)
  if (!escala) escala = cliente ? getEscalaCliente(cliente.id) : 'semana';

  // 1) Calcular rango de fechas (min inicio, max fin)
  const fechas = [];
  tareasCli.forEach(t => {
    if (t.fecha_inicio_calc) fechas.push(new Date(t.fecha_inicio_calc));
    if (t.fecha_estimada)    fechas.push(new Date(t.fecha_estimada));
    if (t.fecha_completada)  fechas.push(new Date(t.fecha_completada));
  });
  if (cliente.fecha_inicio_implementacion) fechas.push(new Date(cliente.fecha_inicio_implementacion));
  if (cliente.fecha_fin_objetivo)          fechas.push(new Date(cliente.fecha_fin_objetivo));

  if (fechas.length === 0) {
    return '<div style="text-align:center;color:var(--text3);padding:20px">Configurá la fecha de inicio del proyecto y las duraciones para ver el Gantt.</div>';
  }

  let minDate = startOfDay(new Date(Math.min(...fechas.map(f => f.getTime()))));
  let maxDate = startOfDay(new Date(Math.max(...fechas.map(f => f.getTime()))));
  // Padding: 3 días antes y después
  minDate = _addDays(minDate, -3);
  maxDate = _addDays(maxDate, 3);

  // 2) Calcular ancho total y posicion de cada elemento
  const pxDay = pixelsPerDay(escala);
  const totalDays = Math.max(1, diasEntre(minDate, maxDate) + 1);
  const totalWidth = totalDays * pxDay;

  // 3) Header del timeline (escalas distintas)
  let headerHtml = '';
  if (escala === 'dia') {
    // Una celda por día
    for (let i = 0; i < totalDays; i++) {
      const d = _addDays(minDate, i);
      const isMonday = d.getDay() === 1;
      const isFirstOfMonth = d.getDate() === 1;
      headerHtml += `<div class="gantt-unit ${isMonday ? 'gantt-unit--week' : ''} ${isFirstOfMonth ? 'gantt-unit--month' : ''}" style="left:${i * pxDay}px;width:${pxDay}px">${d.getDate()}${isFirstOfMonth ? `<span class="gantt-unit-mes">${_formatMesAno(d)}</span>` : ''}</div>`;
    }
  } else if (escala === 'semana') {
    // Una celda por semana (lunes a domingo)
    let cur = mondayOf(minDate);
    while (cur <= maxDate) {
      const diasOffset = diasEntre(minDate, cur);
      const x = diasOffset * pxDay;
      const w = 7 * pxDay;
      const isFirstWeekOfMonth = cur.getDate() <= 7;
      headerHtml += `<div class="gantt-unit gantt-unit--week ${isFirstWeekOfMonth ? 'gantt-unit--month' : ''}" style="left:${x}px;width:${w}px">${cur.getDate()}/${String(cur.getMonth() + 1).padStart(2, '0')}${isFirstWeekOfMonth ? `<span class="gantt-unit-mes">${_formatMesAno(cur)}</span>` : ''}</div>`;
      cur = _addDays(cur, 7);
    }
  } else { // mes
    let cur = firstOfMonth(minDate);
    while (cur <= maxDate) {
      const diasOffset = diasEntre(minDate, cur);
      const x = diasOffset * pxDay;
      // ancho aproximado = días del mes
      const next = new Date(cur); next.setMonth(next.getMonth() + 1);
      const diasMes = diasEntre(cur, next);
      const w = diasMes * pxDay;
      headerHtml += `<div class="gantt-unit gantt-unit--month" style="left:${x}px;width:${w}px">${_formatMesAno(cur)}</div>`;
      cur = next;
    }
  }

  // 4) Linea de hoy
  const hoy = startOfDay(new Date());
  let hoyX = null;
  if (hoy >= minDate && hoy <= maxDate) {
    hoyX = diasEntre(minDate, hoy) * pxDay;
  }

  // 5) Filas de tareas
  const rowsHtml = tareasCli.map((t, i) => renderGanttRow(t, i, minDate, pxDay, totalWidth)).join('');

  // 6) Linea de objetivo (deadline)
  let objetivoX = null;
  if (cliente.fecha_fin_objetivo) {
    const fObj = startOfDay(new Date(cliente.fecha_fin_objetivo));
    if (fObj >= minDate && fObj <= maxDate) {
      objetivoX = diasEntre(minDate, fObj) * pxDay;
    }
  }

  return `
    <div class="gantt-container">
      <div class="gantt-scroll">
        <div class="gantt-header-row" style="width:${GANTT_LABEL_WIDTH + totalWidth}px">
          <div class="gantt-label-col gantt-label-col--header">Tarea</div>
          <div class="gantt-timeline-header" style="width:${totalWidth}px">${headerHtml}</div>
        </div>
        <div class="gantt-body" style="width:${GANTT_LABEL_WIDTH + totalWidth}px">
          ${rowsHtml}
          ${hoyX !== null ? `<div class="gantt-today-line" style="left:${GANTT_LABEL_WIDTH + hoyX}px;height:${tareasCli.length * GANTT_ROW_HEIGHT}px" title="Hoy"></div>` : ''}
          ${objetivoX !== null ? `<div class="gantt-objetivo-line" style="left:${GANTT_LABEL_WIDTH + objetivoX}px;height:${tareasCli.length * GANTT_ROW_HEIGHT}px" title="Fecha objetivo de fin"></div>` : ''}
        </div>
      </div>
      <div class="gantt-legend">
        <span class="gantt-legend-item"><span class="gantt-legend-color" style="background:var(--text3)"></span>Pendiente</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color" style="background:var(--blue)"></span>En progreso</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color" style="background:var(--green)"></span>Completada</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color" style="background:var(--red)"></span>Vencida</span>
        <span class="gantt-legend-item"><span class="gantt-legend-line gantt-legend-line--today"></span>Hoy</span>
        ${cliente.fecha_fin_objetivo ? `<span class="gantt-legend-item"><span class="gantt-legend-line gantt-legend-line--objetivo"></span>Objetivo</span>` : ''}
        <span class="gantt-legend-item" style="margin-left:8px;border-left:1px solid var(--border);padding-left:8px"><span class="gantt-legend-color gantt-legend-color--equipo"></span>Equipo</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color gantt-legend-color--cliente"></span>Cliente</span>
      </div>
    </div>`;
}

function renderGanttRow(t, idx, minDate, pxDay, totalWidth) {
  const inicio = t.fecha_inicio_calc ? startOfDay(_parseDate(t.fecha_inicio_calc)) : null;

  let barHtml = '';
  if (inicio) {
    const x = diasEntre(minDate, inicio) * pxDay;
    const durPlaneada = Math.max(1, t.duracion_dias || 1);
    const wPlan = Math.max(pxDay, durPlaneada * pxDay);

    const isVencida    = isTareaVencida(t);
    const isCompletada = t.estado === 'completada' && t.fecha_completada;
    const esCliente    = t.responsable_tipo === 'cliente';
    const rayas        = (c) => `repeating-linear-gradient(135deg,${c} 0px,${c} 4px,${c}55 4px,${c}55 8px)`;

    if (isCompletada) {
      // ── Tarea completada: siempre verde ──
      // Si se demoró: barra verde (duración planeada) + extensión naranja (días extra)
      // Si fue antes: barra verde corta dentro de outline gris
      const fc       = startOfDay(_parseDate(t.fecha_completada));
      const diasReal = Math.max(1, diasEntre(inicio, fc) + 1);
      const wReal    = Math.max(pxDay, diasReal * pxDay);
      const tardio   = diasReal > durPlaneada;
      const diffLabel = tardio
        ? `+${diasReal - durPlaneada}d de retraso`
        : diasReal < durPlaneada
          ? `-${durPlaneada - diasReal}d antes`
          : 'justo en tiempo';

      const tooltip = `${t.tarea}\nAsesor: ${t.asesor || 'sin asignar'}\nInicio: ${formatFechaImpl(inicio)}\nPlaneada: ${durPlaneada}d  |  Real: ${diasReal}d (${diffLabel})\nEstado: Completada`;

      // Ancho total de la barra = max(planeada, real)
      const wTotal = Math.max(wPlan, wReal);

      barHtml = `
        <div style="position:absolute;left:${x}px;top:50%;transform:translateY(-50%);height:70%;width:${wTotal}px;pointer-events:auto;"
             title="${escapeHtmlImpl(tooltip)}"
             onclick="toggleImplTareaExpanded('${t.id}', null)">
          <!-- Outline: duración planeada (siempre visible como referencia) -->
          <div style="position:absolute;left:0;top:0;width:${wPlan}px;height:100%;
               border:2px dashed rgba(255,255,255,0.35);border-radius:4px;box-sizing:border-box;"></div>
          <!-- Barra verde: duración planeada (o lo que alcanzó si fue antes) -->
          <div style="position:absolute;left:0;top:0;width:${Math.min(wPlan, wReal)}px;height:100%;
               border-radius:${tardio ? '4px 0 0 4px' : '4px'};
               background:${esCliente ? rayas('var(--green)') : 'var(--green)'};opacity:0.9;
               display:flex;align-items:center;padding-left:6px;overflow:hidden;white-space:nowrap;
               font-size:10px;font-weight:700;color:white;">
            ${String(t.orden).padStart(2, '0')}
          </div>
          <!-- Extensión naranja: días de retraso (solo si se pasó) -->
          ${tardio ? `<div style="position:absolute;left:${wPlan}px;top:0;width:${wReal - wPlan}px;height:100%;
               border-radius:0 4px 4px 0;
               background:${esCliente ? rayas('var(--amber)') : 'var(--amber)'};opacity:0.85;"></div>` : ''}
        </div>`;
    } else {
      // ── Tarea no completada: barra simple con color por estado ──
      let color = 'var(--text3)';
      if (t.estado === 'en_progreso') color = 'var(--blue)';
      else if (isVencida || t.estado === 'demorada') color = 'var(--red)';

      const fin     = t.fecha_estimada ? startOfDay(_parseDate(t.fecha_estimada)) : null;
      const tooltip = `${t.tarea}\nAsesor: ${t.asesor || 'sin asignar'}\nInicio: ${formatFechaImpl(inicio)}${fin ? '\nFin estimado: ' + formatFechaImpl(fin) : ''}\nDuración: ${durPlaneada}d\nEstado: ${labelEstadoImpl(t.estado)}`;
      const bg      = esCliente ? rayas(color) : color;

      barHtml = `
        <div class="gantt-bar ${esCliente ? 'gantt-bar--cliente' : 'gantt-bar--equipo'}"
             style="left:${x}px;width:${wPlan}px;background:${bg}"
             title="${escapeHtmlImpl(tooltip)}"
             onclick="toggleImplTareaExpanded('${t.id}', null)">
          <span class="gantt-bar-label">${String(t.orden).padStart(2, '0')}</span>
        </div>`;
    }
  }

  // Render del label izquierdo (orden + nombre de tarea, con tooltip de asesor)
  return `
    <div class="gantt-row" style="height:${GANTT_ROW_HEIGHT}px">
      <div class="gantt-label-col" title="${escapeHtmlImpl(t.tarea)}${t.asesor ? ' · ' + t.asesor : ''}">
        <span class="gantt-row-num">${String(t.orden).padStart(2, '0')}</span>
        <span class="gantt-row-name">${escapeHtmlImpl(t.tarea)}</span>
      </div>
      <div class="gantt-track" style="width:${totalWidth}px">
        ${barHtml}
      </div>
    </div>`;
}

// ────────── Colapsar/expandir cliente ──────────

function toggleClienteCollapse(clienteId, event) {
  if (event && event.target) {
    const ignorar = event.target.closest('button, a, select, input');
    if (ignorar) return;
  }
  if (window._implClienteExpanded[clienteId]) {
    delete window._implClienteExpanded[clienteId];
  } else {
    window._implClienteExpanded[clienteId] = true;
  }
  renderImplementacion();
}

// ────────── Mapeo DB <-> UI ──────────

function dbRowToImplTarea(row) {
  return {
    id:                row.id,
    cliente_id:        row.cliente_id,
    orden:             row.orden,
    tarea:             row.tarea,
    responsable_tipo:  row.responsable_tipo,
    estado:            row.estado,
    asesor:            row.asesor,
    fecha_estimada:    row.fecha_estimada,
    fecha_completada:  row.fecha_completada,
    fecha_inicio_calc: row.fecha_inicio_calc,
    duracion_dias:     row.duracion_dias != null ? row.duracion_dias : 3,
    predecesoras_ids:  Array.isArray(row.predecesoras_ids) ? row.predecesoras_ids : [],
    pendiente_id:      row.pendiente_id,
    notas:             row.notas,
    fase:              row.fase || 'relevamiento',
    asesor_plantilla:  row.asesor_plantilla || null,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at
  };
}

// ────────── Init ──────────

async function initImplementacion() {
  try {
    const rows = await dbList('implementacion_tareas', { orderBy: 'orden', ascending: true });
    implTareas = rows.map(dbRowToImplTarea);

    // Cargar fases custom de todos los clientes
    const { data: fasesRows } = await sb()
      .from('implementacion_fases_cliente')
      .select('*')
      .order('orden', { ascending: true });
    implFasesExtra = {};
    (fasesRows || []).forEach(f => {
      if (!implFasesExtra[f.cliente_id]) implFasesExtra[f.cliente_id] = [];
      implFasesExtra[f.cliente_id].push(f);
    });

    // Cargar notas de todas las tareas en una sola query
    implTareaNotas = {};
    if (implTareas.length > 0) {
      const tareaIds = implTareas.map(t => t.id);
      const { data: notasRows, error: errNotas } = await sb()
        .from('implementacion_tarea_notas')
        .select('*')
        .in('tarea_id', tareaIds)
        .order('created_at', { ascending: true });
      if (errNotas) {
        console.warn('Error cargando notas de tareas', errNotas);
      } else {
        (notasRows || []).forEach(n => {
          if (!implTareaNotas[n.tarea_id]) implTareaNotas[n.tarea_id] = [];
          implTareaNotas[n.tarea_id].push(n);
        });
      }
    }

    // Cargar archivos adjuntos de todas las tareas
    implTareaArchivos = {};
    if (implTareas.length > 0) {
      const tareaIds = implTareas.map(t => t.id);
      const { data: archivosRows, error: errArchivos } = await sb()
        .from('implementacion_tarea_archivos')
        .select('*')
        .in('tarea_id', tareaIds)
        .order('created_at', { ascending: true });
      if (errArchivos) {
        console.warn('Error cargando archivos de tareas', errArchivos);
      } else {
        (archivosRows || []).forEach(a => {
          if (!implTareaArchivos[a.tarea_id]) implTareaArchivos[a.tarea_id] = [];
          implTareaArchivos[a.tarea_id].push(a);
        });
      }
    }

    // Recalcular Gantt de todos los clientes ANTES del primer render
    // para que las fechas mostradas siempre sean correctas.
    const clienteIds = [...new Set(implTareas.map(t => t.cliente_id))];
    await Promise.all(clienteIds.map(id => recalcularGanttCliente(id)));

    renderImplementacion();
    suscribirImplementacion();
    if (typeof refreshAlertas === 'function') refreshAlertas();
  } catch (e) {
    console.error('Error cargando implementacion', e);
    const cont = document.getElementById('impl-clientes-list');
    if (cont) cont.innerHTML = `<div class="card" style="text-align:center;color:var(--red);padding:24px">No se pudieron cargar las tareas. ${e.message}</div>`;
  }
}

// ────────── Render ──────────

function renderImplementacion() {
  const cont = document.getElementById('impl-clientes-list');
  if (!cont) return;
  renderPanelHoy();

  // Todos los clientes con area='impl' O que tienen tareas en implTareas (graduados que pasaron a soporte)
  const idsConTareas = new Set(implTareas.map(t => t.cliente_id));
  const todosImpl = (typeof clientes !== 'undefined' ? clientes : [])
    .filter(c => c.area === 'impl' || (c.area === 'soporte' && idsConTareas.has(c.id)));

  // Separar: finalizados = todas sus tareas completadas; en progreso = el resto
  const enProgreso = todosImpl.filter(c => {
    const tareasCli = implTareas.filter(t => t.cliente_id === c.id);
    if (tareasCli.length === 0) return true; // sin tareas aún → en progreso
    return !tareasCli.every(t => t.estado === 'completada');
  });
  const graduados = todosImpl.filter(c => {
    const tareasCli = implTareas.filter(t => t.cliente_id === c.id);
    return tareasCli.length > 0 && tareasCli.every(t => t.estado === 'completada');
  });

  // Render metricas (siempre sobre el total, no afectado por filtros)
  renderImplMetrics(todosImpl);

  // 1. Filtro por nombre (search) — solo aplica a en progreso
  let implClientes = implFiltroNombre
    ? enProgreso.filter(c => (c.nombre || '').toLowerCase().includes(implFiltroNombre))
    : enProgreso.slice();

  // 2. Filtros a nivel tarea
  const hayFiltroTarea = implFiltroAsesor || implFiltroEstado || implFiltroResp;
  if (hayFiltroTarea) {
    const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
    implClientes = implClientes.filter(c => {
      const tareasCli = implTareas.filter(t => t.cliente_id === c.id);
      return tareasCli.some(t => tareaMatcheaFiltros(t, me));
    });
  }

  // Actualizar contador del buscador
  const countEl = document.getElementById('impl-buscador-count');
  if (countEl) {
    if (implFiltroNombre || hayFiltroTarea) {
      countEl.textContent = `${implClientes.length} de ${enProgreso.length} cliente${enProgreso.length !== 1 ? 's' : ''}`;
    } else {
      countEl.textContent = '';
    }
  }

  // ── Sección: Implementaciones en progreso ──
  if (enProgreso.length === 0 && graduados.length === 0) {
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:40px">
      No hay clientes en implementación. Marcá el área de un cliente como "Implementación" para que aparezca acá con sus 23 etapas.
    </div>`;
  } else if (implClientes.length === 0 && enProgreso.length > 0) {
    const msg = implFiltroNombre
      ? `No hay clientes en implementación que coincidan con "<strong>${escapeHtmlImpl(implFiltroNombre)}</strong>".`
      : 'Ningún cliente tiene tareas que coincidan con los filtros actuales.';
    cont.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px">Implementaciones en progreso</div>
      <div class="card" style="text-align:center;color:var(--text3);padding:32px">${msg}</div>`;
  } else {
    cont.innerHTML = enProgreso.length > 0
      ? `<div style="font-size:12px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px">Implementaciones en progreso</div>`
        + implClientes.map(renderClienteImplCard).join('')
      : '';
  }

  // ── Sección: Implementaciones finalizadas ──
  let graduadosEl = document.getElementById('impl-graduados-section');
  if (!graduadosEl) {
    graduadosEl = document.createElement('div');
    graduadosEl.id = 'impl-graduados-section';
    cont.parentNode.insertBefore(graduadosEl, cont.nextSibling);
  }

  if (graduados.length > 0) {
    graduadosEl.innerHTML = `
      <div style="margin-top:32px">
        <div style="font-size:12px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px">
          🎓 Implementaciones finalizadas — ${graduados.length} cliente${graduados.length !== 1 ? 's' : ''}
        </div>
        <div style="opacity:0.85">${graduados.map(renderClienteImplCard).join('')}</div>
      </div>`;
  } else {
    graduadosEl.innerHTML = '';
  }

  // Métricas avanzadas: re-calcular al final (sobre todos)
  renderMetricasAvanzadas(todosImpl);
}

// ────────── Métricas avanzadas ──────────

function renderMetricasAvanzadas(implClientes) {
  const body = document.getElementById('impl-metricas-avanzadas-body');
  if (!body) return;

  if (implClientes.length === 0) {
    body.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">No hay implementaciones para analizar todavía.</div>`;
    return;
  }

  // Agrupar tareas por cliente
  const tareasPorCliente = {};
  implClientes.forEach(c => {
    tareasPorCliente[c.id] = implTareas
      .filter(t => t.cliente_id === c.id)
      .sort((a, b) => a.orden - b.orden);
  });

  // 1. Tiempo promedio de implementacion (solo para clientes 100% completados)
  let tiempoPromedio = null;
  const completados = [];
  Object.entries(tareasPorCliente).forEach(([cid, tareas]) => {
    if (tareas.length === 0) return;
    const todasCompletas = tareas.every(t => t.estado === 'completada');
    if (!todasCompletas) return;
    const fechas = tareas.map(t => t.fecha_completada).filter(Boolean).map(d => new Date(d));
    if (fechas.length < 2) return;
    const inicio = Math.min(...fechas);
    const fin = Math.max(...fechas);
    const dias = Math.round((fin - inicio) / (24 * 60 * 60 * 1000));
    const cli = implClientes.find(c => c.id === cid);
    completados.push({ cliente: cli, dias });
  });
  if (completados.length > 0) {
    tiempoPromedio = Math.round(completados.reduce((s, c) => s + c.dias, 0) / completados.length);
  }

  // 2. Etapa que mas demora en promedio (por orden de la plantilla)
  // Calculamos: para tareas completadas con fecha_completada y createdAt, días entre ambos.
  // Agrupamos por nombre de tarea, sacamos promedio.
  const demoraPorTarea = {};
  implTareas.forEach(t => {
    if (t.estado !== 'completada') return;
    if (!t.createdAt || !t.fecha_completada) return;
    const dias = Math.round((new Date(t.fecha_completada) - new Date(t.createdAt)) / (24 * 60 * 60 * 1000));
    if (!demoraPorTarea[t.tarea]) demoraPorTarea[t.tarea] = [];
    demoraPorTarea[t.tarea].push(dias);
  });
  let etapaMasDemorada = null;
  Object.entries(demoraPorTarea).forEach(([nombre, dias]) => {
    if (dias.length === 0) return;
    const promedio = Math.round(dias.reduce((s, d) => s + d, 0) / dias.length);
    if (!etapaMasDemorada || promedio > etapaMasDemorada.dias) {
      etapaMasDemorada = { nombre, dias: promedio, muestra: dias.length };
    }
  });

  // 3. % de tareas completadas en tiempo (vs fecha_estimada)
  let totalEvaluables = 0;
  let aTiempo = 0;
  implTareas.forEach(t => {
    if (t.estado !== 'completada') return;
    if (!t.fecha_estimada || !t.fecha_completada) return;
    totalEvaluables++;
    if (new Date(t.fecha_completada) <= new Date(t.fecha_estimada)) aTiempo++;
  });
  const porcEnTiempo = totalEvaluables > 0 ? Math.round((aTiempo / totalEvaluables) * 100) : null;

  // 4. Top 3 mas rapidos / mas demorados
  const topRapidos = [...completados].sort((a, b) => a.dias - b.dias).slice(0, 3);
  const topDemorados = [...completados].sort((a, b) => b.dias - a.dias).slice(0, 3);

  body.innerHTML = `
    <div class="metrics-grid" style="margin-bottom:14px;grid-template-columns:repeat(3,1fr)">
      <div class="metric-card">
        <div class="metric-label">Tiempo promedio</div>
        <div class="metric-value" style="color:var(--accent)">${tiempoPromedio !== null ? tiempoPromedio + ' días' : '—'}</div>
        <div class="metric-sub">${completados.length} implementación${completados.length !== 1 ? 'es' : ''} terminada${completados.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Etapa más demorada</div>
        <div class="metric-value" style="font-size:14px;line-height:1.3;margin-top:6px;color:var(--amber)">${etapaMasDemorada ? escapeHtmlImpl(etapaMasDemorada.nombre) : '—'}</div>
        <div class="metric-sub">${etapaMasDemorada ? etapaMasDemorada.dias + ' días promedio · ' + etapaMasDemorada.muestra + ' muestra' + (etapaMasDemorada.muestra !== 1 ? 's' : '') : 'Sin datos'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">% en tiempo</div>
        <div class="metric-value" style="color:${porcEnTiempo === null ? 'var(--text3)' : (porcEnTiempo >= 70 ? 'var(--green)' : porcEnTiempo >= 40 ? 'var(--amber)' : 'var(--red)')}">${porcEnTiempo !== null ? porcEnTiempo + '%' : '—'}</div>
        <div class="metric-sub">${totalEvaluables > 0 ? aTiempo + ' de ' + totalEvaluables + ' completadas a tiempo' : 'sin tareas con fecha'}</div>
      </div>
    </div>

    ${completados.length > 0 ? `
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div class="metric-label" style="margin-bottom:8px">🏆 Más rápidas</div>
          ${topRapidos.map(c => `
            <div class="impl-metrica-rank">
              <span class="impl-metrica-rank__name">${escapeHtmlImpl(c.cliente.nombre)}</span>
              <span class="impl-metrica-rank__value" style="color:var(--green)">${c.dias} día${c.dias !== 1 ? 's' : ''}</span>
            </div>
          `).join('')}
        </div>
        <div>
          <div class="metric-label" style="margin-bottom:8px">🐢 Más demoradas</div>
          ${topDemorados.map(c => `
            <div class="impl-metrica-rank">
              <span class="impl-metrica-rank__name">${escapeHtmlImpl(c.cliente.nombre)}</span>
              <span class="impl-metrica-rank__value" style="color:var(--red)">${c.dias} día${c.dias !== 1 ? 's' : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : `<div style="text-align:center;color:var(--text3);padding:14px;font-size:13px">Cuando termines algunas implementaciones, vas a ver los rankings acá.</div>`}
  `;
}

// Devuelve true si la tarea matchea los 3 filtros (asesor/estado/responsable)
function tareaMatcheaFiltros(t, me) {
  if (implFiltroAsesor === 'mis') {
    if (!me || t.asesor !== me) return false;
  }
  if (implFiltroEstado) {
    if (implFiltroEstado === 'vencida') {
      if (!isTareaVencida(t)) return false;
    } else if (t.estado !== implFiltroEstado) {
      return false;
    }
  }
  if (implFiltroResp) {
    // 'ambos' tambien matchea con 'cliente' y 'equipo'
    if (t.responsable_tipo !== implFiltroResp && t.responsable_tipo !== 'ambos') return false;
  }
  return true;
}

function renderImplMetrics(implClientes) {
  const total = implClientes.length;
  const tareasDeEstosClientes = implTareas.filter(t => implClientes.some(c => c.id === t.cliente_id));
  const totalTareas = tareasDeEstosClientes.length;
  const completas = tareasDeEstosClientes.filter(t => t.estado === 'completada').length;
  // "Vencidas" = tareas con fecha pasada y sin completar (deriva del isTareaVencida)
  const vencidas = tareasDeEstosClientes.filter(isTareaVencida).length;
  const progreso = totalTareas > 0 ? Math.round((completas / totalTareas) * 100) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('impl-m-total', total);
  set('impl-m-completas', completas);
  set('impl-m-completas-sub', `de ${totalTareas} totales`);
  set('impl-m-demoradas', vencidas);
  set('impl-m-progreso', progreso + '%');
}

function renderClienteImplCard(c) {
  const tareasCliente = implTareas
    .filter(t => t.cliente_id === c.id)
    .sort((a, b) => a.orden - b.orden);

  const totalTareas = tareasCliente.length;
  const completas   = tareasCliente.filter(t => t.estado === 'completada').length;
  const vencidas    = tareasCliente.filter(isTareaVencida).length;
  const progreso    = totalTareas > 0 ? Math.round((completas / totalTareas) * 100) : 0;
  const progresoColor = progreso >= 80 ? 'var(--green)' : progreso >= 40 ? 'var(--amber)' : 'var(--red)';
  const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
  const tipoIcon = ({ empresa: '🏢', estudio: '📊', colegio: '🎓', municipalidad: '🏛️' })[c.tipo] || '◆';

  // Si las tareas todavia no existen para este cliente, mostrar boton para iniciar
  if (totalTareas === 0) {
    return `
      <div class="card impl-cliente-card impl-cliente-card--empty" data-cliente-id="${c.id}">
        <div class="impl-cliente-type-badge type-${c.tipo}">${tipoIcon} ${escapeHtmlImpl(tipoLabel)}</div>
        <div class="impl-cliente-main">
          <div class="impl-cliente-identity">
            <div class="av av-${c.tipo} impl-cliente-avatar">${escapeHtmlImpl(c.iniciales)}</div>
            <div>
              <div class="impl-cliente-name">${escapeHtmlImpl(c.nombre)}</div>
              <div class="impl-cliente-meta">Sin tareas de implementación creadas</div>
            </div>
          </div>
          <button class="btn-primary btn-primary--sm" onclick="iniciarImplementacionConModal('${c.id}')">+ Crear etapas</button>
        </div>
      </div>`;
  }

  // Inputs editables: inicio + objetivo + ETA calculada
  const fechaInicioVal = c.fecha_inicio_implementacion ? c.fecha_inicio_implementacion.substring(0, 10) : '';
  const fechaObjetivoVal = c.fecha_fin_objetivo ? c.fecha_fin_objetivo.substring(0, 10) : '';
  const eta = calcularETACliente(tareasCliente);

  // Estado para mostrar abajo de la fecha de fin calculada
  let finCalcStr = '—';
  let estadoStr = '';
  if (eta && eta.fechaFin) {
    finCalcStr = formatFechaImpl(eta.fechaFin);
    if (c.fecha_fin_objetivo) {
      const objetivo = new Date(c.fecha_fin_objetivo);
      objetivo.setHours(0,0,0,0);
      const dias = diasEntre(objetivo, eta.fechaFin);
      if (progreso === 100) {
        estadoStr = `<span style="color:var(--green)">✓ Terminada</span>`;
      } else if (dias <= 0) {
        estadoStr = `<span style="color:var(--green)">✓ En tiempo</span>`;
      } else {
        estadoStr = `<span style="color:var(--red)">⚠ ${dias}d tarde</span>`;
      }
    } else {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const dias = diasEntre(hoy, eta.fechaFin);
      if (progreso === 100) {
        estadoStr = `<span style="color:var(--green)">✓ Terminada</span>`;
      } else if (dias > 0) {
        estadoStr = `<span style="color:var(--text3)">Faltan ${dias}d</span>`;
      } else if (dias === 0) {
        estadoStr = `<span style="color:var(--amber)">Hoy</span>`;
      } else {
        estadoStr = `<span style="color:var(--red)">⚠ Vencido ${-dias}d</span>`;
      }
    }
  }

  // Filtros a nivel tarea: si hay filtro activo, solo mostrar las que matchean
  // Los clientes graduados (finalizados) ignoran los filtros — siempre muestran todo
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  const esGraduado = tareasCliente.length > 0 && tareasCliente.every(t => t.estado === 'completada');
  const hayFiltroTarea = !esGraduado && (implFiltroAsesor || implFiltroEstado || implFiltroResp);
  const tareasVisibles = hayFiltroTarea
    ? tareasCliente.filter(t => tareaMatcheaFiltros(t, me))
    : tareasCliente;

  // Estado de colapsado:
  //   - Por default, todas las cards arrancan COLAPSADAS
  //   - Si el usuario hizo click para expandir, se queda expandida
  //   - Si hay filtros activos, auto-expandir para que el filtro sirva de algo
  const isCollapsed = hayFiltroTarea ? false : !window._implClienteExpanded[c.id];

  const subtituloProgreso = `${completas} de ${totalTareas}${vencidas > 0 ? ` · <span style="color:var(--red);font-weight:600">⏰ ${vencidas} vencida${vencidas !== 1 ? 's' : ''}</span>` : ''}${hayFiltroTarea ? ` · <span style="color:var(--accent-text)">${tareasVisibles.length} con filtro</span>` : ''}`;
  const semaforo = calcularSemaforo(c, tareasCliente, progreso);

  return `
    <div class="card impl-cliente-card ${isCollapsed ? 'impl-cliente-card--collapsed' : ''}" data-cliente-id="${c.id}" data-tipo="${c.tipo}">
      <div class="impl-cliente-header" onclick="toggleClienteCollapse('${c.id}', event)" title="${isCollapsed ? 'Click para ver tareas' : 'Click para ocultar tareas'}">

        <!-- Type badge en el tope -->
        <div class="impl-cliente-type-badge type-${c.tipo}">${tipoIcon} ${escapeHtmlImpl(tipoLabel)}</div>

        <!-- Fila principal: identity a la izquierda, % grande a la derecha -->
        <div class="impl-cliente-main">
          <div class="impl-cliente-identity">
            <div class="av av-${c.tipo} impl-cliente-avatar">${escapeHtmlImpl(c.iniciales)}</div>
            <div class="impl-cliente-info">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div class="impl-cliente-name">${escapeHtmlImpl(c.nombre)}</div>
                <span class="impl-semaforo-badge" style="background:${semaforo.color}18;color:${semaforo.color};border:1px solid ${semaforo.color}35" title="${semaforo.detalle}">
                  ${semaforo.emoji} ${semaforo.label}
                </span>
              </div>
              <div class="impl-cliente-meta">
                <span class="impl-cliente-meta-resp">Resp: <strong>${escapeHtmlImpl(c.asesor || '—')}</strong></span>
                ${c.whaticket_url ? `<span class="impl-cliente-meta-sep">·</span><a href="${escapeHtmlImpl(c.whaticket_url)}" target="_blank" rel="noopener" class="impl-cliente-meta-link" onclick="event.stopPropagation();">🎫 Whaticket</a>` : ''}
              </div>
            </div>
          </div>

          <div class="impl-cliente-progress-display">
            <div class="impl-cliente-pct" style="color:${progresoColor}"><span class="impl-cliente-pct-num">${progreso}</span><span class="impl-cliente-pct-sym">%</span></div>
            <div class="impl-cliente-pct-sub">${subtituloProgreso}</div>
          </div>
        </div>

        <!-- Progress bar full-width -->
        <div class="impl-cliente-bar-wrap">
          <div class="impl-cliente-bar">
            <div class="impl-cliente-bar-fill" style="width:${progreso}%;background:linear-gradient(90deg, ${progresoColor} 0%, ${progresoColor} 100%)"></div>
          </div>
        </div>

        <!-- 3 mini-cards de fechas -->
        <div class="impl-cliente-stats">
          <label class="impl-cliente-stat" onclick="event.stopPropagation();">
            <span class="impl-cliente-stat-label">📅 Inicio</span>
            <input type="date" value="${fechaInicioVal}" onblur="if(this.value) cambiarFechaInicioCliente('${c.id}', this.value, this)" class="impl-cliente-stat-input" title="Fecha de inicio del proyecto">
          </label>
          <label class="impl-cliente-stat" onclick="event.stopPropagation();">
            <span class="impl-cliente-stat-label">🎯 Objetivo</span>
            <input type="date" value="${fechaObjetivoVal}" onblur="if(this.value) cambiarFechaFinObjetivo('${c.id}', this.value, this)" class="impl-cliente-stat-input" title="Fecha objetivo de fin (deadline)">
          </label>
          <div class="impl-cliente-stat impl-cliente-stat--readonly">
            <span class="impl-cliente-stat-label">⏱ Fin calculado</span>
            <div class="impl-cliente-stat-value">${finCalcStr}</div>
            ${estadoStr ? `<div class="impl-cliente-stat-sub">${estadoStr}</div>` : ''}
          </div>
        </div>

        <!-- Hint visual de "click para expandir" cuando esta colapsada -->
        ${isCollapsed ? `<div class="impl-cliente-expand-hint">Ver ${totalTareas} tareas <span style="font-size:9px">▾</span></div>` : ''}
      </div>

      <div class="impl-cliente-body">
        ${renderClienteViewToggle(c)}
        ${window._implEditMode[c.id]
          ? `<div class="impl-edit-banner">
               <button class="btn-primary btn-primary--sm" onclick="confirmarEdicionCliente('${c.id}', event)">✓ Confirmar</button>
               <span style="font-size:12px;color:var(--accent)">✏️ Modo edición activo</span>
             </div>`
          : getVistaCliente(c.id) !== 'gantt'
            ? `<div style="margin-bottom:10px">
                 <button class="btn-sm" style="font-size:11px" onclick="toggleEditModeCliente('${c.id}', event)">✏️ Editar plantilla</button>
               </div>`
            : ''
        }
        ${getVistaCliente(c.id) === 'gantt'
          ? renderGanttCliente(tareasVisibles, c, getEscalaCliente(c.id))
          : renderListaFases(c, tareasCliente, tareasVisibles)}
        ${renderGoLive(c.id, tareasCliente, progreso)}
        ${renderActividadCliente(c.id)}
      </div>
    </div>`;
}

// Renderiza las 5 fases como una barra segmentada
function renderFasesCliente(tareasCliente) {
  const fases = calcularFases(tareasCliente);
  return `
    <div class="impl-fases">
      ${fases.map(f => {
        const colorBg   = f.estado === 'completa' ? 'var(--green)'
                        : f.estado === 'activa'   ? 'var(--accent)'
                        : 'var(--border2)';
        const colorText = f.estado === 'pendiente' ? 'var(--text3)' : 'white';
        const label     = f.estado === 'completa' ? '✓'
                        : f.estado === 'activa'   ? `${f.completas}/${f.total}`
                        : '—';
        const title = `${f.nombre}: ${f.completas}/${f.total} tareas completadas`;
        return `
          <div class="impl-fase" title="${title}">
            <div class="impl-fase__bar">
              <div class="impl-fase__fill" style="width:${f.pct}%;background:${colorBg}"></div>
            </div>
            <div class="impl-fase__label" style="color:${f.estado === 'pendiente' ? 'var(--text3)' : 'var(--text)'}">
              ${f.icono} ${f.nombre}
            </div>
            <div class="impl-fase__pct" style="color:${colorBg};font-weight:600">${label}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ────────── Lista por fases (acordeón) ──────────

// Estado expandido por fase y cliente: { 'clienteId_faseIdx': bool }
window._implFaseExpanded = window._implFaseExpanded || {};

function toggleFaseExpanded(clienteId, faseIdx) {
  const key = `${clienteId}_${faseIdx}`;
  // Calcular el estado real actual (igual que en el render) para invertirlo bien
  const fasesCliente = getFasesParaCliente(clienteId);
  const tareasCliente = implTareas.filter(t => t.cliente_id === clienteId);
  const fases = calcularFases(tareasCliente, fasesCliente);
  const f = fases[faseIdx];
  const currentlyExpanded = window._implFaseExpanded[key] ?? false;
  window._implFaseExpanded[key] = !currentlyExpanded;
  renderImplementacion();
}

function renderListaFases(c, tareasCliente, tareasVisibles) {
  const fasesCliente = getFasesParaCliente(c.id);
  const fases = calcularFases(tareasCliente, fasesCliente);
  const hayFiltro = implFiltroAsesor || implFiltroEstado || implFiltroResp;
  const enEdicionCliente = !!(window._implEditMode && window._implEditMode[c.id]);

  // Mapa de id → número secuencial global (1, 2, 3... a través de todas las fases)
  const numGlobal = {};
  let seq = 1;
  fasesCliente.forEach(f => {
    tareasCliente
      .filter(t => (t.fase || 'relevamiento') === f.key)
      .sort((a, b) => a.orden - b.orden)
      .forEach(t => { numGlobal[t.id] = seq++; });
  });

  return `<div class="impl-fases-acordeon">
    ${fases.map((f, i) => {
      const key       = `${c.id}_${i}`;
      // Si hay filtro activo, auto-expandir fases que tengan tareas visibles
      const tareasDeFase    = tareasCliente.filter(t => (t.fase || 'relevamiento') === f.key);
      const tareasVisFase   = tareasVisibles.filter(t => (t.fase || 'relevamiento') === f.key);
      const isExpanded = hayFiltro
        ? tareasVisFase.length > 0
        : (window._implFaseExpanded[key] ?? false);

      const colorBar  = f.estado === 'completa' ? 'var(--green)'
                      : f.estado === 'activa'   ? 'var(--accent)'
                      : 'var(--border2)';
      const badge     = f.estado === 'completa'
        ? `<span class="badge b-green" style="font-size:10px">✓ Completa</span>`
        : f.estado === 'activa'
        ? `<span class="badge b-blue" style="font-size:10px">${f.completas}/${f.total}</span>`
        : `<span style="font-size:11px;color:var(--text3)">${f.completas}/${f.total}</span>`;

      const tareasRender = hayFiltro ? tareasVisFase : tareasDeFase;

      return `
        <div class="impl-fase-grupo ${f.estado === 'completa' ? 'impl-fase-grupo--completa' : f.estado === 'activa' ? 'impl-fase-grupo--activa' : ''} ${isExpanded ? 'impl-fase-grupo--open' : ''}">
          <div class="impl-fase-header" onclick="toggleFaseExpanded('${c.id}', ${i})">
            <div class="impl-fase-header__left">
              <span class="impl-fase-num">Fase ${i + 1}</span>
              <span class="impl-fase-icon">${f.icono}</span>
              <span class="impl-fase-nombre">${f.nombre}</span>
            </div>
            <div class="impl-fase-header__right">
              ${badge}
              ${enEdicionCliente && !f._isBase ? `
                <button class="plantilla-row__btn" style="margin-right:2px" title="Subir fase"
                  onclick="event.stopPropagation();moverFaseCliente('${c.id}','${f.key}',-1,event)"
                  ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="plantilla-row__btn" style="margin-right:2px" title="Bajar fase"
                  onclick="event.stopPropagation();moverFaseCliente('${c.id}','${f.key}',1,event)"
                  ${i === fases.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="plantilla-row__btn plantilla-row__btn--delete" style="margin-right:6px" title="Eliminar fase"
                  onclick="event.stopPropagation();eliminarFaseCliente('${c.id}','${f.key}',event)">×</button>
              ` : ''}
              ${enEdicionCliente ? `<button class="btn-sm" style="font-size:11px;padding:2px 8px;margin-right:4px"
                onclick="event.stopPropagation();agregarTareaCliente('${c.id}','${f.key}')">+ Agregar tarea</button>` : ''}
              <div class="impl-fase-minibar">
                <div class="impl-fase-minibar__fill" style="width:${f.pct}%;background:${colorBar}"></div>
              </div>
              <span class="impl-fase-chevron">${isExpanded ? '▴' : '▾'}</span>
            </div>
          </div>
          ${isExpanded ? `
            <div class="impl-fase-tareas">
              ${tareasRender.length > 0
                ? tareasRender.map((t, ti) => renderImplTarea(t, ti, tareasDeFase, numGlobal)).join('')
                : '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px">Sin tareas. Usá "+ Agregar tarea" para añadir una.</div>'}
            </div>` : ''}
        </div>`;
    }).join('')}
    ${enEdicionCliente ? `
      <div style="padding:10px 4px 4px">
        <button class="btn-sm" style="font-size:11px;padding:4px 12px"
          onclick="event.stopPropagation();crearFaseCliente('${c.id}', event)">+ Nueva fase</button>
      </div>` : ''}
  </div>`;
}

// Toggle "Lista / Gantt" + escala (cuando Gantt) que va dentro de cada card
function renderClienteViewToggle(c) {
  const vista = getVistaCliente(c.id);
  const escala = getEscalaCliente(c.id);
  return `
    <div class="impl-cliente-toolbar">
      <div class="impl-filter-segmented impl-filter-segmented--sm">
        <button class="filter-chip ${vista === 'lista' ? 'active' : ''}" onclick="setVistaCliente('${c.id}','lista')">📋 Lista</button>
        <button class="filter-chip ${vista === 'gantt' ? 'active' : ''}" onclick="setVistaCliente('${c.id}','gantt')">📊 Gantt</button>
      </div>
      ${vista === 'gantt' ? `
        <div class="impl-filter-segmented impl-filter-segmented--escala">
          <button class="filter-chip ${escala === 'dia'    ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','dia')">Día</button>
          <button class="filter-chip ${escala === 'semana' ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','semana')">Semana</button>
          <button class="filter-chip ${escala === 'mes'    ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','mes')">Mes</button>
        </div>` : ''}
    </div>`;
}

function renderImplTarea(t, idxEnFase, tareasDeFase, numGlobal) {
  const respLabel = ({ cliente: 'Cliente', equipo: 'Equipo', ambos: 'Ambos' })[t.responsable_tipo] || t.responsable_tipo;
  const respBadge = ({ cliente: 'b-amber', equipo: 'b-blue', ambos: 'b-purple' })[t.responsable_tipo] || 'b-gray';

  const estadoConfig = {
    pendiente:    { label: 'Pendiente',    badge: 'b-gray',  icon: '○' },
    en_progreso:  { label: 'En progreso',  badge: 'b-blue',  icon: '◐' },
    completada:   { label: 'Completada',   badge: 'b-green', icon: '✓' },
    demorada:     { label: 'Demorada',     badge: 'b-red',   icon: '!' }
  };
  const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
  const isCompleted = t.estado === 'completada';
  // Permisos: solo el asesor asignado puede modificar estado/asesor/fecha.
  // Si no hay asesor asignado, cualquiera puede tomarla.
  const puedoEditar = puedeEditarTareaImpl(t);
  const disabledAttr = puedoEditar ? '' : 'disabled';

  // Celda de "fecha + duración":
  // - Si esta completada → muestra ✓ fecha real
  // - Si no → muestra rango calculado (inicio → fin) + input de duración editable
  const inicioStr = t.fecha_inicio_calc ? formatFechaImpl(t.fecha_inicio_calc) : '—';
  const finStr    = t.fecha_estimada    ? formatFechaImpl(t.fecha_estimada)    : '—';
  const enEdicion = !!(window._implEditMode && window._implEditMode[t.cliente_id]);
  const numPred   = (t.predecesoras_ids || []).length;

  // Badge de responsable con asesor (pre-calculado para no anidar template literals)
  const asesorMostrar = t.asesor || t.asesor_plantilla;
  const mostrarAsesor = (t.responsable_tipo === 'equipo' || t.responsable_tipo === 'ambos') && asesorMostrar;
  const respBadgeConAsesor = '<span class="badge ' + respBadge + '" title="Responsable">' + respLabel + (mostrarAsesor ? ' · ' + asesorMostrar.split(' ')[0] : '') + '</span>';

  const fechaCell = isCompleted
    ? `<div class="impl-tarea__fecha-done" title="Completada el ${formatFechaImpl(t.fecha_completada)}">✓ ${formatFechaImpl(t.fecha_completada)}</div>`
    : enEdicion
      ? `<div class="impl-tarea__gantt-cell">
           <input type="number" min="1" max="365" class="impl-tarea__duracion-input"
             value="${t.duracion_dias || 1}" onclick="event.stopPropagation();"
             onchange="cambiarDuracionTarea('${t.id}', this.value)" title="Duración en días"> d
         </div>`
      : `<div class="impl-tarea__gantt-cell" title="Inicio: ${inicioStr} · Fin: ${finStr}">
           <span class="impl-tarea__rango">${inicioStr} → ${finStr}</span>
           <span class="impl-tarea__dur-label">${t.duracion_dias || 1} d</span>
         </div>`;

  const predBtn = enEdicion
    ? `<button class="impl-tarea__pred-btn ${numPred > 0 ? 'impl-tarea__pred-btn--has' : ''}"
         onclick="event.stopPropagation(); abrirModalPredecesoras('${t.id}')"
         title="Configurar predecesoras">🔗${numPred > 0 ? ' ' + numPred : ''}</button>`
    : numPred > 0
      ? `<span class="impl-tarea__pred-info" title="${numPred} predecesora${numPred !== 1 ? 's' : ''}">🔗 ${numPred}</span>`
      : '';

  // Indicador de notas: solo muestra el contador (las notas se agregan desde el modal)
  const notasTarea = implTareaNotas[t.id] || [];
  const notasCount = notasTarea.length;
  const isExpanded = !!(window._implTareaExpanded && window._implTareaExpanded[t.id]);
  const notasIndicator = notasCount > 0
    ? `<span class="impl-tarea__notas-btn impl-tarea__notas-btn--has" title="${notasCount} nota${notasCount !== 1 ? 's' : ''}">📝 ${notasCount}</span>`
    : '';

  // Vencida: fecha estimada en el pasado sin completar
  const isVencida = isTareaVencida(t);
  const diasVencido = isVencida ? diasDesdeVencimiento(t) : 0;

  // Click en la tarea (fuera de controles) toggle expand/collapse de notas
  const rowClasses = [
    'impl-tarea',
    isCompleted ? 'impl-tarea--completed' : '',
    notasCount > 0 ? 'impl-tarea--has-notas' : '',
    isExpanded ? 'impl-tarea--expanded' : '',
    !puedoEditar ? 'impl-tarea--readonly' : '',
    isVencida ? 'impl-tarea--vencida' : ''
  ].filter(Boolean).join(' ');

  const lockTooltip = puedoEditar
    ? `Marcar como ${isCompleted ? 'pendiente' : 'completada'}`
    : `Solo ${t.asesor} puede modificar esta tarea`;

  return `
    <div class="${rowClasses}" data-tarea-id="${t.id}" onclick="handleImplTareaClick('${t.id}', event)">
      <button class="impl-tarea__check impl-tarea__check--${t.estado}" onclick="event.stopPropagation(); toggleTareaCompleta('${t.id}')" title="${lockTooltip}" ${disabledAttr}>${cfg.icon}</button>
      <div class="impl-tarea__num">${String(numGlobal ? (numGlobal[t.id] ?? t.orden) : t.orden).padStart(2, '0')}</div>
      ${enEdicion
        ? `<input
             class="impl-tarea__title-input"
             value="${escapeHtmlImpl(t.tarea)}"
             onclick="event.stopPropagation()"
             onblur="renombrarTareaCliente('${t.id}', this.value)"
             onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
             title="Editá el nombre de la tarea"
           />`
        : `<div class="impl-tarea__title">${escapeHtmlImpl(t.tarea)}${isVencida ? ` <span class="impl-tarea__vencida-badge" title="La fecha estimada ya pasó">⏰ Vencida hace ${diasVencido} día${diasVencido !== 1 ? 's' : ''}</span>` : ''}${notasCount > 0 ? `<span class="impl-tarea__chevron">▸</span>` : ''}${!puedoEditar ? ` <span class="impl-tarea__lock" title="Solo ${escapeHtmlImpl(t.asesor)} puede modificar">🔒</span>` : ''}</div>`
      }
      <div class="impl-tarea__controls">
        ${enEdicion
          ? `<select class="impl-tarea__resp-sel" onclick="event.stopPropagation();"
                 onchange="cambiarResponsableTipoTarea('${t.id}', this.value, event)" title="Responsable">
               <option value="cliente" ${t.responsable_tipo === 'cliente' ? 'selected' : ''}>Cliente</option>
               <option value="equipo"  ${t.responsable_tipo === 'equipo'  ? 'selected' : ''}>Equipo</option>
               <option value="ambos"   ${t.responsable_tipo === 'ambos'   ? 'selected' : ''}>Ambos</option>
             </select>`
          : respBadgeConAsesor
        }
        ${!enEdicion
          ? `<select class="impl-tarea__estado-sel" onclick="event.stopPropagation();" onchange="cambiarEstadoTarea('${t.id}', this.value)" title="${puedoEditar ? 'Cambiar estado' : 'Solo ' + t.asesor + ' puede cambiar el estado'}" ${disabledAttr}>
               <option value="pendiente"   ${t.estado === 'pendiente'   ? 'selected' : ''}>Pendiente</option>
               <option value="en_progreso" ${t.estado === 'en_progreso' ? 'selected' : ''}>En progreso</option>
               <option value="completada"  ${t.estado === 'completada'  ? 'selected' : ''}>Completada</option>
               <option value="demorada"    ${t.estado === 'demorada'    ? 'selected' : ''}>Demorada</option>
             </select>`
          : ''
        }
        ${enEdicion
          ? `<select class="impl-tarea__asesor-sel" onclick="event.stopPropagation();"
                 onchange="cambiarAsesorTarea('${t.id}', this.value)" title="Asignar asesor">
               <option value="">Sin asignar</option>
               ${IMPL_TEAM.map(a => `<option value="${a}" ${(t.asesor || t.asesor_plantilla) === a ? 'selected' : ''}>${a}</option>`).join('')}
             </select>`
          : `<span class="impl-tarea__asesor-label" title="Asesor asignado">
               ${t.asesor || t.asesor_plantilla || '<span style="color:var(--text3)">Sin asignar</span>'}
             </span>`
        }
        ${fechaCell}
        ${predBtn}
        ${enEdicion && tareasDeFase ? (() => {
            const ordenados = [...tareasDeFase].sort((a, b) => a.orden - b.orden);
            const idx = ordenados.findIndex(x => x.id === t.id);
            const isFirst = idx === 0;
            const isLast  = idx === ordenados.length - 1;
            return `<div class="impl-tarea__edit-btns" onclick="event.stopPropagation()">
              <button class="plantilla-row__btn" onclick="moverTareaCliente('${t.id}', -1)" title="Subir" ${isFirst ? 'disabled' : ''}>↑</button>
              <button class="plantilla-row__btn" onclick="moverTareaCliente('${t.id}', 1)"  title="Bajar" ${isLast  ? 'disabled' : ''}>↓</button>
              <button class="plantilla-row__btn plantilla-row__btn--delete" onclick="eliminarTareaCliente('${t.id}')" title="Eliminar">×</button>
            </div>`;
          })() : notasIndicator}
      </div>
    </div>
    ${enEdicion ? '' : renderImplNotasSection(t.id, notasTarea, isExpanded)}`;
}

// Devuelve true si el usuario actual puede modificar esta tarea.
// Regla:
//   - Sin asesor asignado → cualquiera puede tomarla
//   - Con asesor → solo esa persona puede cambiar estado/fecha/reasignar
// Agregar notas siempre esta permitido para todos.
// Retorna true si la tarea está lista para ejecutarse:
// no tiene predecesoras, o todas sus predecesoras están completadas.
function esTareaDesbloqueada(tarea, tareasCliente) {
  const preds = tarea.predecesoras_ids || [];
  if (preds.length === 0) return true;
  return preds.every(predId => {
    const pred = tareasCliente.find(t => t.id === predId);
    return pred && pred.estado === 'completada';
  });
}

function puedeEditarTareaImpl(t) {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  if (!me) return false;
  if (!t.asesor) return true;
  return t.asesor === me;
}

// Render de la seccion de notas debajo de la fila.
// Solo se renderiza si hay contenido para mostrar (notas existentes o
// form de "agregar nota" abierto). Si la tarea fue expandida pero no
// tiene contenido, no generamos un div vacio.
function renderImplNotasSection(tareaId, notas, isExpanded) {
  const formOpen = !!(window._implNotaFormOpen && window._implNotaFormOpen[tareaId]);
  const histOpen = !!(window._implHistorialAbierto && window._implHistorialAbierto[tareaId]);
  // Sin notas ni form ni historial abierto → nada que mostrar. Limpiamos
  // tambien el flag de "expanded" en caso de que haya quedado.
  if (notas.length === 0 && !formOpen && !histOpen) {
    if (window._implTareaExpanded && window._implTareaExpanded[tareaId]) {
      delete window._implTareaExpanded[tareaId];
    }
    return '';
  }

  const isOpen = isExpanded || formOpen || histOpen;

  const historialAbierto = !!window._implHistorialAbierto[tareaId];

  return `
    <div class="impl-notas-section ${isOpen ? 'impl-notas-section--open' : ''}" data-impl-notas-id="${tareaId}">
      <div class="impl-notas-inner">
        ${notas.length > 0 ? `
          <div class="notas-label">Notas (${notas.length})</div>
          <div class="notas-list">
            ${notas.map(renderImplNota).join('')}
          </div>` : ''}
        <div class="nota-form" id="impl-nota-form-${tareaId}" style="display:${formOpen ? 'block' : 'none'}">
          <textarea class="nota-textarea" id="impl-nota-input-${tareaId}" placeholder="Que paso? Ej: el cliente nos envio los recibos por mail..."></textarea>
          <div class="btn-row" style="margin-top:6px">
            <button class="btn-primary btn-primary--sm" onclick="agregarImplNota('${tareaId}')">Guardar nota</button>
            <button class="btn-sm" onclick="toggleImplNotaForm('${tareaId}', false)">Cancelar</button>
          </div>
        </div>
        <div style="margin-top:8px;text-align:right">
          <button class="btn-sm impl-historial-toggle" onclick="toggleImplHistorial('${tareaId}')">
            ${historialAbierto ? 'Ocultar historial' : '📋 Ver historial'}
          </button>
        </div>
        ${renderImplHistorial(tareaId)}
        ${renderImplArchivos(tareaId)}
      </div>
    </div>`;
}

function renderImplNota(nota) {
  return `
    <div class="nota">
      <div class="nota-header">
        <span class="nota-autor">${escapeHtmlImpl(nota.autor_nombre || 'Equipo')}</span>
        <span class="nota-time">${tiempoRelativoImpl(nota.created_at)}</span>
        <button class="nota-delete" onclick="eliminarImplNota('${nota.id}', '${nota.tarea_id}')" title="Eliminar esta nota">×</button>
      </div>
      <div class="nota-texto">${escapeHtmlImpl(nota.texto)}</div>
    </div>`;
}

function tiempoRelativoImpl(timestamp) {
  if (!timestamp) return 'Ahora';
  const ms = Date.now() - new Date(timestamp).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 5)   return 'Ahora';
  if (min < 60)  return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)  return hrs === 1 ? 'Hace 1 hora' : `Hace ${hrs} horas`;
  const dias = Math.floor(hrs / 24);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Hace 1 dia';
  return `Hace ${dias} dias`;
}

function escapeHtmlImpl(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatFechaImpl(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

// ────────── Acciones ──────────

async function iniciarImplementacion(clienteId) {
  try {
    const { data, error } = await sb().rpc('crear_implementacion_para_cliente', { p_cliente_id: clienteId });
    if (error) throw error;
    toast(`Etapas creadas (${data || 23})`);
    // El realtime va a refrescar automaticamente
  } catch (e) {
    console.error('Error iniciando implementacion', e);
    alert('No se pudo crear la implementación: ' + e.message);
  }
}

async function toggleTareaCompleta(tareaId) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) {
    alert(`Solo ${t.asesor} puede marcar esta tarea como completada.`);
    return;
  }
  const nuevoEstado = t.estado === 'completada' ? 'pendiente' : 'completada';
  await cambiarEstadoTarea(tareaId, nuevoEstado);
}

async function renombrarTareaCliente(tareaId, nuevoNombre) {
  const nombre = nuevoNombre.trim();
  if (!nombre) return;
  const t = implTareas.find(x => x.id === tareaId);
  if (!t || t.tarea === nombre) return; // sin cambios
  try {
    await dbUpdate('implementacion_tareas', tareaId, { tarea: nombre });
    t.tarea = nombre;
    // No re-render completo para no perder el foco en otros inputs
  } catch (e) {
    console.error('Error renombrando tarea', e);
    alert('No se pudo guardar el nombre: ' + e.message);
  }
}

async function cambiarEstadoTarea(tareaId, nuevoEstado) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) {
    alert(`Solo ${t.asesor} puede cambiar el estado de esta tarea.`);
    renderImplementacion(); // revertir UI
    return;
  }

  // Validación: no se puede completar una tarea si tiene predecesoras pendientes
  if (nuevoEstado === 'completada' && Array.isArray(t.predecesoras_ids) && t.predecesoras_ids.length > 0) {
    const pendientes = t.predecesoras_ids
      .map(pid => implTareas.find(x => x.id === pid))
      .filter(p => p && p.estado !== 'completada');
    if (pendientes.length > 0) {
      const lista = pendientes
        .map(p => `  ${String(p.orden).padStart(2, '0')} — ${p.tarea}`)
        .join('\n');
      alert(
        `No se puede completar esta tarea todavía.\n\n` +
        `Antes hay que completar sus predecesoras:\n\n${lista}\n\n` +
        `(Tarea actual: ${String(t.orden).padStart(2, '0')} — ${t.tarea})`
      );
      renderImplementacion(); // revertir el select al estado anterior
      return;
    }
  }

  const estadoAnterior = t.estado;
  try {
    await dbUpdate('implementacion_tareas', tareaId, { estado: nuevoEstado });
    if (estadoAnterior !== nuevoEstado) {
      logImplEvento(tareaId, 'estado', `${labelEstadoImpl(estadoAnterior)} → ${labelEstadoImpl(nuevoEstado)}`);
    }

    // Si se marca como completada y tiene pendiente vinculado, cerrarlo
    if (nuevoEstado === 'completada' && t.pendiente_id) {
      try {
        await dbUpdate('pendientes', t.pendiente_id, {
          resuelto: true,
          resolved_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('No se pudo cerrar pendiente vinculado al completar tarea', e);
      }
    }

    // Si cambia el estado de/hacia completada, recalcular el Gantt del cliente
    // (porque las tareas siguientes podrian necesitar correr sus fechas)
    if ((estadoAnterior === 'completada') !== (nuevoEstado === 'completada')) {
      // Refrescar la tarea local antes de recalc para que tenga el dato actualizado
      const idx = implTareas.findIndex(x => x.id === tareaId);
      if (idx !== -1) {
        if (nuevoEstado === 'completada') {
          implTareas[idx].fecha_completada = new Date().toISOString();
        } else {
          implTareas[idx].fecha_completada = null;
        }
        implTareas[idx].estado = nuevoEstado;
      }
      await recalcularGanttCliente(t.cliente_id);

      // ── Hito del 30%: festejo en pantalla (una sola vez por cliente) ──
      if (nuevoEstado === 'completada') {
        const tareasCliente = implTareas.filter(x => x.cliente_id === t.cliente_id);
        const total    = tareasCliente.length;
        const completas = tareasCliente.filter(x => x.estado === 'completada').length;
        const pctAntes = total > 0 ? Math.round(((completas - 1) / total) * 100) : 0;
        const pctAhora = total > 0 ? Math.round((completas / total) * 100) : 0;
        const clave30  = `impl_30pct_${t.cliente_id}`;

        if (((completas - 1) / total) < 0.30 && (completas / total) >= 0.30 && !localStorage.getItem(clave30)) {
          localStorage.setItem(clave30, '1');
          const cli = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === t.cliente_id);
          const nombreCli = cli ? cli.nombre : 'El cliente';
          mostrarFestejo30(nombreCli);
          if (typeof refreshAlertas === 'function') refreshAlertas();
        }

        // ── Popup al entrar a una fase nueva ──
        const FASES_KEYS    = ['relevamiento', 'configuracion', 'analisis', 'pruebas', 'golive'];
        const FASES_NOMBRES = ['Relevamiento', 'Configuración', 'Análisis', 'Pruebas', 'Go-live'];
        const FASES_ICONOS  = ['🔍', '⚙️', '📊', '✅', '🚀'];

        // Determinar la fase activa ANTES y DESPUÉS de completar esta tarea
        const tareasTodas = implTareas.filter(x => x.cliente_id === t.cliente_id);

        // "Antes" = con esta tarea aún sin completar (restar 1 completada de su fase)
        const faseActivaAntes = FASES_KEYS.findIndex(fk => {
          const tf = tareasTodas.filter(x => (x.fase || 'relevamiento') === fk);
          if (tf.length === 0) return false;
          const incompletas = fk === (t.fase || 'relevamiento')
            ? tf.filter(x => x.estado !== 'completada').length + 1  // esta tarea contaba como incompleta antes
            : tf.filter(x => x.estado !== 'completada').length;
          return incompletas > 0;
        });

        // "Después" = con esta tarea ya completada (ya está en implTareas actualizado)
        const faseActivaDespues = FASES_KEYS.findIndex(fk => {
          const tf = tareasTodas.filter(x => (x.fase || 'relevamiento') === fk);
          return tf.length > 0 && tf.some(x => x.estado !== 'completada');
        });

        if (faseActivaDespues > faseActivaAntes && faseActivaDespues > 0) {
          const claveFase = `impl_fase_${t.cliente_id}_${faseActivaDespues}`;
          if (!localStorage.getItem(claveFase)) {
            localStorage.setItem(claveFase, '1');
            const cli2 = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === t.cliente_id);
            mostrarFestejoFase(cli2 ? cli2.nombre : 'El cliente', faseActivaDespues, FASES_NOMBRES, FASES_ICONOS);
            if (typeof refreshAlertas === 'function') refreshAlertas();
          }
        }

        // ── Graduación: todas las tareas completadas → mover a Soporte ──
        const todasListas = total > 0 && tareasCliente.every(x => x.estado === 'completada');
        if (todasListas) {
          await graduarClienteAsoporte(t.cliente_id);
        }

        // ── Desbloqueo en cascada: crear pendientes para tareas que se acaban de habilitar ──
        await crearPendientesDesbloqueados(t.cliente_id, tareaId);
      }
    }
  } catch (e) {
    console.error('Error cambiando estado', e);
    alert('No se pudo actualizar el estado: ' + e.message);
  }
}

// Mueve un cliente de impl → soporte cuando alcanza el 100% de tareas completadas.
// Actualiza Supabase, el array global y re-renderiza.
async function graduarClienteAsoporte(clienteId) {
  try {
    await dbUpdate('clientes', clienteId, { area: 'soporte' });
    // Actualizar en memoria
    const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === clienteId);
    if (c) c.area = 'soporte';
    if (typeof renderClientes   === 'function') renderClientes();
    if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
    renderImplementacion();
    toast(`🎓 ${c ? c.nombre : 'Cliente'} completó la implementación y pasó a Soporte`);
  } catch (e) {
    console.warn('No se pudo graduar el cliente a soporte', e);
  }
}

// Cambia el asesor de una tarea. Si hay asesor nuevo, crea automaticamente
// un pendiente para esa persona vinculado a la tarea. Si el asesor cambia,
// cierra el pendiente viejo y crea uno nuevo.
async function cambiarAsesorTarea(tareaId, asesor) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) {
    alert(`Solo ${t.asesor} puede reasignar esta tarea.`);
    renderImplementacion(); // revertir UI
    return;
  }
  const nuevo = asesor || null;
  if (nuevo === t.asesor) return; // sin cambio

  const cliente = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === t.cliente_id);
  const clienteNombre = cliente ? cliente.nombre : 'Cliente';

  try {
    // 1) Eliminar pendiente viejo si existe — el cambio de asesor es una corrección,
    //    no una resolución, así que no debe quedar rastro en el historial de pendientes.
    if (t.pendiente_id) {
      try {
        await dbDelete('pendientes', t.pendiente_id);
      } catch (e) {
        console.warn('No se pudo eliminar el pendiente viejo (puede que ya no exista)', e);
      }
    }

    let nuevoPendienteId = null;

    // 2) Crear pendiente para el nuevo asesor SOLO si la tarea ya está desbloqueada
    //    (todas sus predecesoras completas). Si está bloqueada, el pendiente se crea
    //    automáticamente cuando se complete la última predecesora.
    if (nuevo) {
      const tareasCliente = implTareas.filter(x => x.cliente_id === t.cliente_id);
      const desbloqueada  = esTareaDesbloqueada(t, tareasCliente);
      if (desbloqueada) {
        try {
          const pendRow = await dbInsert('pendientes', {
            cliente_nombre: clienteNombre,
            asesor:         nuevo,
            prioridad:      'media',
            categoria:      'Implementación',
            descripcion:    `Implementación de ${clienteNombre} — ${t.tarea}`,
            intento:        null,
            prox_paso:      null,
            tipo_pendiente: 'implementacion',
            resuelto:       false
          });
          nuevoPendienteId = pendRow.id;
          toast(`Pendiente creado para ${nuevo}`);
        } catch (e) {
          console.error('No se pudo crear el pendiente automatico', e);
        }
      } else {
        toast(`Asesor asignado. El pendiente se creará cuando se desbloquee la tarea.`);
      }
    }

    // 3) Actualizar la tarea (asesor + pendiente_id vinculado)
    await dbUpdate('implementacion_tareas', tareaId, {
      asesor:       nuevo,
      pendiente_id: nuevoPendienteId
    });

    // Audit log
    const anterior = t.asesor;
    if (!anterior && nuevo) {
      logImplEvento(tareaId, 'asignada', `Asignada a ${nuevo}`);
    } else if (anterior && !nuevo) {
      logImplEvento(tareaId, 'desasignada', `Quitada la asignación de ${anterior}`);
    } else if (anterior !== nuevo) {
      logImplEvento(tareaId, 'reasignada', `${anterior} → ${nuevo}`);
    }
  } catch (e) {
    console.error('Error cambiando asesor', e);
    alert('No se pudo asignar el asesor: ' + e.message);
  }
}

// Al completar una tarea, busca qué otras tareas del cliente se acaban de desbloquear
// (tenían esta tarea como predecesora y ahora todas sus predecesoras están completas)
// y les crea el pendiente automáticamente si tienen asesor asignado.
async function crearPendientesDesbloqueados(clienteId, tareaCompletadaId) {
  const tareasCliente = implTareas.filter(t => t.cliente_id === clienteId);
  const cliente       = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === clienteId);
  const clienteNombre = cliente ? cliente.nombre : 'Cliente';

  const recienDesbloqueadas = tareasCliente.filter(t => {
    const preds = t.predecesoras_ids || [];
    if (!preds.includes(tareaCompletadaId)) return false; // no depende de la tarea completada
    if (!t.asesor) return false;                          // sin asesor asignado
    if (t.pendiente_id) return false;                     // ya tiene pendiente activo
    if (t.estado === 'completada') return false;          // ya estaba completa
    return esTareaDesbloqueada(t, tareasCliente);         // todas sus predecesoras completas
  });

  for (const t of recienDesbloqueadas) {
    try {
      const pendRow = await dbInsert('pendientes', {
        cliente_nombre: clienteNombre,
        asesor:         t.asesor,
        prioridad:      'media',
        categoria:      'Implementación',
        descripcion:    `Implementación de ${clienteNombre} — ${t.tarea}`,
        tipo_pendiente: 'implementacion',
        resuelto:       false
      });
      await dbUpdate('implementacion_tareas', t.id, { pendiente_id: pendRow.id });
      t.pendiente_id = pendRow.id;
      toast(`🔓 Desbloqueada: pendiente creado para ${t.asesor} — "${t.tarea}"`);
    } catch (err) {
      console.warn('No se pudo crear pendiente para tarea desbloqueada', t.id, err);
    }
  }
}

async function cambiarFechaEstimada(tareaId, fecha) {
  // Legacy: ya no se llama desde la UI. La fecha_estimada se calcula via Gantt.
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) { renderImplementacion(); return; }
  try {
    await dbUpdate('implementacion_tareas', tareaId, { fecha_estimada: fecha || null });
  } catch (e) { console.error('Error', e); }
}

// Cambia el responsable_tipo de una tarea (Cliente / Equipo / Ambos)
async function cambiarResponsableTipoTarea(tareaId, tipo, event) {
  if (event) event.stopPropagation();
  const t = implTareas.find(x => x.id === tareaId);
  if (!t || t.responsable_tipo === tipo) return;
  try {
    await dbUpdate('implementacion_tareas', tareaId, { responsable_tipo: tipo });
    t.responsable_tipo = tipo;
    // Si ya no es equipo/ambos, limpiar el asesor
    if (tipo === 'cliente') {
      await cambiarAsesorTarea(tareaId, '');
    }
    renderImplementacion();
  } catch (e) {
    console.error('Error cambiando responsable', e);
    alert('No se pudo guardar: ' + e.message);
  }
}

// Cambia la duracion (en dias) de una tarea y recalcula el Gantt del cliente
async function cambiarDuracionTarea(tareaId, dias) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) {
    alert(`Solo ${t.asesor} puede cambiar la duración de esta tarea.`);
    renderImplementacion();
    return;
  }
  const duracionAnterior = t.duracion_dias;
  const duracion = Math.max(1, parseInt(dias, 10) || 1);
  if (duracion === duracionAnterior) return;
  try {
    await dbUpdate('implementacion_tareas', tareaId, { duracion_dias: duracion });
    t.duracion_dias = duracion;
    logImplEvento(tareaId, 'fecha', `Duración: ${duracionAnterior}d → ${duracion}d`);
    await recalcularGanttCliente(t.cliente_id);
  } catch (e) {
    console.error('Error cambiando duración', e);
    alert('No se pudo actualizar la duración: ' + e.message);
  }
}

// Cambia la fecha de inicio de la implementacion de un cliente y recalcula su Gantt
async function cambiarFechaInicioCliente(clienteId, fecha, inputEl) {
  const cliente = clientes.find(c => c.id === clienteId);
  if (!cliente) return;
  const fechaAnterior = cliente.fecha_inicio_implementacion;
  const fechaNueva = fecha || null;
  if (fechaAnterior === fechaNueva) return;

  // Si ya tenia una fecha seteada, pedir confirmacion
  if (fechaAnterior) {
    const antStr = formatFechaImpl(fechaAnterior);
    const nuevaStr = fechaNueva ? formatFechaImpl(fechaNueva) : '(sin fecha)';
    if (!confirm(
      `Vas a cambiar la fecha de inicio de ${cliente.nombre}:\n\n` +
      `${antStr} → ${nuevaStr}\n\n` +
      `Esto va a recalcular las fechas de TODAS las tareas del cliente.\n¿Continuar?`
    )) {
      // Revertir el input al valor anterior
      if (inputEl) inputEl.value = fechaAnterior.substring(0, 10);
      else renderImplementacion();
      return;
    }
  }

  try {
    await dbUpdate('clientes', clienteId, { fecha_inicio_implementacion: fechaNueva });
    cliente.fecha_inicio_implementacion = fechaNueva;
    await recalcularGanttCliente(clienteId);
    toast(fechaNueva ? `Fecha de inicio: ${formatFechaImpl(fechaNueva)}` : 'Fecha de inicio borrada');
  } catch (e) {
    console.error('Error cambiando fecha de inicio del cliente', e);
    alert('No se pudo actualizar: ' + e.message);
  }
}

// Cambia la fecha de fin objetivo (deadline) de un cliente
async function cambiarFechaFinObjetivo(clienteId, fecha, inputEl) {
  const cliente = clientes.find(c => c.id === clienteId);
  if (!cliente) return;
  const fechaAnterior = cliente.fecha_fin_objetivo;
  const fechaNueva = fecha || null;
  if (fechaAnterior === fechaNueva) return;

  // Si ya tenia una fecha seteada, pedir confirmacion
  if (fechaAnterior) {
    const antStr = formatFechaImpl(fechaAnterior);
    const nuevaStr = fechaNueva ? formatFechaImpl(fechaNueva) : '(sin objetivo)';
    if (!confirm(
      `Vas a cambiar la fecha objetivo de fin de ${cliente.nombre}:\n\n` +
      `${antStr} → ${nuevaStr}\n\n` +
      `¿Continuar?`
    )) {
      if (inputEl) inputEl.value = fechaAnterior.substring(0, 10);
      else renderImplementacion();
      return;
    }
  }

  try {
    await dbUpdate('clientes', clienteId, { fecha_fin_objetivo: fechaNueva });
    cliente.fecha_fin_objetivo = fechaNueva;
    renderImplementacion();
    toast(fechaNueva ? `Objetivo: ${formatFechaImpl(fechaNueva)}` : 'Objetivo borrado');
  } catch (e) {
    console.error('Error cambiando fecha objetivo', e);
    alert('No se pudo actualizar: ' + e.message);
  }
}

// ────────── Modal para editar predecesoras de una tarea ──────────

function abrirModalPredecesoras(tareaId) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) {
    alert(`Solo ${t.asesor} puede editar las predecesoras de esta tarea.`);
    return;
  }

  // Otras tareas del mismo cliente (no podemos depender de nosotros mismos
  // ni de tareas posteriores en orden — para evitar ciclos)
  const otras = implTareas
    .filter(x => x.cliente_id === t.cliente_id && x.id !== tareaId && x.orden < t.orden)
    .sort((a, b) => a.orden - b.orden);

  // Cerrar modal previo
  const existing = document.getElementById('modal-predecesoras');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-predecesoras';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:520px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Predecesoras de la tarea ${String(t.orden).padStart(2, '0')}</div>
          <div class="modal-sub">"${escapeHtmlImpl(t.tarea)}"<br>Tildá las tareas que tienen que terminar antes de que arranque esta.</div>
        </div>
        <button class="btn-sm" onclick="cerrarModalPredecesoras()">✕</button>
      </div>

      <div class="modal-list" style="max-height:50vh">
        ${otras.length === 0 ? `<div class="modal-empty">No hay tareas anteriores en este cliente.</div>` : otras.map(o => `
          <label class="pred-option">
            <input type="checkbox" value="${o.id}" ${(t.predecesoras_ids || []).includes(o.id) ? 'checked' : ''}>
            <span class="pred-option__num">${String(o.orden).padStart(2, '0')}</span>
            <span class="pred-option__name">${escapeHtmlImpl(o.tarea)}</span>
          </label>
        `).join('')}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary btn-secondary--sm" onclick="cerrarModalPredecesoras()">Cancelar</button>
        <button class="btn-primary btn-primary--sm" style="margin-left:auto" onclick="guardarPredecesoras('${tareaId}')">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModalPredecesoras();
  });
}

function cerrarModalPredecesoras() {
  const m = document.getElementById('modal-predecesoras');
  if (m) m.remove();
}

async function guardarPredecesoras(tareaId) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  const checks = document.querySelectorAll('#modal-predecesoras input[type=checkbox]:checked');
  const nuevasIds = Array.from(checks).map(c => c.value);
  const anterioresIds = t.predecesoras_ids || [];

  // No tocar si no hay cambios
  const sonIguales = anterioresIds.length === nuevasIds.length &&
    anterioresIds.every(id => nuevasIds.includes(id));
  if (sonIguales) {
    cerrarModalPredecesoras();
    return;
  }

  try {
    await dbUpdate('implementacion_tareas', tareaId, { predecesoras_ids: nuevasIds });
    t.predecesoras_ids = nuevasIds;
    logImplEvento(tareaId, 'fecha', `Predecesoras actualizadas (${nuevasIds.length})`);
    cerrarModalPredecesoras();
    await recalcularGanttCliente(t.cliente_id);
    toast('Predecesoras actualizadas');
  } catch (e) {
    console.error('Error guardando predecesoras', e);
    alert('No se pudo actualizar: ' + e.message);
  }
}

// ────────── Notas: toggle expand, form inline + persistencia ──────────

// Estado en memoria: que tareas estan expandidas (mostrando sus notas)
// y que formularios de "agregar nota" estan abiertos.
window._implTareaExpanded = window._implTareaExpanded || {};
window._implNotaFormOpen  = window._implNotaFormOpen  || {};

// Toggle expand/collapse de la seccion de notas debajo de una tarea.
// Se llama al hacer click sobre la fila. Condiciones:
//   - Si el click fue sobre un control (boton/select/input), no togglea.
//   - Si la tarea no tiene notas, no togglea (evita abrir un espacio vacio).
function toggleImplTareaExpanded(tareaId, event) {
  if (event && event.target) {
    const ignorar = event.target.closest('button, select, input, a, textarea');
    if (ignorar) return;
  }
  // Sin notas → click en la fila no hace nada. Para agregar la primera nota
  // hay que usar el boton ＋.
  const notas = implTareaNotas[tareaId] || [];
  if (notas.length === 0) return;

  if (window._implTareaExpanded[tareaId]) {
    delete window._implTareaExpanded[tareaId];
    delete window._implNotaFormOpen[tareaId];
  } else {
    window._implTareaExpanded[tareaId] = true;
  }
  renderImplementacion();
}

function toggleImplNotaForm(tareaId, show) {
  if (show) {
    window._implNotaFormOpen[tareaId] = true;
    // Si abrimos el form, tambien expandimos la tarea para que se vean las notas
    window._implTareaExpanded[tareaId] = true;
  } else {
    delete window._implNotaFormOpen[tareaId];
  }
  renderImplementacion();
  if (show) {
    setTimeout(() => {
      const ta = document.getElementById(`impl-nota-input-${tareaId}`);
      if (ta) ta.focus();
    }, 50);
  }
}

async function eliminarImplNota(notaId, tareaId) {
  if (!confirm('¿Eliminar esta nota? Esta acción no se puede deshacer.')) return;
  try {
    await dbDelete('implementacion_tarea_notas', notaId);
    // Update optimista: sacamos la nota del estado local sin esperar al
    // realtime (Supabase a veces manda DELETE sin tarea_id, asi que
    // resolvemos el render inmediatamente).
    if (implTareaNotas[tareaId]) {
      implTareaNotas[tareaId] = implTareaNotas[tareaId].filter(n => n.id !== notaId);
    } else {
      // Fallback: buscar la nota en todas las tareas (por si tareaId fue mal)
      for (const tid in implTareaNotas) {
        implTareaNotas[tid] = implTareaNotas[tid].filter(n => n.id !== notaId);
      }
    }
    // Si fue la ultima nota, colapsamos la tarea para no dejar un espacio
    // expandido vacio.
    if ((implTareaNotas[tareaId] || []).length === 0) {
      if (window._implTareaExpanded && window._implTareaExpanded[tareaId]) {
        delete window._implTareaExpanded[tareaId];
      }
    }
    renderImplementacion();
    // Si el modal está abierto mostrando esta tarea, refrescamos el panel
    if (window._modalTareaId === tareaId) _refreshModalNotasArchivos(tareaId);
    toast('Nota eliminada');
  } catch (e) {
    console.error('Error eliminando nota', e);
    alert('No se pudo eliminar la nota: ' + e.message);
  }
}

async function agregarImplNota(tareaId) {
  const ta = document.getElementById(`impl-nota-input-${tareaId}`);
  if (!ta) return;
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }

  if (typeof currentMember === 'undefined' || !currentMember) {
    alert('No se pudo identificar tu sesión. Recargá la página.');
    return;
  }

  try {
    const inserted = await dbInsert('implementacion_tarea_notas', {
      tarea_id:     tareaId,
      autor_email:  currentMember.email,
      autor_nombre: currentMember.nombre,
      texto:        texto
    });

    if (!implTareaNotas[tareaId]) implTareaNotas[tareaId] = [];
    if (!implTareaNotas[tareaId].find(n => n.id === inserted.id)) {
      implTareaNotas[tareaId].push(inserted);
    }
    ta.value = '';
    delete window._implNotaFormOpen[tareaId];
    renderImplementacion();
    toast('Nota agregada');
  } catch (e) {
    console.error('Error guardando nota', e);
    alert('No se pudo guardar la nota: ' + e.message);
  }
}

// ────────── Realtime ──────────

let _implChannel = null;
function suscribirImplementacion() {
  if (_implChannel) return;
  _implChannel = sb()
    .channel('impl-realtime')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'implementacion_tareas' },
        (payload) => handleImplChange(payload))
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'implementacion_tarea_notas' },
        (payload) => handleImplNotaChange(payload))
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'implementacion_fases_cliente' },
        (payload) => handleImplFaseClienteChange(payload))
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'implementacion_tarea_archivos' },
        (payload) => handleImplArchivoChange(payload))
    .subscribe();
}

function handleImplFaseClienteChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    const cid = newRow.cliente_id;
    if (!implFasesExtra[cid]) implFasesExtra[cid] = [];
    if (!implFasesExtra[cid].find(f => f.id === newRow.id)) {
      implFasesExtra[cid].push(newRow);
      renderImplementacion();
    }
  } else if (eventType === 'UPDATE') {
    const cid = newRow.cliente_id;
    if (!implFasesExtra[cid]) implFasesExtra[cid] = [];
    const idx = implFasesExtra[cid].findIndex(f => f.id === newRow.id);
    if (idx !== -1) { implFasesExtra[cid][idx] = newRow; renderImplementacion(); }
  } else if (eventType === 'DELETE') {
    for (const cid in implFasesExtra) {
      implFasesExtra[cid] = implFasesExtra[cid].filter(f => f.id !== oldRow.id);
    }
    renderImplementacion();
  }
}

function handleImplChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    if (!implTareas.find(t => t.id === newRow.id)) {
      implTareas.push(dbRowToImplTarea(newRow));
      renderImplementacion();
    }
  } else if (eventType === 'UPDATE') {
    const idx = implTareas.findIndex(t => t.id === newRow.id);
    if (idx !== -1) {
      implTareas[idx] = dbRowToImplTarea(newRow);
      renderImplementacion();
    }
  } else if (eventType === 'DELETE') {
    implTareas = implTareas.filter(t => t.id !== oldRow.id);
    delete implTareaNotas[oldRow.id];
    renderImplementacion();
  }
  // Recalcular alertas cuando cambia alguna tarea de implementación
  if (typeof refreshAlertas === 'function') refreshAlertas();
}

function handleImplNotaChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    const tid = newRow.tarea_id;
    if (!implTareaNotas[tid]) implTareaNotas[tid] = [];
    if (!implTareaNotas[tid].find(n => n.id === newRow.id)) {
      implTareaNotas[tid].push(newRow);
      renderImplementacion();
      if (window._modalTareaId === tid) _refreshModalNotasArchivos(tid);
      // Toast solo si fue otro miembro del equipo
      const me = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.email : null;
      if (me && newRow.autor_email !== me) {
        toast(`${newRow.autor_nombre} agregó una nota en una tarea de implementación`);
      }
    }
  } else if (eventType === 'DELETE') {
    // Supabase a veces solo manda { id } en DELETE (sin tarea_id).
    // Si no llega, buscamos la nota por id en todos los arrays.
    let tid = oldRow.tarea_id;
    if (!tid) {
      for (const taId in implTareaNotas) {
        if (implTareaNotas[taId].some(n => n.id === oldRow.id)) {
          tid = taId;
          break;
        }
      }
    }
    if (tid && implTareaNotas[tid]) {
      const before = implTareaNotas[tid].length;
      implTareaNotas[tid] = implTareaNotas[tid].filter(n => n.id !== oldRow.id);
      if (implTareaNotas[tid].length !== before) {
        renderImplementacion();
        if (window._modalTareaId === tid) _refreshModalNotasArchivos(tid);
      }
    }
  }
}

// ────────── Plantilla de etapas (panel dentro de Implementación) ──────────
// Soporta 4 tipos: empresa, estudio, colegio, municipalidad.
// Cada tipo es una plantilla independiente y editable.

let implPlantilla    = [];          // etapas del tipo activo
let implPlantillaTipo = 'empresa';  // tab activo

const PLANTILLA_TIPOS = {
  empresa:       { label: 'Empresa',         emoji: '🏢' },
  estudio:       { label: 'Est. contable',   emoji: '📊' },
  colegio:       { label: 'Colegio',         emoji: '🏫' },
  municipalidad: { label: 'Municipalidad',   emoji: '🏛' },
};

// Mostrar u ocultar el panel de plantillas
function togglePlantillasPanel() {
  const panel = document.getElementById('plantillas-panel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) cargarPlantilla(); // cargar al abrir
}

// Cambiar entre tabs de tipo
function cambiarTabPlantilla(tipo, btn) {
  implPlantillaTipo = tipo;
  document.querySelectorAll('.plantilla-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  cargarPlantilla();
}

async function cargarPlantilla() {
  const cont = document.getElementById('plantilla-list');
  if (!cont) return;
  cont.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">Cargando…</div>`;
  try {
    const { data, error } = await sb()
      .from('implementacion_plantilla')
      .select('*')
      .eq('tipo', implPlantillaTipo)
      .order('orden', { ascending: true });
    if (error) throw error;
    implPlantilla = data || [];
    renderPlantilla();
  } catch (e) {
    console.error('Error cargando plantilla', e);
    if (cont) cont.innerHTML = `<div style="color:var(--red);padding:12px">No se pudo cargar la plantilla: ${e.message}</div>`;
  }
}

function renderPlantilla() {
  const cont = document.getElementById('plantilla-list');
  if (!cont) return;
  if (implPlantilla.length === 0) {
    cont.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">No hay etapas en esta plantilla. Agregá la primera.</div>`;
    return;
  }

  // Agrupar etapas por fase manteniendo el orden de IMPL_FASES
  let html = '';
  IMPL_FASES.forEach(f => {
    const etapasFase = implPlantilla.filter(e => (e.fase || 'relevamiento') === f.key);

    html += `
      <div class="plantilla-fase-section" data-fase="${f.key}"
           ondragover="plantillaDragOver(event, this)"
           ondragleave="plantillaDragLeave(event, this)"
           ondrop="plantillaDrop(event, '${f.key}')">
        <div class="plantilla-fase-header plantilla-fase-header--mobile">
          <div class="plantilla-fase-header__title">${f.icono} Fase ${IMPL_FASES.indexOf(f) + 1}: ${f.nombre}</div>
          <div class="plantilla-fase-header__actions">
            <span style="font-size:11px;color:var(--text3)">${etapasFase.length} tarea${etapasFase.length !== 1 ? 's' : ''}</span>
            <button class="btn-sm" style="font-size:11px;padding:2px 8px" onclick="agregarEtapaEnFase('${f.key}')">+ Agregar tarea</button>
          </div>
        </div>`;

    if (etapasFase.length === 0) {
      html += `<div class="plantilla-fase-empty">Arrastrá una etapa acá</div>`;
    }

    etapasFase.forEach(e => {
      const i       = implPlantilla.indexOf(e);
      const isFirst = i === 0;
      const isLast  = i === implPlantilla.length - 1;

      html += `
        <div class="plantilla-row" data-etapa-id="${e.id}" draggable="true"
             ondragstart="plantillaDragStart(event, '${e.id}')"
             ondragend="plantillaDragEnd(event)">
          <div class="plantilla-row__drag" title="Arrastrá para cambiar de fase">⠿</div>
          <div class="plantilla-row__num">${String(e.orden).padStart(2, '0')}</div>
          <input type="text" class="plantilla-row__nombre" value="${escapeHtmlImpl(e.tarea)}"
            onchange="editarEtapaCampo('${e.id}', 'tarea', this.value)" placeholder="Nombre de la tarea">
          <button class="plantilla-row__btn" onclick="moverEtapa('${e.id}', -1)" title="Subir"  ${isFirst ? 'disabled' : ''}>↑</button>
          <button class="plantilla-row__btn" onclick="moverEtapa('${e.id}', 1)"  title="Bajar"  ${isLast  ? 'disabled' : ''}>↓</button>
          <button class="plantilla-row__btn plantilla-row__btn--delete" onclick="eliminarEtapaPlantilla('${e.id}')" title="Eliminar">×</button>
        </div>`;
    });

    html += `</div>`; // cierre plantilla-fase-section
  });

  cont.innerHTML = html;
}

async function editarEtapaCampo(etapaId, campo, valor) {
  const e = implPlantilla.find(x => x.id === etapaId);
  if (!e) return;
  if ((e[campo] || '') === (valor || '')) return;
  const patch = {};
  patch[campo] = valor;
  try {
    await dbUpdate('implementacion_plantilla', etapaId, patch);
    e[campo] = valor;
    toast('Etapa actualizada');
  } catch (err) {
    console.error('Error actualizando etapa', err);
    alert('No se pudo guardar el cambio: ' + err.message);
    renderPlantilla();
  }
}

async function moverEtapa(etapaId, delta) {
  const idx = implPlantilla.findIndex(x => x.id === etapaId);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= implPlantilla.length) return;
  const a = implPlantilla[idx];
  const b = implPlantilla[target];
  try {
    const tempOrden = 9999 + Math.floor(Math.random() * 1000);
    await dbUpdate('implementacion_plantilla', a.id, { orden: tempOrden });
    await dbUpdate('implementacion_plantilla', b.id, { orden: a.orden });
    await dbUpdate('implementacion_plantilla', a.id, { orden: b.orden });
    const aOrden = a.orden, bOrden = b.orden;
    a.orden = bOrden;
    b.orden = aOrden;
    implPlantilla.sort((x, y) => x.orden - y.orden);
    renderPlantilla();
  } catch (e) {
    console.error('Error reordenando etapa', e);
    alert('No se pudo reordenar: ' + e.message);
    cargarPlantilla();
  }
}

async function eliminarEtapaPlantilla(etapaId) {
  const e = implPlantilla.find(x => x.id === etapaId);
  if (!e) return;
  if (!confirm(`¿Eliminar la etapa "${e.tarea}" de la plantilla ${PLANTILLA_TIPOS[implPlantillaTipo]?.label}?\n\nEsto NO borra las tareas ya creadas en clientes existentes.`)) return;
  try {
    await dbDelete('implementacion_plantilla', etapaId);
    implPlantilla = implPlantilla.filter(x => x.id !== etapaId);

    // Renumerar: recorrer todas las etapas del mismo tipo en orden y actualizar
    const etapasMismoTipo = implPlantilla
      .filter(x => x.tipo === implPlantillaTipo)
      .sort((a, b) => a.orden - b.orden);

    for (let i = 0; i < etapasMismoTipo.length; i++) {
      const nuevoOrden = i + 1;
      if (etapasMismoTipo[i].orden !== nuevoOrden) {
        etapasMismoTipo[i].orden = nuevoOrden;
        dbUpdate('implementacion_plantilla', etapasMismoTipo[i].id, { orden: nuevoOrden })
          .catch(err => console.warn('Error renumerando etapa', err));
      }
    }

    renderPlantilla();
    toast('Etapa eliminada');
  } catch (err) {
    console.error('Error eliminando etapa', err);
    alert('No se pudo eliminar: ' + err.message);
  }
}

// Cuando cambia responsable_tipo en la plantilla, muestra/oculta el selector de asesor
function onPlantillaRespChange(sel, etapaId) {
  editarEtapaCampo(etapaId, 'responsable_tipo', sel.value);
  const row = sel.closest('.plantilla-row');
  const asesorSel = row ? row.querySelector('.plantilla-row__asesor') : null;
  if (asesorSel) asesorSel.style.display = sel.value === 'equipo' ? '' : 'none';
  // Si deja de ser equipo, limpiar el asesor
  if (sel.value !== 'equipo') editarEtapaCampo(etapaId, 'asesor', null);
}

// ────────── Fases custom por cliente ──────────

async function crearFaseCliente(clienteId, event) {
  if (event) event.stopPropagation();
  const nombre = prompt('Nombre de la nueva fase:');
  if (!nombre || !nombre.trim()) return;
  const icono = (prompt('Ícono (emoji):', '📋') || '📋').trim() || '📋';

  const extras   = implFasesExtra[clienteId] || [];
  // Empezar después de golive (5000). Si ya hay extras, poner al final de ellos.
  const maxOrden = extras.length > 0 ? Math.max(...extras.map(f => f.orden)) : 5000;
  const nuevoOrden = Math.max(maxOrden, 5000) + 500;

  try {
    const inserted = await dbInsert('implementacion_fases_cliente', {
      cliente_id: clienteId,
      nombre:     nombre.trim(),
      icono:      icono,
      orden:      nuevoOrden,
    });
    if (!implFasesExtra[clienteId]) implFasesExtra[clienteId] = [];
    implFasesExtra[clienteId].push(inserted);
    renderImplementacion();
    toast(`Fase "${nombre.trim()}" creada`);
  } catch (err) {
    console.error('Error creando fase', err);
    alert('No se pudo crear la fase: ' + err.message);
  }
}

async function moverFaseCliente(clienteId, faseId, dir, event) {
  if (event) event.stopPropagation();
  const fases = getFasesParaCliente(clienteId);
  const idx   = fases.findIndex(f => f.key === faseId);
  if (idx === -1) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= fases.length) return;

  const thisExtra = (implFasesExtra[clienteId] || []).find(f => f.id === faseId);
  if (!thisExtra) return;

  const target = fases[targetIdx];

  try {
    if (!target._isBase) {
      // Intercambio con otra fase custom → swap de ordenes (con temp para evitar conflicto)
      const otherExtra = (implFasesExtra[clienteId] || []).find(f => f.id === target.key);
      if (!otherExtra) return;
      const aOrden = thisExtra.orden;
      const bOrden = otherExtra.orden;
      const tmp = 999999 + Math.floor(Math.random() * 1000);
      await dbUpdate('implementacion_fases_cliente', thisExtra.id,  { orden: tmp });
      await dbUpdate('implementacion_fases_cliente', otherExtra.id, { orden: aOrden });
      await dbUpdate('implementacion_fases_cliente', thisExtra.id,  { orden: bOrden });
      thisExtra.orden  = bOrden;
      otherExtra.orden = aOrden;
    } else {
      // Cruzar una fase base: calcular orden entre las dos fases vecinas de la nueva posición
      let newOrden;
      if (dir === -1) {
        // Subir: nuestra fase queda entre fases[targetIdx-1] y fases[targetIdx]
        const prevOrden = targetIdx > 0 ? fases[targetIdx - 1]._orden : fases[targetIdx]._orden - 200;
        newOrden = targetIdx === 0
          ? fases[targetIdx]._orden - 100
          : Math.floor((prevOrden + fases[targetIdx]._orden) / 2);
      } else {
        // Bajar: nuestra fase queda entre fases[targetIdx] y fases[targetIdx+1]
        const nextOrden = targetIdx < fases.length - 1 ? fases[targetIdx + 1]._orden : fases[targetIdx]._orden + 200;
        newOrden = targetIdx === fases.length - 1
          ? fases[targetIdx]._orden + 100
          : Math.floor((fases[targetIdx]._orden + nextOrden) / 2);
      }
      await dbUpdate('implementacion_fases_cliente', thisExtra.id, { orden: newOrden });
      thisExtra.orden = newOrden;
    }
    renderImplementacion();
    toast('Fase movida');
  } catch (err) {
    console.error('Error moviendo fase', err);
    alert('No se pudo mover la fase: ' + err.message);
  }
}

async function eliminarFaseCliente(clienteId, faseId, event) {
  if (event) event.stopPropagation();

  const extras  = implFasesExtra[clienteId] || [];
  const fase    = extras.find(f => f.id === faseId);
  if (!fase) return;

  // Validación: no se puede eliminar si tiene tareas asignadas
  const tareasEnFase = implTareas.filter(t => t.cliente_id === clienteId && t.fase === faseId);
  if (tareasEnFase.length > 0) {
    alert(
      `No se puede eliminar la fase "${fase.nombre}" porque tiene ${tareasEnFase.length} tarea${tareasEnFase.length !== 1 ? 's' : ''} asignada${tareasEnFase.length !== 1 ? 's' : ''}.\n\nEliminálas o movélas a otra fase antes de eliminar esta.`
    );
    return;
  }

  if (!confirm(`¿Eliminar la fase "${fase.nombre}"?\n\nEsta acción no se puede deshacer.`)) return;

  try {
    await dbDelete('implementacion_fases_cliente', faseId);
    implFasesExtra[clienteId] = extras.filter(f => f.id !== faseId);
    renderImplementacion();
    toast(`Fase "${fase.nombre}" eliminada`);
  } catch (err) {
    console.error('Error eliminando fase', err);
    alert('No se pudo eliminar la fase: ' + err.message);
  }
}

// ────────── Agregar / eliminar / reordenar tareas del cliente ──────────

async function agregarTareaCliente(clienteId, faseKey) {
  const todasFases = getFasesParaCliente(clienteId);
  const nombreFase = todasFases.find(f => f.key === faseKey)?.nombre || faseKey;
  const nombre = prompt(`Nueva tarea en ${nombreFase}:`);
  if (!nombre || !nombre.trim()) return;

  const tareasDelCliente = implTareas.filter(t => t.cliente_id === clienteId);
  const tareasEnFase     = tareasDelCliente.filter(t => (t.fase || 'relevamiento') === faseKey);

  // Insertar al final de la fase: orden = max(ordenes de esta fase) + 1
  const ordenInsercion = tareasEnFase.length > 0
    ? Math.max(...tareasEnFase.map(t => t.orden)) + 1
    : (tareasDelCliente.length > 0 ? Math.max(...tareasDelCliente.map(t => t.orden)) + 1 : 1);

  // Hacer espacio: desplazar +1 todas las tareas con orden >= ordenInsercion
  // (las de fases posteriores que pueden tener el mismo número)
  const tareasADesplazar = tareasDelCliente
    .filter(t => t.orden >= ordenInsercion)
    .sort((a, b) => b.orden - a.orden); // de mayor a menor para evitar conflicto de unique

  try {
    for (const t of tareasADesplazar) {
      await dbUpdate('implementacion_tareas', t.id, { orden: t.orden + 1 });
      t.orden = t.orden + 1;
    }

    const inserted = await dbInsert('implementacion_tareas', {
      cliente_id:       clienteId,
      orden:            ordenInsercion,
      tarea:            nombre.trim(),
      responsable_tipo: 'equipo',
      duracion_dias:    3,
      fase:             faseKey,
      estado:           'pendiente'
    });
    implTareas.push(dbRowToImplTarea(inserted));
    await recalcularGanttCliente(clienteId);
    renderImplementacion();
    toast('Tarea agregada');
  } catch (e) {
    console.error('Error agregando tarea', e);
    alert('No se pudo agregar: ' + e.message);
  }
}

// Renumera `orden` de todas las tareas del cliente como 1,2,3...
// respetando el orden de fases y el orden actual dentro de cada fase.
// Esto corrige gaps y garantiza que el Gantt calcule fechas correctamente.
async function normalizarOrdenTareas(clienteId) {
  let seq = 1;
  const actualizaciones = [];
  IMPL_FASES.forEach(f => {
    implTareas
      .filter(t => t.cliente_id === clienteId && (t.fase || 'relevamiento') === f.key)
      .sort((a, b) => a.orden - b.orden)
      .forEach(t => {
        if (t.orden !== seq) actualizaciones.push({ id: t.id, nuevoOrden: seq });
        t.orden = seq;
        seq++;
      });
  });
  for (const u of actualizaciones) {
    try { await dbUpdate('implementacion_tareas', u.id, { orden: u.nuevoOrden }); }
    catch (e) { console.warn('No se pudo normalizar orden de tarea', u.id, e); }
  }
}

async function eliminarTareaCliente(tareaId) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  const clienteId = t.cliente_id;
  if (!confirm(`¿Eliminar la tarea "${t.tarea}"?\n\nEsta acción no se puede deshacer.`)) return;
  try {
    await dbDelete('implementacion_tareas', tareaId);
    implTareas = implTareas.filter(x => x.id !== tareaId);
    await normalizarOrdenTareas(clienteId);
    await recalcularGanttCliente(clienteId);
    renderImplementacion();
    toast('Tarea eliminada');
  } catch (e) {
    console.error('Error eliminando tarea', e);
    alert('No se pudo eliminar: ' + e.message);
  }
}

async function moverTareaCliente(tareaId, delta) {
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;

  // Lista global de tareas del cliente ordenadas (por fase y orden dentro de fase)
  const todas = [];
  IMPL_FASES.forEach(f => {
    implTareas
      .filter(x => x.cliente_id === t.cliente_id && (x.fase || 'relevamiento') === f.key)
      .sort((a, b) => a.orden - b.orden)
      .forEach(x => todas.push(x));
  });

  const idx = todas.findIndex(x => x.id === tareaId);
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= todas.length) return;

  const otro = todas[targetIdx];
  const tempOrden = 99999 + Math.floor(Math.random() * 1000);
  try {
    // Swap ordenes
    await dbUpdate('implementacion_tareas', t.id,    { orden: tempOrden });
    await dbUpdate('implementacion_tareas', otro.id, { orden: t.orden });
    await dbUpdate('implementacion_tareas', t.id,    { orden: otro.orden });

    // Si cruzan límite de fase, también intercambiar la fase
    if (t.fase !== otro.fase) {
      await dbUpdate('implementacion_tareas', t.id,    { fase: otro.fase });
      await dbUpdate('implementacion_tareas', otro.id, { fase: t.fase });
      const tFase = t.fase;
      t.fase    = otro.fase;
      otro.fase = tFase;
    }

    const tOrden = t.orden;
    t.orden    = otro.orden;
    otro.orden = tOrden;
    renderImplementacion();
  } catch (e) {
    console.error('Error reordenando tarea', e);
    alert('No se pudo reordenar: ' + e.message);
  }
}

// ────────── Drag & drop entre fases ──────────

let _plantillaDragId = null; // id de la etapa que se está arrastrando

function plantillaDragStart(event, etapaId) {
  _plantillaDragId = etapaId;
  event.dataTransfer.effectAllowed = 'move';
  // Marcar la fila visualmente
  setTimeout(() => {
    const row = document.querySelector(`.plantilla-row[data-etapa-id="${etapaId}"]`);
    if (row) row.classList.add('plantilla-row--dragging');
  }, 0);
}

function plantillaDragEnd(event) {
  document.querySelectorAll('.plantilla-row--dragging').forEach(el => el.classList.remove('plantilla-row--dragging'));
  document.querySelectorAll('.plantilla-fase-section--over').forEach(el => el.classList.remove('plantilla-fase-section--over'));
  _plantillaDragId = null;
}

function plantillaDragOver(event, section) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  section.classList.add('plantilla-fase-section--over');
}

function plantillaDragLeave(event, section) {
  // Solo quitar el highlight si salimos de la sección, no de un hijo
  if (!section.contains(event.relatedTarget)) {
    section.classList.remove('plantilla-fase-section--over');
  }
}

async function plantillaDrop(event, faseKey) {
  event.preventDefault();
  document.querySelectorAll('.plantilla-fase-section--over').forEach(el => el.classList.remove('plantilla-fase-section--over'));

  if (!_plantillaDragId) return;
  const etapa = implPlantilla.find(e => e.id === _plantillaDragId);
  if (!etapa || (etapa.fase || 'relevamiento') === faseKey) return;

  // Cambiar fase en Supabase y en memoria
  try {
    await dbUpdate('implementacion_plantilla', etapa.id, { fase: faseKey });
    etapa.fase = faseKey;
    renderPlantilla();
    toast(`Etapa movida a ${IMPL_FASES.find(f => f.key === faseKey)?.nombre || faseKey}`);
  } catch (e) {
    console.error('Error moviendo etapa', e);
    alert('No se pudo mover la etapa: ' + e.message);
  }
}

// Agrega una etapa directamente en la fase indicada.
// Se llama desde el botón "+ Agregar" de cada sección de fase en el editor.
async function agregarEtapaEnFase(faseKey) {
  const nombre = prompt(`Nombre de la nueva etapa (fase: ${IMPL_FASES.find(f => f.key === faseKey)?.nombre || faseKey}):`);
  if (!nombre || !nombre.trim()) return;

  // Insertar DESPUÉS de la última tarea de esta fase, no al final global
  const etapasDeFase = implPlantilla.filter(e => (e.fase || 'relevamiento') === faseKey);
  const ordenInsercion = etapasDeFase.length > 0
    ? Math.max(...etapasDeFase.map(e => e.orden)) + 1
    : (implPlantilla.length > 0 ? Math.max(...implPlantilla.map(e => e.orden)) + 1 : 1);

  // Renumerar en orden descendente para respetar el unique constraint (orden, tipo)
  const aDesplazar = implPlantilla
    .filter(e => e.orden >= ordenInsercion)
    .sort((a, b) => b.orden - a.orden);

  try {
    for (const e of aDesplazar) {
      await dbUpdate('implementacion_plantilla', e.id, { orden: e.orden + 1 });
      e.orden = e.orden + 1;
    }

    const inserted = await dbInsert('implementacion_plantilla', {
      orden:            ordenInsercion,
      tarea:            nombre.trim(),
      responsable_tipo: 'equipo',
      tipo:             implPlantillaTipo,
      fase:             faseKey
    });
    implPlantilla.push(inserted);
    implPlantilla.sort((a, b) => a.orden - b.orden);
    renderPlantilla();
    toast('Tarea agregada');
  } catch (e) {
    console.error('Error agregando tarea', e);
    alert('No se pudo agregar: ' + e.message);
  }
}

// Mantener la función original por compatibilidad (agrega al final, sin fase específica)
async function agregarEtapaPlantilla() {
  await agregarEtapaEnFase('relevamiento');
}

// ────────── Modal selector de plantilla al iniciar implementación ──────────

function iniciarImplementacionConModal(clienteId) {
  // Cerrar modal previo si quedó abierto
  const prev = document.getElementById('modal-elegir-plantilla');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-elegir-plantilla';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:420px">
      <div class="modal-header">
        <div>
          <div class="modal-title">¿Qué plantilla querés usar?</div>
          <div class="modal-sub">Elegí el tipo de cliente para cargar las etapas correspondientes.</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('modal-elegir-plantilla').remove()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;padding:8px 0 16px">
        ${Object.entries(PLANTILLA_TIPOS).map(([tipo, cfg]) => `
          <button class="plantilla-opcion-btn" onclick="confirmarIniciarImpl('${clienteId}','${tipo}')">
            <span style="font-size:22px">${cfg.emoji}</span>
            <div>
              <div style="font-weight:600;font-size:14px">${cfg.label}</div>
              <div style="font-size:11px;color:var(--text3)">Plantilla ${cfg.label.toLowerCase()}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function confirmarIniciarImpl(clienteId, tipo) {
  const modal = document.getElementById('modal-elegir-plantilla');
  if (modal) modal.remove();
  try {
    const { data, error } = await sb().rpc('crear_implementacion_para_cliente', {
      p_cliente_id: clienteId,
      p_tipo:       tipo
    });
    if (error) throw error;
    toast(`Etapas creadas desde plantilla ${PLANTILLA_TIPOS[tipo]?.label} (${data || '?'})`);
  } catch (e) {
    console.error('Error iniciando implementacion', e);
    alert('No se pudo crear la implementación: ' + e.message);
  }
}

// ────────── Checklist de go-live ──────────
// Condiciones automáticas basadas en el estado de las tareas clave.
// Aparece cuando el proyecto supera el 60% de avance.

const GOLIVE_CHECKS = [
  {
    label:    'Relevamiento y configuración completados',
    subtexto: 'Fases 1 y 2 terminadas',
    fn: (tareas) => {
      const etapas = [1,2,3,4,5,6,7,8,9,10];
      const relevant = tareas.filter(t => etapas.includes(t.orden));
      return relevant.length > 0 && relevant.every(t => t.estado === 'completada');
    }
  },
  {
    label:    'Análisis de liquidaciones aprobado',
    subtexto: 'Tareas 11-15 completadas',
    fn: (tareas) => {
      const rel = tareas.filter(t => [11,12,13,14,15].includes(t.orden));
      return rel.length > 0 && rel.every(t => t.estado === 'completada');
    }
  },
  {
    label:    'Pruebas bancarias y presentaciones OK',
    subtexto: 'Tareas 16-18 completadas',
    fn: (tareas) => {
      const rel = tareas.filter(t => [16,17,18].includes(t.orden));
      return rel.length > 0 && rel.every(t => t.estado === 'completada');
    }
  },
  {
    label:    'Salario instalado en la empresa',
    subtexto: 'Tarea 19 completada',
    fn: (tareas) => tareas.find(t => t.orden === 19)?.estado === 'completada'
  },
  {
    label:    'Capacitación a usuarios realizada',
    subtexto: 'Tarea 20 completada',
    fn: (tareas) => tareas.find(t => t.orden === 20)?.estado === 'completada'
  },
  {
    label:    'Acompañamiento iniciado',
    subtexto: 'Tareas 21-22 en curso o completadas',
    fn: (tareas) => {
      const rel = tareas.filter(t => [21,22].includes(t.orden));
      return rel.some(t => t.estado === 'completada' || t.estado === 'en_progreso');
    }
  },
];

let _goliveAbierto = {}; // { cliente_id: bool }

function toggleGoLive(clienteId) {
  _goliveAbierto[clienteId] = !_goliveAbierto[clienteId];
  renderImplementacion();
}

function renderGoLive(clienteId, tareasCliente, progreso) {
  // Solo mostrar si el proyecto supera el 60%
  if (progreso < 60 && progreso !== 100) return '';

  const checks = GOLIVE_CHECKS.map(c => ({
    ...c,
    ok: !!c.fn(tareasCliente)
  }));

  const okCount    = checks.filter(c => c.ok).length;
  const total      = checks.length;
  const listo      = okCount === total;
  const abierto    = _goliveAbierto[clienteId];

  const btnColor   = listo ? 'var(--green)' : 'var(--amber)';
  const btnLabel   = listo ? '🚀 Listo para go-live' : `🚦 Go-live: ${okCount}/${total}`;

  return `
    <div class="impl-golive" style="border-top:1px solid var(--border);padding:10px 16px">
      <button class="impl-golive__toggle" style="color:${btnColor}"
        onclick="toggleGoLive('${clienteId}')">
        ${btnLabel} <span style="font-size:9px">${abierto ? '▴' : '▾'}</span>
      </button>
      ${abierto ? `
        <div class="impl-golive__lista">
          ${checks.map(c => `
            <div class="impl-golive__item ${c.ok ? 'impl-golive__item--ok' : ''}">
              <span class="impl-golive__check">${c.ok ? '✅' : '⬜'}</span>
              <div>
                <div class="impl-golive__label">${c.label}</div>
                <div class="impl-golive__sub">${c.subtexto}</div>
              </div>
            </div>`).join('')}
          ${listo ? `
            <div class="impl-golive__ready">
              🎉 Todas las condiciones están cumplidas. ¡El cliente está listo para operar!
            </div>` : ''}
        </div>` : ''}
    </div>`;
}

// ────────── Log de actividad por cliente ──────────
// Combina eventos de tareas + notas en una línea de tiempo cronológica.
// Se carga de forma lazy al abrir el log de cada cliente.

async function toggleActividadCliente(clienteId) {
  _actividadAbierta[clienteId] = !_actividadAbierta[clienteId];

  if (_actividadAbierta[clienteId] && !implActividadLog[clienteId]) {
    await cargarActividadCliente(clienteId);
  }
  renderImplementacion();
}

async function cargarActividadCliente(clienteId) {
  const tareaIds = implTareas
    .filter(t => t.cliente_id === clienteId)
    .map(t => t.id);

  if (tareaIds.length === 0) { implActividadLog[clienteId] = []; return; }

  const eventos = [];

  // Cargar eventos (cambios de estado, asesor, etc.)
  try {
    const { data } = await sb()
      .from('implementacion_tarea_eventos')
      .select('*')
      .in('tarea_id', tareaIds)
      .order('created_at', { ascending: false })
      .limit(30);
    (data || []).forEach(e => {
      const tarea = implTareas.find(t => t.id === e.tarea_id);
      eventos.push({
        fecha:  e.created_at,
        tipo:   e.tipo,
        autor:  e.autor_nombre || '—',
        texto:  e.detalle || e.tipo,
        tarea:  tarea ? tarea.tarea : '—',
        origen: 'evento'
      });
    });
  } catch(e) { console.warn('No se pudieron cargar eventos', e); }

  // Agregar notas desde el array ya cargado
  tareaIds.forEach(tid => {
    (implTareaNotas[tid] || []).forEach(n => {
      const tarea = implTareas.find(t => t.id === tid);
      eventos.push({
        fecha:  n.created_at,
        tipo:   'nota',
        autor:  n.autor_nombre || '—',
        texto:  n.texto,
        tarea:  tarea ? tarea.tarea : '—',
        origen: 'nota'
      });
    });
  });

  // Ordenar cronológicamente (más reciente primero)
  eventos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  implActividadLog[clienteId] = eventos;
}

function renderActividadCliente(clienteId) {
  const abierto = _actividadAbierta[clienteId];
  const eventos = implActividadLog[clienteId] || [];

  const iconoTipo = {
    completada:       { i: '✅', color: 'var(--green)',  label: 'Completada' },
    en_progreso:      { i: '▶',  color: 'var(--accent)', label: 'En progreso' },
    pendiente:        { i: '○',  color: 'var(--text3)',  label: 'Reiniciada' },
    reasignado:       { i: '↔',  color: 'var(--amber)',  label: 'Reasignada' },
    nota:             { i: '💬', color: 'var(--blue)',   label: 'Nota' },
    creado:           { i: '➕', color: 'var(--text3)',  label: 'Creada' },
  };

  const fmtFecha = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) +
           ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  // Calcular días entre eventos para detectar silencios
  const diasEntre2 = (a, b) => Math.round(Math.abs(new Date(a) - new Date(b)) / 86400000);

  return `
    <div class="impl-actividad">
      <button class="impl-actividad__toggle" onclick="toggleActividadCliente('${clienteId}')">
        📋 ${abierto ? 'Ocultar' : 'Ver'} actividad${eventos.length > 0 ? ` (${eventos.length})` : ''}
        <span style="font-size:9px">${abierto ? '▴' : '▾'}</span>
      </button>
      ${abierto ? `
        <div class="impl-actividad__timeline">
          ${eventos.length === 0
            ? '<div style="color:var(--text3);font-size:12px;padding:12px">Sin actividad registrada todavía.</div>'
            : eventos.slice(0, 15).map((e, i) => {
                const cfg = iconoTipo[e.tipo] || { i: '◆', color: 'var(--text3)', label: e.tipo };
                // Mostrar brecha si pasaron más de 3 días entre eventos
                const brecha = i < eventos.length - 1
                  ? diasEntre2(e.fecha, eventos[i + 1].fecha)
                  : 0;
                const brechaHtml = brecha >= 3
                  ? `<div class="impl-actividad__brecha">↕ ${brecha} días sin actividad</div>`
                  : '';
                return `
                  <div class="impl-actividad__item">
                    <div class="impl-actividad__icon" style="color:${cfg.color}">${cfg.i}</div>
                    <div class="impl-actividad__content">
                      <div class="impl-actividad__tarea">${escapeHtmlImpl(e.tarea)}</div>
                      <div class="impl-actividad__detalle">
                        <span style="color:${cfg.color};font-weight:600">${cfg.label}</span>
                        ${e.texto && e.texto !== e.tipo ? `· ${escapeHtmlImpl(e.texto.substring(0, 60))}` : ''}
                      </div>
                      <div class="impl-actividad__meta">${escapeHtmlImpl(e.autor)} · ${fmtFecha(e.fecha)}</div>
                    </div>
                  </div>
                  ${brechaHtml}`;
              }).join('')}
        </div>` : ''}
    </div>`;
}

// ────────── Reasignación masiva de tareas ──────────

function abrirModalReasignarMasivo() {
  // Cerrar modal previo si existe
  const existing = document.getElementById('modal-reasignar-masivo');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-reasignar-masivo';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:480px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Reasignar tareas masivamente</div>
          <div class="modal-sub">Transferí todas las tareas pendientes de un asesor a otro. Cierra los pendientes viejos y crea nuevos para el nuevo asesor.</div>
        </div>
        <button class="btn-sm" onclick="cerrarModalReasignarMasivo()">✕</button>
      </div>

      <div class="form-row" style="margin-top:14px">
        <div class="form-group">
          <label class="fl">De</label>
          <select id="reasignar-de" onchange="actualizarReasignarPreview()">
            <option value="">Elegí un asesor...</option>
            ${IMPL_TEAM.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="fl">A</label>
          <select id="reasignar-a" onchange="actualizarReasignarPreview()">
            <option value="">Elegí un asesor...</option>
            ${IMPL_TEAM.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="reasignar-preview" style="margin-top:8px;font-size:13px;color:var(--text2);line-height:1.5"></div>

      <div class="modal-actions">
        <button class="btn-secondary btn-secondary--sm" onclick="cerrarModalReasignarMasivo()">Cancelar</button>
        <button class="btn-primary btn-primary--sm" id="btn-confirmar-reasignar" style="margin-left:auto" onclick="confirmarReasignacionMasiva()" disabled>Reasignar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModalReasignarMasivo();
  });
  actualizarReasignarPreview();
}

function cerrarModalReasignarMasivo() {
  const m = document.getElementById('modal-reasignar-masivo');
  if (m) m.remove();
}

function actualizarReasignarPreview() {
  const de = (document.getElementById('reasignar-de') || {}).value || '';
  const a  = (document.getElementById('reasignar-a')  || {}).value || '';
  const preview = document.getElementById('reasignar-preview');
  const btn = document.getElementById('btn-confirmar-reasignar');
  if (!preview || !btn) return;

  if (!de || !a) {
    preview.innerHTML = '<span style="color:var(--text3)">Elegí ambos asesores para ver cuántas tareas se transferirían.</span>';
    btn.disabled = true;
    btn.textContent = 'Reasignar';
    return;
  }
  if (de === a) {
    preview.innerHTML = '<span style="color:var(--red)">El asesor de origen y destino no pueden ser el mismo.</span>';
    btn.disabled = true;
    btn.textContent = 'Reasignar';
    return;
  }
  // Contar tareas con asesor = de, no completadas
  const afectadas = implTareas.filter(t => t.asesor === de && t.estado !== 'completada');
  if (afectadas.length === 0) {
    preview.innerHTML = `<strong>${de}</strong> no tiene tareas pendientes para transferir.`;
    btn.disabled = true;
    btn.textContent = 'Reasignar';
    return;
  }
  preview.innerHTML = `Se transferirán <strong>${afectadas.length} tarea${afectadas.length !== 1 ? 's' : ''}</strong> de <strong>${escapeHtmlImpl(de)}</strong> a <strong>${escapeHtmlImpl(a)}</strong>.<br><span style="font-size:11px;color:var(--text3)">Los pendientes viejos se cierran automáticamente y se crean nuevos para ${escapeHtmlImpl(a)}.</span>`;
  btn.disabled = false;
  btn.textContent = `Transferir ${afectadas.length} tarea${afectadas.length !== 1 ? 's' : ''}`;
}

async function confirmarReasignacionMasiva() {
  const de = (document.getElementById('reasignar-de') || {}).value || '';
  const a  = (document.getElementById('reasignar-a')  || {}).value || '';
  if (!de || !a || de === a) return;

  const afectadas = implTareas.filter(t => t.asesor === de && t.estado !== 'completada');
  if (afectadas.length === 0) return;

  if (!confirm(`¿Confirmás reasignar ${afectadas.length} tarea${afectadas.length !== 1 ? 's' : ''} de ${de} a ${a}?\n\nEsta acción cierra los pendientes vinculados de ${de} y crea nuevos para ${a}.`)) {
    return;
  }

  const btn = document.getElementById('btn-confirmar-reasignar');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  let exitosas = 0;
  let errores = 0;

  for (const t of afectadas) {
    try {
      const cliente = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === t.cliente_id);
      const clienteNombre = cliente ? cliente.nombre : 'Cliente';

      // 1) Eliminar pendiente viejo si existe (reasignación = corrección, no resolución)
      if (t.pendiente_id) {
        try {
          await dbDelete('pendientes', t.pendiente_id);
        } catch (e) {
          console.warn('No se pudo eliminar pendiente viejo de tarea', t.id, e);
        }
      }

      // 2) Crear nuevo pendiente para "a"
      let nuevoPendId = null;
      try {
        const pend = await dbInsert('pendientes', {
          cliente_nombre: clienteNombre,
          asesor:         a,
          prioridad:      'media',
          categoria:      'Implementación',
          descripcion:    `Implementación de ${clienteNombre} — ${t.tarea}`,
          tipo_pendiente: 'implementacion',
          resuelto:       false
        });
        nuevoPendId = pend.id;
      } catch (e) {
        console.warn('No se pudo crear pendiente nuevo para tarea', t.id, e);
      }

      // 3) Actualizar tarea
      await dbUpdate('implementacion_tareas', t.id, {
        asesor:       a,
        pendiente_id: nuevoPendId
      });

      logImplEvento(t.id, 'reasignada', `${de} → ${a} (reasignación masiva)`);
      exitosas++;
    } catch (e) {
      console.error('Error reasignando tarea', t.id, e);
      errores++;
    }
  }

  cerrarModalReasignarMasivo();
  if (errores === 0) {
    toast(`${exitosas} tarea${exitosas !== 1 ? 's' : ''} transferida${exitosas !== 1 ? 's' : ''} a ${a}`);
  } else {
    toast(`${exitosas} transferidas, ${errores} con error`);
  }
}

// ────────── Audit log de tareas ──────────

// Cache de eventos cargados por tarea
let implEventos = {}; // { tarea_id: [evento, ...] }
window._implHistorialAbierto = window._implHistorialAbierto || {};

function labelEstadoImpl(estado) {
  return ({
    pendiente:   'Pendiente',
    en_progreso: 'En progreso',
    completada:  'Completada',
    demorada:    'Demorada'
  })[estado] || estado;
}

async function logImplEvento(tareaId, tipo, detalle) {
  if (typeof currentMember === 'undefined' || !currentMember) return;
  try {
    await dbInsert('implementacion_tarea_eventos', {
      tarea_id:     tareaId,
      tipo:         tipo,
      autor_email:  currentMember.email,
      autor_nombre: currentMember.nombre,
      detalle:      detalle || null
    });
  } catch (e) {
    console.warn('Error logueando evento de implementacion', e);
    // No bloquear, accion principal ya tuvo exito
  }
}

async function cargarImplEventos(tareaId) {
  if (implEventos[tareaId]) return; // ya cargados
  try {
    const data = await dbList('implementacion_tarea_eventos', {
      filter: { tarea_id: tareaId },
      orderBy: 'created_at',
      ascending: false
    });
    implEventos[tareaId] = data || [];
  } catch (e) {
    console.error('Error cargando eventos', e);
    implEventos[tareaId] = [];
  }
}

async function toggleImplHistorial(tareaId) {
  if (window._implHistorialAbierto[tareaId]) {
    delete window._implHistorialAbierto[tareaId];
    renderImplementacion();
    return;
  }
  await cargarImplEventos(tareaId);
  window._implHistorialAbierto[tareaId] = true;
  // Tambien aseguramos que la tarea este expandida (sino no se ve)
  window._implTareaExpanded[tareaId] = true;
  renderImplementacion();
}

function renderImplHistorial(tareaId) {
  if (!window._implHistorialAbierto[tareaId]) return '';
  const eventos = implEventos[tareaId] || [];
  if (eventos.length === 0) {
    return `<div class="impl-historial">
      <div class="impl-historial-label">Historial</div>
      <div style="text-align:center;color:var(--text3);padding:8px;font-size:12px">Aún no hay eventos registrados.</div>
    </div>`;
  }
  return `
    <div class="impl-historial">
      <div class="impl-historial-label">Historial (${eventos.length})</div>
      <div class="impl-historial-list">
        ${eventos.map(e => `
          <div class="impl-historial-item">
            <div class="impl-historial-tipo impl-historial-tipo--${e.tipo}">${eventoLabelImpl(e.tipo)}</div>
            <div class="impl-historial-cuerpo">
              <div class="impl-historial-meta">${escapeHtmlImpl(e.autor_nombre || 'Equipo')} &middot; ${tiempoRelativoImpl(e.created_at)}</div>
              ${e.detalle ? `<div class="impl-historial-detalle">${escapeHtmlImpl(e.detalle)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function eventoLabelImpl(tipo) {
  return ({
    estado:       '🔄 Estado',
    asignada:     '➕ Asignada',
    reasignada:   '↔ Reasignada',
    desasignada:  '➖ Desasignada',
    fecha:        '📅 Fecha',
    nota:         '✉ Nota'
  })[tipo] || tipo;
}

window.addEventListener('app-ready', initImplementacion);

// ── Festejo del 30%: modal de celebración en pantalla ──
function mostrarFestejo30(nombreCliente) {
  // Evitar duplicados
  if (document.getElementById('festejo-30-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'festejo-30-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
    animation:festejo-fadein 0.3s ease;
  `;

  const FRASES = [
    '¡El equipo está imparable! 💪',
    '¡Buen ritmo, sigan así! 🚀',
    '¡Un tercio del camino recorrido! ⚡',
    '¡La constancia da frutos! 🌟',
    '¡Gran trabajo de todo el equipo! 🎯',
  ];
  const frase = FRASES[Math.floor(Math.random() * FRASES.length)];

  overlay.innerHTML = `
    <div style="
      background:var(--surface);border:1px solid var(--border);
      border-radius:20px;padding:40px 48px;max-width:420px;width:90%;
      text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.5);
      animation:festejo-popup 0.4s cubic-bezier(0.34,1.56,0.64,1);
    ">
      <div style="font-size:56px;margin-bottom:12px">🎉</div>
      <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:8px">
        ¡30% alcanzado!
      </div>
      <div style="font-size:15px;color:var(--accent);font-weight:600;margin-bottom:16px">
        ${_esc(nombreCliente)}
      </div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px;line-height:1.5">
        ${frase}<br>
        <span style="color:var(--text3);font-size:12px">Un tercio de la implementación completado.</span>
      </div>
      <button onclick="document.getElementById('festejo-30-overlay').remove()" style="
        background:linear-gradient(135deg,#FF8C00,#E65C00);
        color:white;border:none;border-radius:10px;
        padding:12px 32px;font-size:15px;font-weight:700;
        cursor:pointer;font-family:inherit;
        box-shadow:0 4px 16px rgba(230,92,0,0.4);
      ">¡Vamos por más! 🚀</button>
    </div>
  `;

  // Estilos de animación (solo se agregan una vez)
  if (!document.getElementById('festejo-styles')) {
    const style = document.createElement('style');
    style.id = 'festejo-styles';
    style.textContent = `
      @keyframes festejo-fadein { from{opacity:0} to{opacity:1} }
      @keyframes festejo-popup  { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
    `;
    document.head.appendChild(style);
  }

  // Cerrar al hacer click fuera
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);

  // Auto-cerrar a los 8 segundos
  setTimeout(() => overlay.remove(), 8000);
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Popup al entrar a una nueva fase
function mostrarFestejoFase(nombreCliente, faseIdx, nombres, iconos) {
  if (document.getElementById('festejo-fase-overlay')) return;

  const esGoLive  = faseIdx === 4;
  const faseNombre = nombres[faseIdx];
  const faseIcono  = iconos[faseIdx];
  const numFase    = faseIdx + 1;

  const FRASES_FASE = [
    '',
    '¡La base está lista! Ahora viene la configuración.',
    '¡Configuración completada! A analizar los datos.',
    '¡Análisis listo! Hora de poner a prueba el sistema.',
    '¡Todo probado y validado! Es el momento del Go-live.',
  ];
  const FRASES_GOLIVE = [
    '¡El equipo lo logró! Solo falta el último paso. 🏁',
    '¡A un paso de terminar! Foco total en el Go-live. 💪',
    '¡La recta final! El cliente está listo para volar solo. 🦅',
  ];

  const frase = esGoLive
    ? FRASES_GOLIVE[Math.floor(Math.random() * FRASES_GOLIVE.length)]
    : FRASES_FASE[faseIdx] || '¡Buen trabajo de equipo!';

  const overlay = document.createElement('div');
  overlay.id = 'festejo-fase-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
    animation:festejo-fadein 0.3s ease;
  `;

  const colorAccent = esGoLive ? '#22c55e' : 'var(--accent)';
  const colorGrad   = esGoLive
    ? 'linear-gradient(135deg,#16a34a,#15803d)'
    : 'linear-gradient(135deg,#FF8C00,#E65C00)';

  overlay.innerHTML = `
    <div style="
      background:var(--surface);border:1px solid var(--border);
      border-radius:20px;padding:40px 48px;max-width:440px;width:90%;
      text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.5);
      animation:festejo-popup 0.4s cubic-bezier(0.34,1.56,0.64,1);
    ">
      <div style="font-size:52px;margin-bottom:10px">${faseIcono}</div>
      <div style="font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;
           color:${colorAccent};margin-bottom:6px">
        ${esGoLive ? '¡Fase final!' : 'Nueva fase'}
      </div>
      <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:6px">
        Fase ${numFase}: ${_esc(faseNombre)}
      </div>
      <div style="font-size:14px;color:var(--accent);font-weight:600;margin-bottom:14px">
        ${_esc(nombreCliente)}
      </div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px;line-height:1.5">
        ${frase}
      </div>
      <button onclick="document.getElementById('festejo-fase-overlay').remove()" style="
        background:${colorGrad};
        color:white;border:none;border-radius:10px;
        padding:12px 32px;font-size:15px;font-weight:700;
        cursor:pointer;font-family:inherit;
        box-shadow:0 4px 16px rgba(0,0,0,0.3);
      ">${esGoLive ? '¡Vamos por el cierre! 🏁' : '¡A la siguiente fase! 💪'}</button>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 9000);
}

// Recalcula fechas de todos los clientes — útil cuando se agregaron tareas
// rápido y el Gantt quedó con fechas desactualizadas en la DB.
async function recalcularTodasLasFechas() {
  const btn = document.querySelector('[onclick="recalcularTodasLasFechas()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Recalculando...'; }
  try {
    const clienteIds = [...new Set(implTareas.map(t => t.cliente_id))];
    await Promise.all(clienteIds.map(id => recalcularGanttCliente(id)));
    renderImplementacion();
    toast('Fechas recalculadas ✓');
  } catch (e) {
    console.error('Error recalculando fechas', e);
    toast('Error al recalcular fechas');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Recalcular fechas'; }
  }
}

// ─────────────────────────────────────────────────────────
//  MODAL DE TAREA MOBILE
//  En mobile, en vez de expandir la fila, se abre un bottom
//  sheet con toda la info y un selector de estado.
// ─────────────────────────────────────────────────────────

function handleImplTareaClick(tareaId, event) {
  // Siempre abrir modal (mobile y desktop)
  event.stopPropagation();
  abrirModalTareaMobile(tareaId);
}

function abrirModalTareaMobile(tareaId) {
  const t = implTareas.find(t => t.id === tareaId);
  if (!t) return;

  const modal = document.getElementById('modal-tarea-mobile');
  if (!modal) return;

  const estadoConfig = {
    pendiente:   { label: 'Pendiente',   color: 'var(--text3)' },
    en_progreso: { label: 'En progreso', color: 'var(--accent)' },
    completada:  { label: 'Completada',  color: '#22c55e' },
    demorada:    { label: 'Demorada',    color: 'var(--red)' }
  };

  const inicioStr = t.fecha_inicio_calc ? formatFechaImpl(t.fecha_inicio_calc) : '—';
  const finStr    = t.fecha_estimada    ? formatFechaImpl(t.fecha_estimada)    : '—';
  const numPred   = (t.predecesoras_ids || []).length;
  const puedoEditar = puedeEditarTareaImpl(t);

  // Rellenar contenido del modal
  modal.querySelector('.mtm-num').textContent   = String(t.orden).padStart(2, '0');
  modal.querySelector('.mtm-title').textContent = t.tarea;
  modal.querySelector('.mtm-asesor-val').textContent  = t.asesor || t.asesor_plantilla || 'Sin asignar';
  modal.querySelector('.mtm-fechas-val').textContent  = `${inicioStr} → ${finStr}`;
  modal.querySelector('.mtm-duracion-val').textContent = `${t.duracion_dias || 1} día${t.duracion_dias !== 1 ? 's' : ''}`;
  // Mostrar nombres de predecesoras, no solo el conteo
  const predNombres = (t.predecesoras_ids || [])
    .map(predId => {
      const pred = implTareas.find(x => x.id === predId);
      return pred ? `${String(pred.orden).padStart(2,'0')} ${pred.tarea}` : null;
    })
    .filter(Boolean);
  const predEl = modal.querySelector('.mtm-pred-val');
  if (predNombres.length === 0) {
    predEl.textContent = 'Sin predecesoras';
  } else {
    predEl.innerHTML = predNombres.map(n => `<span class="mtm-pred-item">${n}</span>`).join('');
  }

  // Guardar id en el modal para refresh de notas/archivos
  modal.dataset.tareaId = tareaId;

  // Guardar id abierto para refresh por realtime
  window._modalTareaId = tareaId;

  // Mostrar modal
  modal.classList.add('mtm--open');
  document.body.style.overflow = 'hidden';

  // Inyectar notas y archivos
  _refreshModalNotasArchivos(tareaId);
}

function cerrarModalTareaMobile() {
  const modal = document.getElementById('modal-tarea-mobile');
  if (modal) modal.classList.remove('mtm--open');
  document.body.style.overflow = '';
  window._modalTareaId = null;
}




// ────────── Archivos adjuntos en tareas ──────────

function _formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderImplArchivos(tareaId) {
  const archivos = implTareaArchivos[tareaId] || [];

  const iconoArchivo = (mime, nombre) => {
    const ext = (nombre || '').split('.').pop().toLowerCase();
    if (ext === 'pdf' || (mime || '').includes('pdf'))                                           return '📄';
    if (['xlsx','xls','csv','ods'].includes(ext) || (mime || '').includes('sheet') || (mime || '').includes('excel') || (mime || '').includes('csv')) return '📊';
    if (['docx','doc','odt'].includes(ext) || (mime || '').includes('word') || (mime || '').includes('document')) return '📝';
    if (['pptx','ppt','odp'].includes(ext) || (mime || '').includes('presentation'))             return '📑';
    if (['png','jpg','jpeg','gif','webp','svg'].includes(ext) || (mime || '').includes('image')) return '🖼️';
    if (['zip','rar','7z'].includes(ext))                                                         return '🗜️';
    if (['txt','md'].includes(ext))                                                               return '📃';
    return '📎';
  };

  const tarjetas = archivos.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
      <span style="font-size:22px;flex-shrink:0;line-height:1">${iconoArchivo(a.tipo_mime, a.nombre)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
             title="${escapeHtmlImpl(a.nombre)}">${escapeHtmlImpl(a.nombre)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">
          ${escapeHtmlImpl(a.subido_por || 'Equipo')} · ${tiempoRelativoImpl(a.created_at)}${a.tamano_bytes ? ' · ' + _formatBytes(a.tamano_bytes) : ''}
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button onclick="descargarArchivoTarea('${escapeHtmlImpl(a.id)}', '${escapeHtmlImpl(a.storage_path)}')"
          title="Descargar"
          style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text2);font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap"
          onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='var(--surface)'">
          ⬇ Descargar
        </button>
        <button onclick="eliminarArchivoTarea('${escapeHtmlImpl(a.id)}', '${escapeHtmlImpl(a.storage_path)}', '${escapeHtmlImpl(tareaId)}')"
          title="Eliminar"
          style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text3);font-size:14px;cursor:pointer;line-height:1"
          onmouseover="this.style.color='var(--red)';this.style.borderColor='var(--red)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border)'">
          ×
        </button>
      </div>
    </div>`).join('');

  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text3)">
          📎 Archivos${archivos.length > 0 ? ` <span style="font-weight:400;text-transform:none;letter-spacing:0">(${archivos.length})</span>` : ''}
        </span>
        <button onclick="abrirSelectorArchivo('${escapeHtmlImpl(tareaId)}')"
          style="display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text2);font-size:11px;font-weight:500;cursor:pointer"
          onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='var(--surface)'">
          + Adjuntar
        </button>
      </div>
      ${archivos.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:6px">${tarjetas}</div>`
        : `<div style="font-size:12px;color:var(--text3);padding:2px 0">Sin archivos adjuntos.</div>`}
    </div>`;
}

function abrirSelectorArchivo(tareaId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.csv,.txt,.zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await subirArchivoTarea(tareaId, file);
  };
  input.click();
}

async function subirArchivoTarea(tareaId, file) {
  // Botón de adjuntar → estado de carga visual
  const btns = document.querySelectorAll(`[onclick="abrirSelectorArchivo('${tareaId}')"]`);
  btns.forEach(b => { b.disabled = true; b.textContent = '⏳ Subiendo...'; });

  try {
    // Ruta: tarea_id / timestamp_nombre (evita colisiones)
    const storagePath = `${tareaId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await sb().storage
      .from('implementacion-archivos')
      .upload(storagePath, file);
    if (uploadError) throw uploadError;

    // Guardar metadatos en la tabla
    const subidoPor = (typeof currentMember !== 'undefined' && currentMember)
      ? (currentMember.nombre || currentMember.email)
      : 'Equipo';

    await dbInsert('implementacion_tarea_archivos', {
      tarea_id:     tareaId,
      nombre:       file.name,
      storage_path: storagePath,
      tipo_mime:    file.type || null,
      tamano_bytes: file.size || null,
      subido_por:   subidoPor,
    });

    // El realtime se encarga del re-render; no hacemos nada más
    toast(`Archivo "${file.name}" subido.`);
  } catch (e) {
    console.error('Error subiendo archivo', e);
    toast('Error al subir el archivo. Intentá de nuevo.');
  } finally {
    btns.forEach(b => { b.disabled = false; b.textContent = '+ Adjuntar'; });
  }
}

async function descargarArchivoTarea(archivoId, storagePath) {
  try {
    const { data, error } = await sb().storage
      .from('implementacion-archivos')
      .createSignedUrl(storagePath, 3600); // URL válida por 1 hora
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    console.error('Error descargando archivo', e);
    toast('Error al generar el link de descarga.');
  }
}

async function eliminarArchivoTarea(archivoId, storagePath, tareaId) {
  if (!confirm('¿Eliminar este archivo? Esta acción no se puede deshacer.')) return;

  try {
    // Borrar del storage
    const { error: storageError } = await sb().storage
      .from('implementacion-archivos')
      .remove([storagePath]);
    if (storageError) throw storageError;

    // Borrar metadatos de la DB
    await dbDelete('implementacion_tarea_archivos', archivoId);

    // Actualizar array local (el realtime también lo hace, pero esto es instantáneo)
    if (implTareaArchivos[tareaId]) {
      implTareaArchivos[tareaId] = implTareaArchivos[tareaId].filter(a => a.id !== archivoId);
    }
    renderImplementacion();
    if (window._modalTareaId === tareaId) _refreshModalNotasArchivos(tareaId);
    toast('Archivo eliminado.');
  } catch (e) {
    console.error('Error eliminando archivo', e);
    toast('Error al eliminar el archivo.');
  }
}

function handleImplArchivoChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    const tid = newRow.tarea_id;
    if (!implTareaArchivos[tid]) implTareaArchivos[tid] = [];
    if (!implTareaArchivos[tid].find(a => a.id === newRow.id)) {
      implTareaArchivos[tid].push(newRow);
      renderImplementacion();
      if (window._modalTareaId === tid) _refreshModalNotasArchivos(tid);
      // Toast si fue otro miembro del equipo
      const me = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.email : null;
      if (me && newRow.subido_por && newRow.subido_por !== (currentMember.nombre || currentMember.email)) {
        toast(`${newRow.subido_por} adjuntó "${newRow.nombre}" en una tarea`);
      }
    }
  } else if (eventType === 'DELETE') {
    for (const tid in implTareaArchivos) {
      implTareaArchivos[tid] = implTareaArchivos[tid].filter(a => a.id !== oldRow.id);
    }
    renderImplementacion();
  }
}


// ────────── Modal de tarea: notas y archivos ──────────────────────────────

/**
 * Inyecta el HTML de notas + archivos en el panel #mtm-notas-archivos
 * del modal de tarea. Se llama al abrir el modal y en cada cambio
 * vía realtime mientras el modal esté abierto.
 */
function _refreshModalNotasArchivos(tareaId) {
  const container = document.getElementById('mtm-notas-archivos');
  if (!container) return;

  const notas    = implTareaNotas[tareaId]    || [];
  const archivos = implTareaArchivos[tareaId] || [];

  const iconoArchivo = (mime, nombre) => {
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

  // ── Sección Notas ──────────────────────────────────────────────────────
  const notasHTML = notas.map(n => `
    <div class="mtm-nota">
      <div class="mtm-nota-header">
        <span class="mtm-nota-autor">${escapeHtmlImpl(n.autor_nombre || 'Equipo')}</span>
        <span class="mtm-nota-time">${tiempoRelativoImpl(n.created_at)}</span>
        <button class="mtm-nota-del"
          onclick="eliminarImplNota('${n.id}', '${n.tarea_id}')" title="Eliminar nota">×</button>
      </div>
      <div class="mtm-nota-texto">${escapeHtmlImpl(n.texto)}</div>
    </div>`).join('');

  // ── Sección Archivos ───────────────────────────────────────────────────
  const archivosHTML = archivos.map(a => `
    <div class="mtm-archivo">
      <span class="mtm-archivo-icono">${iconoArchivo(a.tipo_mime, a.nombre)}</span>
      <div class="mtm-archivo-info">
        <div class="mtm-archivo-nombre" title="${escapeHtmlImpl(a.nombre)}">${escapeHtmlImpl(a.nombre)}</div>
        <div class="mtm-archivo-meta">
          ${escapeHtmlImpl(a.subido_por || 'Equipo')} · ${tiempoRelativoImpl(a.created_at)}${a.tamano_bytes ? ' · ' + _formatBytes(a.tamano_bytes) : ''}
        </div>
      </div>
      <div class="mtm-archivo-btns">
        <button class="mtm-archivo-dl"
          onclick="descargarArchivoTarea('${a.id}', '${escapeHtmlImpl(a.storage_path)}')">⬇ Descargar</button>
        <button class="mtm-archivo-del"
          onclick="eliminarArchivoTarea('${a.id}', '${escapeHtmlImpl(a.storage_path)}', '${tareaId}')">×</button>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <!-- Notas -->
    <div class="mtm-seccion">
      <div class="mtm-seccion-header">
        <span class="mtm-seccion-titulo">📝 Notas${notas.length > 0 ? ` (${notas.length})` : ''}</span>
        <button class="mtm-seccion-btn" onclick="_toggleModalNotaForm('${tareaId}')">+ Nueva nota</button>
      </div>
      ${notas.length > 0
        ? notasHTML
        : '<div class="mtm-empty">Sin notas todavía.</div>'}
      <div class="mtm-nota-form" id="mtm-nota-form-${tareaId}">
        <textarea class="mtm-nota-textarea" id="mtm-nota-input-${tareaId}"
          placeholder="¿Qué pasó? Ej: el cliente envió los recibos..."></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-primary btn-primary--sm"
            onclick="agregarNotaEnModal('${tareaId}')">Guardar</button>
          <button class="btn-sm"
            onclick="_toggleModalNotaForm('${tareaId}')">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Archivos -->
    <div class="mtm-seccion">
      <div class="mtm-seccion-header">
        <span class="mtm-seccion-titulo">📎 Archivos${archivos.length > 0 ? ` (${archivos.length})` : ''}</span>
        <button class="mtm-seccion-btn" onclick="abrirSelectorArchivo('${tareaId}')">+ Adjuntar</button>
      </div>
      ${archivos.length > 0
        ? archivosHTML
        : '<div class="mtm-empty">Sin archivos adjuntos.</div>'}
    </div>`;
}

/** Muestra/oculta el form de nota dentro del modal */
function _toggleModalNotaForm(tareaId) {
  const form  = document.getElementById(`mtm-nota-form-${tareaId}`);
  const input = document.getElementById(`mtm-nota-input-${tareaId}`);
  if (!form) return;
  const abriendo = !form.classList.contains('open');
  form.classList.toggle('open', abriendo);
  if (abriendo && input) setTimeout(() => input.focus(), 50);
}

/** Guarda una nota desde el modal (sin recargar toda la lista) */
async function agregarNotaEnModal(tareaId) {
  const ta = document.getElementById(`mtm-nota-input-${tareaId}`);
  if (!ta) return;
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }

  if (typeof currentMember === 'undefined' || !currentMember) {
    alert('No se pudo identificar tu sesión. Recargá la página.');
    return;
  }

  try {
    const inserted = await dbInsert('implementacion_tarea_notas', {
      tarea_id:     tareaId,
      autor_email:  currentMember.email,
      autor_nombre: currentMember.nombre,
      texto
    });

    if (!implTareaNotas[tareaId]) implTareaNotas[tareaId] = [];
    if (!implTareaNotas[tareaId].find(n => n.id === inserted.id)) {
      implTareaNotas[tareaId].push(inserted);
    }
    ta.value = '';
    _refreshModalNotasArchivos(tareaId);   // refresh del modal
    renderImplementacion();               // actualiza el badge de notas en la lista
    toast('Nota agregada');
  } catch (e) {
    console.error('Error guardando nota', e);
    alert('No se pudo guardar la nota: ' + e.message);
  }
}
