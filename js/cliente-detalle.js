// ════════════════════════════════════
// DETALLE DE CLIENTE
// Vista con historial de consultas, stats y mini chart para un cliente específico.
// Se accede desde la card del cliente (botón "Ver historial").
// ════════════════════════════════════

// ID del cliente actualmente en vista de detalle
let _detalleClienteId = null;

// Instancia del mini chart (para destruir antes de recrear)
let _detalleChartInstance = null;
let _detalleOrigen = 'clientes'; // página desde la que se navegó al detalle

// Filtros activos en la tabla de historial
let _detalleMesFiltro    = null;
let _detalleTipoFiltro   = null;
let _detalleHistorialLimit = 5; // cuántas consultas mostrar inicialmente

// ────────── Entrada principal ──────────

function goClienteDetail(clienteId) {
  _detalleClienteId      = clienteId;
  _detalleMesFiltro      = null;
  _detalleTipoFiltro     = null;
  _detalleHistorialLimit = 5;

  // Guardar la página actual antes de navegar
  const paginaActiva = document.querySelector('.page.active');
  _detalleOrigen = paginaActiva ? paginaActiva.id : 'clientes';

  // Navegar a la página de detalle (sin marcar ningún nav-item activo)
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('cliente-detalle').classList.add('active');
  window.scrollTo(0, 0);

  renderDetalleCliente(clienteId);
}

// ────────── Render principal ──────────

function renderDetalleCliente(clienteId) {
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.id === clienteId)
    : null;

  if (!cliente) {
    document.getElementById('cliente-detalle').innerHTML =
      '<div class="card" style="text-align:center;padding:40px;color:var(--text3)">Cliente no encontrado.</div>';
    return;
  }

  // Excluir entradas temporales (_temp_) que aún no fueron confirmadas por realtime
  const consultasDelCliente = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === cliente.nombre && !String(c.id).startsWith('_temp_'))
    : [];

  // Armar el HTML de la página
  const page = document.getElementById('cliente-detalle');
  page.innerHTML = `
    ${_renderDetalleHeader(cliente)}
    ${_renderDetalleStats(cliente, consultasDelCliente)}
    ${_renderDetalleTipoStats(consultasDelCliente)}
    ${_renderDetalleMiniChart(cliente, consultasDelCliente)}
    ${_renderDetalleFiltroYTabla(cliente, consultasDelCliente)}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid var(--border);text-align:right">
      <button class="btn" style="background:#9b2215;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;cursor:pointer"
        onclick="eliminarCliente('${cliente.id}')">
        🗑 Eliminar cliente
      </button>
    </div>
  `;

  // Inicializar el mini chart después de que el DOM existe
  _initDetalleMiniChart(consultasDelCliente);
}

// ────────── Header ──────────

function _renderDetalleHeader(cliente) {
  const iniciales = cliente.nombre.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
  const colores = ['#e8f0fe', '#e6f4ea', '#fef3e2', '#fce8e6', '#f3e8fd'];
  const textColores = ['#1a56db', '#1e7e34', '#b45309', '#c5221f', '#7c3aed'];
  const idx = cliente.nombre.charCodeAt(0) % colores.length;

  const areaBadge = cliente.area === 'impl'
    ? '<span class="badge b-blue">Implementación</span>'
    : '<span class="badge b-green">Soporte</span>';

  const autBadge = {
    baja:  '<span class="badge b-red">Autonomía baja</span>',
    media: '<span class="badge b-amber">Autonomía media</span>',
    alta:  '<span class="badge b-green">Autonomía alta</span>',
  }[cliente.autonomia] || '';

  const scoreClase = cliente.score >= 7 ? 'b-green' : cliente.score >= 4 ? 'b-amber' : 'b-red';
  const scoreBadge = `<span class="badge ${scoreClase}">Score ${cliente.score ?? 0}/10</span>`;

  // Razón social y CUIT
  const razonLine = cliente.razon_social
    ? `<div style="font-size:12px;color:var(--text3);margin-top:2px">📋 ${_escHtml(cliente.razon_social)}</div>`
    : '';
  const cuitLine = cliente.cuit
    ? `<div style="font-size:12px;color:var(--text3);margin-top:1px">CUIT: ${_escHtml(cliente.cuit)}</div>`
    : '';

  return `
    <div class="detalle-header">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:14px">
        <button class="btn-secondary detalle-back" onclick="volverAClientes()">← Volver</button>
        <button class="btn-primary" onclick="irARegistrarConsulta('${_escHtml(cliente.nombre)}')">+ Consulta</button>
      </div>
      <div class="detalle-header__body" style="width:100%">
        <div class="av-lg" style="background:${colores[idx]};color:${textColores[idx]};border-radius:14px;width:52px;height:52px;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${_escHtml(iniciales)}
        </div>
        <div class="detalle-header__info">
          <div class="detalle-header__nombre">${_escHtml(cliente.nombre)}</div>
          ${razonLine}
          ${cuitLine}
          <div class="detalle-header__badges" style="margin-top:8px">
            ${areaBadge}
            ${autBadge}
            ${scoreBadge}
            <span class="badge" style="background:var(--surface2);color:var(--text2)">${_escHtml(cliente.tipo || 'empresa')}</span>
          </div>
        </div>
        ${cliente.whaticket_url ? `
          <a href="${_escHtml(cliente.whaticket_url)}" target="_blank" class="btn-sm" style="margin-left:auto;flex-shrink:0;">
            💬 Whaticket
          </a>` : ''}
      </div>
    </div>
  `;
}

// ────────── Stats ──────────

function _renderDetalleStats(cliente, consultasDelCliente) {
  const ahora      = new Date();
  const mesActual  = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const total     = consultasDelCliente.length;
  const esMes     = consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });
  const repetidas = consultasDelCliente.filter(c => c.repetida === 'si').length;
  const pctRep    = total > 0 ? Math.round((repetidas / total) * 100) : 0;

  // Top categoría
  const catCount = {};
  consultasDelCliente.forEach(c => { if (c.categoria) catCount[c.categoria] = (catCount[c.categoria] || 0) + 1; });
  const topCat   = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
  const CATS_LABELS = {
    liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración',
    actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema'
  };
  const topCatLabel = topCat ? (CATS_LABELS[topCat[0]] || topCat[0]) : '—';

  // Horas consumidas
  const fmtHs = h => h % 1 === 0 ? h + ' hs' : h.toFixed(1) + ' hs';
  const hsMes   = esMes.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0);
  const hsTotal = consultasDelCliente.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0);
  const hsMesTexto   = hsMes   > 0 ? fmtHs(hsMes)   : '—';
  const hsTotalTexto = hsTotal > 0 ? fmtHs(hsTotal)  : '—';
  const hsMesColor   = hsMes >= 5 ? 'var(--red)' : hsMes >= 2 ? 'var(--amber)' : 'var(--accent)';

  // Nombre del mes actual
  const nombreMes = ahora.toLocaleString('es-AR', { month: 'long' });

  return `
    <div class="detalle-stats">
      <div class="detalle-stat">
        <div class="detalle-stat__val">${total}</div>
        <div class="detalle-stat__label">Consultas históricas</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val">${esMes.length}</div>
        <div class="detalle-stat__label">En ${nombreMes}</div>
      </div>
      <div class="detalle-stat" style="${pctRep > 30 ? 'color:var(--red)' : ''}">
        <div class="detalle-stat__val">${pctRep}%</div>
        <div class="detalle-stat__label">% repetidas</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val" style="color:${hsMesColor};font-size:22px">${hsMesTexto}</div>
        <div class="detalle-stat__label">hs este mes</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val" style="font-size:22px">${hsTotalTexto}</div>
        <div class="detalle-stat__label">hs total histórico</div>
      </div>
    </div>
  `;
}

// ────────── Panel de tipos de consulta ──────────

function _renderDetalleTipoStats(consultasDelCliente) {
  const soporte      = consultasDelCliente.filter(c => !c.tipoConsulta || c.tipoConsulta === 'soporte').length;
  const programacion = consultasDelCliente.filter(c => c.tipoConsulta === 'programacion').length;
  const comercial    = consultasDelCliente.filter(c => c.tipoConsulta === 'comercial').length;

  const item = (tipo, emoji, label, count, color) => `
    <div onclick="filtrarDetalleTipo('${tipo}')" title="Filtrar por ${label}"
      style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;
             cursor:pointer;border-radius:8px;transition:background .15s"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-size:22px;font-weight:700;color:${color}">${count}</div>
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${emoji} ${label}</div>
    </div>`;

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="padding:10px 20px 6px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">
        Consultas por tipo
      </div>
      <div style="display:flex;gap:0">
        ${item('soporte',      '🎧', 'Soporte',      soporte,      'var(--accent)')}
        <div style="width:1px;background:var(--border);margin:8px 0"></div>
        ${item('programacion', '🐛', 'Programación', programacion, 'var(--red)')}
        <div style="width:1px;background:var(--border);margin:8px 0"></div>
        ${item('comercial',    '💼', 'Comercial',    comercial,    'var(--green)')}
      </div>
    </div>
  `;
}

// ────────── Mini Chart ──────────

function _renderDetalleMiniChart(cliente, consultasDelCliente) {
  return `
    <div class="card" style="padding: 20px 24px 16px">
      <div class="card-title" style="margin-bottom:12px">Consultas por mes — últimos 6 meses</div>
      <div style="position:relative;height:160px">
        <canvas id="detalle-chart" role="img" aria-label="Consultas del cliente por mes"></canvas>
      </div>
    </div>
  `;
}

function _initDetalleMiniChart(consultasDelCliente) {
  const canvas = document.getElementById('detalle-chart');
  if (!canvas) return;

  // Destruir instancia previa si existe
  if (_detalleChartInstance) {
    _detalleChartInstance.destroy();
    _detalleChartInstance = null;
  }

  // Armar datos de los últimos 6 meses
  const ahora = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleString('es-AR', { month: 'short' }) });
  }

  const totales   = meses.map(m => consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio;
  }).length);

  const repetidas = meses.map(m => consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio && c.repetida === 'si';
  }).length);

  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  _detalleChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [
        {
          label: 'Total',
          data: totales,
          backgroundColor: 'rgba(99,102,241,0.75)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Repetidas',
          data: repetidas,
          backgroundColor: 'rgba(239,68,68,0.65)',
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

// ────────── Filtro + Tabla ──────────

function _renderDetalleFiltroYTabla(cliente, consultasDelCliente) {
  // Armar opciones del filtro: todos los meses que tienen al menos 1 consulta
  const mesesConDatos = {};
  consultasDelCliente.forEach(c => {
    const d   = new Date(c.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!mesesConDatos[key]) {
      mesesConDatos[key] = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
    }
  });

  const opcionesMeses = Object.entries(mesesConDatos)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join('');

  const filas = _buildFilasTabla(cliente, consultasDelCliente, _detalleMesFiltro, _detalleTipoFiltro);

  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 16px 12px;border-bottom:1px solid var(--border)">
        <div class="card-title" style="margin:0 0 10px">Historial de consultas</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="detalle-tipo-filtro" style="margin-bottom:0;font-size:11px;padding:4px 8px;height:28px;border-radius:6px" onchange="filtrarDetalleTipo(this.value)">
            <option value="">Todos los tipos</option>
            <option value="soporte">🎧 Soporte</option>
            <option value="programacion">🐛 Programación</option>
            <option value="comercial">💼 Comercial</option>
          </select>
          <select id="detalle-mes-filtro" style="margin-bottom:0;font-size:11px;padding:4px 8px;height:28px;border-radius:6px" onchange="filtrarDetalleMes(this.value)">
            <option value="">Todos los meses</option>
            ${opcionesMeses}
          </select>
        </div>
      </div>
      <div id="detalle-tabla-body" style="padding:8px 0">
        ${filas}
      </div>
    </div>
  `;
}

function _buildFilasTabla(cliente, consultasDelCliente, mesFiltro, tipoFiltro) {
  const CATS_LABELS = {
    liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración',
    actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema'
  };
  const TIPO_BADGES = {
    soporte:              '<span class="badge b-blue"   style="font-size:10px">🎧 Soporte</span>',
    programacion:         '<span class="badge b-red"    style="font-size:10px">🐛 Program.</span>',
    comercial:            '<span class="badge b-green"  style="font-size:10px">💼 Comercial</span>',
    programacion_interna: '<span class="badge b-amber"  style="font-size:10px">💻 Program.</span>',
    implementacion:       '<span class="badge b-purple" style="font-size:10px">🚀 Implem.</span>',
  };

  let lista = consultasDelCliente;

  if (mesFiltro) {
    const [anioF, mesF] = mesFiltro.split('-').map(Number);
    lista = lista.filter(c => {
      const d = new Date(c.timestamp);
      return d.getFullYear() === anioF && d.getMonth() + 1 === mesF;
    });
  }

  if (tipoFiltro) {
    lista = lista.filter(c => (c.tipoConsulta || 'soporte') === tipoFiltro);
  }

  // Ordenar de más reciente a más antigua
  lista = [...lista].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (lista.length === 0) {
    return `<div style="text-align:center;color:var(--text3);padding:28px;font-size:13px">
      Sin consultas para los filtros seleccionados.
    </div>`;
  }

  const total    = lista.length;
  const visible  = lista.slice(0, _detalleHistorialLimit);
  const restante = total - visible.length;

  return visible.map((c, i) => {
    const fecha = new Date(c.timestamp).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });
    const cat       = CATS_LABELS[c.categoria] || (c.categoria || '—');
    const subtema   = c.subtema || '—';
    const asesor    = c.asesor  || '—';
    const esRepetida = c.repetida === 'si';
    const tipoBadge = TIPO_BADGES[c.tipoConsulta || 'soporte'] || TIPO_BADGES.soporte;
    const desc      = c.descripcion ? c.descripcion.substring(0, 60) + (c.descripcion.length > 60 ? '…' : '') : '—';

    // Datos para el modal (JSON escapado)
    // Buscar texto de la solución en el array global 'soluciones'
    const solObj = c.solucionId && typeof soluciones !== 'undefined'
      ? soluciones.find(s => s.id === c.solucionId)
      : null;
    const solucionTitulo = solObj ? solObj.titulo : null;
    const solucionPasos  = solObj && Array.isArray(solObj.pasos) ? solObj.pasos : [];

    const modalData = _escHtml(JSON.stringify({
      id: c.id,
      fecha, cat, subtema, asesor, repetida: c.repetida,
      descripcion: c.descripcion || '',
      solucionTitulo,
      solucionPasos,
      tiempo: c.tiempo ?? null,
      tipo: c.tipoConsulta || 'soporte'
    }));

    return `
      <button onclick="abrirDetalleConsulta(this)" data-consulta="${modalData}"
        style="display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--border);padding:12px 16px;cursor:pointer;font-family:inherit;transition:background 0.1s"
        onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='none'">
        <div style="flex-shrink:0;margin-top:2px">
          ${tipoBadge}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(cat)} · ${_escHtml(subtema)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(desc)}</div>
        </div>
        <div style="flex-shrink:0;text-align:right">
          <div style="font-size:11px;color:var(--text3)">${fecha}</div>
          ${esRepetida ? '<span class="badge b-red" style="font-size:9px;margin-top:4px;display:inline-block">Repetida</span>' : ''}
        </div>
      </button>
    `;
  }).join('') + (restante > 0 ? `
    <div style="padding:12px 16px;border-top:1px solid var(--border);text-align:center">
      <button onclick="verMasDetalleHistorial()"
        style="background:none;border:1px solid var(--border2);color:var(--text2);font-size:12px;font-family:inherit;padding:6px 20px;border-radius:8px;cursor:pointer;transition:background .13s"
        onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">
        Ver ${Math.min(restante, 5)} más (${restante} restantes)
      </button>
    </div>` : '');
}

function verMasDetalleHistorial() {
  _detalleHistorialLimit += 5;
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

// ────────── Filtros interactivos ──────────

function _getConsultasDelClienteActual() {
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.id === _detalleClienteId)
    : null;
  if (!cliente) return null;
  const lista = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === cliente.nombre)
    : [];
  return { cliente, lista };
}

function filtrarDetalleMes(valor) {
  _detalleMesFiltro      = valor || null;
  _detalleHistorialLimit = 5;
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

function filtrarDetalleTipo(valor) {
  _detalleTipoFiltro     = valor || null;
  _detalleHistorialLimit = 5;
  // Sincronizar el select si se llamó desde el panel de contadores (click en número)
  const sel = document.getElementById('detalle-tipo-filtro');
  if (sel) sel.value = valor || '';
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

// ────────── Modal detalle de consulta ──────────

function abrirDetalleConsulta(btn) {
  try {
    const data = JSON.parse(btn.dataset.consulta);
    const TIPO_LABELS = { soporte: '🎧 Soporte', programacion: '🐛 Programación', comercial: '💼 Comercial' };

    const html = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-blue" style="font-size:11px">${TIPO_LABELS[data.tipo] || data.tipo}</span>
          ${data.repetida === 'si' ? '<span class="badge b-red" style="font-size:11px">Repetida</span>' : '<span class="badge b-green" style="font-size:11px">Nueva</span>'}
          <span style="font-size:12px;color:var(--text3);margin-left:auto">${data.fecha}</span>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Categoría</div>
          <div style="font-size:14px;font-weight:600">${data.cat}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Subtema</div>
          <div style="font-size:14px">${data.subtema}</div>
        </div>
        ${data.descripcion ? `
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Descripción</div>
          <div style="font-size:13px;line-height:1.5;color:var(--text2)">${data.descripcion}</div>
        </div>` : ''}
        <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid var(--border)">
          <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Asesor</div><div style="font-size:13px;font-weight:500">${data.asesor}</div></div>
          <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Tiempo</div><div style="font-size:13px;font-weight:500">${data.tiempo != null ? data.tiempo + ' hs' : '—'}</div></div>
        </div>
        ${data.solucionTitulo ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Solución aplicada</div>
          ${data.solucionPasos && data.solucionPasos.length > 0 ? `
          <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--text2)">
            ${data.solucionPasos.map(p => `<li>${p}</li>`).join('')}
          </ol>` : ''}
        </div>` : `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text3)">
          Sin solución registrada en la base.
        </div>`}
      </div>`;

    // Reusar el modal de consulta o crear uno temporal
    let modal = document.getElementById('modal-detalle-consulta');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-detalle-consulta';
      modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px';
      modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;max-width:480px;width:100%;padding:22px;box-shadow:0 16px 48px rgba(0,0,0,0.25);max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:15px;font-weight:700">Detalle de consulta</div>
          <button onclick="document.getElementById('modal-detalle-consulta').style.display='none'" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text3)">✕</button>
        </div>
        ${html}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
          <button onclick="eliminarConsultaDesdeModal('${data.id}')"
            style="background:none;border:1px solid var(--danger,#e53e3e);color:var(--danger,#e53e3e);border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;transition:background 0.15s"
            onmouseover="this.style.background='rgba(229,62,62,0.08)'" onmouseout="this.style.background='none'">
            🗑 Eliminar consulta
          </button>
        </div>
      </div>`;
    modal.style.display = 'flex';
  } catch(e) {
    console.error('Error abriendo detalle consulta', e);
  }
}

// ────────── Eliminar consulta ──────────

async function eliminarConsultaDesdeModal(id) {
  if (!id) return;

  if (!confirm('¿Seguro que querés eliminar esta consulta? Esta acción no se puede deshacer.')) return;

  // Si es un ID temporal (no guardado aún en DB), solo lo quitamos del array
  if (!String(id).startsWith('_temp_')) {
    try {
      await dbDelete('consultas', id);
    } catch (e) {
      console.error('Error eliminando consulta', e);
      toast('No se pudo eliminar la consulta: ' + (e.message || e));
      return;
    }
  }

  // Quitar del array en memoria
  if (typeof consultas !== 'undefined') {
    consultas = consultas.filter(c => String(c.id) !== String(id));
  }

  // Cerrar modal
  const modal = document.getElementById('modal-detalle-consulta');
  if (modal) modal.style.display = 'none';

  // Refrescar la vista del cliente
  const clienteActual = typeof clientes !== 'undefined'
    ? clientes.find(c => c.id === _detalleClienteId)
    : null;
  if (clienteActual) goClienteDetail(clienteActual.id);

  // Refrescar métricas generales
  if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
  if (typeof refreshConsultasPage === 'function') refreshConsultasPage();
  if (typeof renderClientes === 'function') renderClientes();

  toast('Consulta eliminada.');
}

// ────────── Volver ──────────

function volverAClientes() {
  _detalleClienteId  = null;
  _detalleMesFiltro  = null;
  _detalleTipoFiltro = null;
  if (_detalleChartInstance) {
    _detalleChartInstance.destroy();
    _detalleChartInstance = null;
  }
  const origen = _detalleOrigen || 'clientes';
  _detalleOrigen = 'clientes'; // reset para la próxima vez

  // Navegar a la página origen
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const paginaDestino = document.getElementById(origen);
  if (paginaDestino) paginaDestino.classList.add('active');

  // Marcar nav item del sidebar si existe
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[onclick*="${origen}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Marcar mobile nav si existe
  document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
  const mobileBtn = document.querySelector(`.mobile-nav-item[onclick*="${origen}"]`);
  if (mobileBtn) mobileBtn.classList.add('active');

  window.scrollTo(0, 0);
}

// ────────── Helper: escape HTML ──────────

function _escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
