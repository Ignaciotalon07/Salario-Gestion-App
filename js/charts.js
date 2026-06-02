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

// ────────── Métricas del panel (alimentadas por el array global `consultas`) ──────────

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
  if (elRep) {
    elRep.textContent = pctRep + '%';
    elRep.style.color = pctRep <= 20 ? 'var(--green)' : pctRep <= 30 ? 'var(--amber)' : 'var(--red)';
  }

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

  // ── Sección equipo ──
  refreshEquipoMetrics(mesActual);

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
  const fmtHs = h => h % 1 === 0 ? h + ' hs' : h.toFixed(1) + ' hs';

  // ── Clientes atendidos (distintos) este mes ──
  const clientesSet = new Set(mesActual.map(c => c.cliente).filter(Boolean));
  const elCli = document.getElementById('eq-clientes-atendidos');
  if (elCli) elCli.textContent = clientesSet.size || '0';

  // ── Hs totales equipo este mes ──
  const hsTotales = mesActual.reduce((sum, c) => sum + (parseFloat(c.tiempo) || 0), 0);
  const elHs = document.getElementById('eq-hs-totales');
  if (elHs) elHs.textContent = hsTotales > 0 ? fmtHs(hsTotales) : '—';

  // ── Stats por asesor: arranca con los 4 conocidos en 0 ──
  const porAsesor = {};
  ASESORES_EQUIPO.forEach(nombre => {
    porAsesor[nombre] = { consultas: 0, hs: 0, cats: {}, clientes: new Set() };
  });

  // Sumar datos reales del mes
  mesActual.forEach(c => {
    if (!c.asesor) return;
    // Si es un asesor conocido, usa esa entrada; si no, creala (por si hay otro)
    if (!porAsesor[c.asesor]) {
      porAsesor[c.asesor] = { consultas: 0, hs: 0, cats: {}, clientes: new Set() };
    }
    porAsesor[c.asesor].consultas++;
    porAsesor[c.asesor].hs += parseFloat(c.tiempo) || 0;
    if (c.categoria) {
      porAsesor[c.asesor].cats[c.categoria] = (porAsesor[c.asesor].cats[c.categoria] || 0) + 1;
    }
    if (c.cliente) porAsesor[c.asesor].clientes.add(c.cliente);
  });

  // Ordenar: mayor carga primero, los que tienen 0 al final
  const sorted = Object.entries(porAsesor).sort((a, b) => b[1].consultas - a[1].consultas);

  // ── Card "Más cargado" ──
  const elMasCarg    = document.getElementById('eq-mas-cargado');
  const elMasCargSub = document.getElementById('eq-mas-cargado-sub');
  if (elMasCarg) {
    if (sorted.length > 0) {
      const [nombre, stats] = sorted[0];
      elMasCarg.textContent   = nombre;
      elMasCarg.style.color   = 'var(--red)';
      if (elMasCargSub) elMasCargSub.textContent = stats.consultas + ' consultas · ' + fmtHs(stats.hs);
    } else {
      elMasCarg.textContent = '—';
      elMasCarg.style.color = 'var(--text)';
      if (elMasCargSub) elMasCargSub.textContent = 'Sin datos este mes';
    }
  }

  // ── Lista de asesores ──
  const cont = document.getElementById('eq-asesores-list');
  if (cont) {
    if (sorted.length === 0) {
      cont.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px 0;font-size:13px">Sin datos disponibles.</div>';
    } else {
      const maxConsultas = sorted[0][1].consultas || 1;
      cont.innerHTML = sorted.map(([nombre, stats], i) => {
        // Top categoría histórica del asesor
        const topCatKey   = Object.entries(stats.cats).sort((a, b) => b[1] - a[1])[0]?.[0];
        const topCatLabel = topCatKey
          ? ((typeof CATS !== 'undefined' && CATS[topCatKey]?.label) || topCatKey)
          : null;

        const prom      = stats.consultas > 0 ? stats.hs / stats.consultas : 0;
        const promTexto = prom > 0 ? fmtHs(prom) : null;
        const hsTexto   = stats.hs > 0 ? fmtHs(stats.hs) : '—';

        // Color de carga: rojo si es el más cargado, ámbar si está en el 60%, normal si no
        const cargaColor = stats.consultas >= maxConsultas
          ? 'var(--red)'
          : stats.consultas >= maxConsultas * 0.6
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
          <div class="asesor-row">
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

// Escape HTML básico para usar en el panel
function escapeHtmlPanel(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
