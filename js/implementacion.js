// IMPLEMENTACION (Supabase + realtime)
// Cada cliente con area='impl' tiene 23 tareas (las etapas estandar de
// onboarding). El equipo va marcando cada una con: estado (pendiente /
// en_progreso / completada / demorada), asesor responsable, fecha, notas.
//
// Tabla principal: implementacion_tareas
// Plantilla: implementacion_plantilla (las 23 etapas seed)

let implTareas = [];          // todas las tareas de todos los clientes impl
let implTareaNotas = {};      // { tarea_id: [nota, nota, ...] }
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

const IMPL_TEAM = ['Ignacio', 'Matias', 'Daniel', 'Daniel Ferro', 'Renzo', 'Alfred'];

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
function setImplFiltroEstado(btn, val) {
  implFiltroEstado = val;
  _activarChip(btn, 'estado');
  renderImplementacion();
}
function setImplFiltroResp(btn, val) {
  implFiltroResp = val;
  _activarChip(btn, 'resp');
  renderImplementacion();
}
function _activarChip(btn, grupo) {
  document.querySelectorAll(`.filter-chip[data-impl-filter="${grupo}"]`).forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// Vista/escala por cliente: cada card mantiene su propio estado
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
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(t.fecha_estimada);
  return fecha < hoy;
}

function diasDesdeVencimiento(t) {
  if (!isTareaVencida(t)) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(t.fecha_estimada);
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
//   - fecha_estimada (fin) = inicio + duracion_dias - 1 día
//     (ej: 1 día arranca y termina el mismo día)
//
// Persiste los cambios en DB y actualiza el cache local.

function _toISODate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _addDays(d, dias) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() + dias);
  return r;
}

async function recalcularGanttCliente(clienteId) {
  const cliente = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === clienteId);
  if (!cliente) return;

  const tareasCli = implTareas
    .filter(t => t.cliente_id === clienteId)
    .sort((a, b) => a.orden - b.orden);

  if (tareasCli.length === 0) return;

  // Fecha base del proyecto: si el cliente no la tiene, usamos hoy
  const inicioProyectoStr = cliente.fecha_inicio_implementacion || _toISODate(new Date());
  const inicioProyecto = new Date(inicioProyectoStr);
  inicioProyecto.setHours(0, 0, 0, 0);

  // Index por id para resolver predecesoras
  const byId = {};
  tareasCli.forEach(t => { byId[t.id] = t; });

  const updates = []; // [{id, fecha_inicio_calc, fecha_estimada}]

  for (const t of tareasCli) {
    let fechaInicio;
    if (!t.predecesoras_ids || t.predecesoras_ids.length === 0) {
      fechaInicio = new Date(inicioProyecto);
    } else {
      // Buscar el FIN mas tardio de las predecesoras
      let maxFin = new Date(inicioProyecto);
      maxFin.setDate(maxFin.getDate() - 1); // sentinel
      for (const predId of t.predecesoras_ids) {
        const pred = byId[predId];
        if (!pred) continue;
        const finStr = pred.fecha_completada || pred.fecha_estimada;
        if (!finStr) continue;
        const fin = new Date(finStr);
        fin.setHours(0, 0, 0, 0);
        if (fin > maxFin) maxFin = fin;
      }
      // Arranca el día siguiente
      fechaInicio = _addDays(maxFin, 1);
      // Si quedo antes del proyecto, usar el inicio del proyecto
      if (fechaInicio < inicioProyecto) fechaInicio = new Date(inicioProyecto);
    }

    const duracion = Math.max(1, t.duracion_dias || 1);
    const fechaFin = _addDays(fechaInicio, duracion - 1);

    const inicioISO = _toISODate(fechaInicio);
    const finISO    = _toISODate(fechaFin);

    // Solo encolamos updates si cambio realmente
    const prevInicio = t.fecha_inicio_calc ? t.fecha_inicio_calc.substring(0, 10) : null;
    const prevFin    = t.fecha_estimada    ? t.fecha_estimada.substring(0, 10)    : null;
    if (prevInicio !== inicioISO || prevFin !== finISO) {
      updates.push({ id: t.id, fecha_inicio_calc: inicioISO, fecha_estimada: finISO });
    }

    // Actualizar cache local en el momento para que la siguiente iteración
    // use los valores recien calculados
    t.fecha_inicio_calc = inicioISO;
    t.fecha_estimada    = finISO;
  }

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
      </div>
    </div>`;
}

function renderGanttRow(t, idx, minDate, pxDay, totalWidth) {
  // Calcular x y ancho de la barra
  const inicio = t.fecha_inicio_calc ? startOfDay(new Date(t.fecha_inicio_calc)) : null;
  const fin = t.fecha_estimada ? startOfDay(new Date(t.fecha_estimada)) : null;

  let barHtml = '';
  if (inicio && fin) {
    const x = diasEntre(minDate, inicio) * pxDay;
    const w = Math.max(pxDay, (diasEntre(inicio, fin) + 1) * pxDay);
    const isVencida = isTareaVencida(t);
    let color = 'var(--text3)';
    if (t.estado === 'completada') color = 'var(--green)';
    else if (t.estado === 'en_progreso') color = 'var(--blue)';
    else if (isVencida || t.estado === 'demorada') color = 'var(--red)';

    const tooltip = `${t.tarea}\nAsesor: ${t.asesor || 'sin asignar'}\nInicio: ${formatFechaImpl(inicio)}\nFin: ${formatFechaImpl(fin)}\nDuración: ${t.duracion_dias}d\nEstado: ${labelEstadoImpl(t.estado)}${t.fecha_completada ? '\nCompletada: ' + formatFechaImpl(t.fecha_completada) : ''}`;

    barHtml = `
      <div class="gantt-bar"
           style="left:${x}px;width:${w}px;background:${color}"
           title="${escapeHtmlImpl(tooltip)}"
           onclick="toggleImplTareaExpanded('${t.id}', null)">
        <span class="gantt-bar-label">${String(t.orden).padStart(2, '0')}</span>
      </div>`;
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
    createdAt:         row.created_at,
    updatedAt:         row.updated_at
  };
}

// ────────── Init ──────────

async function initImplementacion() {
  try {
    const rows = await dbList('implementacion_tareas', { orderBy: 'orden', ascending: true });
    implTareas = rows.map(dbRowToImplTarea);

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

    renderImplementacion();
    suscribirImplementacion();
    // Recalcular alertas con las tareas recién cargadas
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

  // Tomar todos los clientes con area=impl (vienen del array global 'clientes')
  const todosImpl = (typeof clientes !== 'undefined' ? clientes : []).filter(c => c.area === 'impl');

  // Render metricas (siempre sobre el total, no afectado por filtros)
  renderImplMetrics(todosImpl);

  // 1. Filtro por nombre (search)
  let implClientes = implFiltroNombre
    ? todosImpl.filter(c => (c.nombre || '').toLowerCase().includes(implFiltroNombre))
    : todosImpl.slice();

  // 2. Filtros a nivel tarea: si hay filtros activos, ocultar clientes sin matches
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
      countEl.textContent = `${implClientes.length} de ${todosImpl.length} cliente${todosImpl.length !== 1 ? 's' : ''}`;
    } else {
      countEl.textContent = '';
    }
  }

  if (todosImpl.length === 0) {
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:40px">
      No hay clientes en implementación. Marcá el área de un cliente como "Implementación" para que aparezca acá con sus 23 etapas.
    </div>`;
    return;
  }

  if (implClientes.length === 0) {
    const msg = implFiltroNombre
      ? `No hay clientes en implementación que coincidan con "<strong>${escapeHtmlImpl(implFiltroNombre)}</strong>".`
      : 'Ningún cliente tiene tareas que coincidan con los filtros actuales.';
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:32px">${msg}</div>`;
    return;
  }

  cont.innerHTML = implClientes.map(renderClienteImplCard).join('');

  // Métricas avanzadas: re-calcular al final
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
    <div class="metrics-grid" style="margin-bottom:14px">
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
          <button class="btn-primary btn-primary--sm" onclick="iniciarImplementacion('${c.id}')">+ Crear las 23 etapas</button>
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
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  const hayFiltroTarea = implFiltroAsesor || implFiltroEstado || implFiltroResp;
  const tareasVisibles = hayFiltroTarea
    ? tareasCliente.filter(t => tareaMatcheaFiltros(t, me))
    : tareasCliente;

  // Estado de colapsado:
  //   - Por default, todas las cards arrancan COLAPSADAS
  //   - Si el usuario hizo click para expandir, se queda expandida
  //   - Si hay filtros activos, auto-expandir para que el filtro sirva de algo
  const isCollapsed = hayFiltroTarea ? false : !window._implClienteExpanded[c.id];

  const subtituloProgreso = `${completas} de ${totalTareas}${vencidas > 0 ? ` · <span style="color:var(--red);font-weight:600">⏰ ${vencidas} vencida${vencidas !== 1 ? 's' : ''}</span>` : ''}${hayFiltroTarea ? ` · <span style="color:var(--accent-text)">${tareasVisibles.length} con filtro</span>` : ''}`;

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
              <div class="impl-cliente-name">${escapeHtmlImpl(c.nombre)}</div>
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
            <input type="date" value="${fechaInicioVal}" onchange="cambiarFechaInicioCliente('${c.id}', this.value, this)" class="impl-cliente-stat-input" title="Fecha de inicio del proyecto">
          </label>
          <label class="impl-cliente-stat" onclick="event.stopPropagation();">
            <span class="impl-cliente-stat-label">🎯 Objetivo</span>
            <input type="date" value="${fechaObjetivoVal}" onchange="cambiarFechaFinObjetivo('${c.id}', this.value, this)" class="impl-cliente-stat-input" title="Fecha objetivo de fin (deadline)">
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
        ${getVistaCliente(c.id) === 'gantt'
          ? renderGanttCliente(tareasVisibles, c, getEscalaCliente(c.id))
          : `<div class="impl-tareas-list">
              ${tareasVisibles.length > 0
                ? tareasVisibles.map(renderImplTarea).join('')
                : '<div style="text-align:center;color:var(--text3);font-size:12px;padding:20px">Ninguna tarea matchea los filtros actuales para este cliente.</div>'}
            </div>`}
      </div>
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
        <div class="impl-filter-segmented impl-filter-segmented--sm">
          <button class="filter-chip ${escala === 'dia'    ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','dia')">Día</button>
          <button class="filter-chip ${escala === 'semana' ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','semana')">Semana</button>
          <button class="filter-chip ${escala === 'mes'    ? 'active' : ''}" onclick="setEscalaCliente('${c.id}','mes')">Mes</button>
        </div>` : ''}
    </div>`;
}

function renderImplTarea(t) {
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
  const fechaCell = isCompleted
    ? `<div class="impl-tarea__fecha-done" title="Completada el ${formatFechaImpl(t.fecha_completada)}">✓ ${formatFechaImpl(t.fecha_completada)}</div>`
    : `<div class="impl-tarea__gantt-cell" title="Inicio: ${inicioStr} · Fin: ${finStr}">
         <span class="impl-tarea__rango">${inicioStr} → ${finStr}</span>
         <input type="number" min="1" max="365" class="impl-tarea__duracion-input" value="${t.duracion_dias || 1}" onclick="event.stopPropagation();" onchange="cambiarDuracionTarea('${t.id}', this.value)" title="Duración en días" ${disabledAttr}> d
       </div>`;

  // Botón de predecesoras
  const numPred = (t.predecesoras_ids || []).length;
  const predBtn = `<button class="impl-tarea__pred-btn ${numPred > 0 ? 'impl-tarea__pred-btn--has' : ''}" onclick="event.stopPropagation(); abrirModalPredecesoras('${t.id}')" title="Editar predecesoras (qué tareas tienen que terminar antes)" ${disabledAttr}>🔗${numPred > 0 ? ' ' + numPred : ''}</button>`;

  // Indicador del boton de notas: muestra contador
  const notasTarea = implTareaNotas[t.id] || [];
  const notasCount = notasTarea.length;
  const isExpanded = !!(window._implTareaExpanded && window._implTareaExpanded[t.id]);
  const notasIndicator = notasCount > 0
    ? `<button class="impl-tarea__notas-btn impl-tarea__notas-btn--has" onclick="event.stopPropagation(); toggleImplNotaForm('${t.id}', true)" title="${notasCount} nota${notasCount !== 1 ? 's' : ''} — click para agregar otra">📝 ${notasCount}</button>`
    : `<button class="impl-tarea__notas-btn" onclick="event.stopPropagation(); toggleImplNotaForm('${t.id}', true)" title="Agregar nota">＋</button>`;

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
    <div class="${rowClasses}" data-tarea-id="${t.id}" onclick="toggleImplTareaExpanded('${t.id}', event)">
      <button class="impl-tarea__check impl-tarea__check--${t.estado}" onclick="event.stopPropagation(); toggleTareaCompleta('${t.id}')" title="${lockTooltip}" ${disabledAttr}>${cfg.icon}</button>
      <div class="impl-tarea__num">${String(t.orden).padStart(2, '0')}</div>
      <div class="impl-tarea__title">${escapeHtmlImpl(t.tarea)}${isVencida ? ` <span class="impl-tarea__vencida-badge" title="La fecha estimada ya pasó">⏰ Vencida hace ${diasVencido} día${diasVencido !== 1 ? 's' : ''}</span>` : ''}${notasCount > 0 ? `<span class="impl-tarea__chevron">▸</span>` : ''}${!puedoEditar ? ` <span class="impl-tarea__lock" title="Solo ${escapeHtmlImpl(t.asesor)} puede modificar">🔒</span>` : ''}</div>
      <span class="badge ${respBadge}" title="Responsable">${respLabel}</span>
      <select class="impl-tarea__estado-sel" onclick="event.stopPropagation();" onchange="cambiarEstadoTarea('${t.id}', this.value)" title="${puedoEditar ? 'Cambiar estado' : 'Solo ' + t.asesor + ' puede cambiar el estado'}" ${disabledAttr}>
        <option value="pendiente"   ${t.estado === 'pendiente'   ? 'selected' : ''}>Pendiente</option>
        <option value="en_progreso" ${t.estado === 'en_progreso' ? 'selected' : ''}>En progreso</option>
        <option value="completada"  ${t.estado === 'completada'  ? 'selected' : ''}>Completada</option>
        <option value="demorada"    ${t.estado === 'demorada'    ? 'selected' : ''}>Demorada</option>
      </select>
      <select class="impl-tarea__asesor-sel" onclick="event.stopPropagation();" onchange="cambiarAsesorTarea('${t.id}', this.value)" title="${puedoEditar ? 'Asignar a un asesor (crea pendiente automatico)' : 'Solo ' + t.asesor + ' puede reasignar'}" ${disabledAttr}>
        <option value="">Sin asignar</option>
        ${IMPL_TEAM.map(a => `<option value="${a}" ${t.asesor === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
      ${fechaCell}
      ${predBtn}
      ${notasIndicator}
    </div>
    ${renderImplNotasSection(t.id, notasTarea, isExpanded)}`;
}

// Devuelve true si el usuario actual puede modificar esta tarea.
// Regla:
//   - Sin asesor asignado → cualquiera puede tomarla
//   - Con asesor → solo esa persona puede cambiar estado/fecha/reasignar
// Agregar notas siempre esta permitido para todos.
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
      // (la fecha_completada se setea via trigger en DB; le damos un valor inmediato)
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
    }
  } catch (e) {
    console.error('Error cambiando estado', e);
    alert('No se pudo actualizar el estado: ' + e.message);
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
    // 1) Cerrar pendiente viejo si existe (sigue vinculado a otro asesor o se desasigna)
    if (t.pendiente_id) {
      try {
        await dbUpdate('pendientes', t.pendiente_id, {
          resuelto: true,
          resolved_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('No se pudo cerrar el pendiente viejo (puede que ya no exista)', e);
      }
    }

    let nuevoPendienteId = null;

    // 2) Crear nuevo pendiente si hay asesor nuevo
    if (nuevo) {
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
        // Continuamos: el cambio de asesor se guarda igual aunque falle el pendiente
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

async function cambiarFechaEstimada(tareaId, fecha) {
  // Legacy: ya no se llama desde la UI. La fecha_estimada se calcula via Gantt.
  const t = implTareas.find(x => x.id === tareaId);
  if (!t) return;
  if (!puedeEditarTareaImpl(t)) { renderImplementacion(); return; }
  try {
    await dbUpdate('implementacion_tareas', tareaId, { fecha_estimada: fecha || null });
  } catch (e) { console.error('Error', e); }
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
    .subscribe();
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
      }
    }
  }
}

// ────────── Plantilla de etapas (editable desde Configuracion) ──────────

let implPlantilla = [];

async function cargarPlantilla() {
  try {
    const rows = await dbList('implementacion_plantilla', { orderBy: 'orden', ascending: true });
    implPlantilla = rows;
    renderPlantilla();
  } catch (e) {
    console.error('Error cargando plantilla', e);
    const cont = document.getElementById('plantilla-list');
    if (cont) cont.innerHTML = `<div style="color:var(--red);padding:12px">No se pudo cargar la plantilla: ${e.message}</div>`;
  }
}

function renderPlantilla() {
  const cont = document.getElementById('plantilla-list');
  if (!cont) return;
  if (implPlantilla.length === 0) {
    cont.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">No hay etapas en la plantilla. Agregá la primera.</div>`;
    return;
  }
  cont.innerHTML = implPlantilla.map((e, i) => {
    const isFirst = i === 0;
    const isLast = i === implPlantilla.length - 1;
    return `
      <div class="plantilla-row" data-etapa-id="${e.id}">
        <div class="plantilla-row__num">${String(e.orden).padStart(2, '0')}</div>
        <input type="text" class="plantilla-row__nombre" value="${escapeHtmlImpl(e.tarea)}" onchange="editarEtapaCampo('${e.id}', 'tarea', this.value)" placeholder="Nombre de la etapa">
        <select class="plantilla-row__resp" onchange="editarEtapaCampo('${e.id}', 'responsable_tipo', this.value)">
          <option value="cliente" ${e.responsable_tipo === 'cliente' ? 'selected' : ''}>Cliente</option>
          <option value="equipo"  ${e.responsable_tipo === 'equipo'  ? 'selected' : ''}>Equipo</option>
          <option value="ambos"   ${e.responsable_tipo === 'ambos'   ? 'selected' : ''}>Ambos</option>
        </select>
        <input type="number" min="1" max="365" class="plantilla-row__dur" value="${e.duracion_dias != null ? e.duracion_dias : 3}" onchange="editarEtapaCampo('${e.id}', 'duracion_dias', parseInt(this.value, 10) || 1)" title="Duración en días por default">
        <button class="plantilla-row__btn" onclick="moverEtapa('${e.id}', -1)" title="Subir" ${isFirst ? 'disabled' : ''}>↑</button>
        <button class="plantilla-row__btn" onclick="moverEtapa('${e.id}', 1)" title="Bajar" ${isLast ? 'disabled' : ''}>↓</button>
        <button class="plantilla-row__btn plantilla-row__btn--delete" onclick="eliminarEtapaPlantilla('${e.id}')" title="Eliminar etapa">×</button>
      </div>
    `;
  }).join('');
}

async function editarEtapaCampo(etapaId, campo, valor) {
  const e = implPlantilla.find(x => x.id === etapaId);
  if (!e) return;
  if ((e[campo] || '') === (valor || '')) return; // sin cambio

  const patch = {};
  patch[campo] = valor;
  try {
    await dbUpdate('implementacion_plantilla', etapaId, patch);
    e[campo] = valor;
    toast('Etapa actualizada');
  } catch (err) {
    console.error('Error actualizando etapa', err);
    alert('No se pudo guardar el cambio: ' + err.message);
    renderPlantilla(); // revertir UI
  }
}

async function moverEtapa(etapaId, delta) {
  const idx = implPlantilla.findIndex(x => x.id === etapaId);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= implPlantilla.length) return;

  const a = implPlantilla[idx];
  const b = implPlantilla[target];

  // Swap orden via dos updates (sin transaccion, asume baja contencion)
  try {
    // Usamos un valor temporal alto para evitar conflicto con el UNIQUE de orden
    const tempOrden = 9999 + Math.floor(Math.random() * 1000);
    await dbUpdate('implementacion_plantilla', a.id, { orden: tempOrden });
    await dbUpdate('implementacion_plantilla', b.id, { orden: a.orden });
    await dbUpdate('implementacion_plantilla', a.id, { orden: b.orden });
    // Actualizar estado local
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
  if (!confirm(`¿Eliminar la etapa "${e.tarea}" de la plantilla?\n\nEsto NO borra las tareas ya creadas en clientes existentes, solo evita que se cree en futuras implementaciones.`)) return;
  try {
    await dbDelete('implementacion_plantilla', etapaId);
    implPlantilla = implPlantilla.filter(x => x.id !== etapaId);
    renderPlantilla();
    toast('Etapa eliminada de la plantilla');
  } catch (err) {
    console.error('Error eliminando etapa', err);
    alert('No se pudo eliminar: ' + err.message);
  }
}

async function agregarEtapaPlantilla() {
  const nombre = prompt('Nombre de la nueva etapa:');
  if (!nombre || !nombre.trim()) return;
  const maxOrden = implPlantilla.length > 0
    ? Math.max(...implPlantilla.map(e => e.orden))
    : 0;
  try {
    const inserted = await dbInsert('implementacion_plantilla', {
      orden: maxOrden + 1,
      tarea: nombre.trim(),
      responsable_tipo: 'equipo' // default
    });
    implPlantilla.push(inserted);
    renderPlantilla();
    toast('Etapa agregada a la plantilla');
  } catch (e) {
    console.error('Error agregando etapa', e);
    alert('No se pudo agregar: ' + e.message);
  }
}

// Cargar la plantilla al inicio para que este lista cuando el usuario vaya
// a la seccion de configuracion
window.addEventListener('app-ready', () => {
  cargarPlantilla();
});

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

      // 1) Cerrar pendiente viejo si existe
      if (t.pendiente_id) {
        try {
          await dbUpdate('pendientes', t.pendiente_id, {
            resuelto: true,
            resolved_at: new Date().toISOString()
          });
        } catch (e) {
          console.warn('No se pudo cerrar pendiente viejo de tarea', t.id, e);
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
