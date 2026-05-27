// ════════════════════════════════════
// PANEL GENERAL — Gráficos y métricas dinámicas
//
// refreshPanelMetrics()  → lee consultas de localStorage y actualiza
//                          los cards + gráficos de tendencia/cliente/asesor/categoría.
//                          Se llama al cargar y cada vez que se guarda una consulta.
//
// refreshClientMetrics() → lee el array global `clientes` (Supabase) y actualiza
//                          contador de activos, autonomía y tabla de score.
//                          Se llama desde clientes.js al cargar/cambiar el array.
// ════════════════════════════════════

// Referencias a instancias de Chart.js (se crean una sola vez)
let chartTendInstance     = null;
let chartClientesInstance = null;
let chartEquipoInstance   = null;

// ────────── Helpers de fechas ──────────
// Leen del array global `consultas` (cargado por consultas.js desde Supabase).

// Devuelve las consultas del mes y año indicados
function getConsultasPorMes(mes, anio) {
  const todas = (typeof consultas !== 'undefined') ? consultas : [];
  return todas.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === mes && d.getFullYear() === anio;
  });
}

// Devuelve las consultas del año indicado
function getConsultasAnio(anio) {
  const todas = (typeof consultas !== 'undefined') ? consultas : [];
  return todas.filter(c => new Date(c.timestamp).getFullYear() === anio);
}

// Devuelve info de los últimos N meses (incluyendo el actual)
function getUltimosMeses(n) {
  const ahora = new Date();
  const resultado = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const label = d.toLocaleString('es-AR', { month: 'short' })
                   .replace('.', '')
                   .replace(/^./, s => s.toUpperCase());
    resultado.push({
      mes:       d.getMonth(),
      anio:      d.getFullYear(),
      label,
      consultas: getConsultasPorMes(d.getMonth(), d.getFullYear())
    });
  }
  return resultado;
}

// ────────── Inicialización de gráficos (una sola vez al cargar) ──────────

window.addEventListener('load', () => {
  initCharts();
  refreshPanelMetrics();
});

function initCharts() {
  // Tendencia mensual — total vs repetidas
  const ctxTend = document.getElementById('chartTend');
  if (ctxTend) {
    chartTendInstance = new Chart(ctxTend, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total',
            data: [],
            borderColor: '#2d2d8e',
            backgroundColor: 'transparent',
            tension: .35,
            pointRadius: 4,
            pointBackgroundColor: '#2d2d8e',
            borderWidth: 2
          },
          {
            label: 'Repetidas',
            data: [],
            borderColor: '#c0392b',
            backgroundColor: 'transparent',
            tension: .35,
            borderDash: [5, 4],
            pointRadius: 4,
            pointBackgroundColor: '#c0392b',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 }
          },
          x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 } } }
        }
      }
    });
  }

  // Consultas por cliente este mes
  const ctxCli = document.getElementById('chartClientes');
  if (ctxCli) {
    chartClientesInstance = new Chart(ctxCli, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Consultas',
          data: [],
          backgroundColor: '#2d2d8e',
          borderRadius: 5,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 }
          },
          x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 }, maxRotation: 35 } }
        }
      }
    });
  }

  // Consultas por asesor
  const ctxEq = document.getElementById('chartEquipo');
  if (ctxEq) {
    chartEquipoInstance = new Chart(ctxEq, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [],
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 }
          },
          x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 } } }
        }
      }
    });
  }
}

// ────────── Métricas del panel (alimentadas por consultas de localStorage) ──────────

function refreshPanelMetrics() {
  const ahora       = new Date();
  const mesActual   = getConsultasPorMes(ahora.getMonth(), ahora.getFullYear());
  const anioActual  = getConsultasAnio(ahora.getFullYear());
  const total       = mesActual.length;
  const repetidas   = mesActual.filter(c => c.repetida === 'si').length;
  const pctRep      = total > 0 ? Math.round((repetidas / total) * 100) : 0;

  // ── Cards de métricas ──
  const elConsultas = document.getElementById('metric-consultas-mes');
  if (elConsultas) elConsultas.textContent = total;

  const elRep = document.getElementById('metric-rep-pct');
  if (elRep) elRep.textContent = pctRep + '%';

  const elAnio = document.getElementById('metric-consultas-anio');
  if (elAnio) elAnio.textContent = anioActual.length;

  // Sub-label consultas: cuántas hay respecto al mes anterior
  const mesAnterior = getConsultasPorMes(
    ahora.getMonth() === 0 ? 11 : ahora.getMonth() - 1,
    ahora.getMonth() === 0 ? ahora.getFullYear() - 1 : ahora.getFullYear()
  );
  const elSub = document.getElementById('metric-consultas-sub');
  if (elSub) {
    if (total === 0) {
      elSub.textContent = 'Sin consultas este mes';
      elSub.className = 'metric-sub';
    } else {
      const diff = total - mesAnterior.length;
      if (diff > 0) {
        elSub.textContent = '+' + diff + ' vs mes anterior';
        elSub.className = 'metric-sub trend-dn'; // más consultas = peor
      } else if (diff < 0) {
        elSub.textContent = diff + ' vs mes anterior';
        elSub.className = 'metric-sub trend-up'; // menos consultas = mejor
      } else {
        elSub.textContent = 'Igual que el mes anterior';
        elSub.className = 'metric-sub';
      }
    }
  }

  // ── Gráfico de tendencia mensual (últimos 6 meses) ──
  if (chartTendInstance) {
    const meses = getUltimosMeses(6);
    chartTendInstance.data.labels                  = meses.map(m => m.label);
    chartTendInstance.data.datasets[0].data        = meses.map(m => m.consultas.length);
    chartTendInstance.data.datasets[1].data        = meses.map(m => m.consultas.filter(c => c.repetida === 'si').length);
    chartTendInstance.update();
  }

  // ── Gráfico consultas por cliente (este mes, top 10) ──
  if (chartClientesInstance) {
    const porCliente = {};
    mesActual.forEach(c => {
      if (c.cliente) porCliente[c.cliente] = (porCliente[c.cliente] || 0) + 1;
    });
    const sorted = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 10);
    chartClientesInstance.data.labels                 = sorted.map(e => e[0]);
    chartClientesInstance.data.datasets[0].data       = sorted.map(e => e[1]);
    chartClientesInstance.data.datasets[0].backgroundColor = sorted.map(() => '#2d2d8e');
    chartClientesInstance.update();
  }

  // ── Gráfico consultas por asesor (este mes) ──
  if (chartEquipoInstance) {
    const colores = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];
    const porAsesor = {};
    mesActual.forEach(c => {
      if (c.asesor) porAsesor[c.asesor] = (porAsesor[c.asesor] || 0) + 1;
    });
    const sorted = Object.entries(porAsesor).sort((a, b) => b[1] - a[1]);
    chartEquipoInstance.data.labels                          = sorted.map(e => e[0]);
    chartEquipoInstance.data.datasets[0].data                = sorted.map(e => e[1]);
    chartEquipoInstance.data.datasets[0].backgroundColor     = sorted.map((_, i) => colores[i % colores.length]);
    chartEquipoInstance.update();
  }

  // ── Barras de consultas por categoría ──
  const catCounts = {};
  Object.keys(CATS).forEach(k => { catCounts[k] = 0; });
  mesActual.forEach(c => {
    if (c.categoria && catCounts.hasOwnProperty(c.categoria)) {
      catCounts[c.categoria]++;
    }
  });
  const maxCat = Math.max(...Object.values(catCounts), 1);
  Object.keys(CATS).forEach(k => {
    const countEl = document.getElementById('cat-count-' + k);
    const fillEl  = document.getElementById('cat-fill-' + k);
    if (countEl) countEl.textContent = catCounts[k];
    if (fillEl)  fillEl.style.width  = Math.round((catCounts[k] / maxCat) * 100) + '%';
  });
}

// ────────── Métricas de clientes (alimentadas por el array global `clientes`) ──────────
// Se llama desde clientes.js después de cargar o cambiar el array.

function refreshClientMetrics() {
  const lista  = (typeof clientes !== 'undefined') ? clientes : [];
  const total  = lista.length;
  const impl   = lista.filter(c => c.area === 'impl').length;
  const baja   = lista.filter(c => c.autonomia === 'baja').length;
  const media  = lista.filter(c => c.autonomia === 'media').length;
  const alta   = lista.filter(c => c.autonomia === 'alta').length;
  const totalAut = baja + media + alta || 1;

  // ── Card "Clientes activos" en el Panel ──
  const elAct  = document.getElementById('metric-clientes-activos');
  const elImpl = document.getElementById('metric-clientes-impl');
  if (elAct)  elAct.textContent  = total;
  if (elImpl) elImpl.textContent = impl + ' en implementación';

  // ── Subtítulo de la sección Clientes ──
  const elSub = document.getElementById('clientes-page-sub');
  if (elSub) elSub.textContent = total + ' cliente' + (total !== 1 ? 's' : '') + ' activo' + (total !== 1 ? 's' : '');

  // ── Anillos de autonomía ──
  const pBaja  = Math.round((baja  / totalAut) * 100);
  const pMedia = Math.round((media / totalAut) * 100);
  const pAlta  = Math.round((alta  / totalAut) * 100);

  const elRingBaja  = document.getElementById('ring-aut-baja');
  const elRingMedia = document.getElementById('ring-aut-media');
  const elRingAlta  = document.getElementById('ring-aut-alta');
  if (elRingBaja)  elRingBaja.textContent  = pBaja  + '%';
  if (elRingMedia) elRingMedia.textContent = pMedia + '%';
  if (elRingAlta)  elRingAlta.textContent  = pAlta  + '%';

  // ── Barras de autonomía ──
  const elBajaCount  = document.getElementById('bar-aut-baja-count');
  const elMediaCount = document.getElementById('bar-aut-media-count');
  const elAltaCount  = document.getElementById('bar-aut-alta-count');
  const elBajaFill   = document.getElementById('bar-aut-baja-fill');
  const elMediaFill  = document.getElementById('bar-aut-media-fill');
  const elAltaFill   = document.getElementById('bar-aut-alta-fill');

  if (elBajaCount)  elBajaCount.textContent  = baja  + ' cliente' + (baja  !== 1 ? 's' : '');
  if (elMediaCount) elMediaCount.textContent = media + ' cliente' + (media !== 1 ? 's' : '');
  if (elAltaCount)  elAltaCount.textContent  = alta  + ' cliente' + (alta  !== 1 ? 's' : '');
  if (elBajaFill)   elBajaFill.style.width   = pBaja  + '%';
  if (elMediaFill)  elMediaFill.style.width  = pMedia + '%';
  if (elAltaFill)   elAltaFill.style.width   = pAlta  + '%';

  // ── Tabla de score de riesgo (top 8 clientes por score) ──
  const tbody = document.getElementById('score-riesgo-tbody');
  if (!tbody) return;

  // Incluye todos los clientes con score > 0, ordenados de mayor a menor
  const top = lista
    .filter(c => (c.score || 0) > 0)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);

  if (top.length === 0) {
    // Si hay clientes pero ninguno tiene score asignado todavía, mostrar todos
    const todos = lista.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).slice(0, 8);
    if (todos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sin clientes cargados todavía.</td></tr>`;
    } else {
      tbody.innerHTML = todos.map(c => renderScoreRow(c)).join('');
    }
  } else {
    tbody.innerHTML = top.map(c => renderScoreRow(c)).join('');
  }
}

// Renderiza una fila de la tabla de score de riesgo
function renderScoreRow(c) {
  const tipoLabel  = (typeof TIPO_LABELS !== 'undefined' && TIPO_LABELS[c.tipo]) || c.tipo || '—';
  const areaLabel  = c.area === 'impl' ? 'Impl.' : 'Soporte';
  const areaBadge  = c.area === 'impl' ? 'b-blue' : 'b-gray';
  const score      = c.score || 0;
  const scoreClass = score >= 7 ? 'b-green' : score >= 4 ? 'b-amber' : 'b-red';

  // % repetición: consultas repetidas del cliente este mes / total del cliente
  const ahora      = new Date();
  const todasGlobal = (typeof consultas !== 'undefined') ? consultas : [];
  const delCliente = todasGlobal.filter(q => {
    const d = new Date(q.timestamp);
    return q.cliente === c.nombre &&
           d.getMonth() === ahora.getMonth() &&
           d.getFullYear() === ahora.getFullYear();
  });
  const repCliente  = delCliente.filter(q => q.repetida === 'si').length;
  const pctRepCli   = delCliente.length > 0 ? Math.round((repCliente / delCliente.length) * 100) : null;
  const repTexto    = pctRepCli !== null ? pctRepCli + '%' : '—';
  const repColor    = pctRepCli === null ? 'var(--text3)' : pctRepCli >= 40 ? 'var(--red)' : pctRepCli >= 20 ? 'var(--amber)' : 'var(--green)';

  const autClass = c.autonomia === 'alta' ? 'b-green' : c.autonomia === 'media' ? 'b-amber' : 'b-red';
  const autLabel = c.autonomia ? (c.autonomia.charAt(0).toUpperCase() + c.autonomia.slice(1)) : '—';

  const adopColor = (c.adopcion || 0) >= 70 ? 'var(--green)' : (c.adopcion || 0) >= 50 ? 'var(--amber)' : 'var(--red)';

  return `<tr onclick="goClienteDetail('${c.id}')" style="cursor:pointer">
    <td style="font-weight:500">
      ${escapeHtmlPanel(c.nombre)}
      <span class="tipo-tag tipo-${c.tipo}" style="font-size:9px">${tipoLabel}</span>
    </td>
    <td><span class="badge ${scoreClass}">${score}/10</span></td>
    <td style="color:${repColor}">${repTexto}</td>
    <td><span class="badge ${autClass}">${autLabel}</span></td>
    <td style="color:${adopColor}">${c.adopcion || 0}%</td>
    <td><span class="badge ${areaBadge}">${areaLabel}</span></td>
    <td>
      <button class="btn-sm" onclick="event.stopPropagation();goClienteDetail('${c.id}')">Ver</button>
    </td>
  </tr>`;
}

// Escape HTML básico para usar en el panel
function escapeHtmlPanel(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
