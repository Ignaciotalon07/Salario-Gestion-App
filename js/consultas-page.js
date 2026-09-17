// CONSULTAS PAGE
// Sección dedicada a métricas e historial de consultas.
// Se inicializa al navegar a 'consultas-page' y se refresca
// automáticamente cuando cambia el array global `consultas`.

// ════════════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════════════

// Rankings: rango activo + offset de período (0 = actual, -1 = anterior, etc.)
const _cpState = {
  'cp-top-cli':    { rango: 'semana', offset: 0 },
  'cp-top-cat':    { rango: 'semana', offset: 0 },
  'cp-top-tiempo': { rango: 'semana', offset: 0 },  // cliente que más horas consume
  'cp-top-rep':    { rango: 'semana', offset: 0 }   // consulta más repetida (flag repetida=si)
};

// Historial: período activo + offset + filtros
let _cpHist     = { periodo: 'todo', offset: 0 };
let _cpHistPage = 5; // cuántas consultas mostrar actualmente

// Selector de mes de las métricas de arriba (Este mes / Top cliente / Promedio).
// "Hoy" no se ve afectado por esto — siempre es el día de hoy.
let _cpMesOffset = 0; // 0 = mes actual, -1 = mes anterior, etc.

// Gráfico "Volumen de consultas": Semana (últimos 7 días) / Mes (sigue a
// _cpMesOffset) / Año (año en curso).
let _cpVolPeriodo = 'mes';
let _cpChartVolumen    = null;
let _cpChartSparkline  = null;

// ════════════════════════════════════════════════════════════════
// HELPERS DE PERÍODO
// ════════════════════════════════════════════════════════════════

// Devuelve { desde, hasta } para el rango + offset dados.
// offset=0 → período actual; offset=-1 → período anterior, etc.
function _cpPeriodRange(rango, offset) {
  const ahora = new Date();
  const hoy   = new Date(ahora); hoy.setHours(0, 0, 0, 0);

  if (rango === 'dia') {
    const desde = new Date(hoy); desde.setDate(desde.getDate() + offset);
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);
    return { desde, hasta };
  }
  if (rango === 'semana') {
    // "Últimos 7 días" desplazado en bloques de 7
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() + 1 + offset * 7);
    const desde = new Date(hasta); desde.setDate(desde.getDate() - 7);
    return { desde, hasta };
  }
  if (rango === 'mes') {
    const totalMeses = ahora.getFullYear() * 12 + ahora.getMonth() + offset;
    const year  = Math.floor(totalMeses / 12);
    const month = ((totalMeses % 12) + 12) % 12;
    const desde = new Date(year, month, 1);
    const hasta = new Date(year, month + 1, 1);
    return { desde, hasta };
  }
  if (rango === 'anio') {
    const year  = ahora.getFullYear() + offset;
    const desde = new Date(year, 0, 1);
    const hasta = new Date(year + 1, 0, 1);
    return { desde, hasta };
  }
  // 'todo'
  return { desde: new Date(0), hasta: new Date(ahora.getTime() + 86400000) };
}

// Etiqueta legible para el período
function _cpPeriodLabel(rango, offset) {
  if (rango === 'todo') return 'Todo el historial';
  const { desde, hasta } = _cpPeriodRange(rango, offset);

  if (rango === 'dia') {
    if (offset === 0)  return 'Hoy';
    if (offset === -1) return 'Ayer';
    return desde.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (rango === 'semana') {
    if (offset === 0) return 'Últimos 7 días';
    const fin = new Date(hasta); fin.setDate(fin.getDate() - 1);
    const opts = { day: 'numeric', month: 'short' };
    const mismoAnio = desde.getFullYear() === fin.getFullYear();
    const labelFin = fin.toLocaleDateString('es-AR', mismoAnio ? opts : { ...opts, year: 'numeric' });
    return `${desde.toLocaleDateString('es-AR', opts)} – ${labelFin}`;
  }
  if (rango === 'mes') {
    return desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }
  if (rango === 'anio') {
    return String(desde.getFullYear());
  }
  return '';
}

// Filtra el array global según rango + offset.
// Excluye registros internos (programacion_interna): la sección Consultas
// es exclusivamente para consultas a clientes.
function _cpFilterPeriod(rango, offset) {
  const all = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.tipoConsulta !== 'programacion_interna' && c.tipo_consulta !== 'programacion_interna')
    : [];
  if (rango === 'todo') return all;
  const { desde, hasta } = _cpPeriodRange(rango, offset);
  return all.filter(c => { const t = new Date(c.timestamp); return t >= desde && t < hasta; });
}

// ════════════════════════════════════════════════════════════════
// RANKINGS — Toggle de rango + navegación de períodos
// ════════════════════════════════════════════════════════════════

function setCpRange(targetId, rango, btn) {
  _cpState[targetId].rango  = rango;
  _cpState[targetId].offset = 0; // resetear al período actual
  if (btn) {
    btn.closest('div').querySelectorAll('.cp-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  _cpUpdateRankingNav(targetId);
  renderCpRanking(targetId);
}

// Navega al período anterior/siguiente dentro del widget de ranking
function cpNavRanking(targetId, dir) {
  const st = _cpState[targetId];
  const nuevoOffset = st.offset + dir;
  if (nuevoOffset > 0) return; // no ir al futuro
  st.offset = nuevoOffset;
  _cpUpdateRankingNav(targetId);
  renderCpRanking(targetId);
}

// Actualiza la etiqueta del período y el estado del botón "siguiente"
function _cpUpdateRankingNav(targetId) {
  const { rango, offset } = _cpState[targetId];
  const labelEl = document.getElementById(targetId + '-period');
  const nextBtn = document.getElementById(targetId + '-nav-next');
  if (labelEl) labelEl.textContent = _cpPeriodLabel(rango, offset);
  if (nextBtn) nextBtn.disabled = (offset >= 0);
}

function renderCpRanking(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;

  const { rango, offset } = _cpState[targetId];
  const datos = _cpFilterPeriod(rango, offset);

  // ────────────────────────────────────────────────
  // cp-top-tiempo: cliente que más horas acumula
  // ────────────────────────────────────────────────
  if (targetId === 'cp-top-tiempo') {
    const horas = {};
    datos.forEach(c => {
      const k = c.cliente || null;
      const t = parseFloat(c.tiempo) || 0;
      if (!k || t <= 0) return;
      horas[k] = (horas[k] || 0) + t;
    });
    const sorted = Object.entries(horas).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos de tiempo en este período</div>';
      return;
    }
    const max = sorted[0][1];
    el.innerHTML = sorted.map(([nombre, hs], i) => {
      const pct   = Math.round((hs / max) * 100);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      // Formatear horas: mostrar en "Xh" o "Xh Ym"
      const hEnteras = Math.floor(hs);
      const mins     = Math.round((hs - hEnteras) * 60);
      const label    = mins > 0 ? `${hEnteras}h ${mins}m` : `${hEnteras}h`;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;gap:8px">
          <span style="font-size:13px;font-weight:${i===0?'600':'400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${medal} ${_cpEsc(nombre)}</span>
          <span style="font-size:13px;font-weight:600;color:var(--amber,#e67e22);white-space:nowrap">${label}</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px">
          <div style="height:5px;background:var(--amber,#e67e22);border-radius:3px;width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  // ────────────────────────────────────────────────
  // cp-top-rep: consulta más repetida (repetida = 'si') — lista tipo tabla
  // (Categoría / Veces) en vez de barras. Cuando las categorías top empatan
  // en la misma cantidad, una barra no aporta información (todas iguales)
  // así que se lo decimos explícitamente en vez de mostrar barras vacías
  // de significado.
  // ────────────────────────────────────────────────
  if (targetId === 'cp-top-rep') {
    const soloRep = datos.filter(c => c.repetida === 'si');

    // Agrupar por categoría › subtema y, dentro de cada grupo, por cliente
    const grupos = {}; // { cat: { total, clientes: { nombre: count } } }
    soloRep.forEach(c => {
      const k = [c.categoria, c.subtema].filter(Boolean).join(' › ') || 'Sin categoría';
      if (!grupos[k]) grupos[k] = { total: 0, clientes: {} };
      grupos[k].total++;
      const cli = c.cliente || 'Sin cliente';
      grupos[k].clientes[cli] = (grupos[k].clientes[cli] || 0) + 1;
    });

    const sorted = Object.entries(grupos).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    if (sorted.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin consultas repetidas en este período</div>';
      return;
    }

    const PERIODO_FRASE = { dia: 'hoy', semana: 'esta semana', mes: 'este mes', anio: 'este año', todo: 'en total' };
    const periodoFrase  = PERIODO_FRASE[rango] || 'en este período';

    const counts   = sorted.map(([, g]) => g.total);
    const allTied  = counts.length > 1 && counts.every(c => c === counts[0]);
    const noteHTML = allTied
      ? `<div style="font-size:12.5px;color:var(--text3);line-height:1.5;margin-bottom:14px">
           Las ${sorted.length} categorías repetidas ${periodoFrase} empatan en ${counts[0]} repetición${counts[0] !== 1 ? 'es' : ''}.
         </div>`
      : '';

    const headerHTML = `
      <div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid var(--border2);margin-bottom:2px">
        <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Categoría</span>
        <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Veces</span>
      </div>`;

    const rowsHTML = sorted.map(([cat, { total, clientes }], i) => {
      const pctTotal = soloRep.length > 0 ? Math.round((total / soloRep.length) * 100) : 0;
      const topCli   = Object.entries(clientes).sort((a, b) => b[1] - a[1])[0];
      const isLast   = i === sorted.length - 1;
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 0;${isLast ? '' : 'border-bottom:1px solid var(--border2)'}">
          <div style="min-width:0">
            <div style="font-size:13.5px;font-weight:600;color:var(--text);line-height:1.35">${_cpEsc(cat)}</div>
            ${topCli ? `<div style="font-size:12px;color:var(--accent);margin-top:3px">${_cpEsc(topCli[0])}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${total}×</div>
            <div style="font-size:11px;color:var(--text3);margin-top:1px">${pctTotal}%</div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = noteHTML + headerHTML + rowsHTML;
    return;
  }

  // ────────────────────────────────────────────────
  // cp-top-cat: categoría/subtema más frecuente — barra segmentada +
  // leyenda con color, en vez de la lista de barras genérica.
  // ────────────────────────────────────────────────
  if (targetId === 'cp-top-cat') {
    const conteoCat = {};
    datos.forEach(c => {
      const k = [c.categoria, c.subtema].filter(Boolean).join(' › ') || 'Sin categoría';
      conteoCat[k] = (conteoCat[k] || 0) + 1;
    });
    const sortedCat = Object.entries(conteoCat).sort((a, b) => b[1] - a[1]);
    const total = datos.length;

    if (sortedCat.length === 0 || total === 0) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos para este período</div>';
      return;
    }

    const TOP_N   = 4;
    const top     = sortedCat.slice(0, TOP_N);
    const resto   = sortedCat.slice(TOP_N);
    const restoCant = resto.reduce((s, [, c]) => s + c, 0);
    const COLORS  = ['#2d6fd6', '#e0522f', '#2d9e5c', '#d19a1c']; // azul, rojo-naranja, verde, ámbar
    const GRIS    = '#6b7280';

    const segmentos = top.map(([nombre, cant], i) => ({
      nombre, cant, color: COLORS[i % COLORS.length],
      pct: Math.round((cant / total) * 100)
    }));
    if (restoCant > 0) {
      segmentos.push({
        nombre: 'Otras categorías', cant: restoCant, color: GRIS,
        pct: Math.round((restoCant / total) * 100)
      });
    }

    const barHTML = segmentos.map(s => `
      <div style="flex:${Math.max(s.pct, 1)} 1 0%;background:${s.color};display:flex;align-items:center;justify-content:center">
        ${s.pct >= 6 ? `<span style="font-size:11px;font-weight:700;color:#fff">${s.nombre === 'Otras categorías' ? 'Otras' : s.pct + '%'}</span>` : ''}
      </div>`).join('');

    const legendHTML = segmentos.map(s => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex:none"></span>
        <span style="font-size:13px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_cpEsc(s.nombre)}</span>
        <span style="font-size:12px;color:var(--text3);white-space:nowrap">${s.cant} · ${s.pct}%</span>
      </div>`).join('');

    el.innerHTML = `
      <div style="display:flex;height:26px;border-radius:6px;overflow:hidden;margin-bottom:14px">${barHTML}</div>
      <div>${legendHTML}</div>`;
    return;
  }

  // ────────────────────────────────────────────────
  // cp-top-cli: cliente con más consultas
  // ────────────────────────────────────────────────
  const conteo = {};
  datos.forEach(c => {
    const k = c.cliente || null;
    if (!k) return;
    conteo[k] = (conteo[k] || 0) + 1;
  });

  const sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos para este período</div>';
    return;
  }

  const max = sorted[0][1];

  el.innerHTML = sorted.map(([nombre, cant], i) => {
    const pct   = Math.round((cant / max) * 100);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;gap:8px">
        <span style="font-size:13px;font-weight:${i===0?'600':'400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${medal} ${_cpEsc(nombre)}</span>
        <span style="font-size:13px;font-weight:600;color:var(--accent);white-space:nowrap">${cant}</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px">
        <div style="height:5px;background:var(--accent);border-radius:3px;width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// HISTORIAL — Período + asesor + búsqueda
// ════════════════════════════════════════════════════════════════

// Cambia el período activo del historial
function setCpHistPeriodo(periodo, btn) {
  _cpHist.periodo = periodo;
  _cpHist.offset  = 0;
  _cpHistPage     = 5; // resetear paginación al cambiar período
  if (btn) {
    btn.closest('div').querySelectorAll('.cp-hist-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  _cpUpdateHistNav();
  renderCpHistorial();
}

// Navega al período anterior/siguiente del historial
function cpHistNav(dir) {
  if (_cpHist.periodo === 'todo') return;
  const nuevoOffset = _cpHist.offset + dir;
  if (nuevoOffset > 0) return; // no ir al futuro
  _cpHist.offset = nuevoOffset;
  _cpHistPage    = 5; // resetear paginación al navegar
  _cpUpdateHistNav();
  renderCpHistorial();
}

// Carga las siguientes 5 consultas
function cpHistCargarMas() {
  _cpHistPage += 5;
  renderCpHistorial();
}

// Llamado desde oninput/onchange del buscador y filtro de asesor — resetea la página
function cpHistFiltroChange() {
  _cpHistPage = 5;
  renderCpHistorial();
}

// Actualiza la etiqueta y el estado del botón "siguiente" del historial
function _cpUpdateHistNav() {
  const { periodo, offset } = _cpHist;
  const labelEl = document.getElementById('cp-hist-period-label');
  const nextBtn = document.getElementById('cp-hist-nav-next');
  const prevBtn = document.getElementById('cp-hist-nav-prev');
  const navRow  = document.getElementById('cp-hist-nav-row');

  const esTodo = periodo === 'todo';
  if (navRow)  navRow.style.display  = esTodo ? 'none' : 'flex';
  if (labelEl) labelEl.textContent   = _cpPeriodLabel(periodo, offset);
  if (nextBtn) nextBtn.disabled      = (offset >= 0);
  if (prevBtn) prevBtn.disabled      = false;
}

function renderCpHistorial() {
  const cont    = document.getElementById('cp-historial');
  const countEl = document.getElementById('cp-hist-count');
  if (!cont) return;

  const all     = (typeof consultas !== 'undefined') ? consultas : [];
  const buscar  = (document.getElementById('cp-buscar')?.value || '').trim().toLowerCase();
  const asesorF = document.getElementById('cp-filtro-asesor')?.value || '';

  // Filtrar por período
  let filtradas = _cpFilterPeriod(_cpHist.periodo, _cpHist.offset);

  // Filtrar por búsqueda de texto
  if (buscar) filtradas = filtradas.filter(c =>
    (c.cliente     || '').toLowerCase().includes(buscar) ||
    (c.categoria   || '').toLowerCase().includes(buscar) ||
    (c.subtema     || '').toLowerCase().includes(buscar) ||
    (c.descripcion || '').toLowerCase().includes(buscar)
  );

  // Filtrar por asesor
  if (asesorF) filtradas = filtradas.filter(c => c.asesor === asesorF);

  // Ordenar más nueva primero
  filtradas = [...filtradas].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (countEl) {
    const totalLabel = all.length !== filtradas.length ? ` de ${all.length}` : '';
    countEl.textContent = `${filtradas.length}${totalLabel} consulta${filtradas.length !== 1 ? 's' : ''}`;
  }

  if (filtradas.length === 0) {
    cont.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px 0;font-size:13px">Sin resultados para este período</div>';
    return;
  }

  // Paginar: solo mostrar las primeras _cpHistPage consultas
  const visible  = filtradas.slice(0, _cpHistPage);
  const hayMas   = filtradas.length > _cpHistPage;

  // Agrupar por día (clave ISO para preservar orden)
  const grupos      = {};
  const gruposOrder = [];
  visible.forEach(c => {
    const d   = new Date(c.timestamp);
    const iso = d.toISOString().slice(0, 10);
    const lbl = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!grupos[iso]) { grupos[iso] = { label: lbl, items: [] }; gruposOrder.push(iso); }
    grupos[iso].items.push(c);
  });

  const listHTML = gruposOrder.map((iso, idx) => {
    const { label, items } = grupos[iso];
    // Capitalizar primera letra del día
    const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
    return `
      <div style="margin-top:${idx === 0 ? '0' : '32px'}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="
            background:var(--accent);color:#fff;
            font-size:11px;font-weight:600;
            padding:3px 10px;border-radius:99px;
            white-space:nowrap;letter-spacing:0.3px;
          ">${labelCap}</span>
          <span style="flex:1;height:1px;background:var(--border2)"></span>
          <span style="font-size:11px;color:var(--text3);white-space:nowrap">${items.length} consulta${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(c => _cpRenderRow(c)).join('')}
        </div>
      </div>`;
  }).join('');

  const btnMas = hayMas
    ? `<div style="text-align:center;padding:12px 0">
         <button onclick="cpHistCargarMas()"
           style="border:1px solid var(--border2);background:transparent;color:var(--text2);
                  font-size:13px;font-family:inherit;padding:7px 20px;border-radius:8px;cursor:pointer">
           Cargar más
           <span style="color:var(--text3);font-size:12px">(${filtradas.length - _cpHistPage} restantes)</span>
         </button>
       </div>`
    : '';

  cont.innerHTML = listHTML + btnMas;
}

// ── Render de una fila de consulta ──
function _cpRenderRow(c) {
  const hora = new Date(c.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const cat  = [c.categoria, c.subtema].filter(Boolean).join(' › ') || '—';
  const tags = [];
  if (c.repetida === 'si')
    tags.push(`<span style="background:rgba(220,38,38,0.12);color:var(--red,#c0392b);font-size:10px;padding:2px 6px;border-radius:4px">Repetida</span>`);
  if (c.remota)
    tags.push(`<span style="background:var(--surface2);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:4px">Remota</span>`);
  if (c.tiempo)
    tags.push(`<span style="background:var(--surface2);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:4px">⏱ ${typeof fmtHHMM === 'function' ? fmtHHMM(c.tiempo) : parseFloat(c.tiempo).toFixed(2) + 'h'}</span>`);

  return `
    <div onclick="_cpAbrirDetalle('${c.id}')" style="
      background:var(--surface2,rgba(255,255,255,0.03));
      border:1px solid var(--border2);
      border-radius:10px;
      padding:12px 14px;
      display:flex;gap:14px;
      cursor:pointer;
      transition:border-color .15s, background .15s;
    "
    onmouseenter="this.style.borderColor='var(--accent)';this.style.background='var(--surface3,rgba(255,255,255,0.06))'"
    onmouseleave="this.style.borderColor='var(--border2)';this.style.background='var(--surface2,rgba(255,255,255,0.03))'">
      <!-- Hora -->
      <div style="flex-shrink:0;width:38px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:12px;color:var(--text3);font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap">${hora}</span>
      </div>
      <!-- Separador vertical -->
      <div style="flex-shrink:0;width:1px;background:var(--border2);border-radius:1px;align-self:stretch"></div>
      <!-- Contenido -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:13px">${_cpEsc(c.cliente || '—')}</span>
          <span style="font-size:12px;color:var(--accent);font-weight:500">${_cpEsc(cat)}</span>
          ${tags.length ? `<span style="display:inline-flex;gap:4px;flex-wrap:wrap">${tags.join('')}</span>` : ''}
        </div>
        ${c.descripcion ? `
          <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px;
               overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">
            ${_cpEsc(c.descripcion)}
          </div>` : ''}
        <div style="font-size:11px;color:var(--text3)">${_cpEsc(c.asesor || '—')}</div>
      </div>
      <!-- Ícono indicador -->
      <div style="flex-shrink:0;display:flex;align-items:center">
        <span style="font-size:14px;color:var(--text3)">›</span>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// MODAL DETALLE DE CONSULTA
// ════════════════════════════════════════════════════════════════

function _cpAbrirDetalle(id) {
  const c = (typeof consultas !== 'undefined') ? consultas.find(x => x.id == id) : null;
  if (!c) return;

  // Buscar solución asociada si hay solucionId
  let solTitulo = null;
  let solPasos  = [];
  if (c.solucionId && typeof soluciones !== 'undefined') {
    const sol = soluciones.find(s => s.id === c.solucionId);
    if (sol) {
      solTitulo = sol.titulo;
      solPasos  = Array.isArray(sol.pasos) ? sol.pasos : [];
    }
  }

  const fecha = new Date(c.timestamp).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const cat = [c.categoria, c.subtema].filter(Boolean).join(' › ') || '—';

  const tipoLabels = {
    soporte: '🎧 Soporte',
    programacion: '🐛 Programación',
    comercial: '💼 Comercial',
    programacion_interna: '💻 Programación interna',
    implementacion: '🚀 Implementación',
  };
  const tipoLabel = tipoLabels[c.tipoConsulta] || c.tipoConsulta || '—';

  // HTML del modal
  const overlay = document.createElement('div');
  overlay.id = 'cp-detalle-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:3000;
    background:rgba(0,0,0,0.55);
    display:flex;align-items:center;justify-content:center;
    padding:16px;
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--surface);
      border:1px solid var(--border2);
      border-radius:14px;
      width:100%;max-width:520px;
      max-height:90vh;overflow-y:auto;scrollbar-color:var(--border2) transparent;scrollbar-width:thin;
      padding:24px;
      position:relative;
    ">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px">
        <div>
          <div style="font-size:17px;font-weight:700;margin-bottom:3px">${_cpEsc(c.cliente || '—')}</div>
          <div style="font-size:12px;color:var(--text3)">${fechaCap}</div>
        </div>
        <button onclick="cerrarDetalleConsulta()" style="
          background:transparent;border:none;cursor:pointer;
          color:var(--text3);font-size:20px;padding:0 4px;line-height:1;
          flex-shrink:0;margin-top:2px;
        ">✕</button>
      </div>

      <!-- Campos -->
      <div style="display:flex;flex-direction:column;gap:14px">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Asesor</div>
            <div style="font-size:13px">${_cpEsc(c.asesor || '—')}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tipo</div>
            <div style="font-size:13px">${_cpEsc(tipoLabel)}</div>
          </div>
        </div>

        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Categoría</div>
          <div style="font-size:13px;color:var(--accent)">${_cpEsc(cat)}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Repetida</div>
            <div style="font-size:13px">${c.repetida === 'si' ? '⚠️ Sí' : 'No'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Remota</div>
            <div style="font-size:13px">${c.remota ? '🖥 Sí' : 'No'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tiempo</div>
            <div style="font-size:13px">${c.tiempo ? `⏱ ${typeof fmtHHMM === 'function' ? fmtHHMM(c.tiempo) : parseFloat(c.tiempo).toFixed(2) + 'h'}` : '—'}</div>
          </div>
        </div>

        ${c.descripcion ? `
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Detalle del problema</div>
          <div style="
            font-size:13px;color:var(--text2);line-height:1.6;
            background:var(--surface2);border:1px solid var(--border2);
            border-radius:8px;padding:10px 12px;
          ">${_cpEsc(c.descripcion)}</div>
        </div>` : ''}

        ${solTitulo ? `
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Solución utilizada</div>
          <div style="
            background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.25);
            border-radius:8px;padding:12px 14px;
          ">
            ${solPasos.length ? `
            <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
              ${solPasos.map(p => `<li style="font-size:13px;color:var(--text2);line-height:1.5">${_cpEsc(p)}</li>`).join('')}
            </ol>` : `<div style="font-size:13px;color:var(--text2)">✅ ${_cpEsc(solTitulo)}</div>`}
          </div>
        </div>` : ''}

      </div>

      <!-- Footer -->
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border2);display:flex;justify-content:flex-end">
        <button id="cp-detalle-del-btn" onclick="eliminarConsultaDesdeDetalle('${c.id}')" style="
          background:transparent;
          border:1px solid var(--red,#c0392b);
          color:var(--red,#c0392b);
          font-size:13px;font-family:inherit;
          padding:7px 16px;border-radius:8px;cursor:pointer;
          transition:background .15s,color .15s;
        "
        onmouseenter="this.style.background='var(--red,#c0392b)';this.style.color='#fff'"
        onmouseleave="this.style.background='transparent';this.style.color='var(--red,#c0392b)'">
          🗑 Eliminar consulta
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cerrar con Escape
  overlay._onKey = (e) => { if (e.key === 'Escape') cerrarDetalleConsulta(); };
  document.addEventListener('keydown', overlay._onKey);
}

function cerrarDetalleConsulta() {
  const overlay = document.getElementById('cp-detalle-overlay');
  if (!overlay) return;
  if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
  overlay.remove();
}

async function eliminarConsultaDesdeDetalle(id) {
  if (!confirm('¿Seguro que querés eliminar esta consulta? Esta acción no se puede deshacer.')) return;
  _cpConfirmarEliminacion(id);
}

async function _cpConfirmarEliminacion(id) {
  const btn = document.getElementById('cp-detalle-del-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando...'; }

  try {
    await dbDelete('consultas', id);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '🗑 Eliminar consulta'; btn.onclick = () => eliminarConsultaDesdeDetalle(id); }
    if (typeof toast === 'function') toast('No se pudo eliminar. Intentá de nuevo.');
    return;
  }

  // Quitar del array global
  if (typeof consultas !== 'undefined') {
    consultas = consultas.filter(c => c.id != id);
  }

  cerrarDetalleConsulta();

  // Refrescar vistas
  if (typeof refreshPanelMetrics === 'function')    refreshPanelMetrics();
  if (typeof renderClientes === 'function')         renderClientes();
  if (typeof refreshConsultasPage === 'function')   refreshConsultasPage();

  if (typeof toast === 'function') toast('Consulta eliminada');
}

// ════════════════════════════════════════════════════════════════
// MÉTRICAS SUPERIORES (cards hoy / mes / año / promedio)
// ════════════════════════════════════════════════════════════════

function _cpRefreshMetricas() {
  const all   = (typeof consultas !== 'undefined') ? consultas : [];
  const ahora = new Date();
  const hoy   = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  const man   = new Date(hoy);   man.setDate(man.getDate() + 1);

  const deHoy  = all.filter(c => { const t = new Date(c.timestamp); return t >= hoy && t < man; });
  const desMes = _cpFilterPeriod('mes', _cpMesOffset);

  // Días para el promedio: si es el mes actual, los transcurridos hasta hoy;
  // si es un mes pasado (ya cerrado), el total de días de ese mes.
  const totalMesesSel = ahora.getFullYear() * 12 + ahora.getMonth() + _cpMesOffset;
  const yearSel  = Math.floor(totalMesesSel / 12);
  const monthSel = ((totalMesesSel % 12) + 12) % 12;
  const diasDelMes = _cpMesOffset === 0 ? ahora.getDate() : new Date(yearSel, monthSel + 1, 0).getDate();
  const promDia = diasDelMes > 0 ? (desMes.length / diasDelMes).toFixed(1) : '0';
  const repMes  = desMes.filter(c => c.repetida === 'si').length;
  const pctRep  = desMes.length > 0 ? Math.round(repMes / desMes.length * 100) : 0;

  // Top cliente del mes seleccionado
  const conteoCli = {};
  desMes.forEach(c => { if (c.cliente) conteoCli[c.cliente] = (conteoCli[c.cliente] || 0) + 1; });
  const topCliEntries = Object.entries(conteoCli).sort((a, b) => b[1] - a[1]);
  const topCliNombre  = topCliEntries.length > 0 ? topCliEntries[0][0] : null;
  const topCliCant    = topCliEntries.length > 0 ? topCliEntries[0][1] : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cp-hoy',     deHoy.length);
  set('cp-hoy-sub', deHoy.length === 1 ? 'consulta' : 'consultas');
  set('cp-mes',     desMes.length);
  const subMes = document.getElementById('cp-mes-sub');
  if (subMes) {
    subMes.textContent = `${pctRep}% repetidas`;
    subMes.style.color = pctRep <= 20 ? 'var(--green)' : pctRep <= 35 ? 'var(--amber)' : 'var(--red,#c0392b)';
  }
  // Card top cliente del mes
  const elNombre = document.getElementById('cp-top-mes-nombre');
  const elSub    = document.getElementById('cp-top-mes-sub');
  if (elNombre) elNombre.textContent = topCliNombre || '—';
  if (elSub) {
    const mesTexto = _cpMesOffset === 0 ? 'este mes' : 'ese mes';
    elSub.textContent = topCliNombre
      ? `${topCliCant} consulta${topCliCant !== 1 ? 's' : ''} ${mesTexto}`
      : 'sin datos aún';
  }
  set('cp-prom', promDia);
  // cp-sub es texto fijo definido en el HTML, no se sobreescribe

  // Etiquetas dinámicas: "Este mes" / "Top cliente del mes" / "Prom. diario (mes)"
  // pasan a nombrar el mes elegido cuando no es el actual.
  const labelMesRaw = _cpPeriodLabel('mes', _cpMesOffset);
  const labelMes = labelMesRaw.charAt(0).toUpperCase() + labelMesRaw.slice(1);
  const esMesActual = _cpMesOffset === 0;
  const elLblMes  = document.getElementById('cp-mes-label');
  const elLblTop  = document.getElementById('cp-top-mes-label');
  const elLblProm = document.getElementById('cp-prom-label');
  if (elLblMes)  elLblMes.textContent  = esMesActual ? 'Este mes' : labelMes;
  if (elLblTop)  elLblTop.textContent  = esMesActual ? 'Top cliente del mes' : 'Top cliente — ' + labelMes;
  if (elLblProm) elLblProm.textContent = esMesActual ? 'Prom. diario (mes)' : 'Prom. diario — ' + labelMes;
}

// ────────── Selector de mes (Este mes / Top cliente / Promedio) ──────────

function navCpMes(dir) {
  const nuevo = _cpMesOffset + dir;
  if (nuevo > 0) return; // no ir al futuro
  _cpMesOffset = nuevo;
  _cpUpdateMesNav();
  _cpRefreshMetricas();
  _cpRenderMesSparkline();
  if (_cpVolPeriodo === 'mes') _cpRenderVolumenChart();
}

function _cpUpdateMesNav() {
  const label   = document.getElementById('cp-mes-nav-label');
  const nextBtn = document.getElementById('cp-mes-next');
  if (label) {
    const txt = _cpPeriodLabel('mes', _cpMesOffset);
    label.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  if (nextBtn) {
    nextBtn.disabled     = (_cpMesOffset >= 0);
    nextBtn.style.opacity = (_cpMesOffset >= 0) ? '0.35' : '1';
    nextBtn.style.cursor  = (_cpMesOffset >= 0) ? 'default' : 'pointer';
  }
}

// ════════════════════════════════════════════════════════════════
// GRÁFICO "VOLUMEN DE CONSULTAS" + sparkline de la card "Este mes"
// Datos reales (no de ejemplo): se agrupan por día/mes a partir del
// array global `consultas`, con el mismo criterio de _cpFilterPeriod
// (excluye programación interna).
// ════════════════════════════════════════════════════════════════

function _cpTodas() {
  return (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.tipoConsulta !== 'programacion_interna' && c.tipo_consulta !== 'programacion_interna')
    : [];
}

function _cpDateKey(d) {
  // Clave YYYY-MM-DD en hora local (evita corrimientos de zona horaria de toISOString)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function setCpVolPeriodo(periodo) {
  _cpVolPeriodo = periodo;
  ['semana', 'mes', 'anio'].forEach(p => {
    const btn = document.getElementById('cp-vol-btn-' + p);
    if (btn) btn.classList.toggle('active', p === periodo);
  });
  _cpRenderVolumenChart();
}

function _cpRenderVolumenChart() {
  const ctx = document.getElementById('cp-chart-volumen');
  if (!ctx) return;
  const todas = _cpTodas();
  const ahora = new Date();
  const hoyKey = _cpDateKey(ahora);

  let labels = [];
  let data = [];
  let todayIdx = -1;
  let titulo = 'Volumen de consultas';
  let sub = '';

  if (_cpVolPeriodo === 'semana') {
    const hoy0 = new Date(ahora); hoy0.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy0); d.setDate(d.getDate() - i);
      const key = _cpDateKey(d);
      const count = todas.filter(c => _cpDateKey(new Date(c.timestamp)) === key).length;
      labels.push(['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()] + ' ' + d.getDate());
      data.push(count);
      if (key === hoyKey) todayIdx = labels.length - 1;
    }
    titulo = 'Volumen de consultas — Últimos 7 días';
    sub = 'Últimos 7 días' + (todayIdx >= 0 ? ' · hoy destacado' : '');
  } else if (_cpVolPeriodo === 'anio') {
    const year = ahora.getFullYear();
    for (let m = 0; m < 12; m++) {
      const count = todas.filter(c => {
        const d = new Date(c.timestamp);
        return d.getFullYear() === year && d.getMonth() === m;
      }).length;
      const lbl = new Date(year, m, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
      labels.push(lbl.charAt(0).toUpperCase() + lbl.slice(1));
      data.push(count);
      if (m === ahora.getMonth()) todayIdx = m;
    }
    titulo = 'Volumen de consultas — ' + year;
    sub = 'Enero – diciembre' + (todayIdx >= 0 ? ' · mes actual destacado' : '');
  } else {
    // 'mes' — sigue al selector de mes de arriba (_cpMesOffset)
    const totalMeses  = ahora.getFullYear() * 12 + ahora.getMonth() + _cpMesOffset;
    const year         = Math.floor(totalMeses / 12);
    const month        = ((totalMeses % 12) + 12) % 12;
    const esMesActual  = _cpMesOffset === 0;
    const diasEnMes    = new Date(year, month + 1, 0).getDate();
    const ultimoDia    = esMesActual ? ahora.getDate() : diasEnMes;
    for (let dia = 1; dia <= ultimoDia; dia++) {
      const count = todas.filter(c => {
        const d = new Date(c.timestamp);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dia;
      }).length;
      labels.push(String(dia));
      data.push(count);
      if (_cpDateKey(new Date(year, month, dia)) === hoyKey) todayIdx = dia - 1;
    }
    const mesLabelRaw = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long' });
    const mesLabel    = mesLabelRaw.charAt(0).toUpperCase() + mesLabelRaw.slice(1);
    titulo = 'Volumen de consultas — ' + mesLabel;
    sub = `Días 1–${ultimoDia}` + (todayIdx >= 0 ? ' · hoy destacado' : '');
  }

  const elTitulo = document.getElementById('cp-vol-titulo');
  const elSub    = document.getElementById('cp-vol-sub');
  if (elTitulo) elTitulo.textContent = titulo;
  if (elSub)    elSub.textContent    = sub;

  const accentColor = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#2d2d8e';
  const pointBg     = data.map((_, i) => i === todayIdx ? accentColor : 'transparent');
  const pointRadius = data.map((_, i) => i === todayIdx ? 5 : 0);
  const pointHover  = data.map((_, i) => i === todayIdx ? 6 : 4);

  if (!_cpChartVolumen) {
    _cpChartVolumen = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: accentColor,
          backgroundColor: accentColor + '1a',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: [],
          pointBorderColor: accentColor,
          pointBorderWidth: 2,
          pointRadius: [],
          pointHoverRadius: [],
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => item.parsed.y + (item.parsed.y === 1 ? ' consulta' : ' consultas')
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148,163,184,0.12)' },
            ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 1, precision: 0 }
          },
          x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }
        }
      }
    });
  }

  _cpChartVolumen.data.labels                          = labels;
  _cpChartVolumen.data.datasets[0].data                 = data;
  _cpChartVolumen.data.datasets[0].borderColor          = accentColor;
  _cpChartVolumen.data.datasets[0].backgroundColor      = accentColor + '1a';
  _cpChartVolumen.data.datasets[0].pointBorderColor     = accentColor;
  _cpChartVolumen.data.datasets[0].pointBackgroundColor = pointBg;
  _cpChartVolumen.data.datasets[0].pointRadius          = pointRadius;
  _cpChartVolumen.data.datasets[0].pointHoverRadius     = pointHover;
  _cpChartVolumen.update();
}

// Mini gráfico de tendencia dentro de la card "Este mes" (días 1..hoy,
// o el mes completo si es un mes cerrado).
function _cpRenderMesSparkline() {
  const ctx = document.getElementById('cp-mes-sparkline');
  if (!ctx) return;
  const todas = _cpTodas();
  const ahora = new Date();

  const totalMeses = ahora.getFullYear() * 12 + ahora.getMonth() + _cpMesOffset;
  const year        = Math.floor(totalMeses / 12);
  const month       = ((totalMeses % 12) + 12) % 12;
  const esMesActual = _cpMesOffset === 0;
  const diasEnMes   = new Date(year, month + 1, 0).getDate();
  const ultimoDia   = esMesActual ? Math.max(ahora.getDate(), 1) : diasEnMes;

  const data = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const count = todas.filter(c => {
      const d = new Date(c.timestamp);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dia;
    }).length;
    data.push(count);
  }
  if (data.length === 0) data.push(0);

  const greenColor = (getComputedStyle(document.documentElement).getPropertyValue('--green') || '').trim() || '#2d6a2d';

  if (!_cpChartSparkline) {
    _cpChartSparkline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: greenColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.35,
          pointRadius: 0,
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      }
    });
  } else {
    _cpChartSparkline.data.labels             = data.map((_, i) => i);
    _cpChartSparkline.data.datasets[0].data   = data;
    _cpChartSparkline.data.datasets[0].borderColor = greenColor;
    _cpChartSparkline.update();
  }
}

// ════════════════════════════════════════════════════════════════
// RENDER COMPLETO
// ════════════════════════════════════════════════════════════════

function renderConsultasPage() {
  if (!document.getElementById('cp-hoy')) return;
  _cpUpdateMesNav();
  _cpRefreshMetricas();
  _cpRenderMesSparkline();
  _cpRenderVolumenChart();
  _cpUpdateRankingNav('cp-top-cli');
  _cpUpdateRankingNav('cp-top-cat');
  _cpUpdateRankingNav('cp-top-tiempo');
  _cpUpdateRankingNav('cp-top-rep');
  renderCpRanking('cp-top-cli');
  renderCpRanking('cp-top-cat');
  renderCpRanking('cp-top-tiempo');
  renderCpRanking('cp-top-rep');
  _cpUpdateHistNav();
  renderCpHistorial();
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function _cpEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ════════════════════════════════════════════════════════════════
// CSS
// ════════════════════════════════════════════════════════════════

(function () {
  if (document.getElementById('cp-styles')) return;
  const s = document.createElement('style');
  s.id = 'cp-styles';
  s.textContent = `
    .cp-range-btn, .cp-hist-btn {
      padding: 4px 10px; font-size: 12px; font-family: inherit;
      border: none; cursor: pointer; background: transparent; color: var(--text2);
      transition: background .12s, color .12s;
    }
    .cp-range-btn.active, .cp-hist-btn.active {
      background: var(--accent); color: #fff; font-weight: 500;
    }
    .cp-nav-btn {
      border: 1px solid var(--border2); background: transparent; color: var(--text2);
      border-radius: 6px; padding: 3px 8px; font-size: 13px; cursor: pointer;
      transition: background .12s;
    }
    .cp-nav-btn:hover:not(:disabled) { background: var(--surface2); }
    .cp-nav-btn:disabled { opacity: 0.35; cursor: default; }
    .cp-period-label {
      font-size: 12px; color: var(--text3); font-weight: 500; min-width: 120px; text-align: center;
    }
  `;
  document.head.appendChild(s);
})();

window.addEventListener('app-ready', () => {
  renderConsultasPage();
});

// Llamada desde consultas.js cuando cambia el array global `consultas`
function refreshConsultasPage() {
  renderConsultasPage();
}
