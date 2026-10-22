// ════════════════════════════════════
// DISPONIBILIDAD DE IMPLEMENTACIÓN
// Gantt general con TODOS los clientes en implementación: cuándo arranca y
// termina cada uno, quién viene atrasado / en tiempo / adelantado, y cuánta
// carga hay por mes para saber en qué momento del año hay lugar para meter
// clientes nuevos.
//
// Incluye:
//   · Zoom de rango (trimestre / semestre / año) y navegación
//   · Carga por mes (pico de clientes simultáneos) vs. capacidad máxima
//   · Capacidad máxima configurable (se guarda en este navegador)
//   · Simulador: "¿entra un cliente nuevo?" + sugerencia de mejor fecha
//
// Usa los helpers de implementacion.js (_parseDate, _addDays, calcularSemaforo...)
// ════════════════════════════════════

window._implDispAbierta  = window._implDispAbierta  || false;
window._implVolverADisp  = window._implVolverADisp  || false; // true si se abrió un cliente desde acá
window._dispZoom         = window._dispZoom         || 'semestre'; // trimestre | semestre | anio
window._dispInicio       = window._dispInicio       || null;       // Date: primer día del primer mes visible
window._dispMostrarFin   = (window._dispMostrarFin === undefined) ? true : window._dispMostrarFin; // mostrar finalizados (por defecto sí)
window._dispSim          = window._dispSim          || null;       // { inicio:'YYYY-MM-DD', dur:60 }

const DISP_MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DISP_ZOOM_MESES = { trimestre: 3, semestre: 6, anio: 12 };
const DISP_ZOOM_DIAS  = { trimestre: 92, semestre: 183, anio: 365 };  // días visibles según el zoom
const DISP_DIA_MS = 24 * 60 * 60 * 1000;

// ────────── Navegación ──────────

function abrirDisponibilidadImpl() {
  window._implProyAbierta = false;
  window._proyAbierto = null;
  window._implDispAbierta = true;
  window._implClienteAbierto = null;
  window._dispInicio = null;  // se recalcula al dibujar
  renderImplementacion();
  window.scrollTo({ top: 0 });
}

function cerrarDisponibilidadImpl() {
  window._implDispAbierta = false;
  renderImplementacion();
  window.scrollTo({ top: 0 });
}

// Abrir un cliente desde el Gantt: al volver, se regresa a Disponibilidad
function dispAbrirCliente(id) {
  window._implVolverADisp = true;
  abrirClienteImpl(id);
}

// ────────── Helpers de fecha ──────────

function _dispHoy() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }
function _dispPrimeroDeMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function _dispSumarMeses(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function _dispDias(a, b) { return Math.round((b - a) / DISP_DIA_MS); }
function _dispFmt(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
function _dispEsc(s) { return (typeof escapeHtmlImpl === 'function') ? escapeHtmlImpl(s) : String(s == null ? '' : s); }

// Máximo real de implementaciones simultáneas del equipo
const DISP_CAPACIDAD_DEFAULT = 4;

// Capacidad cambiada a mano por el usuario en este navegador (o null → se usa la por defecto)
function _dispCapacidadManual() {
  const n = parseInt(localStorage.getItem('impl_disp_capacidad'), 10);
  return (n && n > 0) ? n : null;
}

// ────────── Capacidad sugerida a partir del historial ──────────
// (Por ahora NO se usa: el equipo definió que el máximo real es 4. Se deja por
// si más adelante se quiere volver a estimar la capacidad con datos.)
// No sabemos "a priori" cuántos clientes se pueden implementar a la vez, así
// que se aprende de lo que ya pasó:
//   1) Si hay implementaciones terminadas con fecha objetivo (≥3): se busca la
//      mayor cantidad de clientes simultáneos con la que al menos el 70% terminó
//      a tiempo.
//   2) Si no hay datos suficientes: se usa el máximo de clientes simultáneos
//      que ya manejaron (hasta hoy).
function _dispAprender(items) {
  const hoy = _dispHoy();
  if (items.length === 0) return { cap: 5, motivo: 'Todavía no hay historial: valor inicial de 5 clientes.', conHistorial: false };

  // Pico histórico de clientes simultáneos (hasta hoy)
  const primero = new Date(Math.min(...items.map(i => i.inicio)));
  let picoPasado = 0;
  for (let d = new Date(primero); d <= hoy; d = _addDays(d, 3)) {
    picoPasado = Math.max(picoPasado, _dispCargaDia(items, d));
  }
  picoPasado = Math.max(picoPasado, 1);

  // Muestras: terminadas con fecha objetivo → ¿cuántos clientes había en paralelo y terminó a tiempo?
  const muestras = items
    .filter(i => i.finalizado && i.c.fecha_fin_objetivo)
    .map(i => {
      let pico = 0;
      for (let d = new Date(i.inicio); d <= i.fin; d = _addDays(d, 3)) pico = Math.max(pico, _dispCargaDia(items, d));
      return { pico: Math.max(pico, 1), aTiempo: i.fin <= _parseDate(i.c.fecha_fin_objetivo) };
    });

  if (muestras.length >= 3) {
    let mejor = null;
    const maxPico = Math.max(...muestras.map(m => m.pico));
    for (let n = 1; n <= maxPico; n++) {
      const set = muestras.filter(m => m.pico <= n);
      if (set.length < 2) continue;
      const tasa = set.filter(m => m.aTiempo).length / set.length;
      if (tasa >= 0.7) mejor = { n, tasa, total: set.length };
    }
    if (mejor) {
      return {
        cap: mejor.n, conHistorial: true,
        motivo: `Con hasta ${mejor.n} clientes en paralelo, ${Math.round(mejor.tasa * 100)}% de tus implementaciones terminadas (${mejor.total}) cerraron a tiempo.`,
      };
    }
    return {
      cap: Math.max(1, picoPasado - 1), conHistorial: true,
      motivo: `Las implementaciones terminadas con fecha objetivo se demoraron aun con poca carga; se sugiere quedar 1 por debajo de tu máximo histórico (${picoPasado}).`,
    };
  }
  return {
    cap: picoPasado, conHistorial: false,
    motivo: `Es el máximo de clientes simultáneos que ya manejaron (${picoPasado}). Cuando haya más implementaciones terminadas con fecha objetivo, se va a afinar midiendo atrasos.`,
  };
}

function _dispInicioDefault() {
  const hoy = _dispHoy();
  return window._dispZoom === 'anio'
    ? new Date(hoy.getFullYear(), 0, 1)
    : _dispSumarMeses(hoy, -1);
}

// ────────── Datos por cliente ──────────

// Clientes de implementación con sus fechas y estado
function _dispDatos() {
  const hoy = _dispHoy();
  const idsConTareas = new Set(implTareas.map(t => t.cliente_id));
  const lista = (typeof clientes !== 'undefined' ? clientes : [])
    .filter(c => idsConTareas.has(c.id) && (c.area === 'impl' || c.area === 'soporte'));

  const itemsClientes = lista.map(c => {
    const tareas = implTareas.filter(t => t.cliente_id === c.id);
    const total = tareas.length;
    const completas = tareas.filter(t => t.estado === 'completada').length;
    const progreso = total > 0 ? Math.round((completas / total) * 100) : 0;
    const finalizado = total > 0 && completas === total;
    const vencidas = tareas.filter(isTareaVencida).length;

    // Inicio: fecha de inicio del proyecto, o la primera fecha calculada de las tareas
    let inicio = _parseDate(c.fecha_inicio_implementacion);
    if (!inicio) {
      const fechas = tareas.map(t => _parseDate(t.fecha_inicio_calc)).filter(Boolean);
      if (fechas.length) inicio = new Date(Math.min(...fechas));
    }
    // Fin: última fecha estimada de lo pendiente; si ya terminó, última completada
    let fin = null;
    const pend = tareas.filter(t => t.estado !== 'completada').map(t => _parseDate(t.fecha_estimada)).filter(Boolean);
    if (pend.length) fin = new Date(Math.max(...pend));
    else {
      const comp = tareas.map(t => _parseDate(t.fecha_completada) || _parseDate(t.fecha_estimada)).filter(Boolean);
      if (comp.length) fin = new Date(Math.max(...comp));
    }

    // Si lo que falta ya venció, el fin se proyecta desde hoy con las duraciones de las tareas pendientes
    // (así la barra, la carga por mes y el simulador usan la fecha realista y no la vieja)
    if (!(total > 0 && completas === total)) {
      const etaP = calcularETACliente(tareas);
      if (etaP && etaP.fechaFin) {
        const f = new Date(etaP.fechaFin); f.setHours(0, 0, 0, 0);
        if (!fin || f > fin) fin = f;
      }
    }

    // Estado: atrasado / en tiempo / adelantado (compara avance real vs. avance esperado por tiempo)
    let estado = 'tiempo';
    let pctEsperado = null;
    if (finalizado) {
      estado = 'finalizado';
    } else if (inicio && inicio > hoy) {
      // Todavía no arrancó: es una reserva (ocupa lugar pero no está en curso)
      estado = 'porArrancar';
    } else if (inicio && fin) {
      const totalDias = Math.max(1, _dispDias(inicio, fin));
      pctEsperado = Math.max(0, Math.min(100, Math.round((_dispDias(inicio, hoy) / totalDias) * 100)));
      const diff = progreso - pctEsperado;
      const sem = calcularSemaforo(c, tareas, progreso);
      // Tarde = el fin calculado pasa de la fecha objetivo (si la tiene), o el avance viene bien por debajo de lo esperado
      const objetivo = _parseDate(c.fecha_fin_objetivo);
      if (diff <= -10 || sem.color === 'var(--red)' || (objetivo && fin > objetivo)) estado = 'atrasado';
      else if (diff >= 10) estado = 'adelantado';
    }
    return { c, total, completas, progreso, finalizado, vencidas, inicio, fin, estado, pctEsperado,
             sinFechas: !(inicio && fin) };
  });
  // Los proyectos (Implementación → Proyectos) cuentan como un cliente más: ocupan 1 lugar
  // mientras están en curso, en los meses que van de su inicio a su fin.
  return itemsClientes.concat(_dispProyectoItems());
}

// Un proyecto = una fila del Gantt y 1 lugar de la capacidad (igual que un cliente en implementación).
// Fin = última fecha de sus tareas; si todavía no tiene tareas, la fecha objetivo. Si está en curso y
// tiene tareas vencidas sin cerrar, el fin se proyecta hasta hoy (sigue ocupando lugar).
function _dispProyectoItems() {
  if (typeof proyectos === 'undefined' || typeof proyCalc !== 'function') return [];
  const hoy = _dispHoy();
  return proyectos.map(p => {
    const k = proyCalc(p);
    const cli = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === p.cliente_id);
    const finalizado = p.estado === 'finalizado';
    let fin = k.fin || k.objetivo || null;
    if (!finalizado && fin && fin < hoy && k.completas < k.total) fin = hoy;
    return {
      c: { id: p.id, nombre: '🧩 ' + p.nombre + (cli ? ' · ' + cli.nombre : '') },
      esProyecto: true,
      total: k.total, completas: k.completas, progreso: k.progreso, finalizado, vencidas: k.vencidas,
      inicio: k.inicio, fin, estado: k.estado, pctEsperado: null,
      sinFechas: !(k.inicio && fin),
    };
  });
}

// Cuántos "lugares" de la capacidad están ocupados un día dado: cada cliente
// activo ocupa 1, y la Estructuración interna ocupa 1 más mientras haya al
// menos una tarea (pendiente o en curso) ese día.
function _dispCargaDia(items, dia) {
  let n = 0;
  for (const it of items) {
    if (it.inicio && it.fin && it.inicio <= dia && dia <= it.fin) n++;
  }
  if (_dispEstructActiva(dia)) n++;
  return n;
}

// ────────── Estructuración interna ──────────
// Trabajo del equipo que no es implementar un cliente (soporte, proyectos
// internos, mejoras de gestión, capacitaciones). Se ve como una fila más en el
// Gantt y resta 1 lugar de la capacidad mientras tenga tareas activas.
// Tabla: impl_estructuracion (migración 048).
let estructTareas = [];
let _estructError = false;   // true si la tabla todavía no existe (falta correr la migración)

const ESTRUCT_TIPOS = {
  soporte:      { ico: '🎧', label: 'Soporte' },
  proyecto:     { ico: '🧩', label: 'Proyecto' },
  mejora:       { ico: '🛠️', label: 'Mejora' },
  capacitacion: { ico: '🎓', label: 'Capacitación' },
};
const ESTRUCT_ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' };

function _estructMap(r) {
  return { id: r.id, nombre: r.nombre, tipo: r.tipo, estado: r.estado, detalle: r.detalle || '',
           inicio: _parseDate(r.fecha_inicio), fin: _parseDate(r.fecha_fin),
           fi: r.fecha_inicio, ff: r.fecha_fin };
}

// Colores para distinguir una tarea de la siguiente en el Gantt y en la lista.
// Se asignan por orden de fecha, así dos tareas consecutivas nunca comparten color.
// Tonos apagados (grisáceos) para que la barra pase más desapercibida que las de los clientes
const ESTRUCT_COLORES = ['#8582a0', '#7993a6', '#789c93', '#a08596', '#a59a76', '#808bab'];
function _estructOrdenadas() {
  return [...estructTareas].sort((a, b) => (a.inicio - b.inicio) || String(a.id).localeCompare(String(b.id)));
}
function _estructColor(t) {
  const i = _estructOrdenadas().findIndex(x => x.id === t.id);
  return ESTRUCT_COLORES[(i < 0 ? 0 : i) % ESTRUCT_COLORES.length];
}

// ¿Hay estructuración interna activa ese día? (las "hechas" no ocupan lugar)
function _dispEstructActiva(dia) {
  return estructTareas.some(t => t.estado !== 'hecha' && t.inicio && t.fin && t.inicio <= dia && dia <= t.fin);
}

async function cargarEstructuracion() {
  try {
    const rows = await dbList('impl_estructuracion', { orderBy: 'fecha_inicio' });
    estructTareas = rows.map(_estructMap);
    _estructError = false;
  } catch (e) {
    console.warn('Estructuración interna: no se pudo cargar (¿falta correr la migración 048?)', e);
    _estructError = true;
  }
  if (window._implDispAbierta && typeof renderImplementacion === 'function') renderImplementacion();
}

window.addEventListener('app-ready', () => {
  cargarEstructuracion();
  try {
    sb().channel('impl-estructuracion-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impl_estructuracion' }, () => cargarEstructuracion())
      .subscribe();
  } catch (e) { /* sin tiempo real, igual se carga al abrir */ }
});

// Modal para agregar / editar una tarea
function estructAbrirForm(id) {
  cerrarEstructForm();
  const t = id ? estructTareas.find(x => x.id === id) : null;
  const hoyISO = _toISODate(_dispHoy());
  const overlay = document.createElement('div');
  overlay.id = 'estruct-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:460px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0">${t ? 'Editar tarea' : 'Nueva tarea de estructuración interna'}</div>
        <button onclick="cerrarEstructForm()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Nombre</label>
      <input type="text" id="estruct-nombre" maxlength="120" placeholder="Ej: Armar manual de onboarding" value="${t ? _dispEsc(t.nombre) : ''}" style="width:100%;margin:4px 0 12px">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Tipo</label>
      <select id="estruct-tipo" style="width:100%;margin:4px 0 12px">
        ${Object.entries(ESTRUCT_TIPOS).map(([k, v]) => `<option value="${k}" ${(t ? t.tipo : 'proyecto') === k ? 'selected' : ''}>${v.ico} ${v.label}</option>`).join('')}
      </select>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Detalle <span style="font-weight:400;color:var(--text3)">(opcional)</span></label>
      <textarea id="estruct-detalle" rows="3" placeholder="Explicá de qué se trata, qué incluye, quién participa..." style="width:100%;margin:4px 0 12px;resize:vertical">${t ? _dispEsc(t.detalle) : ''}</textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:var(--text2)">Fecha de inicio</label>
          <input type="date" id="estruct-ini" value="${t ? t.fi : hoyISO}" style="width:100%;margin-top:4px"></div>
        <div><label style="font-size:12px;font-weight:600;color:var(--text2)">Fecha de fin</label>
          <input type="date" id="estruct-fin" value="${t ? t.ff : hoyISO}" style="width:100%;margin-top:4px"></div>
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Estado</label>
      <select id="estruct-estado" style="width:100%;margin:4px 0 18px">
        ${Object.entries(ESTRUCT_ESTADOS).map(([k, v]) => `<option value="${k}" ${(t ? t.estado : 'pendiente') === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-secondary" onclick="cerrarEstructForm()">Cancelar</button>
        <button class="btn-primary" onclick="estructGuardar(${t ? `'${t.id}'` : 'null'})">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('estruct-nombre')?.focus();
}
function cerrarEstructForm() { document.getElementById('estruct-overlay')?.remove(); }

async function estructGuardar(id) {
  const nombre = document.getElementById('estruct-nombre').value.trim();
  const tipo   = document.getElementById('estruct-tipo').value;
  const ini    = document.getElementById('estruct-ini').value;
  const fin    = document.getElementById('estruct-fin').value;
  const estado = document.getElementById('estruct-estado').value;
  const detalle = document.getElementById('estruct-detalle').value.trim();
  if (!nombre) { toast('Poné un nombre para la tarea.'); return; }
  if (!ini || !fin) { toast('Completá las fechas de inicio y fin.'); return; }
  if (fin < ini) { toast('La fecha de fin no puede ser anterior a la de inicio.'); return; }
  try {
    const fila = { nombre, tipo, fecha_inicio: ini, fecha_fin: fin, estado, detalle: detalle || null };
    if (id) await dbUpdate('impl_estructuracion', id, { ...fila, updated_at: new Date().toISOString() });
    else    await dbInsert('impl_estructuracion', { ...fila, creado_por: (typeof getCurrentUserName === 'function' ? getCurrentUserName() : null) });
    cerrarEstructForm();
    toast(id ? 'Tarea actualizada.' : 'Tarea agregada.');
    await cargarEstructuracion();
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar. ¿Corriste las migraciones 048 y 049 en Supabase?');
  }
}

async function estructCambiarEstado(id, estado) {
  try {
    await dbUpdate('impl_estructuracion', id, { estado, updated_at: new Date().toISOString() });
    await cargarEstructuracion();
  } catch (e) { toast('No se pudo cambiar el estado.'); }
}

async function estructEliminar(id) {
  const t = estructTareas.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${t ? t.nombre : 'esta tarea'}"?`)) return;
  try {
    await dbDelete('impl_estructuracion', id);
    await cargarEstructuracion();
  } catch (e) { toast('No se pudo eliminar.'); }
}

// Sección de abajo del Gantt: lista de tareas + botón para agregar
function _estructSeccionHtml() {
  const orden = _estructOrdenadas().sort((a, b) =>
    (a.estado === 'hecha') - (b.estado === 'hecha') || a.inicio - b.inicio);
  const activas = estructTareas.filter(t => t.estado !== 'hecha').length;
  const fila = (t) => {
    const tp = ESTRUCT_TIPOS[t.tipo] || { ico: '•', label: t.tipo };
    return `
      <div class="estruct-fila ${t.estado === 'hecha' ? 'estruct-fila--hecha' : ''}">
        <span class="estruct-tipo" title="${tp.label}"><i class="estruct-color" style="background:${_estructColor(t)}"></i>${tp.ico} ${tp.label}</span>
        <span class="estruct-nombre">${_dispEsc(t.nombre)}${t.detalle ? `<small class="estruct-detalle">${_dispEsc(t.detalle)}</small>` : ''}</span>
        <span class="estruct-fechas">${_dispFmt(t.inicio)} → ${_dispFmt(t.fin)}</span>
        <select class="estruct-estado estruct-estado--${t.estado}" onchange="estructCambiarEstado('${t.id}', this.value)">
          ${Object.entries(ESTRUCT_ESTADOS).map(([k, v]) => `<option value="${k}" ${t.estado === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <span class="estruct-acc">
          <button class="btn-sm" onclick="estructAbrirForm('${t.id}')" title="Editar">✎</button>
          <button class="btn-sm" onclick="estructEliminar('${t.id}')" title="Eliminar">🗑</button>
        </span>
      </div>`;
  };
  return `
    <div class="card estruct-card" id="estruct-seccion">
      <div class="estruct-head">
        <div>
          <div class="card-title" style="margin:0">🛠️ Estructuración interna</div>
          <div class="estruct-sub">Trabajo del equipo que no es implementar un cliente (soporte, proyectos, mejoras, capacitaciones). Mientras haya tareas pendientes o en curso, ocupa <b>1 lugar</b> de la capacidad y se ve en el Gantt.${activas ? ` Hoy hay <b>${activas}</b> activa${activas !== 1 ? 's' : ''}.` : ''}</div>
        </div>
        <button class="btn-primary" onclick="estructAbrirForm()">+ Agregar tarea</button>
      </div>
      ${_estructError
        ? '<div class="estruct-vacio">No se pudo cargar. Falta correr la migración <b>048_impl_estructuracion.sql</b> en Supabase.</div>'
        : orden.length === 0
          ? '<div class="estruct-vacio">Todavía no hay tareas. Agregá la primera para ver cuánto tiempo nos lleva la estructuración interna.</div>'
          : `<div class="estruct-lista">${orden.map(fila).join('')}</div>`}
    </div>`;
}

// Pico de clientes simultáneos en un mes (con un cliente extra opcional: simulación)
function _dispPicoMes(items, primerDia, extra) {
  const ultimo = new Date(primerDia.getFullYear(), primerDia.getMonth() + 1, 0);
  let pico = 0;
  for (let d = new Date(primerDia); d <= ultimo; d = _addDays(d, 1)) {
    let n = _dispCargaDia(items, d);
    if (extra && extra.inicio <= d && d <= extra.fin) n++;
    if (n > pico) pico = n;
  }
  return pico;
}

// ── Capacidad según las ausencias del equipo ──
// La capacidad base (4 por defecto) corresponde a los 2 implementadores trabajando. Cuando alguien de
// Implementación falta, o baja a cubrir Soporte, esa capacidad baja en proporción (ver equipo-ausencias.js).
function _dispCapDia(cap, dia) {
  if (typeof ausCoberturaDia !== 'function' || typeof ausencias === 'undefined' || !ausencias.length) return cap;
  const c = ausCoberturaDia(_toISODate(dia));
  return Math.max(0, Math.round(cap * c.implDisp / AUS_IMPL.length));
}

// Día más ajustado de un mes: carga, capacidad de ese día y lugares libres (puede ser negativo).
// `extra` es un cliente simulado opcional.
function _dispMesInfo(items, primerDia, extra, cap) {
  const ultimo = new Date(primerDia.getFullYear(), primerDia.getMonth() + 1, 0);
  let peor = null, capMin = cap;
  for (let d = new Date(primerDia); d <= ultimo; d = _addDays(d, 1)) {
    let n = _dispCargaDia(items, d);
    if (extra && extra.inicio <= d && d <= extra.fin) n++;
    const c = _dispCapDia(cap, d);
    if (c < capMin) capMin = c;
    const hol = c - n;
    if (!peor || hol < peor.libres || (hol === peor.libres && n > peor.pico)) peor = { pico: n, cap: c, libres: hol };
  }
  return { ...peor, capMin, reducida: capMin < cap };
}

// Por qué baja la capacidad en un mes: "falta Ignacio", "Matias cubre Soporte"
function _dispMotivoReduccion(primerDia, cap) {
  const ultimo = new Date(primerDia.getFullYear(), primerDia.getMonth() + 1, 0);
  const faltan = new Set(), cubren = new Set();
  for (let d = new Date(primerDia); d <= ultimo; d = _addDays(d, 1)) {
    if (_dispCapDia(cap, d) >= cap) continue;
    const c = ausCoberturaDia(_toISODate(d));
    c.implFalta.forEach(n => faltan.add(n.split(' ')[0]));
    c.cubren.forEach(n => cubren.add(n.split(' ')[0]));
  }
  const partes = [];
  if (faltan.size) partes.push('falta ' + [...faltan].join(' y '));
  if (cubren.size) partes.push([...cubren].join(' y ') + ' cubre Soporte');
  return partes.join(', ');
}

// Primera fecha (desde hoy) en la que entra un cliente de `dur` días sin pasar la capacidad
function _dispSugerirFecha(items, dur, cap) {
  const hoy = _dispHoy();
  for (let i = 0; i <= 730; i += 3) {
    const ini = _addDays(hoy, i);
    let ok = true;
    for (let k = 0; k < dur; k += 2) {
      const dk = _addDays(ini, k);
      if (_dispCargaDia(items, dk) + 1 > _dispCapDia(cap, dk)) { ok = false; break; }
    }
    if (ok) return ini;
  }
  return null;
}

// ────────── Controles ──────────

function dispSetZoom(z) {
  window._dispZoom = z;
  window._dispInicio = _dispInicioDefault();
  renderImplementacion();
}
function dispMover(dir) {
  const dias = DISP_ZOOM_DIAS[window._dispZoom];
  window._dispInicio = _addDays(window._dispInicio || _dispInicioDefault(), dir * dias);
  renderImplementacion();
}

// ────────── Deslizar el Gantt con el mouse / dedo / trackpad ──────────
// Arrastrar sobre el Gantt (o usar la rueda horizontal / Shift + rueda) mueve
// el rango de fechas día por día, sin tener que usar las flechas de arriba.
let _dispPan = null;      // { x0, base, pxDia } mientras se está arrastrando
let _dispRaf = null;

function _dispPxPorDia() {
  const m = document.querySelector('.disp-head .disp-months');
  return m ? m.clientWidth / DISP_ZOOM_DIAS[window._dispZoom] : 0;
}

function _dispRedibujar() {
  if (_dispRaf) return;
  _dispRaf = requestAnimationFrame(() => { _dispRaf = null; renderImplementacion(); });
}

// Se engancha a cada Gantt recién dibujado (el contenedor se reemplaza en cada render)
function dispInitPan() {
  const wrap = document.querySelector('.disp-wrap');
  if (!wrap) return;
  if (_dispPan) wrap.classList.add('disp-wrap--drag');

  wrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.disp-label, a, button, input')) return;   // nombres: siguen siendo clickeables
    // Si el Gantt tiene scroll horizontal propio (pantallas chicas), se usa ese
    if (wrap.scrollWidth > wrap.clientWidth + 2) return;
    _dispPan = { x0: e.clientX, base: new Date(window._dispInicio), pxDia: _dispPxPorDia() };
    wrap.classList.add('disp-wrap--drag');
  });

  // Rueda horizontal (trackpad) o Shift + rueda
  wrap.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (!horizontal) return;                       // la rueda vertical sigue scrolleando la página
    e.preventDefault();
    const px = _dispPxPorDia();
    if (!px) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    window._dispInicio = _addDays(window._dispInicio, Math.round(delta / px));
    _dispRedibujar();
  }, { passive: false });
}

// Movimiento y suelta: listeners globales, se registran una sola vez
document.addEventListener('pointermove', (e) => {
  if (!_dispPan || !_dispPan.pxDia) return;
  const dias = Math.round(-(e.clientX - _dispPan.x0) / _dispPan.pxDia);
  const nueva = _addDays(_dispPan.base, dias);
  if (+nueva !== +window._dispInicio) {
    window._dispInicio = nueva;
    _dispRedibujar();
  }
});
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => {
  if (!_dispPan) return;
  _dispPan = null;
  const w = document.querySelector('.disp-wrap');
  if (w) w.classList.remove('disp-wrap--drag');
}));
function dispHoy() {
  window._dispInicio = _dispInicioDefault();
  renderImplementacion();
}
function dispSetCapacidad(v) {
  const n = parseInt(v, 10);
  if (n && n > 0) localStorage.setItem('impl_disp_capacidad', String(n));
  renderImplementacion();
}
function dispUsarSugerida() {
  localStorage.removeItem('impl_disp_capacidad');
  renderImplementacion();
}
function dispToggleFin(on) {
  window._dispMostrarFin = !!on;
  renderImplementacion();
}
// Modal del simulador: fecha de inicio + duración del cliente nuevo
function dispAbrirSim() {
  cerrarDispSim();
  const terminadas = _dispDatos().filter(i => i.finalizado && i.inicio && i.fin);
  const durProm = terminadas.length
    ? Math.round(terminadas.reduce((s, i) => s + Math.max(1, _dispDias(i.inicio, i.fin)), 0) / terminadas.length)
    : 60;
  const sim = window._dispSim;
  const overlay = document.createElement('div');
  overlay.id = 'disp-sim-overlay';
  overlay.className = 'kb-modal-overlay kb-modal--open';
  overlay.onclick = (e) => { if (e.target === overlay) cerrarDispSim(); };
  overlay.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:440px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="card-title" style="margin:0">🧪 ¿Entra un cliente nuevo?</div>
        <button onclick="cerrarDispSim()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="font-size:12.5px;color:var(--text3);margin-bottom:16px;line-height:1.5">
        Elegí cuándo arrancaría y cuánto duraría. Te muestro en el Gantt si entra o si pasa la capacidad de ${_dispCapacidadManual() || DISP_CAPACIDAD_DEFAULT} clientes.
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Fecha de inicio</label>
      <input type="date" id="disp-sim-inicio" value="${sim ? sim.inicio : ''}" style="width:100%;margin:4px 0 12px">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Duración (días)</label>
      <input type="number" id="disp-sim-dur" min="1" value="${sim ? sim.dur : durProm}" style="width:100%;margin:4px 0 6px">
      <div style="font-size:11.5px;color:var(--text3);margin-bottom:18px">
        Duración promedio de tus implementaciones${terminadas.length ? ' terminadas' : ' (estándar)'}: ${durProm} días
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-secondary" onclick="cerrarDispSim()">Cancelar</button>
        <button class="btn-primary" onclick="dispSimular()">Simular</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
function cerrarDispSim() {
  const o = document.getElementById('disp-sim-overlay');
  if (o) o.remove();
}

function dispSimular() {
  const ini = document.getElementById('disp-sim-inicio').value;
  const dur = parseInt(document.getElementById('disp-sim-dur').value, 10);
  if (!ini || !dur || dur < 1) { toast('Completá la fecha de inicio y la duración.'); return; }
  cerrarDispSim();
  window._dispSim = { inicio: ini, dur };
  // Si la simulación cae fuera del rango visible, mover la vista para mostrarla
  const d = _parseDate(ini);
  const base = window._dispInicio || _dispInicioDefault();
  const fin = _addDays(base, DISP_ZOOM_DIAS[window._dispZoom]);
  if (d < base || d >= fin) window._dispInicio = _dispPrimeroDeMes(d);
  renderImplementacion();
}
function dispLimpiarSim() {
  window._dispSim = null;
  renderImplementacion();
}
function dispUsarFecha(iso) {
  window._dispSim = { inicio: iso, dur: (window._dispSim && window._dispSim.dur) || 60 };
  const d = _parseDate(iso);
  window._dispInicio = _dispPrimeroDeMes(d);
  renderImplementacion();
}

// ────────── Render ──────────

function renderDisponibilidadImpl() {
  const cont = document.getElementById('impl-disp-body');
  if (!cont) return;
  const hoy = _dispHoy();
  if (!window._dispInicio) window._dispInicio = _dispInicioDefault();
  // El rango arranca en cualquier día (se puede deslizar día por día)
  const rIni = new Date(window._dispInicio.getFullYear(), window._dispInicio.getMonth(), window._dispInicio.getDate());
  const totalDias = DISP_ZOOM_DIAS[window._dispZoom];
  const rFin = _addDays(rIni, totalDias);                // exclusivo

  const todos = _dispDatos();
  const conFechas = todos.filter(i => !i.sinFechas);

  // Capacidad máxima de implementaciones simultáneas: 4 (la real del equipo).
  // Si alguien la cambia a mano, se guarda en este navegador.
  const cap = _dispCapacidadManual() || DISP_CAPACIDAD_DEFAULT;
  const sinFechas = todos.filter(i => i.sinFechas && !i.finalizado);
  // En el Gantt solo se dibujan los clientes en curso (los finalizados no figuran,
  // aunque sí se usan por detrás para calcular la carga histórica y la capacidad).
  const visibles = conFechas
    .filter(i => !i.finalizado)
    .sort((a, b) => a.inicio - b.inicio);

  // Simulación
  let sim = null;
  if (window._dispSim) {
    const ini = _parseDate(window._dispSim.inicio);
    sim = { inicio: ini, fin: _addDays(ini, window._dispSim.dur - 1), dur: window._dispSim.dur };
  }

  // Meses del rango (el primero y el último pueden verse cortados, porque el rango
  // arranca en cualquier día). El pico de carga siempre se calcula sobre el mes completo.
  const meses = [];
  let cur = new Date(rIni);
  while (cur < rFin) {
    const sigMes = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const hasta = sigMes < rFin ? sigMes : rFin;
    const dias = _dispDias(cur, hasta);
    const ini = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const info = _dispMesInfo(conFechas, ini, null, cap);
    const infoSim = sim ? _dispMesInfo(conFechas, ini, sim, cap) : info;
    meses.push({ ini, dias, pico: info.pico, cap: info.cap, libres: info.libres, reducida: info.reducida, capMin: info.capMin,
                 libresSim: infoSim.libres, w: (dias / totalDias) * 100 });
    cur = hasta;
  }

  // KPIs
  const activos = conFechas.filter(i => !i.finalizado && i.estado !== 'porArrancar');
  const porArr = conFechas.filter(i => i.estado === 'porArrancar');
  const atr = activos.filter(i => i.estado === 'atrasado');
  const tie = activos.filter(i => i.estado === 'tiempo');
  const ade = activos.filter(i => i.estado === 'adelantado');
  // Próximo mes con lugar (desde el mes actual)
  let proxLibre = null;
  for (let m = 0; m < 24 && !proxLibre; m++) {
    const ini = _dispSumarMeses(_dispPrimeroDeMes(hoy), m);
    const info = _dispMesInfo(conFechas, ini, null, cap);
    if (info.libres > 0) proxLibre = { ini, libres: info.libres };
  }

  // Duración promedio de implementaciones terminadas (sugerida en el simulador)
  const terminadas = conFechas.filter(i => i.finalizado);
  const durProm = terminadas.length
    ? Math.round(terminadas.reduce((s, i) => s + Math.max(1, _dispDias(i.inicio, i.fin)), 0) / terminadas.length)
    : 60;

  // Posición de una barra en porcentaje del rango
  const pos = (d0, d1) => {
    const a = d0 < rIni ? rIni : d0;
    const bFin = _addDays(d1, 1);
    const b = bFin > rFin ? rFin : bFin;
    if (b <= a) return null;
    return {
      left:  (_dispDias(rIni, a) / totalDias) * 100,
      width: (_dispDias(a, b) / totalDias) * 100,
      cortaIzq: d0 < rIni,
      cortaDer: bFin > rFin,
    };
  };

  // Ancho de la parte "fuerte" (avance) dentro de la parte VISIBLE de la barra.
  // El avance se mide sobre la barra completa (aunque esté cortada por el borde
  // del rango), para que no se estire al deslizar el Gantt.
  const fillPct = (it, p) => {
    const leftFull  = (_dispDias(rIni, it.inicio) / totalDias) * 100;
    const widthFull = (_dispDias(it.inicio, _addDays(it.fin, 1)) / totalDias) * 100;
    const fillEnd   = leftFull + widthFull * (it.progreso / 100);
    const visible   = Math.max(0, Math.min(fillEnd, p.left + p.width) - p.left);
    return Math.max(0, Math.min(100, (visible / p.width) * 100)).toFixed(2);
  };

  const hoyPct = (hoy >= rIni && hoy < rFin) ? (_dispDias(rIni, hoy) / totalDias) * 100 : null;
  const rUlt = _addDays(rFin, -1);
  const rangoTxt = `${DISP_MESES[rIni.getMonth()]} ${rIni.getFullYear()} – ${DISP_MESES[rUlt.getMonth()]} ${rUlt.getFullYear()}`;

  const ESTADO = {
    atrasado:   { cls: 'atrasado',   txt: '🔴 Atrasado' },
    tiempo:     { cls: 'tiempo',     txt: '🟢 En tiempo' },
    adelantado: { cls: 'adelantado', txt: '🔵 Adelantado' },
    finalizado: { cls: 'finalizado', txt: '⚪ Finalizado' },
    porArrancar: { cls: 'porarrancar', txt: '⏳ Por arrancar' },
  };

  // ── Filas ──
  const fila = (it) => {
    const p = pos(it.inicio, it.fin);
    const e = ESTADO[it.estado];
    const tip = `${it.c.nombre}\nInicio: ${_dispFmt(it.inicio)} · Fin: ${_dispFmt(it.fin)}\nAvance: ${it.progreso}%`
      + (it.pctEsperado != null ? ` (esperado ${it.pctEsperado}%)` : '')
      + `\n${e.txt}${it.vencidas ? ` · ${it.vencidas} tarea(s) vencida(s)` : ''}`;
    const barra = p ? `
      <div class="disp-bar disp-bar--${e.cls} ${p.cortaIzq ? 'disp-bar--cortaIzq' : ''} ${p.cortaDer ? 'disp-bar--cortaDer' : ''}"
           style="left:${p.left}%;width:${p.width}%" title="${_dispEsc(tip)}">
        <div class="disp-bar__fill" style="width:${fillPct(it, p)}%"></div>
        <span class="disp-bar__txt">${it.estado === 'porArrancar' ? 'Por arrancar' : it.progreso + '%'}</span>
      </div>` : '';
    return `
      <div class="disp-row">
        <div class="disp-label" onclick="${it.esProyecto ? 'dispAbrirProyecto' : 'dispAbrirCliente'}('${it.c.id}')" title="Abrir ${_dispEsc(it.c.nombre)}">
          <span class="disp-label__dot disp-dot--${e.cls}"></span>
          <span class="disp-label__name">${_dispEsc(it.c.nombre)}</span>
          <span class="disp-label__sub">${_dispFmt(it.inicio)} → ${_dispFmt(it.fin)}</span>
        </div>
        <div class="disp-track">${barra}</div>
      </div>`;
  };

  // Fila "Estructuración Interna": un tramo por tarea, como si fuera un cliente más
  const estructActivas = estructTareas.filter(t => t.estado !== 'hecha').length;
  // UNA sola barra: se parte en tramos cada vez que empieza o termina una tarea.
  // Cada tramo toma el color de su tarea (así se nota dónde termina una y empieza
  // la otra). Si dos tareas coinciden en fechas, ese tramo muestra a las dos
  // juntas ("A + B") con rayas de sus colores. Donde no hay tareas, queda vacío.
  const estructAlto = 48;
  const cortes = [...new Set(estructTareas.flatMap(t => [+t.inicio, +_addDays(t.fin, 1)]))].sort((a, b) => a - b);
  const estructTramos = cortes.slice(0, -1).map((c0, i) => {
    const a = new Date(c0), bExcl = new Date(cortes[i + 1]), b = _addDays(bExcl, -1);
    const activas = _estructOrdenadas().filter(t => t.inicio <= a && t.fin >= b);
    if (!activas.length) return '';
    const p = pos(a, b);
    if (!p) return '';
    const colores = activas.map(_estructColor);
    const fondo = colores.length === 1
      ? colores[0]
      : `repeating-linear-gradient(45deg, ${colores.map((c, k) => `${c} ${k * 9}px ${(k + 1) * 9}px`).join(', ')})`;
    const todasHechas = activas.every(t => t.estado === 'hecha');
    const tip = activas.map(t => {
      const tp = ESTRUCT_TIPOS[t.tipo] || { ico: '•', label: t.tipo };
      return `${t.nombre}\n${tp.label} · ${ESTRUCT_ESTADOS[t.estado]} · ${_dispFmt(t.inicio)} → ${_dispFmt(t.fin)}`
        + (t.detalle ? `\n${t.detalle}` : '');
    }).join('\n\n');
    return `<div class="disp-bar disp-bar--interna ${p.cortaIzq ? 'disp-bar--cortaIzq' : ''} ${p.cortaDer ? 'disp-bar--cortaDer' : ''}"
                 style="left:calc(${p.left}% + 1px);width:calc(${p.width}% - 2px);background:${fondo};${todasHechas ? 'opacity:.4;' : ''}" title="${_dispEsc(tip)}">
              <span class="disp-bar__txt">${activas.map(t => _dispEsc(t.nombre)).join(' + ')}</span></div>`;
  }).join('');
  const estructFila = `
      <div class="disp-row disp-row--interna">
        <div class="disp-label" onclick="document.getElementById('estruct-seccion')?.scrollIntoView({behavior:'smooth',block:'start'})"
             title="Ver y editar las tareas de Estructuración interna (abajo)">
          <span class="disp-label__dot disp-dot--interna"></span>
          <span class="disp-label__name">Estructuración Interna</span>
          <span class="disp-label__sub">${estructActivas} tarea${estructActivas !== 1 ? 's' : ''} activa${estructActivas !== 1 ? 's' : ''}</span>
        </div>
        <div class="disp-track" style="height:${estructAlto}px">${estructTramos}</div>
      </div>`;

  // Fila fantasma del simulador
  let simFila = '';
  if (sim) {
    const p = pos(sim.inicio, sim.fin);
    simFila = `
      <div class="disp-row disp-row--sim">
        <div class="disp-label">
          <span class="disp-label__dot disp-dot--sim"></span>
          <span class="disp-label__name">Cliente nuevo (simulado)</span>
          <span class="disp-label__sub">${_dispFmt(sim.inicio)} → ${_dispFmt(sim.fin)}</span>
        </div>
        <div class="disp-track">${p ? `<div class="disp-bar disp-bar--sim ${p.cortaIzq ? 'disp-bar--cortaIzq' : ''} ${p.cortaDer ? 'disp-bar--cortaDer' : ''}" style="left:${p.left}%;width:${p.width}%"><span class="disp-bar__txt">Simulado</span></div>` : ''}</div>
      </div>`;
  }

  // ── Resultado del simulador ──
  let simMsg = '';
  if (sim) {
    // meses (de TODO el horizonte de la simulación) donde se pasaría la capacidad
    const llenos = [];
    let m = _dispPrimeroDeMes(sim.inicio);
    const ultimoMes = _dispPrimeroDeMes(sim.fin);
    while (m <= ultimoMes) {
      const info = _dispMesInfo(conFechas, m, sim, cap);
      if (info.libres < 0) llenos.push(`${DISP_MESES[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`);
      m = _dispSumarMeses(m, 1);
    }
    if (llenos.length === 0) {
      simMsg = `<div class="disp-simmsg disp-simmsg--ok">✅ <b>Entra sin problemas.</b> Un cliente nuevo del ${_dispFmt(sim.inicio)} al ${_dispFmt(sim.fin)} no supera la capacidad (${cap} clientes simultáneos, o menos los días que falte alguien del equipo).</div>`;
    } else {
      const sug = _dispSugerirFecha(conFechas, sim.dur, cap);
      simMsg = `<div class="disp-simmsg disp-simmsg--no">⚠️ <b>Se pasa de la capacidad</b> (${cap}) en: ${llenos.join(', ')}.
        ${sug ? `<br>Primera fecha en la que sí entra: <b>${_dispFmt(sug)}</b>
          <button class="btn-sm" style="margin-left:8px" onclick="dispUsarFecha('${_toISODate(sug)}')">Usar esta fecha</button>` : '<br>No encontré una fecha con lugar en los próximos 2 años.'}</div>`;
    }
  }

  cont.innerHTML = `
    <!-- Leyenda: para qué sirve y cómo se usa -->
    <div class="disp-ayuda">
      <div class="disp-ayuda__ico">📅</div>
      <div class="disp-ayuda__txt">
        <span>Esta herramienta sirve para ver de un vistazo <b>cuándo arranca y termina cada implementación</b> y <b>en qué meses hay lugar para sumar clientes nuevos</b> (hasta ${cap} simultáneas).</span>
        <details class="disp-ayuda__det" ${window._dispAyudaAbierta ? 'open' : ''} ontoggle="window._dispAyudaAbierta = this.open">
          <summary>Cómo se usa</summary>
          <ol>
            <li><b>Mirá la fila "Carga del mes":</b> cada mes muestra cuántos clientes hay en paralelo sobre el máximo (ej: 3/${cap}). Verde = hay lugar, amarillo = queda uno, rojo = lleno.</li>
            <li><b>Capacidad máxima:</b> es el tope de implementaciones que el equipo puede llevar al mismo tiempo (hoy ${cap}). Se cambia en el campo <b>"Capacidad Máx. de clientes"</b> de los controles; con ese número se calculan los colores de "Carga del mes", el "Próximo mes con lugar" y el simulador. Se guarda en este navegador.</li>
            <li><b>Ausencias:</b> la capacidad baja sola los días en que falta un implementador (o baja a cubrir Soporte), según lo cargado en <b>Equipo → Ausencias</b>. Esos meses muestran 🏖️ y la capacidad reducida.</li>
            <li><b>Estructuración Interna:</b> la primera fila del Gantt muestra el tiempo que el equipo dedica a cosas que no son implementar un cliente (soporte, proyectos, mejoras, capacitaciones). Mientras haya tareas pendientes o en curso, <b>ocupa 1 lugar</b> de la capacidad, así ves la disponibilidad real. Las tareas se cargan y editan en la sección de abajo del Gantt.</li>
            <li><b>Proyectos:</b> los proyectos de la pestaña <b>Proyectos</b> (🧩) aparecen como una fila más y <b>ocupan 1 lugar</b> en los meses donde corren, igual que un cliente en implementación.</li>
            <li><b>Leé las barras:</b> cada fila es un cliente, de su inicio a su fin estimado. La parte oscura es el avance real; el color indica si va atrasado (rojo), en tiempo (verde) o adelantado (azul).</li>
            <li><b>Probá un cliente nuevo:</b> con <b>🧪 Simular cliente nuevo</b> elegís una fecha y una duración y te dice si entra o desde cuándo conviene arrancar.</li>
            <li><b>Navegá:</b> cambiá entre Trimestre, Semestre y Año. Para moverte en el tiempo <b>arrastrá el Gantt hacia los costados</b> (o usá las flechas ‹ › de arriba). Tocá el nombre de un cliente para abrirlo.</li>
          </ol>
        </details>
      </div>
    </div>

    <!-- KPIs -->
    <div class="disp-kpis">
      <div class="disp-kpi"><span>En implementación</span><b>${activos.length}</b></div>
      <div class="disp-kpi disp-kpi--atrasado"><span>Atrasados</span><b>${atr.length}</b><small>${atr.map(i => _dispEsc(i.c.nombre)).join(', ') || '—'}</small></div>
      <div class="disp-kpi disp-kpi--tiempo"><span>En tiempo</span><b>${tie.length}</b></div>
      <div class="disp-kpi disp-kpi--adelantado"><span>Adelantados</span><b>${ade.length}</b><small>${ade.map(i => _dispEsc(i.c.nombre)).join(', ') || '—'}</small></div>
      <div class="disp-kpi disp-kpi--libre"><span>Próximo mes con lugar</span>
        <b>${proxLibre ? DISP_MESES[proxLibre.ini.getMonth()] + ' ' + proxLibre.ini.getFullYear() : '—'}</b>
        <small>${proxLibre ? `${proxLibre.libres} lugar${proxLibre.libres !== 1 ? 'es' : ''} libre${proxLibre.libres !== 1 ? 's' : ''}` : 'Sin lugar en 2 años'}</small></div>
    </div>

    <!-- Controles -->
    <div class="disp-controles">
      <div class="disp-ctl-grupo">
        <button class="btn-sm" onclick="dispMover(-1)" title="Anterior">‹</button>
        <span class="disp-rango">${rangoTxt}</span>
        <button class="btn-sm" onclick="dispMover(1)" title="Siguiente">›</button>
        <button class="btn-sm" onclick="dispHoy()">Hoy</button>
      </div>
      <div class="impl-filter-segmented impl-filter-segmented--sm">
        <button class="filter-chip ${window._dispZoom === 'trimestre' ? 'active' : ''}" onclick="dispSetZoom('trimestre')">Trimestre</button>
        <button class="filter-chip ${window._dispZoom === 'semestre' ? 'active' : ''}" onclick="dispSetZoom('semestre')">Semestre</button>
        <button class="filter-chip ${window._dispZoom === 'anio' ? 'active' : ''}" onclick="dispSetZoom('anio')">Año</button>
      </div>
      <label class="disp-ctl-cap" title="Cuántos clientes pueden estar implementándose a la vez">
        Capacidad Máx. de clientes:
        <input type="number" min="1" max="50" value="${cap}" onchange="dispSetCapacidad(this.value)">
      </label>
      <button class="btn-sm disp-btn-sim" onclick="dispAbrirSim()" title="Probar si entra un cliente nuevo">🧪 Simular cliente nuevo</button>
    </div>

    ${(() => {
      const red = meses.filter(m => m.reducida);
      if (!red.length) return '';
      const chips = red.map(m => `<span class="disp-aus__chip"><b>${DISP_MESES[m.ini.getMonth()]}</b> baja a <b>${m.capMin}</b> <small>${_dispEsc(_dispMotivoReduccion(m.ini, cap))}</small></span>`).join('');
      return `<div class="disp-aus">
        <div class="disp-aus__ico">🏖️</div>
        <div class="disp-aus__txt">
          <div class="disp-aus__tit">Capacidad reducida por ausencias</div>
          <div class="disp-aus__chips">${chips}</div>
          <div class="disp-aus__sub">Se carga en Equipo → Ausencias.</div>
        </div>
      </div>`;
    })()}

    <!-- Resultado del simulador (solo cuando hay una simulación activa) -->
    ${sim ? `<div class="disp-simbar">
      <span class="disp-simbar__tit">🧪 Cliente nuevo simulado: ${_dispFmt(sim.inicio)} → ${_dispFmt(sim.fin)} (${sim.dur} días)</span>
      <span class="disp-simbar__acc">
        <button class="btn-sm" onclick="dispAbrirSim()">Editar</button>
        <button class="btn-sm" onclick="dispLimpiarSim()">Quitar</button>
      </span>
    </div>${simMsg}` : ''}

    <!-- Gantt -->
    <div class="disp-wrap">
      <div class="disp-inner">
        <div class="disp-head">
          <div class="disp-label disp-label--head">Cliente</div>
          <div class="disp-months">
            ${meses.map(m => `<div class="disp-month" style="width:${m.w}%">${m.w < 6 ? '' : DISP_MESES[m.ini.getMonth()] + ((m.ini.getMonth() === 0 || m === meses[0]) ? ` <small>${m.ini.getFullYear()}</small>` : '')}</div>`).join('')}
          </div>
        </div>

        <!-- Carga por mes -->
        <div class="disp-load">
          <div class="disp-label disp-label--head" title="Pico de clientes simultáneos en el mes / capacidad máxima">Carga del mes</div>
          <div class="disp-months">
            ${meses.map(m => {
              const libres = m.libres;
              const cls = libres <= 0 ? 'lleno' : libres === 1 ? 'justo' : 'libre';
              const pisa = sim && m.libresSim < 0 && m.libresSim < m.libres ? ' disp-cell--pisa' : '';
              const txt = libres <= 0 ? 'Lleno' : `${libres} libre${libres !== 1 ? 's' : ''}`;
              const aus = m.reducida ? ' 🏖️' : '';
              return `<div class="disp-cell disp-cell--${cls}${pisa}" style="width:${m.w}%" title="${m.pico} de ${m.cap} clientes simultáneos (día más ajustado del mes)${m.reducida ? ' · la capacidad baja por ausencias del equipo' : ''}">
                ${m.w < 6 ? '' : `<b>${m.pico}/${m.cap}${aus}</b><span>${txt}</span>`}</div>`;
            }).join('')}
          </div>
        </div>

        <div class="disp-body">
          <div class="disp-overlay">
            ${meses.map(m => `<div class="disp-vline" style="width:${m.w}%"></div>`).join('')}
            ${hoyPct !== null ? `<div class="disp-hoy" style="left:${hoyPct}%"><span>Hoy</span></div>` : ''}
          </div>
          ${simFila}
          ${visibles.length === 0 && !sim
            ? '<div class="disp-vacio">No hay implementaciones con fechas para mostrar.</div>'
            : visibles.map(fila).join('')}
          ${estructFila}
        </div>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="disp-leyenda">
      <span><i class="disp-dot--atrasado"></i> Atrasado (avance 10+ puntos por debajo de lo esperado)</span>
      <span><i class="disp-dot--tiempo"></i> En tiempo</span>
      <span><i class="disp-dot--adelantado"></i> Adelantado (10+ puntos por encima)</span>
      <span><i class="disp-dot--porarrancar"></i> Por arrancar (reserva: ocupa lugar pero todavía no empezó)</span>
      <span><i class="disp-dot--interna"></i> Estructuración interna (ocupa 1 lugar mientras haya tareas activas)</span>
      <span><i class="disp-dot--sim"></i> Simulado</span>
    </div>
    ${sinFechas.length ? `<div class="disp-sinfechas">Sin fechas para dibujar: ${sinFechas.map(i =>
      `<a onclick="${i.esProyecto ? 'dispAbrirProyecto' : 'dispAbrirCliente'}('${i.c.id}')">${_dispEsc(i.c.nombre)}</a>`).join(', ')}. Cargales la fecha de inicio (o tareas / fecha objetivo en un proyecto) para que aparezcan.</div>` : ''}

    <!-- Estructuración interna: tareas que el equipo carga a mano -->
    ${_estructSeccionHtml()}
  `;
  dispInitPan();
}
