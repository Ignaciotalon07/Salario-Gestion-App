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

  const COLORES_CATEGORIAS = ['#2d2d8e', '#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#7c3aed', '#0d9488', '#be185d', '#5f5e5a', '#65a30d'];

  const ctxCat = document.getElementById('rep-chart-categorias');
  if (ctxCat) {
    if (!_repChartCategorias) {
      _repChartCategorias = new Chart(ctxCat, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'var(--surface,#1a1a1a)', borderWidth: 2 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: '#9e9e99', font: { size: 11 }, boxWidth: 12, padding: 10 }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                  return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }
    _repChartCategorias.data.labels                     = catSorted.map(e => e[0]);
    _repChartCategorias.data.datasets[0].data            = catSorted.map(e => e[1]);
    _repChartCategorias.data.datasets[0].backgroundColor = catSorted.map((_, i) => COLORES_CATEGORIAS[i % COLORES_CATEGORIAS.length]);
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

// ────────── PDF — modal de notas ──────────
//
// Igual que el reporte semanal de Implementación: al tocar "Descargar PDF"
// se abre un modal chico para sumar una nota opcional antes de generar el
// archivo (no se genera directo al tocar el botón de la tabla).

function abrirModalReporteConsultas() {
  if (!_repUltimoReporte || _repUltimoReporte.filtradas.length === 0) {
    alert('Generá un reporte primero.');
    return;
  }
  const { rango, clienteFiltro } = _repUltimoReporte;
  const subEl = document.getElementById('repc-modal-sub');
  if (subEl) subEl.textContent = (clienteFiltro || 'Todos los clientes') + ' — ' + rango.label;
  const notasEl = document.getElementById('repc-notas');
  if (notasEl) notasEl.value = '';

  const modal = document.getElementById('modal-reporte-consultas');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function cerrarModalReporteConsultas() {
  const modal = document.getElementById('modal-reporte-consultas');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

// ────────── Texto narrativo automático ──────────

function _repCategoriasTop(arr, n) {
  const porCategoria = {};
  arr.forEach(c => {
    const l = _repCatLabel(c.categoria);
    if (l) porCategoria[l] = (porCategoria[l] || 0) + 1;
  });
  return Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, n || 999);
}

// Rango del mes calendario inmediatamente anterior al mes en el que arranca
// `desde` (se usa para comparar contra "el mes pasado").
function _repRangoMesAnterior(desde) {
  const anteriorDesde = new Date(desde.getFullYear(), desde.getMonth() - 1, 1, 0, 0, 0);
  const anteriorHasta = new Date(desde.getFullYear(), desde.getMonth(), 0, 23, 59, 59);
  return { desde: anteriorDesde, hasta: anteriorHasta };
}

// Arma un resumen en prosa, profesional, de qué estuvo consultando el
// cliente en el período y si hay continuidad con el mes anterior. Devuelve
// un array de párrafos.
function _repTextoNarrativo(rango, clienteFiltro, filtradas, periodo) {
  const parrafos = [];
  const total = filtradas.length;
  if (total === 0) return parrafos;

  const topCats = _repCategoriasTop(filtradas, 3);
  const catsTxt = topCats.map(([k, v]) => `${k} (${v})`).join(', ');
  const rangoLabelMin = rango.label.charAt(0).toLowerCase() + rango.label.slice(1);

  if (clienteFiltro) {
    parrafos.push(
      topCats.length > 0
        ? `Durante ${rangoLabelMin}, ${clienteFiltro} realizó ${total} consulta${total !== 1 ? 's' : ''} a través de nuestro equipo de soporte. Los temas más recurrentes fueron ${catsTxt}.`
        : `Durante ${rangoLabelMin}, ${clienteFiltro} realizó ${total} consulta${total !== 1 ? 's' : ''} a través de nuestro equipo de soporte.`
    );

    // Comparación con el mes anterior — solo tiene sentido cuando el período
    // elegido es un mes concreto (cerrado o el actual en curso).
    if (periodo === 'mes_cerrado' || periodo === 'mes_actual') {
      const rangoAnt = _repRangoMesAnterior(rango.desde);
      const todas = (typeof consultas !== 'undefined') ? consultas : [];
      const anteriores = todas.filter(c => {
        if (c.cliente !== clienteFiltro) return false;
        const t = new Date(c.timestamp);
        return t >= rangoAnt.desde && t <= rangoAnt.hasta;
      });

      if (anteriores.length > 0) {
        const catsAntNombres = _repCategoriasTop(anteriores).map(e => e[0]);
        const catsActNombres = topCats.map(e => e[0]);
        const comunes = catsActNombres.filter(c => catsAntNombres.includes(c));

        if (comunes.length > 0) {
          parrafos.push(
            `Se observa continuidad respecto al mes anterior (${anteriores.length} consulta${anteriores.length !== 1 ? 's' : ''}): el cliente también había consultado sobre ${comunes.join(', ')}. Puede ser una buena oportunidad para reforzar ese punto con una capacitación puntual o material de apoyo.`
          );
        } else {
          parrafos.push(
            `En el mes anterior el cliente había realizado ${anteriores.length} consulta${anteriores.length !== 1 ? 's' : ''}, pero sobre temáticas distintas a las de este período, sin coincidencias relevantes.`
          );
        }
      } else {
        parrafos.push('No se registran consultas de este cliente en el mes anterior.');
      }
    }

    const repetidas = filtradas.filter(c => c.repetida === 'si').length;
    if (repetidas > 0) {
      parrafos.push(
        `${repetidas} de estas consultas fueron marcadas como repetidas, lo que puede indicar que conviene reforzar ese tema con el cliente para reducir la cantidad de consultas asociadas a futuro.`
      );
    }
  } else {
    parrafos.push(
      topCats.length > 0
        ? `Durante ${rangoLabelMin} se registraron ${total} consulta${total !== 1 ? 's' : ''} en total entre todos los clientes, principalmente sobre ${topCats.map(e => e[0]).join(', ')}.`
        : `Durante ${rangoLabelMin} se registraron ${total} consulta${total !== 1 ? 's' : ''} en total entre todos los clientes.`
    );
  }

  return parrafos;
}

// ────────── Generación del PDF ──────────

// Logo institucional, cargado una sola vez y reutilizado en cada PDF que se
// genere (evita recargarlo de disco cada vez que se apreta "Descargar").
//
// Probamos primero una versión PNG con fondo transparente (mejor para el
// PDF, sin recuadro visible) y si no existe, caemos al JPEG con fondo que
// ya está en assets/img. Cuando subas la versión transparente, guardala
// como assets/img/logoconsultoraferro.png y se usa sola, sin tocar código.
let _repLogo = null; // { img, formato: 'PNG'|'JPEG' }
let _repLogoPromise = null;

function _repCargarImagen(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function _repCargarLogo() {
  if (_repLogo) return _repLogo;
  if (_repLogoPromise) return _repLogoPromise;

  _repLogoPromise = (async () => {
    const img = await _repCargarImagen('assets/img/consultora-ferro-logo-sin-fondo.png');
    _repLogo = img ? { img, formato: 'PNG' } : null;
    return _repLogo;
  })();

  return _repLogoPromise;
}

async function generarReporteConsultasPDF() {
  if (!_repUltimoReporte || _repUltimoReporte.filtradas.length === 0) {
    alert('Generá un reporte primero.');
    return;
  }
  if (typeof window.jspdf === 'undefined') {
    alert('No se pudo cargar la librería de exportación a PDF. Revisá tu conexión e intentá de nuevo.');
    return;
  }

  const btn = document.getElementById('repc-btn-generar');
  const textoOriginalBtn = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  try {
    const notas = ((document.getElementById('repc-notas') || {}).value || '').trim();
    const periodo = document.getElementById('rep-periodo').value;
    const { jsPDF } = window.jspdf;
    const { rango, clienteFiltro, filtradas } = _repUltimoReporte;
    const logo = await _repCargarLogo();

    // Naranja institucional (mismo tono que el badge "Nuevo" del Repositorio)
    const NARANJA = [245, 158, 11];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 44;
    let y = margin;

    const checkPageBreak = (alturaNecesaria) => {
      if (y + alturaNecesaria > pageH - margin) {
        doc.addPage('a4', 'landscape');
        y = margin;
      }
    };

    // ── Encabezado ──
    // Logo institucional en su propia fila, arriba a la izquierda, antes de
    // todo el resto del contenido (incluido el título).
    if (logo && logo.img.naturalWidth) {
      const logoX = -8;
      const logoY = -6;
      const logoH = 105;
      const logoW = logoH * (logo.img.naturalWidth / logo.img.naturalHeight);
      doc.addImage(logo.img, logo.formato, logoX, logoY, logoW, logoH);
      y = logoY + logoH + 8;
    }

    // Título en serif (Times), más elegante y distinguible del resto del
    // texto (que sigue en Helvetica, sans-serif) — un contraste tipográfico
    // clásico de reportes corporativos.
    doc.setFont('times', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(48, 48, 52);
    doc.text('Reporte de Consultas', pageW / 2, y, { align: 'center', charSpace: 0.4 }); y += 15;
    doc.setFont('times', 'italic');
    doc.setFontSize(12.5);
    doc.setTextColor(110);
    doc.text('Salario Gestión', pageW / 2, y, { align: 'center' }); y += 12;

    // Línea divisoria naranja debajo del título, para separar el
    // encabezado del resto del documento.
    doc.setDrawColor(NARANJA[0], NARANJA[1], NARANJA[2]);
    doc.setLineWidth(1.6);
    doc.line(pageW / 2 - 90, y, pageW / 2 + 90, y);
    y += 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30);
    doc.text(clienteFiltro || 'Todos los clientes', margin, y); y += 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(120);
    doc.text(rango.label, margin, y, { charSpace: 0.2 }); y += 26;

    // ── Métricas ──
    // Tira de estadísticas tipo "stat cards" en texto: etiqueta chica en
    // mayúsculas gris arriba, valor grande y en negrita abajo — más prolijo
    // que una sola línea corrida de texto.
    const minTotal  = sumaMinutos(filtradas);
    const repetidas = filtradas.filter(c => c.repetida === 'si').length;
    const pctRep    = filtradas.length > 0 ? Math.round((repetidas / filtradas.length) * 100) : 0;

    const stats = [
      { label: 'TOTAL CONSULTAS', valor: String(filtradas.length) },
      { label: 'TIEMPO TOTAL',    valor: minTotal > 0 ? fmtMinutos(minTotal) : '—' },
      { label: 'REPETIDAS',       valor: `${repetidas} (${pctRep}%)` },
    ];
    const statColW = 150;
    stats.forEach((s, i) => {
      const sx = margin + i * statColW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(s.label, sx, y, { charSpace: 0.5 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14.5);
      doc.setTextColor(NARANJA[0], NARANJA[1], NARANJA[2]);
      doc.text(s.valor, sx, y + 16);
      if (i > 0) {
        doc.setDrawColor(225, 225, 220);
        doc.setLineWidth(0.7);
        doc.line(sx - 14, y - 9, sx - 14, y + 14);
      }
    });
    y += 34;
    doc.setDrawColor(230, 230, 225);
    doc.setLineWidth(0.7);
    doc.line(margin, y, pageW - margin, y);
    y += 24;

    const seccion = (titulo) => {
      checkPageBreak(32);
      // Marca de acento naranja a la izquierda del título de sección.
      doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2]);
      doc.rect(margin, y - 9, 3, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(40);
      doc.text(titulo.toUpperCase(), margin + 10, y, { charSpace: 0.6 });
      y += 19;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(70);
    };

    const parrafo = (texto) => {
      const wrapped = doc.splitTextToSize(texto, pageW - margin * 2);
      checkPageBreak(wrapped.length * 14 + 8);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14 + 8;
    };

    // ── Resumen del período (texto narrativo) ──
    const narrativa = _repTextoNarrativo(rango, clienteFiltro, filtradas, periodo);
    if (narrativa.length > 0) {
      seccion('Resumen del período');
      narrativa.forEach(p => parrafo(p));
    }

    // ── Detalle de consultas ──
    seccion('Detalle de consultas');
    y -= 5; // el autoTable ya trae su propio espaciado superior

    const rows = filtradas.map(c => [
      new Date(c.timestamp).toLocaleDateString('es-AR'),
      c.cliente || '—',
      c.asesor || '—',
      REP_TIPO_LABELS[c.tipoConsulta] || c.tipoConsulta || '—',
      [_repCatLabel(c.categoria), c.subtema].filter(Boolean).join(' › ') || '—',
      c.descripcion || '—',
      c.tiempo ? fmtHHMM(c.tiempo) : '—'
    ]);

    doc.autoTable({
      startY: y,
      head: [['Fecha', 'Cliente', 'Asesor', 'Tipo', 'Categoría', 'Descripción', 'Tiempo']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 5, lineColor: [235, 231, 222], lineWidth: 0.5 },
      headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [250, 247, 241] },
      columnStyles: { 5: { cellWidth: 220 } },
      margin: { left: margin, right: margin }
    });

    y = doc.lastAutoTable.finalY + 20;

    // ── Cierre ──
    checkPageBreak(40);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(90);
    parrafo('Ante cualquier consulta sobre este reporte, quedamos a disposición del equipo de Salario.');

    // ── Notas opcionales ──
    // Solo se salta de hoja si no queda lugar en la actual; si hay espacio
    // libre después del cierre, las notas se agregan ahí mismo.
    if (notas) {
      checkPageBreak(40);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text('Notas', margin, y); y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(60);
      parrafo(notas);
    }

    // ── Pie de página en todas las hojas: fecha de generación + autor a la
    // izquierda, numeración "Página X de Y" a la derecha. ──
    const totalPaginas = doc.getNumberOfPages();
    const fechaGen = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const autor = (typeof getCurrentUserName === 'function' && getCurrentUserName()) || '';
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(225, 225, 220);
      doc.setLineWidth(0.6);
      doc.line(margin, pageH - 28, pageW - margin, pageH - 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(
        `Generado el ${fechaGen}${autor ? ' por ' + autor : ''} — Salario Gestión`,
        margin, pageH - 16
      );
      doc.text(`Página ${p} de ${totalPaginas}`, pageW - margin, pageH - 16, { align: 'right' });
    }

    const nombreArchivo = 'reporte_' +
      (clienteFiltro ? clienteFiltro.replace(/[^a-zA-Z0-9]/g, '_') + '_' : '') +
      rango.label.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    doc.save(nombreArchivo);
    cerrarModalReporteConsultas();
  } catch (e) {
    console.error('Error generando el reporte de consultas', e);
    alert('No se pudo generar el PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn || 'Descargar PDF'; }
  }
}
