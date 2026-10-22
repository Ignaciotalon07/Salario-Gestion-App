// proyectos.js — Implementación → pestaña "Proyectos"
// Trabajos puntuales para clientes que YA son de soporte (cambios que ellos pidieron).
// Cada proyecto tiene: lista de tareas (duración + fechas, sin predecesoras), fecha de
// inicio, fecha objetivo, fecha de fin calculada y porcentaje de avance.
// Un cliente tiene UN proyecto en curso a la vez: si pide más cosas, se le suman tareas.
// Mientras está en curso ocupa 1 lugar en Disponibilidad (ver implementacion-disponibilidad.js).
// Tablas: proyectos + proyecto_tareas (migración 060).

// ── Estado ────────────────────────────────────────────────────────────────────
let proyectos   = [];     // filas de `proyectos`
let proyTareas  = [];     // filas de `proyecto_tareas`
let _proyError  = false;  // true si las tablas todavía no existen (falta correr la 060)

window._implProyAbierta = window._implProyAbierta || false;  // ¿está abierta la pestaña Proyectos?
window._proyAbierto     = window._proyAbierto     || null;   // id del proyecto abierto (detalle)
window._proyEscala      = window._proyEscala      || 'dia';   // escala del Gantt: 'dia' | 'mes' | 'anio'
window._proyVista       = window._proyVista       || 'lista'; // vista de tareas en el detalle: 'lista' | 'gantt'

const PROY_ESTADOS_TAREA = { pendiente: 'Pendiente', en_progreso: 'En curso', completada: 'Completa' };
const PROY_ASESORES = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Daniel Ferro', 'Renzo Moretti', 'Alfredo Cesar'];

window.addEventListener('app-ready', () => { initProyectos(); });

async function initProyectos() {
  try {
    const [pr, ta] = await Promise.all([
      dbList('proyectos', { orderBy: 'created_at', ascending: false }),
      dbList('proyecto_tareas', { orderBy: 'orden', ascending: true }),
    ]);
    proyectos  = pr;
    proyTareas = ta;
    _proyError = false;
  } catch (e) {
    console.warn('Proyectos: no se pudieron cargar (¿falta correr la migración 060?)', e);
    _proyError = true;
  }
  _proyRefrescar();
  if (!_proyError) suscribirProyectos();
}

// Realtime: cambios de otros usuarios se reflejan al instante
function suscribirProyectos() {
  const aplicar = (lista, payload) => {
    const { eventType, new: n, old: o } = payload;
    if (eventType === 'DELETE') return lista.filter(x => x.id !== o.id);
    const i = lista.findIndex(x => x.id === n.id);
    if (i === -1) return [...lista, n];
    if (JSON.stringify(lista[i]) === JSON.stringify(n)) return lista;  // eco de un cambio propio ya aplicado
    const copia = [...lista]; copia[i] = n; return copia;
  };
  sb().channel('proyectos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos' }, (p) => {
      const antes = proyectos;
      proyectos = aplicar(proyectos, p);
      if (proyectos !== antes) _proyRefrescar();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proyecto_tareas' }, (p) => {
      const antes = proyTareas;
      proyTareas = aplicar(proyTareas, p);
      if (proyTareas !== antes) _proyRefrescar();
    })
    .subscribe();
}

// Redibuja lo que dependa de proyectos (la pestaña si está abierta y Disponibilidad si está abierta)
function _proyRefrescar() {
  if (typeof renderSaludoPanel === 'function') { try { renderSaludoPanel(); } catch (e) { /* el panel se rearma solo */ } }
  if ((window._implProyAbierta || window._implDispAbierta) && typeof renderImplementacion === 'function') {
    renderImplementacion();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _pEsc(s) { return (typeof escapeHtmlImpl === 'function') ? escapeHtmlImpl(s) : String(s == null ? '' : s); }
function _pHoy()  { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }
function _pFmt(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
function _pClienteDe(p)  { return (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === p.cliente_id) || null; }
function _pTareasDe(pid) { return proyTareas.filter(t => t.proyecto_id === pid).sort((a, b) => a.orden - b.orden); }
function _pFinTarea(inicioISO, dur) {
  const ini = _parseDate(inicioISO);
  return ini ? _toISODate(_addDays(ini, Math.max(1, dur) - 1)) : null;
}

// Cálculos de un proyecto: avance, fechas y estado
function proyCalc(p) {
  const ts = _pTareasDe(p.id);
  const total = ts.length;
  const completas = ts.filter(t => t.estado === 'completada').length;
  const progreso = total ? Math.round((completas / total) * 100) : 0;
  const hoy = _pHoy();

  const inicios = ts.map(t => _parseDate(t.fecha_inicio)).filter(Boolean);
  const fines   = ts.map(t => _parseDate(t.fecha_fin)).filter(Boolean);
  const inicio  = _parseDate(p.fecha_inicio) || (inicios.length ? new Date(Math.min(...inicios)) : null);
  const fin     = fines.length ? new Date(Math.max(...fines)) : null;
  const objetivo = _parseDate(p.fecha_fin_objetivo);
  const vencidas = ts.filter(t => t.estado !== 'completada' && _parseDate(t.fecha_fin) && _parseDate(t.fecha_fin) < hoy).length;

  let estado = 'tiempo';
  if (p.estado === 'finalizado') estado = 'finalizado';
  else if (inicio && inicio > hoy) estado = 'porArrancar';
  else if (vencidas > 0 || (objetivo && fin && fin > objetivo)) estado = 'atrasado';

  return { ts, total, completas, progreso, inicio, fin, objetivo, vencidas, estado };
}

const PROY_SEM = {
  tiempo:      { color: 'var(--green)', txt: 'En tiempo' },
  atrasado:    { color: 'var(--red)',   txt: 'Atrasado' },
  porArrancar: { color: 'var(--amber)', txt: 'Por arrancar' },
  finalizado:  { color: 'var(--text3)', txt: 'Finalizado' },
};

// ── Navegación ────────────────────────────────────────────────────────────────
function abrirProyectos() {
  window._implProyAbierta = true;
  window._implDispAbierta = false;
  window._implClienteAbierto = null;
  window._proyAbierto = null;
  renderImplementacion();
  window.scrollTo({ top: 0 });
}
function abrirProyecto(id) {
  window._implProyAbierta = true;
  window._proyAbierto = id;
  renderImplementacion();
  window.scrollTo({ top: 0 });
}
function cerrarProyecto() {
  window._proyAbierto = null;
  if (window._proyVolverADisp) {   // se abrió desde Disponibilidad: se vuelve ahí
    window._proyVolverADisp = false;
    window._implProyAbierta = false;
    window._implDispAbierta = true;
  }
  renderImplementacion();
  window.scrollTo({ top: 0 });
}
// Desde Disponibilidad: abrir un proyecto y volver ahí con el botón "Volver"
function dispAbrirProyecto(id) {
  window._proyVolverADisp = true;
  window._implDispAbierta = false;
  abrirProyecto(id);
}

// Llamado desde renderImplementacion() cuando la pestaña Proyectos está activa
function renderProyectosView() {
  const listaView = document.getElementById('impl-proy-view');
  const detView   = document.getElementById('impl-proy-detalle-view');
  const p = window._proyAbierto ? proyectos.find(x => x.id === window._proyAbierto) : null;
  if (window._proyAbierto && !p) window._proyAbierto = null;
  if (listaView) listaView.style.display = p ? 'none' : '';
  if (detView)   detView.style.display   = p ? '' : 'none';
  if (p) _renderProyDetalle(p); else _renderProyLista();
}

// ── Lista de proyectos (cards) ────────────────────────────────────────────────
window._proyFiltro = window._proyFiltro || '';

function setProyFiltro(v) { window._proyFiltro = (v || '').toLowerCase(); _renderProyLista(); }

// Lista de filas anchas: una por proyecto, con barra de avance grande. Arriba los que requieren
// atención (atrasados), después los que van en curso, los que todavía no arrancaron y, al final,
// los finalizados.
const PROY_ORDEN = ['atrasado', 'tiempo', 'porArrancar'];

function _renderProyLista() {
  const body = document.getElementById('proy-lista-body');
  if (!body) return;
  if (_proyError) {
    body.innerHTML = `<div class="card" style="text-align:center;padding:36px;color:var(--text3)">
      Todavía no está creada la base de Proyectos.<br>Falta correr la migración <b>060_proyectos.sql</b> en Supabase → SQL Editor.</div>`;
    return;
  }
  if (!proyectos.length) {
    body.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:40px">
      Todavía no hay proyectos. Tocá <b>＋ Nuevo proyecto</b> para armar uno para un cliente de soporte.</div>`;
    return;
  }
  const q = window._proyFiltro;
  const coincide = (p) => {
    if (!q) return true;
    const c = _pClienteDe(p);
    return (p.nombre || '').toLowerCase().includes(q) || (c && (c.nombre || '').toLowerCase().includes(q));
  };
  const buscador = document.getElementById('proy-buscador');
  if (buscador && buscador.value !== window._proyFiltro && document.activeElement !== buscador) buscador.value = window._proyFiltro;

  const items = proyectos.filter(coincide).map(p => ({ p, k: proyCalc(p) }));
  const activos = items.filter(i => i.k.estado !== 'finalizado')
    .sort((a, b) => (PROY_ORDEN.indexOf(a.k.estado) - PROY_ORDEN.indexOf(b.k.estado)) || ((a.k.fin || 0) - (b.k.fin || 0)));
  const fin = items.filter(i => i.k.estado === 'finalizado')
    .sort((a, b) => (b.k.fin || 0) - (a.k.fin || 0));

  const cuenta = (e) => items.filter(i => i.k.estado === e).length;
  const resumen = `
    <div class="proy-resumen">
      <span><i style="background:var(--red)"></i><b>${cuenta('atrasado')}</b> atrasados</span>
      <span><i style="background:var(--green)"></i><b>${cuenta('tiempo')}</b> en curso</span>
      <span><i style="background:var(--amber)"></i><b>${cuenta('porArrancar')}</b> por arrancar</span>
      <span><i style="background:var(--text3)"></i><b>${fin.length}</b> finalizados</span>
    </div>`;

  // El resumen (puntitos) va al lado del buscador, no dentro de la lista
  const host = document.getElementById('proy-resumen-host');
  if (host) host.innerHTML = resumen;
  body.innerHTML = `
    ${activos.length ? `<div class="proy-rows">${activos.map(i => _proyRow(i.p, i.k)).join('')}</div>`
      : `<div class="card" style="text-align:center;color:var(--text3);padding:28px">No hay proyectos activos${q ? ' que coincidan con la búsqueda' : ''}.</div>`}
    ${fin.length ? `
      <div class="proy-sec">✅ Finalizados — ${fin.length}</div>
      <div class="proy-rows proy-rows--fin">${fin.map(i => _proyRow(i.p, i.k)).join('')}</div>` : ''}`;
}

function _proyRow(p, k) {
  const c = _pClienteDe(p);
  const sem = PROY_SEM[k.estado];
  const color = k.estado === 'finalizado' ? 'var(--text3)' : k.progreso >= 80 ? 'var(--green)' : k.progreso >= 40 ? 'var(--amber)' : 'var(--red)';
  const proxima = k.ts.find(t => t.estado !== 'completada');
  const pasaObj = k.objetivo && k.fin && k.fin > k.objetivo;
  return `
    <div class="proy-row" style="--st:${sem.color}" onclick="abrirProyecto('${p.id}')">
      <div class="proy-row__main">
        <div class="av av-${_pEsc(c ? c.tipo : 'empresa')} proy-row__av">${_pEsc(c ? c.iniciales : '?')}</div>
        <div class="proy-row__txt">
          <div class="proy-row__cliente" title="${_pEsc(c ? c.nombre : '')}">${_pEsc(c ? c.nombre : 'Cliente eliminado')}</div>
          <div class="proy-row__nombre" title="${_pEsc(p.nombre)}">🧩 ${_pEsc(p.nombre)}</div>
          ${proxima && k.estado !== 'finalizado' ? `<div class="proy-row__prox" title="Próxima tarea">▸ ${_pEsc(proxima.tarea)}</div>` : ''}
        </div>
      </div>
      <div class="proy-row__avance">
        <div class="proy-row__bar"><i style="width:${k.progreso}%;background:${color}"></i></div>
        <div class="proy-row__pct"><b style="color:${color}">${k.progreso}%</b><span>${k.completas}/${k.total} tareas</span></div>
      </div>
      <div class="proy-row__fecha"><span>Inicio</span><b>${_pFmt(k.inicio)}</b></div>
      <div class="proy-row__fecha"><span>Objetivo</span><b>${_pFmt(k.objetivo)}</b></div>
      <div class="proy-row__fecha"><span>Fin calculado</span><b ${pasaObj ? 'style="color:var(--red)"' : ''}>${_pFmt(k.fin)}</b></div>
      <div class="proy-row__est">
        <span class="proy-row__badge" style="color:${sem.color};background:color-mix(in srgb, ${sem.color} 14%, transparent)">${sem.txt}</span>
        ${k.vencidas ? `<span class="proy-row__venc" title="Tareas vencidas">⏰ ${k.vencidas}</span>` : ''}
      </div>
      <div class="proy-row__go">›</div>
    </div>`;
}

// ── Nuevo proyecto (modal) ────────────────────────────────────────────────────
function abrirNuevoProyecto() {
  if (_proyError) { toastError('Falta correr la migración 060 en Supabase.'); return; }
  document.getElementById('proy-overlay')?.remove();
  const lista = (typeof clientes !== 'undefined' ? clientes : [])
    .filter(c => c.area !== 'impl')
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const hoyISO = _toISODate(_pHoy());
  const ov = document.createElement('div');
  ov.id = 'proy-overlay';
  ov.className = 'kb-modal-overlay kb-modal--open';
  ov.innerHTML = `
    <div class="kb-modal-sheet proy-modal" onclick="event.stopPropagation()">
      <div class="proy-modal__head">
        <div class="proy-modal__ico">🧩</div>
        <div>
          <div class="proy-modal__tit">Nuevo proyecto</div>
          <div class="proy-modal__sub">Cambios puntuales para un cliente de soporte</div>
        </div>
        <button class="proy-modal__x" onclick="cerrarNuevoProyecto()" title="Cerrar">✕</button>
      </div>

      <div class="proy-modal__aviso">Si el cliente ya tiene un proyecto en curso, sumale tareas a ese en lugar de crear otro.</div>

      <div class="proy-f">
        <label for="proy-cliente">Cliente</label>
        <input type="text" id="proy-cliente" list="proy-clientes-dl" placeholder="Escribí para buscar el cliente…" autocomplete="off">
        <datalist id="proy-clientes-dl">${lista.map(c => `<option value="${_pEsc(c.nombre)}"></option>`).join('')}</datalist>
      </div>
      <div class="proy-f">
        <label for="proy-nombre">Nombre del proyecto</label>
        <input type="text" id="proy-nombre" placeholder="Ej: Nuevo diseño de recibos, migración de legajos…" maxlength="120" autocomplete="off">
      </div>
      <div class="proy-f">
        <label for="proy-detalle">Detalle <span>opcional</span></label>
        <textarea id="proy-detalle" rows="3" placeholder="Qué pidió el cliente"></textarea>
      </div>
      <div class="proy-f-fila">
        <div class="proy-f">
          <label for="proy-inicio">Fecha de inicio</label>
          <input type="date" id="proy-inicio" value="${hoyISO}">
        </div>
        <div class="proy-f">
          <label for="proy-objetivo">Fecha objetivo <span>opcional</span></label>
          <input type="date" id="proy-objetivo">
        </div>
      </div>

      <div class="proy-modal__pie">
        <button class="btn-secondary" onclick="cerrarNuevoProyecto()">Cancelar</button>
        <button class="btn-primary" onclick="guardarNuevoProyecto()">Crear proyecto</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('proy-cliente')?.focus(), 50);
}
function cerrarNuevoProyecto() { document.getElementById('proy-overlay')?.remove(); }

async function guardarNuevoProyecto() {
  const nombreCli = (document.getElementById('proy-cliente')?.value || '').trim();
  const nombre    = (document.getElementById('proy-nombre')?.value || '').trim();
  const detalle   = (document.getElementById('proy-detalle')?.value || '').trim();
  const inicio    = document.getElementById('proy-inicio')?.value || null;
  const objetivo  = document.getElementById('proy-objetivo')?.value || null;

  const cliente = (typeof clientes !== 'undefined' ? clientes : []).find(c => (c.nombre || '').toLowerCase() === nombreCli.toLowerCase());
  if (!cliente) { toastError('Elegí un cliente de la lista.'); return; }
  if (!nombre)  { toastError('Poné un nombre al proyecto.'); return; }
  if (objetivo && inicio && objetivo < inicio) { toastError('La fecha objetivo no puede ser anterior al inicio.'); return; }

  // Un cliente tiene un solo proyecto en curso: si ya hay uno, se lo ofrece
  const existente = proyectos.find(p => p.cliente_id === cliente.id && p.estado === 'en_curso');
  if (existente) {
    if (confirm(`${cliente.nombre} ya tiene un proyecto en curso: "${existente.nombre}".\n\nSi pidió más cosas, se le agregan tareas a ese proyecto.\n\n¿Querés abrirlo?`)) {
      cerrarNuevoProyecto();
      abrirProyecto(existente.id);
    }
    return;
  }
  try {
    const nuevo = await dbInsert('proyectos', {
      cliente_id: cliente.id, nombre, detalle: detalle || null,
      fecha_inicio: inicio, fecha_fin_objetivo: objetivo,
      creado_por: (typeof getCurrentUserName === 'function' ? getCurrentUserName() : null),
    });
    if (!proyectos.some(x => x.id === nuevo.id)) proyectos = [nuevo, ...proyectos];
    cerrarNuevoProyecto();
    toast('Proyecto creado ✓');
    abrirProyecto(nuevo.id);
  } catch (e) {
    console.error('Error creando proyecto', e);
    toastError(String(e.code) === '23505' ? 'Ese cliente ya tiene un proyecto en curso.' : 'No se pudo crear el proyecto.');
  }
}

// ── Detalle de un proyecto ────────────────────────────────────────────────────
function _renderProyDetalle(p) {
  const slot = document.getElementById('proy-detalle-body');
  if (!slot) return;
  const c = _pClienteDe(p);
  const k = proyCalc(p);
  const sem = PROY_SEM[k.estado];
  const color = k.estado === 'finalizado' ? '#94a3b8' : k.progreso >= 80 ? 'var(--green)' : k.progreso >= 40 ? 'var(--amber)' : 'var(--red)';
  const circ = 276.5;
  const offset = (circ * (1 - k.progreso / 100)).toFixed(1);
  const diasObj = (k.objetivo && k.fin) ? Math.round((k.fin - k.objetivo) / 86400000) : null;
  const finSub = (k.progreso === 100 && k.total) ? '<span style="color:var(--green)">✓ Todas completas</span>'
    : diasObj == null ? ''
    : diasObj > 0 ? `<span style="color:var(--red)">⚠ ${diasObj}d después del objetivo</span>`
    : '<span style="color:var(--green)">✓ Dentro del objetivo</span>';

  // Foco: si se estaba escribiendo en un input, se conserva al redibujar
  const foco = document.activeElement && document.activeElement.id ? document.activeElement.id : null;

  // El scroll de la lista de tareas se conserva al redibujar (cada edición vuelve a dibujar)
  const scrollPrev = slot.querySelector('.proy-scroll') ? slot.querySelector('.proy-scroll').scrollTop : 0;

  slot.innerHTML = `
    <div class="proy-det" style="--st:${sem.color}">
      <!-- Panel lateral: quién, cuánto avanzó y fechas -->
      <aside class="proy-det__lado">
        <div class="proy-det__cli">
          <div class="av av-${_pEsc(c ? c.tipo : 'empresa')} proy-det__av">${_pEsc(c ? c.iniciales : '?')}</div>
          <div class="proy-det__cli-txt">
            <div class="proy-det__cli-nombre" title="${_pEsc(c ? c.nombre : '')}">${_pEsc(c ? c.nombre : 'Cliente eliminado')}</div>
            <span class="proy-det__badge" style="color:${sem.color};background:color-mix(in srgb, ${sem.color} 14%, transparent)">${sem.txt}</span>
          </div>
        </div>

        <label class="proy-det__lbl" for="proy-nombre-input">Proyecto</label>
        <input id="proy-nombre-input" class="proy-det__nombre" value="${_pEsc(p.nombre)}" maxlength="120"
          onchange="proyCampo('${p.id}','nombre',this.value)" title="Nombre del proyecto">
        ${p.detalle ? `<div class="proy-det__detalle">${_pEsc(p.detalle)}</div>` : ''}

        <div class="proy-det__avance">
          <div class="impl-mini__ring" style="width:104px;height:104px">
            <svg viewBox="0 0 100 100">
              <circle class="impl-mini__ring-bg" cx="50" cy="50" r="44"/>
              <circle class="impl-mini__ring-fg" cx="50" cy="50" r="44" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="impl-mini__ring-num" style="font-size:26px">${k.progreso}<small>%</small></div>
          </div>
          <div class="proy-det__avance-txt">
            <b>${k.completas} de ${k.total}</b><span>tareas completas</span>
            ${k.vencidas ? `<em>⏰ ${k.vencidas} vencida${k.vencidas !== 1 ? 's' : ''}</em>` : ''}
          </div>
        </div>

        <div class="proy-det__fechas">
          <label>
            <span>📅 Inicio</span>
            <input type="date" id="proy-f-inicio" value="${p.fecha_inicio ? p.fecha_inicio.substring(0, 10) : ''}"
              onchange="proyCampo('${p.id}','fecha_inicio',this.value)">
          </label>
          <label>
            <span>🎯 Objetivo</span>
            <input type="date" id="proy-f-objetivo" value="${p.fecha_fin_objetivo ? p.fecha_fin_objetivo.substring(0, 10) : ''}"
              onchange="proyCampo('${p.id}','fecha_fin_objetivo',this.value)">
          </label>
          <div class="proy-det__fin">
            <span>⏱ Fin calculado</span>
            <b>${_pFmt(k.fin)}</b>
            ${finSub ? `<small>${finSub}</small>` : ''}
          </div>
        </div>

        <button class="btn-sm proy-btn-borrar" onclick="proyEliminar('${p.id}')">🗑 Eliminar proyecto</button>
      </aside>

      <!-- Tareas -->
      <section class="proy-det__tareas">
        <div class="proy-tabs">
          <button class="${window._proyVista === 'lista' ? 'on' : ''}" onclick="setProyVista('lista')">☰ Tareas <span>${k.total}</span></button>
          <button class="${window._proyVista === 'gantt' ? 'on' : ''}" onclick="setProyVista('gantt')">📊 Gantt</button>
          <button class="${window._proyVista === 'docs' ? 'on' : ''}" onclick="setProyVista('docs')">📁 Documentos <span>${typeof pdocCantidad === 'function' ? pdocCantidad(p.id) : 0}</span></button>
        </div>
        ${window._proyVista === 'docs' ? `<div class="proy-tareas-head">
          <div class="proy-tareas-tit">Documentos del proyecto</div>
          <button class="btn-primary btn-primary--sm" onclick="pdocElegirTipo('${p.id}')">＋ Agregar documento</button>
        </div>` : `<div class="proy-tareas-head">
          <div class="proy-tareas-tit">${window._proyVista === 'gantt' ? 'Cronograma' : 'Tareas del proyecto'}</div>
          ${window._proyVista === 'gantt' ? `<div class="proy-vistas">
            <button class="${window._proyEscala === 'dia' ? 'on' : ''}" onclick="setProyEscala('dia')">Día</button>
            <button class="${window._proyEscala === 'mes' ? 'on' : ''}" onclick="setProyEscala('mes')">Mes</button>
            <button class="${window._proyEscala === 'anio' ? 'on' : ''}" onclick="setProyEscala('anio')">Año</button>
          </div>` : ''}
          <button class="btn-primary btn-primary--sm" onclick="proyAgregarTarea('${p.id}')">＋ Agregar tarea</button>
        </div>`}
        <div class="proy-scroll">
          ${window._proyVista === 'docs' ? proyDocsHtml(p) : k.ts.length ? (window._proyVista === 'gantt' ? _proyGanttHtml(p, k.ts) : _proyTareasHtml(p, k.ts, true)) : `
          <div class="proy-vacio">Todavía no hay tareas. Agregá la primera con <b>＋ Agregar tarea</b>: nombre, responsable, duración en días y fecha de inicio.</div>`}
        </div>
        <div class="proy-nota">Con todas las tareas completas el proyecto se finaliza solo; si agregás o destildás una, vuelve a estar en curso.</div>
      </section>
    </div>`;
  _proyAjustarAlto();
  const sc = slot.querySelector('.proy-scroll');
  if (sc) sc.scrollTop = scrollPrev;
  if (foco) document.getElementById(foco)?.focus({ preventScroll: true });
}

// El detalle ocupa todo el alto de la pantalla: el panel de la izquierda queda fijo y solo la lista
// de tareas (derecha) tiene scroll cuando no entra.
function _proyAjustarAlto() {
  const el = document.querySelector('.proy-det');
  if (!el) return;
  if (window.innerWidth <= 1000) { el.style.height = ''; return; }   // celular / pantalla chica: alto libre
  const arriba = el.getBoundingClientRect().top + window.scrollY;
  el.style.height = Math.max(440, window.innerHeight - arriba - 28) + 'px';
}
window.addEventListener('resize', _proyAjustarAlto);

function setProyEscala(e) {
  window._proyEscala = e;
  renderImplementacion();
}

function setProyVista(v) {
  window._proyVista = v;
  renderImplementacion();
}

// Gantt del proyecto: una fila por tarea sobre un calendario compartido. Las etiquetas de la izquierda y
// el encabezado de fechas quedan fijos al deslizar; hay una línea para "hoy" y otra para la fecha objetivo.
function _proyGanttHtml(p, ts) {
  const DIA = 86400000;
  const dif = (a, b) => Math.round((b - a) / DIA);
  const hoy = _pHoy();
  const objetivo = _parseDate(p.fecha_fin_objetivo);

  const ini = ts.map(t => _parseDate(t.fecha_inicio)).filter(Boolean);
  const fin = ts.map(t => _parseDate(t.fecha_fin)).filter(Boolean);
  if (!ini.length || !fin.length) return '<div class="proy-vacio">Las tareas todavía no tienen fechas para dibujar.</div>';

  // Rango: de la primera a la última tarea, sumando el inicio del proyecto, el objetivo y hoy si caen cerca
  let desde = new Date(Math.min(...ini, _parseDate(p.fecha_inicio) || Infinity));
  let hasta = new Date(Math.max(...fin, objetivo || 0));
  if (hoy >= _addDays(desde, -14) && hoy <= _addDays(hasta, 14)) {
    if (hoy < desde) desde = new Date(hoy);
    if (hoy > hasta) hasta = new Date(hoy);
  }
  desde = _addDays(desde, -2);
  hasta = _addDays(hasta, 3);
  const total = dif(desde, hasta) + 1;

  // Ancho de cada día según la escala elegida (día / mes / año)
  const esc = window._proyEscala || 'dia';
  const px = esc === 'dia' ? 30 : esc === 'mes' ? 7 : 2;
  const W = total * px;
  const mostrarDia = esc === 'dia';
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Encabezado: arriba meses (o años en la escala anual), abajo días (o meses)
  let meses = '', dias = '';
  const tramos = (clave, fmt) => {
    let html = '';
    for (let d = new Date(desde); d <= hasta; ) {
      const fin = clave === 'anio' ? new Date(d.getFullYear(), 11, 31) : new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const corte = fin < hasta ? fin : hasta;
      const n = dif(d, corte) + 1;
      html += fmt(d, n);
      d = _addDays(corte, 1);
    }
    return html;
  };
  if (esc === 'anio') {
    meses = tramos('anio', (d, n) => `<div class="pg-mes" style="width:${n * px}px">${n * px >= 36 ? d.getFullYear() : ''}</div>`);
    dias  = tramos('mes',  (d, n) => `<div class="pg-dia pg-dia--mes" style="width:${n * px}px">${n * px >= 24 ? MES[d.getMonth()][0] : ''}</div>`);
  } else {
    meses = tramos('mes', (d, n) => `<div class="pg-mes" style="width:${n * px}px">${n * px >= 50 ? MES[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : ''}</div>`);
    if (esc === 'mes') {
      dias = tramos('mes', (d, n) => `<div class="pg-dia pg-dia--mes" style="width:${n * px}px">${n * px >= 40 ? MES[d.getMonth()] : ''}</div>`);
    } else {
      for (let i = 0; i < total; i++) {
        const d = _addDays(desde, i);
        const finde = d.getDay() === 0 || d.getDay() === 6;
        const esHoy = +d === +hoy;
        dias += `<div class="pg-dia ${finde ? 'pg-dia--fin' : ''} ${esHoy ? 'pg-dia--hoy' : ''}" style="width:${px}px">${d.getDate()}</div>`;
      }
    }
  }

  // Líneas verticales (hoy y objetivo)
  const linea = (fecha, cls, txt) => {
    const off = dif(desde, fecha);
    if (off < 0 || off >= total) return '';
    return `<div class="pg-linea ${cls}" style="left:${off * px + px / 2}px"><span>${txt}</span></div>`;
  };

  const filas = ts.map((t, i) => {
    const a = _parseDate(t.fecha_inicio), b = _parseDate(t.fecha_fin);
    if (!a || !b) return '';
    const dur = dif(a, b) + 1;
    const vencida = t.estado !== 'completada' && b < hoy;
    const cls = vencida ? 'venc' : t.estado;
    const tip = `${t.tarea}\n${_pFmt(a)} → ${_pFmt(b)} (${dur} día${dur !== 1 ? 's' : ''})\n${PROY_ESTADOS_TAREA[t.estado]}${t.asesor ? ' · ' + t.asesor : ''}${vencida ? ' · vencida' : ''}`;
    return `
      <div class="pg-fila">
        <div class="pg-label" title="${_pEsc(t.tarea)}">
          <span class="pg-label__n">${i + 1}</span>
          <span class="pg-label__t">${_pEsc(t.tarea)}<small>${_pEsc(t.asesor || 'Sin asignar')}</small></span>
        </div>
        <div class="pg-track" style="width:${W}px">
          <div class="pg-barra pg-barra--${cls}" style="left:${dif(desde, a) * px}px;width:${Math.max(dur * px, 6)}px" title="${_pEsc(tip)}">
            ${dur * px >= 44 ? `<span>${dur}d</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="pg pg--${esc}" style="--px:${px}px">
      <div class="pg-inner" style="width:calc(var(--pg-lw) + ${W}px)">
        <div class="pg-head">
          <div class="pg-label pg-label--head">Tarea</div>
          <div class="pg-cal" style="width:${W}px"><div class="pg-meses">${meses}</div><div class="pg-dias">${dias}</div></div>
        </div>
        <div class="pg-body">
          <div class="pg-lineas" style="left:var(--pg-lw);width:${W}px">
            ${linea(hoy, 'pg-linea--hoy', 'Hoy')}
            ${objetivo ? linea(objetivo, 'pg-linea--obj', '🎯 Objetivo') : ''}
          </div>
          ${filas}
        </div>
      </div>
      <div class="pg-ley">
        <span><i class="pg-barra--pendiente"></i> Pendiente</span>
        <span><i class="pg-barra--en_progreso"></i> En curso</span>
        <span><i class="pg-barra--completada"></i> Completa</span>
        <span><i class="pg-barra--venc"></i> Vencida</span>
      </div>
    </div>`;
}

function _proyTareasHtml(p, ts, enCurso) {
  const hoy = _pHoy();
  // Cada tarea es una tarjeta con franja de color según su estado: arriba el título (número, tilde, nombre y
  // acciones) y abajo, en un recuadro aparte, responsable, duración, fechas y estado.
  return `
    <div class="proy-tabla">
      ${ts.map((t, i) => {
        const fin = _parseDate(t.fecha_fin);
        const vencida = t.estado !== 'completada' && fin && fin < hoy;
        return `
        <div class="proy-tr proy-tr--${t.estado} ${vencida ? 'proy-tr--venc' : ''}">
          <div class="proy-tr__top">
            <span class="proy-num">${i + 1}</span>
            <button class="proy-check" onclick="proyToggleTarea('${t.id}')" title="${t.estado === 'completada' ? 'Marcar pendiente' : 'Marcar completa'}">${t.estado === 'completada' ? '✓' : ''}</button>
            <span class="proy-celda proy-celda--tarea">
              <input value="${_pEsc(t.tarea)}" maxlength="200" onchange="proyTareaCampo('${t.id}','tarea',this.value)"></span>
            <span class="proy-acc">
              <button class="proy-ico-btn" onclick="proyMoverTarea('${t.id}',-1)" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="proy-ico-btn" onclick="proyMoverTarea('${t.id}',1)" title="Bajar" ${i === ts.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="proy-ico-btn proy-ico-btn--del" onclick="proyEliminarTarea('${t.id}')" title="Eliminar tarea">✕</button>
            </span>
          </div>
          <div class="proy-tr__campos">
            <span class="proy-celda proy-c-resp" data-l="Responsable">
              <select onchange="proyTareaCampo('${t.id}','asesor',this.value)">
                <option value="">Sin asignar</option>
                ${PROY_ASESORES.map(a => `<option value="${a}" ${t.asesor === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select></span>
            <span class="proy-celda proy-c-dias" data-l="Días"><input type="number" min="1" max="365" value="${t.duracion_dias}"
              onchange="proyTareaCampo('${t.id}','duracion_dias',this.value)"></span>
            <span class="proy-celda proy-c-ini" data-l="Inicio"><input type="date" value="${t.fecha_inicio ? t.fecha_inicio.substring(0, 10) : ''}"
              onchange="proyTareaCampo('${t.id}','fecha_inicio',this.value)"></span>
            <span class="proy-celda proy-c-fin proy-fin" data-l="Fin"><b>${fin ? _pFmt(fin) : '—'}${vencida ? ' ⏰' : ''}</b></span>
            <span class="proy-celda proy-c-est" data-l="Estado">
              <select class="proy-est proy-est--${t.estado}" onchange="proyTareaCampo('${t.id}','estado',this.value)">
                ${Object.entries(PROY_ESTADOS_TAREA).map(([k, v]) => `<option value="${k}" ${t.estado === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select></span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── Edición del proyecto ──────────────────────────────────────────────────────
async function proyCampo(id, campo, valor) {
  const p = proyectos.find(x => x.id === id);
  if (!p) return;
  let v = (typeof valor === 'string') ? valor.trim() : valor;
  if (campo === 'nombre' && !v) { toastError('El nombre no puede quedar vacío.'); _proyRefrescar(); return; }
  if (campo === 'fecha_inicio' || campo === 'fecha_fin_objetivo') v = v || null;
  const patch = { [campo]: v, updated_at: new Date().toISOString() };
  try {
    const row = await dbUpdate('proyectos', id, patch);
    proyectos = proyectos.map(x => x.id === id ? row : x);
    _proyRefrescar();
  } catch (e) { console.error(e); toastError('No se pudo guardar el cambio.'); }
}

// El estado del proyecto se calcula solo: con todas sus tareas completas queda "finalizado" (deja de ocupar
// lugar en Disponibilidad); si se agrega una tarea o se destilda una, vuelve a "en curso".
async function _proySincronizar(pid) {
  const p = proyectos.find(x => x.id === pid);
  if (!p) return;
  const ts = _pTareasDe(pid);
  const completo = ts.length > 0 && ts.every(t => t.estado === 'completada');
  const ahora = new Date().toISOString();
  try {
    if (completo && p.estado === 'en_curso') {
      const row = await dbUpdate('proyectos', pid, { estado: 'finalizado', finalizado_at: ahora, updated_at: ahora });
      proyectos = proyectos.map(x => x.id === pid ? row : x);
      toast('🎉 Proyecto finalizado: todas las tareas completas');
    } else if (!completo && p.estado === 'finalizado') {
      if (proyectos.some(x => x.cliente_id === p.cliente_id && x.estado === 'en_curso' && x.id !== pid)) {
        toastError('Este cliente ya tiene otro proyecto en curso: no se puede reabrir este.');
        return;
      }
      const row = await dbUpdate('proyectos', pid, { estado: 'en_curso', finalizado_at: null, updated_at: ahora });
      proyectos = proyectos.map(x => x.id === pid ? row : x);
      toast('Proyecto reabierto: hay tareas pendientes');
    }
  } catch (e) { console.error('No se pudo sincronizar el estado del proyecto', e); }
}

async function proyEliminar(id) {
  const p = proyectos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar el proyecto "${p.nombre}" y todas sus tareas? No se puede deshacer.`)) return;
  try {
    await dbDelete('proyectos', id);
    proyectos = proyectos.filter(x => x.id !== id);
    proyTareas = proyTareas.filter(t => t.proyecto_id !== id);
    window._proyAbierto = null;
    toast('Proyecto eliminado');
    if (window._proyVolverADisp) { window._proyVolverADisp = false; window._implProyAbierta = false; window._implDispAbierta = true; }
    _proyRefrescar();
    renderImplementacion();
  } catch (e) { console.error(e); toastError('No se pudo eliminar el proyecto.'); }
}

// ── Tareas ────────────────────────────────────────────────────────────────────
async function proyAgregarTarea(pid) {
  const p = proyectos.find(x => x.id === pid);
  if (!p) return;
  const ts = _pTareasDe(pid);
  // Inicio por defecto: el día siguiente al fin de la última tarea; si no hay, el inicio del proyecto u hoy
  let ini = _pHoy();
  const fines = ts.map(t => _parseDate(t.fecha_fin)).filter(Boolean);
  if (fines.length) ini = _addDays(new Date(Math.max(...fines)), 1);
  else if (p.fecha_inicio) ini = _parseDate(p.fecha_inicio);
  const inicioISO = _toISODate(ini);
  try {
    const row = await dbInsert('proyecto_tareas', {
      proyecto_id: pid,
      orden: ts.length ? Math.max(...ts.map(t => t.orden)) + 1 : 1,
      tarea: 'Nueva tarea',
      duracion_dias: 1,
      fecha_inicio: inicioISO,
      fecha_fin: _pFinTarea(inicioISO, 1),
    });
    if (!proyTareas.some(x => x.id === row.id)) proyTareas = [...proyTareas, row];
    await _proySincronizar(pid);
    _proyRefrescar();
    // Deja el nombre listo para escribir
    setTimeout(() => {
      const inputs = document.querySelectorAll('.proy-celda--tarea input');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 60);
  } catch (e) { console.error(e); toastError('No se pudo agregar la tarea.'); }
}

async function proyTareaCampo(id, campo, valor) {
  const t = proyTareas.find(x => x.id === id);
  if (!t) return;
  const patch = { updated_at: new Date().toISOString() };
  let v = (typeof valor === 'string') ? valor.trim() : valor;

  if (campo === 'tarea') {
    if (!v) { toastError('La tarea necesita un nombre.'); _proyRefrescar(); return; }
    patch.tarea = v;
  } else if (campo === 'asesor') {
    patch.asesor = v || null;
  } else if (campo === 'duracion_dias') {
    const n = Math.max(1, Math.min(365, parseInt(v, 10) || 1));
    patch.duracion_dias = n;
    patch.fecha_fin = _pFinTarea(t.fecha_inicio, n);
  } else if (campo === 'fecha_inicio') {
    if (!v) { toastError('La tarea necesita una fecha de inicio.'); _proyRefrescar(); return; }
    patch.fecha_inicio = v;
    patch.fecha_fin = _pFinTarea(v, t.duracion_dias);
  } else if (campo === 'estado') {
    patch.estado = v;
    patch.fecha_completada = v === 'completada' ? new Date().toISOString() : null;
  } else return;

  try {
    const row = await dbUpdate('proyecto_tareas', id, patch);
    proyTareas = proyTareas.map(x => x.id === id ? row : x);
    if (campo === 'estado') await _proySincronizar(t.proyecto_id);
    _proyRefrescar();
  } catch (e) { console.error(e); toastError('No se pudo guardar el cambio.'); _proyRefrescar(); }
}

function proyToggleTarea(id) {
  const t = proyTareas.find(x => x.id === id);
  if (!t) return;
  proyTareaCampo(id, 'estado', t.estado === 'completada' ? 'pendiente' : 'completada');
}

async function proyEliminarTarea(id) {
  const t = proyTareas.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`¿Eliminar la tarea "${t.tarea}"?`)) return;
  try {
    await dbDelete('proyecto_tareas', id);
    proyTareas = proyTareas.filter(x => x.id !== id);
    await _proySincronizar(t.proyecto_id);
    _proyRefrescar();
  } catch (e) { console.error(e); toastError('No se pudo eliminar la tarea.'); }
}

async function proyMoverTarea(id, dir) {
  const t = proyTareas.find(x => x.id === id);
  if (!t) return;
  const ts = _pTareasDe(t.proyecto_id);
  const i = ts.findIndex(x => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= ts.length) return;
  const otra = ts[j];
  // Intercambia los órdenes
  try {
    const [a, b] = await Promise.all([
      dbUpdate('proyecto_tareas', t.id,    { orden: otra.orden, updated_at: new Date().toISOString() }),
      dbUpdate('proyecto_tareas', otra.id, { orden: t.orden,    updated_at: new Date().toISOString() }),
    ]);
    proyTareas = proyTareas.map(x => x.id === a.id ? a : x.id === b.id ? b : x);
    _proyRefrescar();
  } catch (e) { console.error(e); toastError('No se pudo mover la tarea.'); }
}


// ── Alertas del Panel general ─────────────────────────────────────────────────
// Devuelve los avisos de proyectos que todavía NO se vieron. Cada aviso tiene una `key` que incluye
// el estado (ej. cantidad de tareas vencidas), así que si la situación cambia vuelve a aparecer.
// Al tocar el botón del aviso se marca como visto (ausAvisoMarcarVisto) y desaparece del panel.
const PROY_DIAS_ESTANCADO = 10;
const PROY_MESES_CAPACIDAD = 3;

function proyAvisosPanel() {
  if (typeof proyectos === 'undefined' || !proyectos.length || typeof ausAvisoVisto !== 'function') return [];
  const hoy = _pHoy();
  const out = [];
  const cli = p => { const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === p.cliente_id); return c ? c.nombre : ''; };
  const tit = p => `<strong>${_pEsc(cli(p) || p.nombre)}</strong>${cli(p) ? ' (' + _pEsc(p.nombre) + ')' : ''}`;

  for (const p of proyectos) {
    const k = proyCalc(p);

    // 3) Proyecto atrasado: tareas vencidas o el fin calculado pasa la fecha objetivo
    if (p.estado === 'en_curso' && k.estado === 'atrasado') {
      const key = `proy:${p.id}:atraso:${k.vencidas}:${k.fin ? _toISODate(k.fin) : ''}`;
      if (!ausAvisoVisto(key)) {
        const motivo = k.vencidas > 0
          ? `${k.vencidas} tarea${k.vencidas !== 1 ? 's' : ''} vencida${k.vencidas !== 1 ? 's' : ''}`
          : `termina el ${_pFmt(k.fin)}, después del objetivo (${_pFmt(k.objetivo)})`;
        out.push({ key, pid: p.id, color: '#c0392b', icon: '⏰', msg: `Proyecto atrasado: ${tit(p)} — ${motivo}. Va al ${k.progreso}%.`, cta: 'Ver proyecto →' });
      }
    }

    // 5) Proyecto estancado: en curso, ya arrancó, con tareas pendientes y nadie lo toca hace días
    if (p.estado === 'en_curso' && k.total > k.completas && k.inicio && k.inicio <= hoy) {
      const ult = Math.max(+new Date(p.updated_at || 0), ...k.ts.map(t => +new Date(t.updated_at || 0)));
      const dias = Math.floor((Date.now() - ult) / 86400000);
      if (ult && dias >= PROY_DIAS_ESTANCADO) {
        const key = `proy:${p.id}:estancado:${_toISODate(new Date(ult))}`;
        if (!ausAvisoVisto(key)) {
          out.push({ key, pid: p.id, color: '#7c6f64', icon: '🕸️', msg: `Proyecto estancado: ${tit(p)} — hace ${dias} días que nadie lo actualiza.`, cta: 'Ver proyecto →' });
        }
      }
    }

    // 8) Proyecto terminado (últimos 7 días)
    if (p.estado === 'finalizado' && p.finalizado_at && (Date.now() - +new Date(p.finalizado_at)) < 7 * 86400000) {
      const key = `proy:${p.id}:fin:${p.finalizado_at}`;
      if (!ausAvisoVisto(key)) {
        out.push({ key, pid: p.id, color: '#16a34a', icon: '🎉', msg: `¡Proyecto terminado! ${tit(p)} completó sus ${k.total} tareas.`, cta: 'Ver proyecto →' });
      }
    }
  }

  // 10) Capacidad: meses próximos sin lugar en Disponibilidad en los que hay algún proyecto en curso
  if (typeof _dispDatos === 'function' && typeof _dispMesInfo === 'function' && proyectos.some(p => p.estado === 'en_curso')) {
    try {
      const items = _dispDatos().filter(i => !i.finalizado && i.inicio && i.fin);
      const cap = (typeof _dispCapacidadManual === 'function' && _dispCapacidadManual()) || DISP_CAPACIDAD_DEFAULT;
      const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      for (let i = 0; i < PROY_MESES_CAPACIDAD; i++) {
        const m1 = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
        const m2 = new Date(m1.getFullYear(), m1.getMonth() + 1, 0);
        const hayProy = items.some(it => it.esProyecto && it.inicio <= m2 && it.fin >= m1);
        if (!hayProy) continue;
        const info = _dispMesInfo(items, m1, null, cap);
        if (info.libres > 0) continue;
        const key = `proy:cap:${m1.getFullYear()}-${m1.getMonth() + 1}:${info.pico}/${info.cap}`;
        if (ausAvisoVisto(key)) continue;
        out.push({ key, pid: null, color: '#f97316', icon: '📊',
          msg: `En <strong>${MES[m1.getMonth()]}</strong> no queda lugar en Implementación: ${info.pico} de ${info.cap} ocupados (cuentan los proyectos).`,
          cta: 'Ver Disponibilidad →' });
      }
    } catch (e) { console.warn('proyAvisosPanel capacidad', e); }
  }
  return out;
}

// Botón del aviso: lo marca como visto y abre el proyecto (o Disponibilidad si es de capacidad)
function proyAvisoIr(key, pid) {
  if (typeof ausAvisoMarcarVisto === 'function') ausAvisoMarcarVisto(key);
  if (typeof _saludoNavBtn === 'function') goTo(_saludoNavBtn('implementacion'), 'implementacion');
  setTimeout(() => {
    if (pid) { window._proyVolverADisp = false; abrirProyecto(pid); }
    else if (typeof abrirDisponibilidadImpl === 'function') abrirDisponibilidadImpl();
  }, 50);
  setTimeout(() => { if (typeof renderSaludoPanel === 'function') renderSaludoPanel(); }, 100);
}
