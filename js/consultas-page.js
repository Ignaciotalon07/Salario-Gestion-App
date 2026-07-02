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
  // cp-top-rep: consulta más repetida (repetida = 'si')
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
    const max = sorted[0][1].total;
    el.innerHTML = sorted.map(([cat, { total, clientes }], i) => {
      const pct      = Math.round((total / max) * 100);
      const pctTotal = soloRep.length > 0 ? Math.round((total / soloRep.length) * 100) : 0;
      const medal    = i === 0 ? '🔁' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

      // Cliente que más repite esta consulta específica
      const topCli = Object.entries(clientes).sort((a, b) => b[1] - a[1])[0];
      const topCliLabel = topCli
        ? `<span style="font-size:11px;color:var(--text3);margin-top:2px;display:block">
             👤 ${_cpEsc(topCli[0])} · ${topCli[1]}x
           </span>`
        : '';

      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;gap:8px">
          <span style="font-size:13px;font-weight:${i===0?'600':'400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${medal} ${_cpEsc(cat)}</span>
          <span style="font-size:13px;font-weight:600;color:var(--red,#c0392b);white-space:nowrap">
            ${total} <span style="font-size:11px;color:var(--text3);font-weight:400">(${pctTotal}%)</span>
          </span>
        </div>
        ${topCliLabel}
        <div style="height:5px;background:var(--border);border-radius:3px;margin-top:4px">
          <div style="height:5px;background:var(--red,#c0392b);border-radius:3px;width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  // ────────────────────────────────────────────────
  // cp-top-cli: cliente con más consultas
  // cp-top-cat: categoría/subtema más frecuente (total, no solo repetidas)
  // ────────────────────────────────────────────────
  const conteo = {};
  datos.forEach(c => {
    const k = targetId === 'cp-top-cli'
      ? (c.cliente || null)
      : ([c.categoria, c.subtema].filter(Boolean).join(' › ') || 'Sin categoría');
    if (!k) return;
    conteo[k] = (conteo[k] || 0) + 1;
  });

  const sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos para este período</div>';
    return;
  }

  const max      = sorted[0][1];
  const isTopCli = (targetId === 'cp-top-cli');

  el.innerHTML = sorted.map(([nombre, cant], i) => {
    const pct      = Math.round((cant / max) * 100);
    const pctTotal = datos.length > 0 ? Math.round((cant / datos.length) * 100) : 0;
    const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const barColor = isTopCli ? 'var(--accent)' : (i === 0 ? 'var(--red,#c0392b)' : 'var(--accent)');
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;gap:8px">
        <span style="font-size:13px;font-weight:${i===0?'600':'400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${medal} ${_cpEsc(nombre)}</span>
        <span style="font-size:13px;font-weight:600;color:var(--accent);white-space:nowrap">
          ${cant}${isTopCli ? '' : ` <span style="font-size:11px;color:var(--text3);font-weight:400">(${pctTotal}%)</span>`}
        </span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px">
        <div style="height:5px;background:${barColor};border-radius:3px;width:${pct}%"></div>
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
    tags.push(`<span style="background:var(--surface2);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:4px">⏱ ${parseFloat(c.tiempo).toFixed(1)}h</span>`);

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
            <div style="font-size:13px">${c.tiempo ? `⏱ ${parseFloat(c.tiempo).toFixed(1)}h` : '—'}</div>
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
  const desMes = _cpFilterPeriod('mes', 0);

  const diasTranscurridos = ahora.getDate();
  const promDia = diasTranscurridos > 0 ? (desMes.length / diasTranscurridos).toFixed(1) : '0';
  const repMes  = desMes.filter(c => c.repetida === 'si').length;
  const pctRep  = desMes.length > 0 ? Math.round(repMes / desMes.length * 100) : 0;

  // Top cliente del mes: cliente con más consultas en el mes actual
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
    elSub.textContent = topCliNombre
      ? `${topCliCant} consulta${topCliCant !== 1 ? 's' : ''} este mes`
      : 'sin datos aún';
  }
  set('cp-prom', promDia);
  // cp-sub es texto fijo definido en el HTML, no se sobreescribe
}

// ════════════════════════════════════════════════════════════════
// RENDER COMPLETO
// ════════════════════════════════════════════════════════════════

function renderConsultasPage() {
  if (!document.getElementById('cp-hoy')) return;
  _cpRefreshMetricas();
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

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

window.addEventListener('app-ready', () => {
  renderConsultasPage();
});

// Llamada desde consultas.js cuando cambia el array global `consultas`
function refreshConsultasPage() {
  renderConsultasPage();
}
