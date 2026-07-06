// ════════════════════════════════════
// PANEL GENERAL — Gráficos y métricas dinámicas
//
// refreshPanelMetrics()  → lee el array global `consultas` (Supabase) y actualiza
//                          los cards + gráficos de tendencia/cliente/asesor/categoría.
//                          Se llama al cargar y cada vez que se guarda una consulta.
//
// refreshClientMetrics() → lee el array global `clientes` (Supabase) y actualiza
//                          contador de activos, autonomía y tabla de score.
//                          Se llama desde clientes.js al cargar/cambiar el array.
// ════════════════════════════════════

// ════════════════════════════════════
// HELPERS DE TIEMPO (formato HH.MM)
// El sistema usa formato HH.MM donde el decimal representa minutos (0-59),
// NO fracciones de hora. Ej: 1.30 = 1 hora 30 min, 0.45 = 45 min.
// ════════════════════════════════════

// "1.45" o 1.45 → 105 minutos totales
function hhmmAMinutos(val) {
  const v = parseFloat(val) || 0;
  const h = Math.floor(v);
  const m = Math.round((v - h) * 100);
  return h * 60 + m;
}

// 105 minutos → 1.45 (float HH.MM para guardar en DB)
function minutosAHHMM(totalMin) {
  const t = Math.round(totalMin);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return h + m / 100;
}

// Parsea input del usuario y normaliza: "0.60" → 1.0, "1.75" → 2.15
function parsearHHMM(str) {
  return minutosAHHMM(hhmmAMinutos(str));
}

// Formatea minutos para display: 105 → "1h 45min", 60 → "1 hs", 30 → "30 min"
function fmtMinutos(totalMin) {
  const t = Math.round(totalMin || 0);
  if (t <= 0) return '—';
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (m === 0) return h + ' hs';
  if (h === 0) return m + ' min';
  return h + 'h ' + String(m).padStart(2, '0') + 'min';
}

// Formatea un valor HH.MM float para display
function fmtHHMM(val) {
  return fmtMinutos(hhmmAMinutos(val));
}

// Suma un array de consultas devolviendo minutos totales
function sumaMinutos(arr) {
  return arr.reduce((s, c) => s + hhmmAMinutos(c.tiempo || 0), 0);
}

// Referencias a instancias de Chart.js (se crean una sola vez)
let chartTendInstance     = null;
let chartClientesInstance = null;
let chartEquipoInstance   = null;

// Estado del toggle de vista de equipo
let _eqViewMode  = 'mes'; // 'mes' | 'dia'
let _eqRange     = 7;     // 7 | 30
let _eqMesOffset = 0;     // 0 = mes actual, -1 = mes anterior, etc.

// Offset del mes seleccionado en el Panel general
let _panelMesOffset = 0;  // 0 = mes actual, -1 = mes anterior, etc.

// Devuelve { consultas, label, year, month } para el offset del panel
function _getPanelMesDatos() {
  const ahora = new Date();
  const totalMeses = ahora.getFullYear() * 12 + ahora.getMonth() + _panelMesOffset;
  const year  = Math.floor(totalMeses / 12);
  const month = ((totalMeses % 12) + 12) % 12;
  const label = new Date(year, month, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  return { consultas: getConsultasPorMes(month, year), label: labelCap, year, month };
}

// Navega entre meses en el Panel general
function navPanelMes(dir) {
  const nuevoOffset = _panelMesOffset + dir;
  if (nuevoOffset > 0) return;
  _panelMesOffset = nuevoOffset;
  refreshPanelMetrics();
}

function setEqView(mode) {
  _eqViewMode = mode;
  const btnMes = document.getElementById('eq-tog-mes');
  const btnDia = document.getElementById('eq-tog-dia');
  const rangeEl = document.getElementById('eq-range-selector');
  if (btnMes) { btnMes.style.background = mode === 'mes' ? 'var(--accent)' : 'transparent'; btnMes.style.color = mode === 'mes' ? 'white' : 'var(--text2)'; btnMes.style.fontWeight = mode === 'mes' ? '500' : '400'; }
  if (btnDia) { btnDia.style.background = mode === 'dia' ? 'var(--accent)' : 'transparent'; btnDia.style.color = mode === 'dia' ? 'white' : 'var(--text2)'; btnDia.style.fontWeight = mode === 'dia' ? '500' : '400'; }
  if (rangeEl) rangeEl.style.display = mode === 'dia' ? 'inline-flex' : 'none';
  if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
}

// Navega entre meses en la sección Equipo
function navEqMes(dir) {
  const nuevoOffset = _eqMesOffset + dir;
  if (nuevoOffset > 0) return; // no ir al futuro
  _eqMesOffset = nuevoOffset;
  _updateEqMesNav();
  _refreshEquipoDelMes();
}

// Devuelve { consultas, label } para el offset actual
function _getEqMesDatos() {
  const ahora = new Date();
  const totalMeses = ahora.getFullYear() * 12 + ahora.getMonth() + _eqMesOffset;
  const year  = Math.floor(totalMeses / 12);
  const month = ((totalMeses % 12) + 12) % 12;
  const label = new Date(year, month, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  return { consultas: getConsultasPorMes(month, year), label: labelCap };
}

// Actualiza la etiqueta y el estado del botón "siguiente" del nav de mes
function _updateEqMesNav() {
  const { label } = _getEqMesDatos();
  const labelEl = document.getElementById('eq-mes-label');
  const nextBtn = document.getElementById('eq-mes-next');
  if (labelEl) labelEl.textContent = label;
  if (nextBtn) {
    nextBtn.disabled = (_eqMesOffset >= 0);
    nextBtn.style.opacity = (_eqMesOffset >= 0) ? '0.35' : '1';
    nextBtn.style.cursor  = (_eqMesOffset >= 0) ? 'default' : 'pointer';
  }
}

// Llama a refreshEquipoMetrics con los datos del mes seleccionado
function _refreshEquipoDelMes() {
  const { consultas: datos } = _getEqMesDatos();
  refreshEquipoMetrics(datos);
}

function setEqRange(dias) {
  _eqRange = dias;
  const btn7  = document.getElementById('eq-r7');
  const btn30 = document.getElementById('eq-r30');
  if (btn7)  { btn7.style.background  = dias === 7  ? 'var(--accent)' : 'transparent'; btn7.style.color  = dias === 7  ? 'white' : 'var(--text2)'; btn7.style.fontWeight  = dias === 7  ? '500' : '400'; }
  if (btn30) { btn30.style.background = dias === 30 ? 'var(--accent)' : 'transparent'; btn30.style.color = dias === 30 ? 'white' : 'var(--text2)'; btn30.style.fontWeight = dias === 30 ? '500' : '400'; }
  if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
}

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

// ────────── Métricas del panel (alimentadas por el array global `consultas`) ──────────

function refreshPanelMetrics() {
  // Usar el mes seleccionado con _panelMesOffset
  const { consultas: mesActual, label: panelLabel, year: panelYear, month: panelMonth } = _getPanelMesDatos();
  const anioActual  = getConsultasAnio(panelYear);
  const total       = mesActual.length;
  const repetidas   = mesActual.filter(c => c.repetida === 'si').length;
  const pctRep      = total > 0 ? Math.round((repetidas / total) * 100) : 0;

  // ── Actualizar nav de mes ──
  const panelLabelEl = document.getElementById('panel-mes-label');
  const panelNextBtn = document.getElementById('panel-mes-next');
  if (panelLabelEl) panelLabelEl.textContent = panelLabel;
  if (panelNextBtn) {
    panelNextBtn.disabled = (_panelMesOffset >= 0);
    panelNextBtn.style.opacity = (_panelMesOffset >= 0) ? '0.35' : '1';
    panelNextBtn.style.cursor  = (_panelMesOffset >= 0) ? 'default' : 'pointer';
  }

  // ── Sub del page-header: mes seleccionado ──
  const panelSub = document.getElementById('panel-page-sub');
  if (panelSub) panelSub.textContent = panelLabel + ' — datos en tiempo real';

  // ── Cards de métricas ──
  const elConsultas = document.getElementById('metric-consultas-mes');
  if (elConsultas) elConsultas.textContent = total;

  // Label dinámica de la card
  const elConsultasLabel = document.getElementById('metric-consultas-mes-label');
  if (elConsultasLabel) elConsultasLabel.textContent = 'Consultas ' + panelLabel.split(' ')[0].toLowerCase();

  const elRep = document.getElementById('metric-rep-pct');
  if (elRep) {
    elRep.textContent = pctRep + '%';
    elRep.style.color = pctRep > 20 ? 'var(--red)' : '';
  }

  const elAnio = document.getElementById('metric-consultas-anio');
  if (elAnio) elAnio.textContent = anioActual.length;

  // ── Horas del equipo ese mes ──
  const esInterna = c => c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna';
  const conTiempo = mesActual.filter(c => c.tiempo && parseFloat(c.tiempo) > 0);
  const minClientes = sumaMinutos(conTiempo.filter(c => !esInterna(c)));
  const minInternas = sumaMinutos(conTiempo.filter(c =>  esInterna(c)));
  const minEquipo   = minClientes + minInternas;
  const elHsEq    = document.getElementById('metric-hs-equipo');
  const elHsEqSub = document.getElementById('metric-hs-equipo-sub');
  const elHsEqLbl = document.getElementById('metric-hs-equipo-label');
  if (elHsEqLbl) elHsEqLbl.textContent = 'Hs equipo ' + panelLabel.split(' ')[0].toLowerCase();
  if (elHsEq)    elHsEq.textContent    = minEquipo > 0 ? fmtMinutos(minEquipo) : '—';
  if (elHsEqSub) elHsEqSub.textContent = minEquipo > 0
    ? fmtMinutos(minClientes) + ' clientes · ' + fmtMinutos(minInternas) + ' internas'
    : 'Sin horas registradas';

  // Sub-label consultas: comparación con el mes previo al seleccionado
  const totalMesesPrev = panelYear * 12 + panelMonth - 1;
  const yearPrev  = Math.floor(totalMesesPrev / 12);
  const monthPrev = ((totalMesesPrev % 12) + 12) % 12;
  const mesAnterior = getConsultasPorMes(monthPrev, yearPrev);
  const elSub = document.getElementById('metric-consultas-sub');
  if (elSub) {
    if (total === 0) {
      elSub.textContent = 'Sin consultas';
      elSub.className = 'metric-sub';
    } else {
      const diff = total - mesAnterior.length;
      if (diff > 0) {
        elSub.textContent = '+' + diff + ' vs mes anterior';
        elSub.className = 'metric-sub trend-dn';
      } else if (diff < 0) {
        elSub.textContent = diff + ' vs mes anterior';
        elSub.className = 'metric-sub trend-up';
      } else {
        elSub.textContent = 'Igual que el mes anterior';
        elSub.className = 'metric-sub';
      }
    }
  }

  // ── Gráfico de tendencia: 6 meses centrados en el mes seleccionado ──
  if (chartTendInstance) {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const totalM = panelYear * 12 + panelMonth - i;
      const y = Math.floor(totalM / 12);
      const m = ((totalM % 12) + 12) % 12;
      const d = new Date(y, m, 1);
      const lbl = d.toLocaleString('es-AR', { month: 'short' }).replace('.','').replace(/^./, s => s.toUpperCase());
      meses.push({ label: lbl, consultas: getConsultasPorMes(m, y) });
    }
    chartTendInstance.data.labels           = meses.map(m => m.label);
    chartTendInstance.data.datasets[0].data = meses.map(m => m.consultas.length);
    chartTendInstance.data.datasets[1].data = meses.map(m => m.consultas.filter(c => c.repetida === 'si').length);
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

  // ── Sección equipo ──
  _updateEqMesNav();
  _refreshEquipoDelMes();

  // ── Alertas dinámicas ──
  if (typeof refreshAlertas === 'function') refreshAlertas();

  // ── Barras de consultas por categoría (top 5 dinámico) ──
  // Las consultas de "Registrar consulta" guardan la clave corta (ej: 'liquidacion').
  // Las de Pendientes guardan el texto visible (ej: 'Liquidación de sueldos').
  // Normalizamos todo al label legible usando CATS, y si no hay match mostramos tal cual.

  // Mapa inverso: label → label (para normalizar variantes)
  const catLabelMap = {};
  if (typeof CATS !== 'undefined') {
    Object.entries(CATS).forEach(([key, cfg]) => {
      catLabelMap[key]       = cfg.label; // 'liquidacion' → 'Liquidación de sueldos'
      catLabelMap[cfg.label] = cfg.label; // ya está en formato legible, se pasa igual
    });
  }

  // Contar agrupando por label normalizado
  const catCounts = {};
  mesActual.forEach(c => {
    if (!c.categoria) return;
    const rawLabel = catLabelMap[c.categoria] || c.categoria;
    // Primera letra siempre en mayúscula
    const label = rawLabel ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1) : rawLabel;
    catCounts[label] = (catCounts[label] || 0) + 1;
  });

  // Top 5 por cantidad, orden descendente
  const top5Cats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Colores en orden: accent, blue, green, amber, red
  const CAT_COLORES = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)'];

  const catContainer = document.getElementById('cat-bars-container');
  if (catContainer) {
    if (top5Cats.length === 0) {
      catContainer.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0">Sin consultas registradas este mes.</div>';
    } else {
      const maxCat = top5Cats[0][1]; // el primero ya es el máximo
      catContainer.innerHTML = top5Cats.map(([label, count], i) => {
        const color = CAT_COLORES[i % CAT_COLORES.length];
        const pct   = Math.round((count / maxCat) * 100);
        return `
          <div class="bar-wrap">
            <div class="bar-label">
              <span>${escapeHtmlPanel(label)}</span><span>${count}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>`;
      }).join('');
    }
  }
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

  // El sub-label del panel lo maneja refreshPanelMetrics con el mes seleccionado

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

  // ── Alertas dinámicas (se re-evalúan cuando cambia la lista de clientes) ──
  if (typeof refreshAlertas === 'function') refreshAlertas();

  // ── Tabla de score de riesgo (top 8 clientes por score) ──
  const tbody = document.getElementById('score-riesgo-tbody');
  if (!tbody) return;

  // Nombres de clientes que tienen al menos una consulta registrada
  const todasConsultas = (typeof consultas !== 'undefined') ? consultas : [];
  const clientesConConsultas = new Set(todasConsultas.map(c => c.cliente).filter(Boolean));

  // Clientes con score asignado y al menos una consulta, agrupados: bajo (1-4) → medio (5-7) → alto (8-10), 10 primeros
  function scoreGrupo(s) { return s <= 4 ? 0 : s <= 7 ? 1 : 2; }
  const top = lista
    .filter(c => (c.score || 0) > 0 && clientesConConsultas.has(c.nombre))
    .sort((a, b) => {
      const ga = scoreGrupo(a.score || 0), gb = scoreGrupo(b.score || 0);
      if (ga !== gb) return ga - gb;          // primero el grupo más bajo
      return (a.score || 0) - (b.score || 0); // dentro del grupo, ascendente
    })
    .slice(0, 10);

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
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span>${escapeHtmlPanel(c.nombre)}</span>
        <span class="tipo-tag tipo-${c.tipo}" style="font-size:9px;flex-shrink:0">${tipoLabel}</span>
      </div>
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

// ────────── Métricas de equipo (alimentadas por consultas del mes actual) ──────────
// Recibe el array ya filtrado por mes para no recalcular.

// Los 6 miembros del equipo.
// Se muestran siempre, incluso si no tienen consultas en el mes actual.
const ASESORES_EQUIPO = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Renzo Moretti', 'Alfredo Cesar', 'Daniel Ferro'];

function refreshEquipoMetrics(mesActual) {
  if (!mesActual) return;

  const COLORES_ASESORES = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];
  // fmtHs: recibe minutos totales y devuelve texto legible
  const fmtHs = m => fmtMinutos(m);

  // Etiqueta corta del mes para los sub-labels de las cards
  const { label: mesLabel } = _getEqMesDatos();
  const mesCorto = mesLabel.split(' ')[0]; // "Junio 2026" → "Junio"

  // ── Clientes atendidos (distintos) ese mes ──
  const clientesSet = new Set(mesActual.map(c => c.cliente).filter(Boolean));
  const elCli    = document.getElementById('eq-clientes-atendidos');
  const elCliSub = document.getElementById('eq-clientes-atendidos-sub');
  if (elCli)    elCli.textContent    = clientesSet.size || '0';
  if (elCliSub) elCliSub.textContent = mesCorto;

  // ── Hs totales equipo ese mes (en minutos internamente) ──
  const hsTotales = sumaMinutos(mesActual);
  const elHs    = document.getElementById('eq-hs-totales');
  const elHsSub = document.getElementById('eq-hs-sub');
  if (elHs)    elHs.textContent    = hsTotales > 0 ? fmtMinutos(hsTotales) : '—';
  if (elHsSub) elHsSub.textContent = mesCorto;

  // ── Stats por asesor: arranca con los 4 conocidos en 0 ──
  // hs se acumula en MINUTOS para poder sumar correctamente
  const porAsesor = {};
  ASESORES_EQUIPO.forEach(nombre => {
    porAsesor[nombre] = { consultas: 0, hs: 0, cats: {}, clientes: new Set() };
  });

  // Sumar datos reales del mes
  mesActual.forEach(c => {
    if (!c.asesor) return;
    if (!porAsesor[c.asesor]) {
      porAsesor[c.asesor] = { consultas: 0, hs: 0, cats: {}, clientes: new Set() };
    }
    porAsesor[c.asesor].consultas++;
    porAsesor[c.asesor].hs += hhmmAMinutos(c.tiempo || 0); // acumular en minutos
    if (c.categoria) {
      porAsesor[c.asesor].cats[c.categoria] = (porAsesor[c.asesor].cats[c.categoria] || 0) + 1;
    }
    if (c.cliente) porAsesor[c.asesor].clientes.add(c.cliente);
  });

  // Ordenar: mayor carga por horas primero, los que tienen 0 al final
  const sorted = Object.entries(porAsesor).sort((a, b) => b[1].hs - a[1].hs);

  // ── Card "Más cargado" ──
  const elMasCarg    = document.getElementById('eq-mas-cargado');
  const elMasCargSub = document.getElementById('eq-mas-cargado-sub');
  if (elMasCarg) {
    if (sorted.length > 0) {
      const [nombre, stats] = sorted[0];
      elMasCarg.textContent   = nombre;
      elMasCarg.style.color   = 'var(--red)';
      if (elMasCargSub) elMasCargSub.textContent = fmtHs(stats.hs) + ' · ' + stats.consultas + ' consultas';
    } else {
      elMasCarg.textContent = '—';
      elMasCarg.style.color = 'var(--text)';
      if (elMasCargSub) elMasCargSub.textContent = 'Sin datos este mes';
    }
  }

  // ── Vista por día o por mes ──
  const cont = document.getElementById('eq-asesores-list');
  if (_eqViewMode === 'dia') {
    renderEquipoPorDia(porAsesor);
    return;
  }

  // ── Lista de asesores (vista mes) ──
  if (cont) {
    if (sorted.length === 0) {
      cont.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px 0;font-size:13px">Sin datos disponibles.</div>';
    } else {
      const maxHs = sorted[0][1].hs || 1;
      cont.innerHTML = sorted.map(([nombre, stats], i) => {
        // Top categoría histórica del asesor
        const topCatKey   = Object.entries(stats.cats).sort((a, b) => b[1] - a[1])[0]?.[0];
        const topCatLabel = topCatKey
          ? ((typeof CATS !== 'undefined' && CATS[topCatKey]?.label) || topCatKey)
          : null;

        // stats.hs está en minutos; prom también en minutos
        const prom      = stats.consultas > 0 ? Math.round(stats.hs / stats.consultas) : 0;
        const promTexto = prom > 0 ? fmtMinutos(prom) : null;
        const hsTexto   = stats.hs > 0 ? fmtMinutos(stats.hs) : '—';

        // Color de carga: rojo si es el más cargado (por hs), ámbar si está en el 60%, normal si no
        const cargaColor = stats.hs >= maxHs
          ? 'var(--red)'
          : stats.hs >= maxHs * 0.6
          ? 'var(--amber)'
          : 'var(--text)';

        // Avatar con color consistente por posición en el ranking
        const color   = COLORES_ASESORES[i % COLORES_ASESORES.length];
        const iniciales = nombre.substring(0, 2).toUpperCase();

        // Sublínea: clientes atendidos + top categoría
        const subParts = [];
        if (stats.clientes.size > 0) subParts.push(stats.clientes.size + ' cliente' + (stats.clientes.size !== 1 ? 's' : ''));
        if (topCatLabel) subParts.push('Top: ' + topCatLabel);
        const subLinea = subParts.join(' · ') || '—';

        // Sublínea derecha: hs + prom
        const subDerecha = [hsTexto, promTexto ? 'prom ' + promTexto : null].filter(Boolean).join(' · ');

        return `
          <div class="asesor-row asesor-row--clickable" onclick="abrirModalAsesor(this.dataset.nombre)" data-nombre="${escapeHtmlPanel(nombre)}">
            <div class="av" style="background:${color}22;color:${color};font-size:11px;font-weight:700;flex-shrink:0">
              ${escapeHtmlPanel(iniciales)}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:13px">${escapeHtmlPanel(nombre)}</div>
              <div style="font-size:11px;color:var(--text3)">${escapeHtmlPanel(subLinea)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:13px;font-weight:600;color:${cargaColor}">${stats.consultas} consultas</div>
              <div style="font-size:11px;color:var(--text3)">${escapeHtmlPanel(subDerecha)}</div>
            </div>
          </div>`;
      }).join('');
    }
  }

  // ── Gráfico por asesor ──
  if (chartEquipoInstance) {
    chartEquipoInstance.data.labels                      = sorted.map(([n]) => n);
    chartEquipoInstance.data.datasets[0].data            = sorted.map(([, s]) => s.consultas);
    chartEquipoInstance.data.datasets[0].backgroundColor = sorted.map((_, i) => COLORES_ASESORES[i % COLORES_ASESORES.length]);
    chartEquipoInstance.update();
  }
}

// ── Vista por día: barras diarias de horas por asesor ──
function renderEquipoPorDia(porAsesorMes) {
  const cont = document.getElementById('eq-asesores-list');
  if (!cont) return;

  const allConsultas = (typeof consultas !== 'undefined') ? consultas : [];
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // Generar array de fechas del rango (más reciente al final)
  const dias = [];
  for (let i = _eqRange - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    dias.push(d);
  }
  const toKey = d => d.toISOString().substring(0, 10);

  // Filtrar consultas del rango
  const desde = new Date(hoy); desde.setDate(hoy.getDate() - (_eqRange - 1));
  const enRango = allConsultas.filter(c => {
    const t = new Date(c.timestamp);
    return t >= desde;
  });

  // Agrupar hs por asesor y día
  const ASESORES = Object.keys(porAsesorMes);
  const COLORES_ASESORES = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];
  const datosPorAsesor = {};
  ASESORES.forEach(a => {
    datosPorAsesor[a] = {};
    dias.forEach(d => { datosPorAsesor[a][toKey(d)] = 0; });
  });
  enRango.forEach(c => {
    if (!c.asesor || !datosPorAsesor[c.asesor]) return;
    const k = new Date(c.timestamp).toISOString().substring(0, 10);
    if (datosPorAsesor[c.asesor][k] !== undefined) {
      datosPorAsesor[c.asesor][k] += parseFloat(c.tiempo) || 0;
    }
  });

  // Máximo de horas en un día (para escalar barras)
  let maxHs = 0;
  ASESORES.forEach(a => { Object.values(datosPorAsesor[a]).forEach(v => { if (v > maxHs) maxHs = v; }); });
  if (maxHs === 0) maxHs = 1;

  // Labels de días según rango
  const fmtDia = d => _eqRange <= 7
    ? ['D','L','M','X','J','V','S'][d.getDay()]
    : (d.getDate() === 1 ? d.toLocaleDateString('es-AR', { month: 'short' }) : String(d.getDate()));

  // Render
  const labelRow = `<div style="display:flex;margin-left:130px;gap:2px;margin-bottom:2px">
    ${dias.map(d => `<div style="flex:1;font-size:9px;color:var(--text3);text-align:center;overflow:hidden">${fmtDia(d)}</div>`).join('')}
  </div>`;

  const rows = ASESORES.map((nombre, i) => {
    const color = COLORES_ASESORES[i % COLORES_ASESORES.length];
    const iniciales = nombre.substring(0, 2).toUpperCase();
    const totalHs = Object.values(datosPorAsesor[nombre]).reduce((s, v) => s + v, 0);

    const barras = dias.map(d => {
      const hs = datosPorAsesor[nombre][toKey(d)];
      const pct = Math.round((hs / maxHs) * 100);
      const esFinDeSemana = [0, 6].includes(d.getDay());
      const bg = hs === 0 ? (esFinDeSemana ? 'transparent' : 'var(--border)') : color;
      const title = hs > 0 ? `${hs.toFixed(1)}h` : '';
      return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:32px" title="${d.toLocaleDateString('es-AR')}${title ? ': ' + title : ''}">
        <div style="background:${bg};height:${Math.max(pct, hs > 0 ? 8 : 0)}%;border-radius:2px 2px 0 0;min-height:${hs > 0 ? '3px' : '0'}"></div>
      </div>`;
    }).join('');

    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
      <div class="av" style="background:${color}22;color:${color};font-size:11px;font-weight:700;flex-shrink:0;width:28px;height:28px">${escapeHtmlPanel(iniciales)}</div>
      <div style="width:94px;flex-shrink:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtmlPanel(nombre.split(' ')[0])}</div>
        <div style="font-size:10px;color:var(--text3)">${totalHs > 0 ? totalHs.toFixed(1) + 'h en rango' : 'sin datos'}</div>
      </div>
      <div style="flex:1;display:flex;gap:2px;align-items:flex-end">${barras}</div>
    </div>`;
  }).join('');

  cont.innerHTML = labelRow + rows;
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

// ════════════════════════════════════
// MODAL CARGA DE HORAS
// ════════════════════════════════════

function abrirModalHoras() {
  const modal = document.getElementById('modal-horas');
  if (!modal) return;
  // Limpiar campos
  const horas   = document.getElementById('mh-horas');
  const detalle = document.getElementById('mh-detalle');
  if (horas)   horas.value   = '';
  if (detalle) detalle.value = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (horas) horas.focus();
}

function cerrarModalHoras() {
  const modal = document.getElementById('modal-horas');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

async function guardarHoras() {
  const horasRaw = (document.getElementById('mh-horas') || {}).value || '';
  const horas    = horasRaw ? parsearHHMM(horasRaw) : null;
  const detalle  = ((document.getElementById('mh-detalle') || {}).value || '').trim();

  if (!horas || isNaN(horas) || horas <= 0) {
    alert('Ingresá las horas trabajadas.');
    document.getElementById('mh-horas').focus();
    return;
  }
  if (!detalle) {
    alert('Completá el detalle de lo realizado.');
    document.getElementById('mh-detalle').focus();
    return;
  }

  const asesor = (typeof currentMember !== 'undefined' && currentMember)
    ? currentMember.nombre
    : 'Equipo';

  try {
    await dbInsert('consultas', {
      cliente_id:        null,
      cliente_nombre:    null,
      asesor,
      categoria:         'programacion_interna',
      subtema:           null,
      repetida:          false,
      descripcion:       detalle || null,
      solucion_id:       null,
      tiempo_resolucion: horas,
      material:          null,
      conexion_remota:   null,
      tipo_consulta:     'programacion_interna'
    });

    // Actualizar array en memoria
    if (typeof consultas !== 'undefined') {
      consultas.unshift({
        id:           '_temp_' + Date.now(),
        cliente:      null,
        asesor,
        categoria:    'programacion_interna',
        subtema:      null,
        repetida:     'no',
        descripcion:  detalle || null,
        tiempo:       horas,
        tipoConsulta: 'programacion_interna',
        tipo_consulta:'programacion_interna',
        timestamp:    new Date().toISOString()
      });
    }

    if (typeof refreshPanelMetrics  === 'function') refreshPanelMetrics();
    if (typeof refreshConsultasPage === 'function') refreshConsultasPage();

    cerrarModalHoras();
    if (typeof toast === 'function') toast('Horas guardadas correctamente');
  } catch (e) {
    console.error('Error guardando horas', e);
    alert('No se pudo guardar: ' + e.message);
  }
}

// ════════════════════════════════════
// MODAL DE ASESOR
// ════════════════════════════════════

const _COLORES_ASESORES_MODAL = ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5', '#2d2d8e', '#5f5e5a'];

let _modalAsesorNombre  = null;
let _modalAsesorPeriodo = 'mes'; // 'mes' | 'año' | 'todo'

// Devuelve { inicio: Date|null, fin: Date } para el período activo
function _modalAsesorRango() {
  const ahora = new Date();
  if (_modalAsesorPeriodo === 'mes') {
    // Respetar el mes seleccionado con _eqMesOffset
    const totalMeses = ahora.getFullYear() * 12 + ahora.getMonth() + _eqMesOffset;
    const year  = Math.floor(totalMeses / 12);
    const month = ((totalMeses % 12) + 12) % 12;
    const inicio = new Date(year, month, 1);
    const fin    = new Date(year, month + 1, 0, 23, 59, 59); // último día del mes
    return { inicio, fin };
  }
  if (_modalAsesorPeriodo === 'año') {
    return { inicio: new Date(ahora.getFullYear(), 0, 1), fin: ahora };
  }
  return { inicio: null, fin: ahora }; // todo
}

function abrirModalAsesor(nombre) {
  _modalAsesorNombre  = nombre;
  _modalAsesorPeriodo = 'mes';

  // Avatar: buscar índice del asesor en el ranking actual para el color
  const todosAsesores = [...new Set(
    (typeof consultas !== 'undefined' ? consultas : []).map(c => c.asesor).filter(Boolean)
  )].sort();
  const idx   = todosAsesores.indexOf(nombre);
  const color = _COLORES_ASESORES_MODAL[idx >= 0 ? idx % _COLORES_ASESORES_MODAL.length : 0];
  const inic  = nombre.substring(0, 2).toUpperCase();

  const avatar = document.getElementById('modal-asesor-avatar');
  if (avatar) {
    avatar.textContent       = inic;
    avatar.style.background  = color + '22';
    avatar.style.color       = color;
    avatar.style.width       = '40px';
    avatar.style.height      = '40px';
  }
  document.getElementById('modal-asesor-nombre').textContent = nombre;

  // Activar chip "Este mes"
  ['mes','año','todo'].forEach(p => {
    const btn = document.getElementById('masesor-p-' + p);
    if (btn) btn.classList.toggle('active', p === 'mes');
  });

  // Mostrar modal
  const modal = document.getElementById('modal-asesor');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }

  _renderModalAsesor();
}

function cerrarModalAsesor() {
  const modal = document.getElementById('modal-asesor');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  _modalAsesorNombre = null;
}

function setModalAsesorPeriodo(periodo) {
  _modalAsesorPeriodo = periodo;
  ['mes','año','todo'].forEach(p => {
    const btn = document.getElementById('masesor-p-' + p);
    if (btn) btn.classList.toggle('active', p === periodo);
  });
  _renderModalAsesor();
}

// Cuántos registros mostrar inicialmente por sección
const _MASESOR_PAGE = 5;
let _masesorVisiblesClientes = _MASESOR_PAGE;
let _masesorVisiblesInternas = _MASESOR_PAGE;

// Renderiza una lista paginada dentro de un contenedor
function _renderListaAsesor(cont, items, visibles, keyVerMas, fmt) {
  if (!cont) return;
  if (items.length === 0) {
    cont.innerHTML = '<div class="empty-state" style="padding:12px 0">Sin registros en este período.</div>';
    return;
  }

  const slice    = items.slice(0, visibles);
  const hayMas   = items.length > visibles;
  const restante = items.length - visibles;

  cont.innerHTML = slice.map(c => fmt(c)).join('') +
    (hayMas
      ? `<button class="btn-ver-mas" onclick="${keyVerMas}()">Ver ${Math.min(restante, _MASESOR_PAGE)} registros más (${restante} restantes)</button>`
      : '');
}

// Listas globales del modal (para que _abrirDetalleRegistroAsesor pueda buscar en ellas)
let _masesorListaClientes = [];
let _masesorListaInternas = [];

// Renderiza todo el contenido del modal de asesor según el período activo
function _renderModalAsesor() {
  if (!_modalAsesorNombre) return;
  const { inicio, fin } = _modalAsesorRango();

  const todas = (typeof consultas !== 'undefined' ? consultas : [])
    .filter(c => {
      if (c.asesor !== _modalAsesorNombre) return false;
      const t = new Date(c.timestamp);
      if (inicio && t < inicio) return false;
      if (t > fin) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  _masesorListaClientes = todas.filter(c =>
    c.tipoConsulta !== 'programacion_interna' && c.tipo_consulta !== 'programacion_interna');
  _masesorListaInternas = todas.filter(c =>
    c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna');

  // Resetear paginación al cambiar período
  _masesorVisiblesClientes = _MASESOR_PAGE;
  _masesorVisiblesInternas = _MASESOR_PAGE;

  // Métricas
  const minClientes = sumaMinutos(_masesorListaClientes);
  const minInternas = sumaMinutos(_masesorListaInternas);
  const minTotal    = minClientes + minInternas;

  const el = id => document.getElementById(id);
  if (el('masesor-hs-clientes')) el('masesor-hs-clientes').textContent = fmtMinutos(minClientes);
  if (el('masesor-hs-interna'))  el('masesor-hs-interna').textContent  = fmtMinutos(minInternas);
  if (el('masesor-hs-total'))    el('masesor-hs-total').textContent    = fmtMinutos(minTotal);
  if (el('masesor-consultas'))   el('masesor-consultas').textContent   = _masesorListaClientes.length;

  // Subtítulo
  const labels = { mes: 'Este mes', 'año': 'Este año', todo: 'Todo el historial' };
  if (el('modal-asesor-subtitulo')) el('modal-asesor-subtitulo').textContent = labels[_modalAsesorPeriodo] || '';

  // Listas paginadas
  _renderListaAsesor(el('masesor-lista-clientes'), _masesorListaClientes, _masesorVisiblesClientes, 'verMasAsesorClientes', _rowCliente);
  _renderListaAsesor(el('masesor-lista-interna'),  _masesorListaInternas, _masesorVisiblesInternas, 'verMasAsesorInternas', _rowInterna);
}

function verMasAsesorClientes() {
  _masesorVisiblesClientes += _MASESOR_PAGE;
  _renderListaAsesor(document.getElementById('masesor-lista-clientes'), _masesorListaClientes, _masesorVisiblesClientes, 'verMasAsesorClientes', _rowCliente);
}

function verMasAsesorInternas() {
  _masesorVisiblesInternas += _MASESOR_PAGE;
  _renderListaAsesor(document.getElementById('masesor-lista-interna'), _masesorListaInternas, _masesorVisiblesInternas, 'verMasAsesorInternas', _rowInterna);
}

async function eliminarRegistroAsesor(id) {
  try {
    await dbDelete('consultas', id);
    if (typeof consultas !== 'undefined') {
      consultas = consultas.filter(c => String(c.id) !== String(id));
    }
    if (typeof refreshPanelMetrics  === 'function') refreshPanelMetrics();
    if (typeof refreshEquipoMetrics === 'function') {
      const ahora = new Date();
      const mesActual = (typeof consultas !== 'undefined' ? consultas : []).filter(c => {
        const d = new Date(c.timestamp);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      });
      refreshEquipoMetrics(mesActual);
    }
    _renderModalAsesor();
    if (typeof toast === 'function') toast('Registro eliminado');
  } catch (e) {
    console.error('Error eliminando registro', e);
    if (typeof toast === 'function') toast('Error al eliminar: ' + (e.message || e));
  }
}

// Devuelve true si el asesor logueado puede eliminar registros del modal abierto
function _puedoEliminarEnModal() {
  return typeof currentMember !== 'undefined'
    && currentMember
    && currentMember.nombre === _modalAsesorNombre;
}

// Abre el panel de detalle de un registro dentro del modal del asesor
function _abrirDetalleRegistroAsesor(id) {
  // Buscar en ambas listas
  const c = [..._masesorListaClientes, ..._masesorListaInternas].find(x => String(x.id) === String(id));
  if (!c) return;

  // Quitar detalle previo si había
  document.getElementById('_asesor-detalle-overlay')?.remove();

  const esInterna  = c.tipoConsulta === 'programacion_interna' || c.tipo_consulta === 'programacion_interna';
  const puedeBorrar = _puedoEliminarEnModal() && !String(id).startsWith('_temp_');

  // Solución KB
  let solTitulo = null, solPasos = [];
  const solId = c.solucionId || c.solucion_id;
  if (solId && typeof soluciones !== 'undefined') {
    const sol = soluciones.find(s => s.id === solId);
    if (sol) { solTitulo = sol.titulo; solPasos = Array.isArray(sol.pasos) ? sol.pasos : []; }
  }

  const fecha = new Date(c.timestamp).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const catLabel = (typeof CATS !== 'undefined' && CATS[c.categoria]?.label) || c.categoria || '—';
  const cat      = esInterna ? catLabel : [catLabel, c.subtema].filter(Boolean).join(' › ');

  const tipoLabels = {
    soporte: '🎧 Soporte', programacion: '🐛 Programación', comercial: '💼 Comercial',
    programacion_interna: '💻 Horas internas', implementacion: '🚀 Implementación',
  };
  const tipoLabel = tipoLabels[c.tipoConsulta || c.tipo_consulta] || c.tipoConsulta || '—';

  const overlay = document.createElement('div');
  overlay.id = '_asesor-detalle-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px';

  overlay.innerHTML = `
    <div style="
      background:var(--surface);border:1px solid var(--border2);border-radius:14px;
      width:100%;max-width:520px;max-height:90vh;
      overflow-y:auto;scrollbar-color:var(--border2) transparent;scrollbar-width:thin;
      padding:24px;position:relative;
    ">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px">
        <div>
          <div style="font-size:17px;font-weight:700;margin-bottom:3px">${esInterna ? '⏱ Hora interna' : escapeHtmlPanel(c.cliente || c.cliente_nombre || '—')}</div>
          <div style="font-size:12px;color:var(--text3)">${fechaCap}</div>
        </div>
        <button onclick="document.getElementById('_asesor-detalle-overlay').remove()" style="
          background:transparent;border:none;cursor:pointer;color:var(--text3);font-size:20px;padding:0 4px;line-height:1;flex-shrink:0;margin-top:2px;">✕</button>
      </div>

      <!-- Campos en grilla -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Asesor</div>
          <div style="font-size:13px;font-weight:500">${escapeHtmlPanel(c.asesor || '—')}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Tipo</div>
          <div style="font-size:13px;font-weight:500">${tipoLabel}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Categoría</div>
          <div style="font-size:13px;font-weight:500">${escapeHtmlPanel(cat)}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">
            ${!esInterna ? 'Repetida' : '⏱ Tiempo'}
          </div>
          <div style="font-size:13px;font-weight:500">
            ${!esInterna
              ? (c.repetida === 'si' || c.repetida === true ? 'Sí' : 'No')
              : (c.tiempo ? fmtHHMM(c.tiempo) : '—')}
          </div>
        </div>
        ${!esInterna ? `
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Remota</div>
          <div style="font-size:13px;font-weight:500">${c.conexionRemota || c.conexion_remota ? 'Sí' : 'No'}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">⏱ Tiempo</div>
          <div style="font-size:13px;font-weight:500">${c.tiempo ? fmtHHMM(c.tiempo) : '—'}</div>
        </div>` : ''}
      </div>

      <!-- Detalle -->
      ${(c.descripcion || c.subtema) ? `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Detalle</div>
        <div style="background:var(--surface2);border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6;color:var(--text)">
          ${escapeHtmlPanel(c.descripcion || c.subtema || '')}
        </div>
      </div>` : ''}

      <!-- Solución utilizada -->
      ${solTitulo ? `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Solución utilizada</div>
        <div style="background:rgba(52,199,89,0.08);border:1px solid rgba(52,199,89,0.25);border-radius:8px;padding:12px 14px">
          ${solPasos.length ? `<ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:var(--text2)">
            ${solPasos.map(p => `<li>${escapeHtmlPanel(p)}</li>`).join('')}
          </ol>` : '<div style="font-size:13px;color:var(--text2)">${escapeHtmlPanel(solTitulo)}</div>'}
        </div>
      </div>` : ''}

      <!-- Footer -->
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border2);display:flex;justify-content:flex-end">
        ${puedeBorrar ? `
        <button onclick="_eliminarDesdeDetalle('${id}')" style="
          background:transparent;border:1px solid var(--red,#c0392b);color:var(--red,#c0392b);
          font-size:13px;font-family:inherit;padding:7px 16px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s;"
          onmouseenter="this.style.background='var(--red,#c0392b)';this.style.color='#fff'"
          onmouseleave="this.style.background='transparent';this.style.color='var(--red,#c0392b)'">
          🗑 Eliminar consulta
        </button>` : ''}
      </div>
    </div>
  `;

  // Cerrar con Escape o click fuera
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
  });

  document.body.appendChild(overlay);
}

async function _eliminarDesdeDetalle(id) {
  if (!confirm('¿Seguro que querés eliminar este registro? Esta acción no se puede deshacer.')) return;
  document.getElementById('_asesor-detalle-overlay')?.remove();
  await eliminarRegistroAsesor(id);
}

// ── Fila de registro en lista de cliente ──
function _rowCliente(c, fmt) {
  const fecha    = new Date(c.timestamp).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' });
  const catLabel = (typeof CATS !== 'undefined' && CATS[c.categoria]?.label) || c.categoria || '';
  const tipoTag  = c.tipoConsulta === 'programacion' || c.tipo_consulta === 'programacion'
    ? '<span class="tipo-tag tipo-bug" style="font-size:9px">Prog</span>' : '';
  const clickable = c.id ? `onclick="_abrirDetalleRegistroAsesor('${c.id}')" style="cursor:pointer"` : '';
  return `
    <div class="asesor-modal-row" ${clickable}>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${tipoTag}${escapeHtmlPanel(c.cliente || c.cliente_nombre || '—')}
        </div>
        <div style="font-size:11px;color:var(--text3)">${escapeHtmlPanel(catLabel)}${c.subtema ? ' › ' + escapeHtmlPanel(c.subtema) : ''}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);flex-shrink:0">${fecha}</div>
    </div>`;
}

function _rowInterna(c, fmt) {
  const fecha     = new Date(c.timestamp).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' });
  const clickable = c.id ? `onclick="_abrirDetalleRegistroAsesor('${c.id}')" style="cursor:pointer"` : '';
  return `
    <div class="asesor-modal-row" ${clickable}>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escapeHtmlPanel(c.descripcion || c.subtema || c.categoria || '—')}
        </div>
        <div style="font-size:11px;color:var(--text3)">${escapeHtmlPanel(c.categoria || '')}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);flex-shrink:0">${fecha}</div>
    </div>`;
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
