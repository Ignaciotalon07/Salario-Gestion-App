// ════════════════════════════════════
// REPORTES
// Reportes de consultas por período (este mes hasta hoy / un mes específico /
// un año completo) y opcionalmente filtrados por cliente. Muestra todo en
// pantalla (métricas, gráficos, detalle) y permite exportar a Excel/PDF.
//
// Lee del array global `consultas` (cargado por consultas.js desde Supabase),
// no requiere ninguna tabla ni migración nueva.
// ════════════════════════════════════

const REP_TIPO_LABELS = {
  soporte:               'Soporte',
  programacion:          'Programación',
  comercial:             'Comercial',
  programacion_interna:  'Programación interna',
  implementacion:        'Implementación',
};

// Último reporte generado (para poder exportarlo sin volver a calcular)
let _repUltimoReporte = null;

// Instancias de Chart.js de esta sección (se crean una sola vez)
let _repChartCategorias = null;
let _repChartAsesores   = null;

// ────────── Filtros ──────────

// Popula el select de clientes y el de años. Se llama cada vez que se entra
// a la sección (desde nav.js) para que el listado de clientes esté al día.
function initReportesFiltros() {
  const selCliente = document.getElementById('rep-cliente');
  if (selCliente) {
    const valorActual = selCliente.value;
    const lista = (typeof clientes !== 'undefined' ? clientes : [])
      .slice()
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    selCliente.innerHTML = '<option value="">Todos los clientes</option>' +
      lista.map(c => `<option value="${escapeHtmlPanel(c.nombre)}">${escapeHtmlPanel(c.nombre)}</option>`).join('');
    if (valorActual) selCliente.value = valorActual;
  }

  const selAnio = document.getElementById('rep-anio');
  if (selAnio && selAnio.options.length === 0) {
    const anioActual = new Date().getFullYear();
    const anios = [];
    for (let y = anioActual; y >= anioActual - 4; y--) anios.push(y);
    selAnio.innerHTML = anios.map(y => `<option value="${y}">${y}</option>`).join('');
  }

  const inputMes = document.getElementById('rep-mes');
  if (inputMes && !inputMes.value) {
    const ahora = new Date();
    inputMes.value = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0');
  }
}

// Muestra/oculta los selectores de mes o año según el período elegido
function onCambioPeriodoReporte() {
  const periodo  = document.getElementById('rep-periodo').value;
  const mesWrap  = document.getElementById('rep-mes-wrap');
  const anioWrap = document.getElementById('rep-anio-wrap');
  if (mesWrap)  mesWrap.style.display  = periodo === 'mes_cerrado' ? 'flex' : 'none';
  if (anioWrap) anioWrap.style.display = periodo === 'anio'        ? 'flex' : 'none';
}

// Devuelve { desde: Date, hasta: Date, label: string } según el período elegido,
// o null si falta un dato (ej: no eligió mes)
function _repRango() {
  const periodo = document.getElementById('rep-periodo').value;

  if (periodo === 'mes_cerrado') {
    const val = document.getElementById('rep-mes').value; // "2026-09"
    if (!val) return null;
    const [y, m] = val.split('-').map(Number);
    const desde  = new Date(y, m - 1, 1, 0, 0, 0);
    const hasta  = new Date(y, m, 0, 23, 59, 59);
    const label  = desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { desde, hasta, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }

  if (periodo === 'anio') {
    const y = parseInt(document.getElementById('rep-anio').value, 10);
    if (!y) return null;
    const desde = new Date(y, 0, 1, 0, 0, 0);
    const hasta = new Date(y, 11, 31, 23, 59, 59);
    return { desde, hasta, label: 'Año ' + y };
  }

  // mes_actual: desde el 1° del mes en curso hasta hoy
  const ahora = new Date();
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
  const label = desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return { desde, hasta: ahora, label: (label.charAt(0).toUpperCase() + label.slice(1)) + ' (hasta hoy)' };
}

// ────────── Generar reporte ──────────

function generarReporte() {
  const rango = _repRango();
  if (!rango) {
    alert('Elegí el mes o el año del reporte.');
    return;
  }

  const clienteFiltro = document.getElementById('rep-cliente').value;
  const todas = (typeof consultas !== 'undefined') ? consultas : [];

  const filtradas = todas
    .filter(c => {
      const t = new Date(c.timestamp);
      if (t < rango.desde || t > rango.hasta) return false;
      if (clienteFiltro && c.cliente !== clienteFiltro) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  _repUltimoReporte = { rango, clienteFiltro, filtradas };

  const elEmpty     = document.getElementById('reportes-empty');
  const elResultado = document.getElementById('reportes-resultado');
  const elTitulo    = document.getElementById('rep-detalle-titulo');

  if (elTitulo) elTitulo.textContent = 'Detalle' + (clienteFiltro ? ' — ' + clienteFiltro : ' — Todos los clientes');

  if (filtradas.length === 0) {
    if (elEmpty) {
      elEmpty.textContent = 'No hay consultas registradas en ese período' +
        (clienteFiltro ? ` para ${clienteFiltro}` : '') + '.';
      elEmpty.style.display = 'block';
    }
    if (elResultado) elResultado.style.display = 'none';
    return;
  }

  if (elEmpty)     elEmpty.style.display     = 'none';
  if (elResultado) elResultado.style.display = 'block';

  _renderRepMetrics(filtradas, rango, clienteFiltro);
  _renderRepCharts(filtradas);
  _renderRepTabla(filtradas);
}

// Normaliza el label de categoría (clave corta → texto legible)
function _repCatLabel(categoria) {
  if (!categoria) return null;
  if (typeof CATS !== 'undefined' && CATS[categoria]) return CATS[categoria].label;
  return categoria;
}

// ────────── Métricas ──────────

function _renderRepMetrics(filtradas, rango, clienteFiltro) {
  const cont = document.getElementById('rep-metrics');
  if (!cont) return;

  const total     = filtradas.length;
  const minTotal  = sumaMinutos(filtradas);
  const repetidas = filtradas.filter(c => c.repetida === 'si').length;
  const pctRep    = total > 0 ? Math.round((repetidas / total) * 100) : 0;

  const porCategoria = {};
  filtradas.forEach(c => {
    const l = _repCatLabel(c.categoria);
    if (l) porCategoria[l] = (porCategoria[l] || 0) + 1;
  });
  const topCat = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];

  const porAsesor = {};
  filtradas.forEach(c => { if (c.asesor) porAsesor[c.asesor] = (porAsesor[c.asesor] || 0) + 1; });
  const topAsesor = Object.entries(porAsesor).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { label: 'Consultas',         value: total,                                   sub: rango.label },
    { label: 'Tiempo total',      value: minTotal > 0 ? fmtMinutos(minTotal) : '—', sub: 'del equipo' },
    { label: 'Repetidas',         value: pctRep + '%',                            sub: repetidas + ' de ' + total },
    { label: 'Más consultado',    value: topCat ? topCat[0] : '—',                sub: topCat ? topCat[1] + ' consulta' + (topCat[1] !== 1 ? 's' : '') : '' },
    { label: 'Quién más atendió', value: topAsesor ? topAsesor[0] : '—',          sub: topAsesor ? topAsesor[1] + ' consulta' + (topAsesor[1] !== 1 ? 's' : '') : '' },
  ];

  if (!clienteFiltro) {
    const clientesDistintos = new Set(filtradas.map(c => c.cliente).filter(Boolean)).size;
    cards.push({ label: 'Clientes atendidos', value: clientesDistintos, sub: 'distintos en el período' });
  }

  cont.innerHTML = cards.map(c => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtmlPanel(c.label)}</div>
      <div class="metric-value" style="font-size:19px;line-height:1.25">${escapeHtmlPanel(String(c.value))}</div>
      <div class="metric-sub">${escapeHtmlPanel(c.sub || '')}</div>
    </div>`).join('');
}

// ────────── Gráficos ──────────

function _renderRepCharts(filtradas) {
  // Por categoría
  const porCategoria = {};
  filtradas.forEach(c => {
    const l = _repCatLabel(c.categoria);
    if (l) porCategoria[l] = (porCategoria[l] || 0) + 1;
  });
  const catSorted = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  const ctxCat = document.getElementById('rep-chart-categorias');
  if (ctxCat) {
    if (!_repChartCategorias) {
      _repChartCategorias = new Chart(ctxCat, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#2d2d8e', borderRadius: 5, borderSkipped: false }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 } },
            x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 }, maxRotation: 30 } }
          }
        }
      });
    }
    _repChartCategorias.data.labels           = catSorted.map(e => e[0]);
    _repChartCategorias.data.datasets[0].data  = catSorted.map(e => e[1]);
    _repChartCategorias.update();
  }

  // Por asesor
  const porAsesor = {};
  filtradas.forEach(c => { if (c.asesor) porAsesor[c.asesor] = (porAsesor[c.asesor] || 0) + 1; });
  const asesorSorted = Object.entries(porAsesor).sort((a, b) => b[1] - a[1]);
  const COLORES_ASESORES = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];

  const ctxAs = document.getElementById('rep-chart-asesores');
  if (ctxAs) {
    if (!_repChartAsesores) {
      _repChartAsesores = new Chart(ctxAs, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 6, borderSkipped: false }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 } },
            x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 } } }
          }
        }
      });
    }
    _repChartAsesores.data.labels                      = asesorSorted.map(e => e[0]);
    _repChartAsesores.data.datasets[0].data             = asesorSorted.map(e => e[1]);
    _repChartAsesores.data.datasets[0].backgroundColor  = asesorSorted.map((_, i) => COLORES_ASESORES[i % COLORES_ASESORES.length]);
    _repChartAsesores.update();
  }
}

// ────────── Tabla de detalle ──────────

function _renderRepTabla(filtradas) {
  const tbody = document.getElementById('rep-tabla-body');
  if (!tbody) return;

  const solucionesMap = {};
  if (typeof soluciones !== 'undefined') {
    soluciones.forEach(s => { solucionesMap[s.id] = s.titulo; });
  }

  tbody.innerHTML = filtradas.map(c => {
    const fecha     = new Date(c.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tipoLabel = REP_TIPO_LABELS[c.tipoConsulta] || c.tipoConsulta || '—';
    const catLabel  = [_repCatLabel(c.categoria), c.subtema].filter(Boolean).join(' › ') || '—';
    const solucion  = (c.solucionId && solucionesMap[c.solucionId]) ? solucionesMap[c.solucionId] : '—';
    const tiempo    = c.tiempo ? fmtHHMM(c.tiempo) : '—';
    return `<tr>
      <td>${escapeHtmlPanel(fecha)}</td>
      <td>${escapeHtmlPanel(c.cliente || '—')}</td>
      <td>${escapeHtmlPanel(c.asesor || '—')}</td>
      <td>${escapeHtmlPanel(tipoLabel)}</td>
      <td>${escapeHtmlPanel(catLabel)}</td>
      <td>${escapeHtmlPanel(solucion)}</td>
      <td>${escapeHtmlPanel(tiempo)}</td>
    </tr>`;
  }).join('');
}

// ────────── Exportar a Excel ──────────

function exportarReporteExcel() {
  if (!_repUltimoReporte || _repUltimoReporte.filtradas.length === 0) {
    alert('Generá un reporte primero.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    alert('No se pudo cargar la librería de exportación a Excel. Revisá tu conexión e intentá de nuevo.');
    return;
  }

  const { rango, clienteFiltro, filtradas } = _repUltimoReporte;

  const detalle = filtradas.map(c => ({
    Fecha:          new Date(c.timestamp).toLocaleDateString('es-AR'),
    Cliente:        c.cliente || '',
    Asesor:         c.asesor || '',
    Tipo:           REP_TIPO_LABELS[c.tipoConsulta] || c.tipoConsulta || '',
    Categoria:      _repCatLabel(c.categoria) || '',
    Subtema:        c.subtema || '',
    Repetida:       c.repetida === 'si' ? 'Si' : 'No',
    Descripcion:    c.descripcion || '',
    'Tiempo (hs)':  c.tiempo ? fmtHHMM(c.tiempo) : ''
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle');

  const porCategoria = {};
  const porAsesor    = {};
  filtradas.forEach(c => {
    const l = _repCatLabel(c.categoria);
    if (l) porCategoria[l] = (porCategoria[l] || 0) + 1;
    if (c.asesor) porAsesor[c.asesor] = (porAsesor[c.asesor] || 0) + 1;
  });
  const minTotal = sumaMinutos(filtradas);

  const resumen = [
    { Metrica: 'Periodo',           Valor: rango.label },
    { Metrica: 'Cliente',           Valor: clienteFiltro || 'Todos' },
    { Metrica: 'Total consultas',   Valor: filtradas.length },
    { Metrica: 'Tiempo total',      Valor: minTotal > 0 ? fmtMinutos(minTotal) : '—' },
    { Metrica: '', Valor: '' },
    { Metrica: 'Por categoria', Valor: '' },
    ...Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Metrica: k, Valor: v })),
    { Metrica: '', Valor: '' },
    { Metrica: 'Por asesor', Valor: '' },
    ...Object.entries(porAsesor).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Metrica: k, Valor: v })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

  const nombreArchivo = 'reporte_' +
    (clienteFiltro ? clienteFiltro.replace(/[^a-zA-Z0-9]/g, '_') + '_' : '') +
    rango.label.replace(/[^a-zA-Z0-9]/g, '_') + '.xlsx';
  XLSX.writeFile(wb, nombreArchivo);
}

// ────────── Exportar a PDF ──────────

function exportarReportePDF() {
  if (!_repUltimoReporte || _repUltimoReporte.filtradas.length === 0) {
    alert('Generá un reporte primero.');
    return;
  }
  if (typeof window.jspdf === 'undefined') {
    alert('No se pudo cargar la librería de exportación a PDF. Revisá tu conexión e intentá de nuevo.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const { rango, clienteFiltro, filtradas } = _repUltimoReporte;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Reporte de consultas — Salario', 40, 40);

  doc.setFontSize(10.5);
  doc.setTextColor(90);
  doc.text('Período: ' + rango.label, 40, 60);
  doc.text('Cliente: ' + (clienteFiltro || 'Todos los clientes'), 40, 75);

  const minTotal  = sumaMinutos(filtradas);
  const repetidas = filtradas.filter(c => c.repetida === 'si').length;
  doc.text(
    'Total consultas: ' + filtradas.length +
    '     Tiempo total: ' + (minTotal > 0 ? fmtMinutos(minTotal) : '—') +
    '     Repetidas: ' + repetidas,
    40, 90
  );

  const rows = filtradas.map(c => [
    new Date(c.timestamp).toLocaleDateString('es-AR'),
    c.cliente || '—',
    c.asesor || '—',
    REP_TIPO_LABELS[c.tipoConsulta] || c.tipoConsulta || '—',
    [_repCatLabel(c.categoria), c.subtema].filter(Boolean).join(' › ') || '—',
    c.tiempo ? fmtHHMM(c.tiempo) : '—'
  ]);

  doc.autoTable({
    startY: 108,
    head: [['Fecha', 'Cliente', 'Asesor', 'Tipo', 'Categoría', 'Tiempo']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [45, 45, 142] },
    margin: { left: 40, right: 40 }
  });

  const nombreArchivo = 'reporte_' +
    (clienteFiltro ? clienteFiltro.replace(/[^a-zA-Z0-9]/g, '_') + '_' : '') +
    rango.label.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
  doc.save(nombreArchivo);
}
