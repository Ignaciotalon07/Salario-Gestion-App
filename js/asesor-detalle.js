// ════════════════════════════════════
// DETALLE DE ASESOR
// Vista completa con métricas, consultas por tipo, gráfico y listado.
// Reemplaza el modal anterior al hacer click en un asesor desde Equipo.
// ════════════════════════════════════

// Nombre del asesor actualmente en vista
let _detalleAsesorNombre = null;

// Instancia del chart (para destruir antes de recrear)
let _detalleAsesorChart = null;

// Paginación del historial
let _detalleAsesorLimit = 10;

// Filtro de mes global (afecta todas las métricas de la vista)
// 0 = mes actual, -1 = mes anterior, etc.
let _detalleAsesorMesOffset = 0;

// Filtros del historial
let _detalleAsesorTipoFiltro   = null;
let _detalleAsesorMesFiltro    = null;
let _detalleAsesorPeriodo      = 'mes';  // arranca en 'mes' para sincronizar con el filtro global
let _detalleAsesorPeriodoOffset = 0;     // 0 = actual, -1 = anterior, etc.
let _detalleAsesorBusqueda     = '';

// Colores por asesor (mismo orden que ASESORES_EQUIPO en charts.js)
const _ASESOR_NOMBRES  = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Renzo Moretti', 'Alfredo Cesar', 'Daniel Ferro'];
const _ASESOR_COLORES  = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];

// ── Navegación ────────────────────────────────────────────────────────────────

function goAsesorDetail(nombre) {
  _detalleAsesorNombre         = nombre;
  _detalleAsesorLimit          = 10;
  _detalleAsesorMesOffset      = 0;
  _detalleAsesorTipoFiltro     = null;
  _detalleAsesorMesFiltro      = null;
  _detalleAsesorPeriodo        = 'mes';
  _detalleAsesorPeriodoOffset  = 0;
  _detalleAsesorBusqueda       = '';

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('asesor-detalle').classList.add('active');
  window.scrollTo(0, 0);

  renderDetalleAsesor();
}

function volverAEquipo() {
  _detalleAsesorNombre = null;
  if (_detalleAsesorChart) { _detalleAsesorChart.destroy(); _detalleAsesorChart = null; }

  // Volver a la sección Equipo activando su nav-item
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const equipoPage = document.getElementById('equipo');
  if (equipoPage) equipoPage.classList.add('active');

  const navEquipo = document.querySelector('.nav-item[onclick*="equipo"]');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (navEquipo) navEquipo.classList.add('active');

  window.scrollTo(0, 0);
}

// ── Render principal ──────────────────────────────────────────────────────────

function renderDetalleAsesor() {
  const nombre = _detalleAsesorNombre;
  if (!nombre) return;

  const todasConsultas = typeof consultas !== 'undefined' ? consultas : [];

  // Separar consultas de clientes vs horas internas
  const consultasCli = todasConsultas.filter(c =>
    c.asesor === nombre &&
    c.tipoConsulta !== 'programacion_interna' &&
    c.tipo_consulta !== 'programacion_interna' &&
    !String(c.id).startsWith('_temp_')
  );
  const consultasInt = todasConsultas.filter(c =>
    c.asesor === nombre &&
    (c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna') &&
    !String(c.id).startsWith('_temp_')
  );

  // Poblar los arrays que usa _abrirDetalleRegistroAsesor (definido en charts.js)
  if (typeof _masesorListaClientes !== 'undefined') _masesorListaClientes = consultasCli;
  if (typeof _masesorListaInternas !== 'undefined') _masesorListaInternas = consultasInt;
  if (typeof _modalAsesorNombre    !== 'undefined') _modalAsesorNombre    = nombre;

  const page = document.getElementById('asesor-detalle');
  page.innerHTML = `
    ${_renderAsesorHeader(nombre)}
    ${_renderAsesorStats(nombre, consultasCli, consultasInt)}
    ${_renderAsesorChart()}
    ${_renderAsesorTipoStats(nombre, consultasCli, consultasInt)}
    ${_renderAsesorHistorial(consultasCli, consultasInt)}
  `;

  _initAsesorChart(consultasCli, consultasInt);
}

// ── Mes de referencia global ──────────────────────────────────────────────────

// Devuelve el mes/año de referencia según el offset global.
function _getAsesorMesRef() {
  const ahora = new Date();
  const d     = new Date(ahora.getFullYear(), ahora.getMonth() + _detalleAsesorMesOffset, 1);
  return {
    mes:      d.getMonth(),
    anio:     d.getFullYear(),
    nombreMes: d.toLocaleString('es-AR', { month: 'long' }),
    label:    d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    esActual: _detalleAsesorMesOffset >= 0,
  };
}

// Navega al mes anterior (dir=-1) o siguiente (dir=1).
// Sincroniza automáticamente el filtro de período del historial.
function navAsesorMes(dir) {
  if (dir > 0 && _detalleAsesorMesOffset >= 0) return;
  _detalleAsesorMesOffset     += dir;
  // Sincronizar historial al mes seleccionado
  _detalleAsesorPeriodo        = 'mes';
  _detalleAsesorPeriodoOffset  = _detalleAsesorMesOffset;
  _detalleAsesorLimit          = 10;
  renderDetalleAsesor();
}

// ── Header ────────────────────────────────────────────────────────────────────

function _renderAsesorHeader(nombre) {
  const idx      = _ASESOR_NOMBRES.indexOf(nombre);
  const color    = _ASESOR_COLORES[idx >= 0 ? idx : 0];
  const iniciales = nombre.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
  const mesRef   = _getAsesorMesRef();

  const btnStyle = 'background:none;border:1px solid var(--border);border-radius:8px;padding:5px 12px;color:var(--text2);font-size:15px;line-height:1;cursor:pointer;transition:background .13s';

  return `
    <div class="detalle-header">
      <!-- Fila superior: volver + navegador de mes -->
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:14px">
        <button class="btn-secondary detalle-back" onclick="volverAEquipo()">← Volver al equipo</button>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="navAsesorMes(-1)" style="${btnStyle}">‹</button>
          <span style="font-size:13px;font-weight:600;color:var(--text);min-width:110px;text-align:center">
            ${mesRef.label}
          </span>
          <button onclick="navAsesorMes(1)"
            ${mesRef.esActual ? 'disabled' : ''}
            style="${btnStyle};${mesRef.esActual ? 'opacity:.35;cursor:not-allowed' : ''}">›</button>
        </div>
      </div>
      <!-- Avatar + nombre -->
      <div class="detalle-header__body" style="width:100%">
        <div class="av-lg" style="
          background:${color}22;color:${color};border-radius:14px;
          width:52px;height:52px;font-size:18px;font-weight:700;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${_escAsesor(iniciales)}
        </div>
        <div class="detalle-header__info">
          <div class="detalle-header__nombre">${_escAsesor(nombre)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">Asesor del equipo Salario</div>
        </div>
      </div>
    </div>
  `;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function _renderAsesorStats(nombre, consultasCli, consultasInt) {
  // Usar el mes seleccionado por el navegador global
  const { mes: mesActual, anio: anioActual, nombreMes } = _getAsesorMesRef();

  // ── Consultas en el mes seleccionado ──
  const esMes = consultasCli.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });

  // ── Pendientes abiertos (el array global ya solo tiene los no resueltos) ──
  const pendAbiertos = typeof pendientes !== 'undefined'
    ? pendientes.filter(p => p.asesor === nombre).length
    : 0;

  // ── Promedio de hs por consulta (solo consultas clientes con tiempo cargado) ──
  const conTiempo = consultasCli.filter(c => c.tiempo && parseFloat(c.tiempo) > 0);
  const promHs    = conTiempo.length > 0
    ? conTiempo.reduce((s, c) => s + parseFloat(c.tiempo), 0) / conTiempo.length
    : 0;

  // ── Hs trabajadas este mes (clientes + internas) ──
  const esMesInt = consultasInt.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });
  const hsMes = esMes.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0)
              + esMesInt.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0);

  const fmtHs = h => {
    if (h <= 0) return '—';
    const hs  = Math.floor(h);
    const min = Math.round((h - hs) * 60);
    return min > 0 ? `${hs}h ${min}min` : `${hs}h`;
  };

  // Celda del grid: valor coloreado + label gris + dividers
  const cell = (val, label, color, br, bb) => `
    <div style="
      padding:22px 16px;text-align:center;
      ${br ? 'border-right:1px solid var(--border);' : ''}
      ${bb ? 'border-bottom:1px solid var(--border);' : ''}
    ">
      <div style="font-size:26px;font-weight:700;color:${color};margin-bottom:5px;line-height:1">
        ${_escAsesor(String(val))}
      </div>
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">
        ${label}
      </div>
    </div>`;

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr)">
        ${cell(esMes.length,        `Consultas clientes en ${nombreMes}`,       'var(--green)',                                      true,  true)}
        ${cell(pendAbiertos,        'Pendientes abiertos',             pendAbiertos > 0 ? '#e65c00' : 'var(--text3)',       true,  true)}
        ${cell(consultasCli.length, 'Consultas históricas',            'var(--accent)',                                     false, true)}
        ${cell(esMesInt.length,     `Registros internos en ${nombreMes}`, '#3b82f6',                                        true,  false)}
        ${cell(fmtHs(promHs),       'Promedio hs / consulta',          'var(--amber)',                                      true,  false)}
        ${cell(fmtHs(hsMes),        `Hs trabajadas en ${nombreMes}`,   '#22c55e',                                           false, false)}
      </div>
    </div>
  `;
}

// ── Consultas por tipo ────────────────────────────────────────────────────────

// Tipos disponibles según asesor.
// Ignacio, Matias, Daniel Colomer, Renzo → Soporte · Implementación · Hs internas
// Alfredo                                → Soporte · Programación · Implementación · Hs internas
// Daniel Ferro                           → Soporte · Comercial · Implementación · Hs internas
const _TIPOS_POR_ASESOR = {
  'Ignacio Talon':  ['soporte', 'implementacion', 'interna'],
  'Matias Ferro':   ['soporte', 'implementacion', 'interna'],
  'Daniel Colomer': ['soporte', 'implementacion', 'interna'],
  'Renzo Moretti':  ['soporte', 'implementacion', 'interna'],
  'Alfredo Cesar':  ['soporte', 'programacion', 'implementacion', 'interna'],
  'Daniel Ferro':   ['soporte', 'comercial',    'implementacion', 'interna'],
};

// Definición visual + filtro de cada tipo
const _TIPO_DEF = {
  soporte:        { emoji: '🎧', label: 'Soporte',            labelCorto: 'Soporte',    color: 'var(--accent)', filtro: c => !c.tipoConsulta || c.tipoConsulta === 'soporte'        || c.tipo_consulta === 'soporte'        },
  programacion:   { emoji: '🐛', label: 'Programación',       labelCorto: 'Program.',   color: 'var(--red)',    filtro: c =>  c.tipoConsulta === 'programacion'                      || c.tipo_consulta === 'programacion'   },
  comercial:      { emoji: '💼', label: 'Comercial',          labelCorto: 'Comercial',  color: 'var(--green)',  filtro: c =>  c.tipoConsulta === 'comercial'                         || c.tipo_consulta === 'comercial'      },
  implementacion: { emoji: '📋', label: 'Implementación',     labelCorto: 'Impleme.',   color: 'var(--amber)',  filtro: c =>  c.tipoConsulta === 'implementacion'                    || c.tipo_consulta === 'implementacion' },
  interna:        { emoji: '💻', label: 'Registros internos', labelCorto: 'Internos',   color: 'var(--text2)', filtro: null  }, // usa consultasInt
};

function _renderAsesorTipoStats(nombre, consultasCli, consultasInt) {
  const tiposActivos = _TIPOS_POR_ASESOR[nombre] || ['soporte', 'implementacion', 'interna'];

  const item = (tipo, emoji, label, labelCorto, count, color) => `
    <div onclick="filtrarAsesorDetalleTipo('${tipo}')" title="Filtrar por ${label}"
      style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;
             cursor:pointer;border-radius:8px;transition:background .15s"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-size:24px;font-weight:700;color:${color}">${count}</div>
      <div class="asesor-tipo-label">
        ${emoji}
        <span class="asesor-tipo-label__full">${label}</span>
        <span class="asesor-tipo-label__short">${labelCorto}</span>
      </div>
    </div>`;

  const sep = `<div style="width:1px;background:var(--border);margin:8px 0"></div>`;

  const items = tiposActivos.map((tipo, idx) => {
    const def   = _TIPO_DEF[tipo];
    const count = tipo === 'interna'
      ? consultasInt.length
      : consultasCli.filter(def.filtro).length;
    return (idx > 0 ? sep : '') + item(tipo, def.emoji, def.label, def.labelCorto || def.label, count, def.color);
  }).join('');

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="padding:10px 20px 6px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">
        Consultas por tipo — históricas
      </div>
      <div style="display:flex;gap:0">${items}</div>
    </div>
  `;
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _renderAsesorChart() {
  return `
    <div class="card" style="padding:20px 24px 16px;margin-bottom:16px">
      <div class="card-title" style="margin-bottom:12px">Consultas por mes — últimos 6 meses</div>
      <div style="position:relative;height:180px;width:100%;overflow:hidden">
        <canvas id="asesor-detalle-chart" role="img" aria-label="Consultas del asesor por mes" style="max-width:100%"></canvas>
      </div>
    </div>
  `;
}

function _initAsesorChart(consultasCli, consultasInt) {
  const canvas = document.getElementById('asesor-detalle-chart');
  if (!canvas) return;

  if (_detalleAsesorChart) { _detalleAsesorChart.destroy(); _detalleAsesorChart = null; }

  const ahora = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleString('es-AR', { month: 'short' }) });
  }

  const totales   = meses.map(m => consultasCli.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio;
  }).length);

  const internas  = meses.map(m => consultasInt.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio;
  }).length);

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  _detalleAsesorChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [
        {
          label: 'Consultas clientes',
          data: totales,
          backgroundColor: 'rgba(99,102,241,0.75)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Horas internas',
          data: internas,
          backgroundColor: 'rgba(107,114,128,0.55)',
          borderRadius: 5,
          borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: textColor, font: { size: 11 }, boxWidth: 10, padding: 12 } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

// ── Historial ─────────────────────────────────────────────────────────────────

function filtrarAsesorDetalleTipo(tipo) {
  _detalleAsesorTipoFiltro = _detalleAsesorTipoFiltro === tipo ? null : tipo;
  _detalleAsesorLimit = 10;
  _actualizarHistorialAsesor();
}

// Cambia el período activo (todo/dia/mes/anio) y resetea el offset
function setAsesorHistorialPeriodo(periodo) {
  _detalleAsesorPeriodo       = periodo;
  _detalleAsesorPeriodoOffset = 0;
  _detalleAsesorLimit         = 10;
  _actualizarHistorialAsesor();
}

// Navega hacia atrás (dir=-1) o adelante (dir=1) dentro del período elegido
function navAsesorPeriodo(dir) {
  // No dejar pasar del presente
  if (dir > 0 && _detalleAsesorPeriodoOffset >= 0) return;
  _detalleAsesorPeriodoOffset += dir;
  _detalleAsesorLimit = 10;
  _actualizarHistorialAsesor();
}

// Filtra el historial por texto de cliente.
// Solo reemplaza las filas — el input (dentro del header) nunca se destruye.
function buscarAsesorCliente(texto) {
  _detalleAsesorBusqueda = texto;
  _detalleAsesorLimit    = 10;
  _soloActualizarFilas();
}

// Actualiza únicamente #asesor-historial-rows sin tocar el header ni el input.
function _soloActualizarFilas() {
  const nombre = _detalleAsesorNombre;
  if (!nombre) return;

  const todasConsultas = typeof consultas !== 'undefined' ? consultas : [];
  const consultasCli = todasConsultas.filter(c =>
    c.asesor === nombre &&
    c.tipoConsulta !== 'programacion_interna' &&
    c.tipo_consulta !== 'programacion_interna' &&
    !String(c.id).startsWith('_temp_')
  );
  const consultasInt = todasConsultas.filter(c =>
    c.asesor === nombre &&
    (c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna') &&
    !String(c.id).startsWith('_temp_')
  );

  const rows = document.getElementById('asesor-historial-rows');
  if (rows) {
    const { html } = _calcularFilas(consultasCli, consultasInt);
    rows.outerHTML = html;
  }
}

// Calcula el rango de fechas para el período activo con su offset
function _getPeriodoBounds() {
  if (_detalleAsesorPeriodo === 'todo') return null;
  const ahora = new Date();

  if (_detalleAsesorPeriodo === 'dia') {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + _detalleAsesorPeriodoOffset);
    return {
      desde: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      hasta: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      label: d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    };
  }

  if (_detalleAsesorPeriodo === 'mes') {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() + _detalleAsesorPeriodoOffset, 1);
    return {
      desde: new Date(d.getFullYear(), d.getMonth(), 1),
      hasta: new Date(d.getFullYear(), d.getMonth() + 1, 1),
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    };
  }

  if (_detalleAsesorPeriodo === 'anio') {
    const anio = ahora.getFullYear() + _detalleAsesorPeriodoOffset;
    return {
      desde: new Date(anio, 0, 1),
      hasta: new Date(anio + 1, 0, 1),
      label: String(anio)
    };
  }

  return null;
}

function _actualizarHistorialAsesor() {
  const nombre = _detalleAsesorNombre;
  if (!nombre) return;

  const todasConsultas = typeof consultas !== 'undefined' ? consultas : [];
  const consultasCli = todasConsultas.filter(c =>
    c.asesor === nombre &&
    c.tipoConsulta !== 'programacion_interna' &&
    c.tipo_consulta !== 'programacion_interna' &&
    !String(c.id).startsWith('_temp_')
  );
  const consultasInt = todasConsultas.filter(c =>
    c.asesor === nombre &&
    (c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna') &&
    !String(c.id).startsWith('_temp_')
  );

  // Solo actualiza el encabezado (filtros) y las filas por separado,
  // sin destruir el input del buscador
  const header = document.getElementById('asesor-historial-header');
  if (header) header.outerHTML = _renderAsesorHistorialHeader();

  const rows = document.getElementById('asesor-historial-rows');
  if (rows) {
    const { html } = _calcularFilas(consultasCli, consultasInt);
    rows.outerHTML = html;
  }
}

// Genera el encabezado con filtros (botones de período, navegador, label de tipo).
// Se reemplaza por sí solo al cambiar período/tipo, SIN tocar el buscador.
function _renderAsesorHistorialHeader() {
  const bounds = _getPeriodoBounds();

  const periodoOpts = [
    { val: 'todo', lbl: 'Todos' },
    { val: 'dia',  lbl: 'Día'  },
    { val: 'mes',  lbl: 'Mes'  },
    { val: 'anio', lbl: 'Año'  },
  ];
  const periodBtns = periodoOpts.map(({ val, lbl }) => {
    const activo = _detalleAsesorPeriodo === val;
    return `<button onclick="setAsesorHistorialPeriodo('${val}')" style="
      padding:5px 12px;font-size:12px;border-radius:6px;
      border:1px solid ${activo ? 'var(--accent)' : 'var(--border)'};
      background:${activo ? 'var(--accent)' : 'transparent'};
      color:${activo ? '#fff' : 'var(--text2)'};
      cursor:pointer;font-weight:${activo ? '600' : '400'};transition:background .13s,border-color .13s
    ">${lbl}</button>`;
  }).join('');

  const navPeriodoHtml = bounds ? (() => {
    const nextDisabled = _detalleAsesorPeriodoOffset >= 0;
    const btn = 'background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text2);font-size:14px;line-height:1';
    return `
      <div style="display:flex;align-items:center;gap:6px;margin-left:4px">
        <button onclick="navAsesorPeriodo(-1)" style="${btn};cursor:pointer">‹</button>
        <span style="font-size:12px;font-weight:500;color:var(--text2);min-width:80px;text-align:center">${bounds.label}</span>
        <button onclick="navAsesorPeriodo(1)" ${nextDisabled ? 'disabled' : ''} style="${btn};cursor:${nextDisabled ? 'not-allowed' : 'pointer'};${nextDisabled ? 'opacity:.35' : ''}">›</button>
      </div>`;
  })() : '';

  const filtroLabel = _detalleAsesorTipoFiltro
    ? ` — ${(_TIPO_DEF[_detalleAsesorTipoFiltro]?.label) || _detalleAsesorTipoFiltro}`
    : '';

  return `
    <div id="asesor-historial-header" style="padding:12px 20px 12px;border-bottom:1px solid var(--border)">
      <!-- Título + quitar filtro -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">
          Historial${filtroLabel}
        </span>
        ${_detalleAsesorTipoFiltro
          ? `<button onclick="filtrarAsesorDetalleTipo('${_detalleAsesorTipoFiltro}')"
              style="font-size:11px;background:none;border:none;color:var(--accent);cursor:pointer;padding:0">
              ✕ Quitar filtro
             </button>`
          : ''}
      </div>
      <!-- Período + navegador -->
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <div style="display:flex;gap:4px">${periodBtns}</div>
        ${navPeriodoHtml}
      </div>
      <!-- Buscador — SIEMPRE aquí; nunca se reemplaza con outerHTML -->
      <div style="position:relative">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:13px;pointer-events:none">🔍</span>
        <input
          id="asesor-busqueda-input"
          type="text"
          placeholder="Buscar por cliente..."
          value="${_escAsesor(_detalleAsesorBusqueda)}"
          oninput="buscarAsesorCliente(this.value)"
          style="width:100%;box-sizing:border-box;padding:8px 10px 8px 32px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;outline:none"
        >
      </div>
    </div>`;
}

// Aplica todos los filtros activos y devuelve { filtradas, html } con las filas + ver más.
function _calcularFilas(consultasCli, consultasInt) {
  const CATS_LABELS = {
    liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración',
    actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema'
  };
  const TIPO_LABELS = {
    soporte: '🎧 Soporte', programacion: '🐛 Programación',
    comercial: '💼 Comercial', programacion_interna: '💻 Hs internas'
  };

  const todas = [...consultasCli, ...consultasInt].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  // 1) Tipo
  let filtradas = todas;
  if (_detalleAsesorTipoFiltro) {
    if (_detalleAsesorTipoFiltro === 'interna') {
      filtradas = todas.filter(c => c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna');
    } else {
      filtradas = todas.filter(c => (c.tipoConsulta || c.tipo_consulta) === _detalleAsesorTipoFiltro);
    }
  }

  // 2) Mes legacy
  if (_detalleAsesorMesFiltro) {
    const [anioF, mesF] = _detalleAsesorMesFiltro.split('-').map(Number);
    filtradas = filtradas.filter(c => {
      const d = new Date(c.timestamp);
      return d.getFullYear() === anioF && d.getMonth() + 1 === mesF;
    });
  }

  // 3) Período (día/mes/año con offset)
  const bounds = _getPeriodoBounds();
  if (bounds) {
    filtradas = filtradas.filter(c => {
      const d = new Date(c.timestamp);
      return d >= bounds.desde && d < bounds.hasta;
    });
  }

  // 4) Búsqueda por cliente
  const busq = _detalleAsesorBusqueda.trim().toLowerCase();
  if (busq) {
    filtradas = filtradas.filter(c => {
      const cli  = (c.cliente || c.cliente_nombre || '').toLowerCase();
      const desc = (c.descripcion || '').toLowerCase();
      return cli.includes(busq) || desc.includes(busq);
    });
  }

  const visibles  = filtradas.slice(0, _detalleAsesorLimit);
  const restantes = filtradas.length - visibles.length;

  const filas = visibles.map(c => {
    const esInterna = c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna';
    const fecha = new Date(c.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const hora  = new Date(c.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const catLabel  = (typeof CATS !== 'undefined' && CATS[c.categoria]?.label) || CATS_LABELS[c.categoria] || c.categoria || '—';
    const subtema   = c.subtema ? ` › ${c.subtema}` : '';
    const tipoLabel = TIPO_LABELS[c.tipoConsulta || c.tipo_consulta] || '🎧 Soporte';
    const tiempoTxt = c.tiempo ? (() => {
      const h   = parseFloat(c.tiempo);
      const hs  = Math.floor(h);
      const min = Math.round((h - hs) * 60);
      return min > 0 ? `${hs}h ${min}min` : `${hs}h`;
    })() : null;

    const clickAttr = c.id ? `onclick="_abrirDetalleRegistroAsesor('${c.id}')"` : '';
    const hoverAttr = c.id ? `onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''"` : '';

    return `
      <div ${clickAttr} ${hoverAttr} style="
        display:flex;align-items:center;gap:12px;
        padding:12px 20px;
        border-bottom:1px solid var(--border);
        ${c.id ? 'cursor:pointer;transition:background .13s;' : ''}
      ">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${esInterna
              ? _escAsesor(c.descripcion || c.categoria || 'Hora interna')
              : _escAsesor(c.cliente || c.cliente_nombre || '—')}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span>${tipoLabel}</span>
            ${!esInterna
              ? `<span>· ${_escAsesor(catLabel + subtema)}</span>`
              : (c.categoria && c.categoria !== '—' ? `<span>· ${_escAsesor(catLabel)}</span>` : '')}
            ${c.repetida === 'si' ? '<span style="color:var(--amber);font-weight:600">· Repetida</span>' : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${tiempoTxt ? `<div style="font-size:12px;font-weight:600;color:var(--text2)">⏱ ${tiempoTxt}</div>` : ''}
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${fecha} ${hora}</div>
        </div>
      </div>`;
  }).join('');

  const verMasBtn = restantes > 0
    ? `<button class="btn-ver-mas" onclick="_verMasHistorialAsesor()">
        Ver ${Math.min(restantes, 10)} más (${restantes} restantes)
       </button>`
    : '';

  const html = `
    <div id="asesor-historial-rows">
      ${visibles.length === 0
        ? '<div style="text-align:center;color:var(--text3);padding:32px;font-size:13px">Sin registros para este filtro.</div>'
        : filas}
      ${verMasBtn}
    </div>`;

  return { filtradas, html };
}

// Render inicial: genera la card completa (header + rows).
// Solo se llama una vez por visita al detalle; de ahí en más se actualizan partes.
function _renderAsesorHistorial(consultasCli, consultasInt) {
  const { html: rowsHtml } = _calcularFilas(consultasCli, consultasInt);

  return `
    <div id="asesor-historial-cont" class="card" style="padding:0;overflow:hidden">
      ${_renderAsesorHistorialHeader()}
      ${rowsHtml}
    </div>
  `;
}

function _verMasHistorialAsesor() {
  _detalleAsesorLimit += 10;
  _soloActualizarFilas();
}

// ── Helper escape ─────────────────────────────────────────────────────────────

function _escAsesor(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
