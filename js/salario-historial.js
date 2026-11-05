// salario-historial.js — Historial mensual de los datos de Salario por cliente (migración 071)
// Modal "📈 Historial": selector de mes, datos de ese mes con variación contra el anterior,
// gráfico de evolución de legajos/personas y lista de cambios (convenios, empresas, versión, motor).
// Los datos salen de window.salarioHist (js/salario-sync.js): una fila por cliente + base + año + mes.

const SAL_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
window._salHist = null;        // { clienteId, periodo: 'YYYY-MM' }
let _salHistChart = null;

const _salPer = r => `${r.anio}-${String(r.mes).padStart(2, '0')}`;
function _salPerTxt(per) { const [a, m] = per.split('-'); return `${SAL_MESES[Number(m) - 1]} ${a}`; }
function _salPerCorto(per) { const [a, m] = per.split('-'); return `${SAL_MESES[Number(m) - 1].slice(0, 3)} ${String(a).slice(2)}`; }
const _salNom = x => (typeof x === 'string' ? x : (x && (x.nombre || x.razon_social)) || '').toString().trim();

// Períodos con datos de un cliente, del más nuevo al más viejo
function salarioPeriodosCliente(clienteId) {
  const s = new Set();
  ((window.salarioHist || {})[clienteId] || []).forEach(r => s.add(_salPer(r)));
  return [...s].sort().reverse();
}

// Junta todas las bases de un período en un solo resumen
function salarioAgregadoPeriodo(clienteId, per) {
  const filas = ((window.salarioHist || {})[clienteId] || []).filter(r => _salPer(r) === per);
  if (!filas.length) return null;
  const suma = k => { const c = filas.filter(f => f[k] != null); return c.length ? c.reduce((t, f) => t + f[k], 0) : null; };
  const junta = k => {
    if (!filas.some(f => Array.isArray(f[k]))) return null;
    const vistos = new Set(), out = [];
    filas.forEach(f => (f[k] || []).forEach(x => { const n = _salNom(x); const key = n.toLowerCase(); if (n && !vistos.has(key)) { vistos.add(key); out.push(n); } }));
    return out;
  };
  const uniq = k => [...new Set(filas.map(f => f[k]).filter(Boolean))];
  return { legajos: suma('legajos'), cuiles: suma('cuiles'), convenios: junta('convenios'), empresas: junta('empresas'),
           versiones: uniq('version'), motores: uniq('motor'), bases: filas.length };
}

const _salMotorTxt = m => m === 'mysql' ? 'MySQL' : m === 'dbf' ? 'DBF' : (m || '');

function abrirSalarioHistorial(clienteId) {
  const pers = salarioPeriodosCliente(clienteId);
  window._salHist = { clienteId, periodo: pers[0] || null };
  const hoja = document.querySelector('#salario-overlay .kb-modal-sheet');
  if (hoja) { hoja.style.maxWidth = '920px'; hoja.style.width = '94%'; }
  document.getElementById('salario-overlay').classList.add('kb-modal--open');
  salarioHistRender();
}

function salarioHistCerrar() {
  window._salHist = null;
  const hoja = document.querySelector('#salario-overlay .kb-modal-sheet');
  if (hoja) { hoja.style.maxWidth = ''; hoja.style.width = ''; }
  if (_salHistChart) { _salHistChart.destroy(); _salHistChart = null; }
}

function salarioHistRefrescar() { if (window._salHist) salarioHistRender(); }

function salarioHistIr(per) { if (!window._salHist) return; window._salHist.periodo = per; salarioHistRender(); }

function salarioHistRender() {
  const st = window._salHist;
  if (!st) return;
  const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => String(x.id) === String(st.clienteId));
  const titulo = document.getElementById('salario-modal-titulo');
  const body = document.getElementById('salario-modal-body');
  if (!c || !titulo || !body) return;
  titulo.textContent = `📈 Historial de Salario — ${c.nombre}`;
  const pers = salarioPeriodosCliente(st.clienteId);
  if (!pers.length) {
    body.innerHTML = `<div style="text-align:center;padding:28px 10px;color:var(--text3);font-size:14px">Todavía no hay historial.<br>Se arma solo cuando Salario manda los datos de cada mes.</div>`;
    return;
  }
  if (!st.periodo || !pers.includes(st.periodo)) st.periodo = pers[0];
  const i = pers.indexOf(st.periodo);                      // pers está del más nuevo al más viejo
  const ant = pers[i + 1] || null, sig = pers[i - 1] || null;
  const act = salarioAgregadoPeriodo(st.clienteId, st.periodo);
  const prev = ant ? salarioAgregadoPeriodo(st.clienteId, ant) : null;

  const delta = (a, b) => {
    if (a == null || b == null || a === b) return '';
    const d = a - b;
    return `<small class="sh-delta ${d > 0 ? 'sh-delta--up' : 'sh-delta--down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</small>`;
  };
  const card = (ico, lbl, val, extra) => `
    <div class="sh-card"><div class="sh-card__k">${ico} ${lbl}</div><div class="sh-card__v">${val}${extra || ''}</div></div>`;
  const nv = v => v == null ? '—' : v;

  // Cambios contra el mes anterior
  const cambios = [];
  if (prev) {
    const dif = (nuevo, viejo) => (nuevo || []).filter(x => !(viejo || []).some(y => y.toLowerCase() === x.toLowerCase()));
    dif(act.convenios, prev.convenios).forEach(x => cambios.push(['+', `Convenio nuevo: ${x}`]));
    dif(prev.convenios, act.convenios).forEach(x => cambios.push(['−', `Convenio que ya no está: ${x}`]));
    dif(act.empresas, prev.empresas).forEach(x => cambios.push(['+', `Empresa nueva: ${x}`]));
    dif(prev.empresas, act.empresas).forEach(x => cambios.push(['−', `Empresa que ya no está: ${x}`]));
    if (act.legajos != null && prev.legajos != null && act.legajos !== prev.legajos)
      cambios.push([act.legajos > prev.legajos ? '+' : '−', `Legajos: ${prev.legajos} → ${act.legajos} (${act.legajos > prev.legajos ? '+' : ''}${act.legajos - prev.legajos})`]);
    if (act.cuiles != null && prev.cuiles != null && act.cuiles !== prev.cuiles)
      cambios.push([act.cuiles > prev.cuiles ? '+' : '−', `Personas: ${prev.cuiles} → ${act.cuiles}`]);
    if (act.versiones.join() !== prev.versiones.join() && act.versiones.length)
      cambios.push(['•', `Versión de Salario: ${prev.versiones.join(', ') || '—'} → ${act.versiones.join(', ')}`]);
    if (act.motores.join() !== prev.motores.join() && act.motores.length)
      cambios.push(['•', `Motor de datos: ${prev.motores.map(_salMotorTxt).join(', ') || '—'} → ${act.motores.map(_salMotorTxt).join(', ')}`]);
  }

  const kpi = (lbl, val, extra, mudo) => `
    <div class="sh-kpi${mudo ? ' sh-kpi--mudo' : ''}"><div class="sh-kpi__v">${val}${extra || ''}</div><div class="sh-kpi__k">${lbl}</div></div>`;
  const vacio = v => v == null || v === '—' || (Array.isArray(v) && !v.length);
  const chips = (arr, vacioTxt) => arr && arr.length
    ? `<div class="sh-lista">${arr.map(x => `<span>${_escHtml(x)}</span>`).join('')}</div>`
    : `<div class="sh-vacio">${vacioTxt}</div>`;
  // Línea de tiempo de meses: del más viejo al más nuevo
  const lineaMeses = [...pers].reverse().map(p => {
    const [a, m] = p.split('-');
    return `<button class="sh-mes${p === st.periodo ? ' sh-mes--on' : ''}" onclick="salarioHistIr('${p}')"><b>${SAL_MESES[Number(m) - 1].slice(0, 3)}</b><small>${a}</small></button>`;
  }).join('');

  body.innerHTML = `
    <div class="sh-head">
      <div>
        <div class="sh-head__t">${_salPerTxt(st.periodo)}</div>
        <div class="sh-head__s">${i === 0 ? 'Mes más reciente' : `<button class="sh-nav__lnk" onclick="salarioHistIr('${pers[0]}')">Ir al más reciente →</button>`}${act.bases > 1 ? ` · ${act.bases} bases` : ''}</div>
      </div>
    </div>
    <div class="sh-meses">${lineaMeses}</div>

    <div class="sh-kpis">
      ${kpi('Legajos', nv(act.legajos), prev ? delta(act.legajos, prev.legajos) : '', act.legajos == null)}
      ${kpi('Personas (CUIL)', nv(act.cuiles), prev ? delta(act.cuiles, prev.cuiles) : '', act.cuiles == null)}
      ${kpi('Convenios', act.convenios ? act.convenios.length : '—', prev && act.convenios && prev.convenios ? delta(act.convenios.length, prev.convenios.length) : '', !act.convenios)}
      ${kpi('Empresas', act.empresas ? act.empresas.length : '—', prev && act.empresas && prev.empresas ? delta(act.empresas.length, prev.empresas.length) : '', !act.empresas)}
      ${kpi('Versión', act.versiones.length ? _escHtml(act.versiones.join(', ')) : '—', '', !act.versiones.length)}
      ${kpi('Motor', act.motores.length ? act.motores.map(_salMotorTxt).join(', ') : '—', '', !act.motores.length)}
    </div>

    <div class="sh-dos">
      <div class="sh-panel">
        <div class="sh-sec">Evolución</div>
        <div class="sh-chart"><canvas id="sh-chart"></canvas></div>
      </div>
      <div class="sh-panel">
        <div class="sh-sec">Cambios${ant ? ` desde ${_salPerTxt(ant)}` : ''}</div>
        ${!ant ? '<div class="sh-vacio">Es el primer mes con datos: todavía no hay con qué comparar.</div>'
          : cambios.length ? `<div class="sh-cambios">${cambios.map(([sg, t]) => `<div class="sh-cambio"><b class="sh-cambio__s sh-cambio__s--${sg === '+' ? 'mas' : sg === '−' ? 'menos' : 'otro'}">${sg}</b><span>${_escHtml(t)}</span></div>`).join('')}</div>`
            : '<div class="sh-vacio">Sin cambios respecto del mes anterior.</div>'}
      </div>
    </div>

    <div class="sh-dos">
      <div class="sh-panel">
        <div class="sh-sec">Convenios${act.convenios ? ` (${act.convenios.length})` : ''}</div>
        ${chips(act.convenios, 'Sin datos de convenios en este mes.')}
      </div>
      <div class="sh-panel">
        <div class="sh-sec">Empresas${act.empresas ? ` (${act.empresas.length})` : ''}</div>
        ${chips(act.empresas, 'Sin datos de empresas en este mes.')}
      </div>
    </div>`;

  // Gráfico: últimos 12 meses con datos, del más viejo al más nuevo
  const serie = pers.slice(0, 12).reverse().map(p => ({ p, a: salarioAgregadoPeriodo(st.clienteId, p) }));
  const cv = document.getElementById('sh-chart');
  if (_salHistChart) { _salHistChart.destroy(); _salHistChart = null; }
  if (cv && typeof Chart !== 'undefined') {
    _salHistChart = new Chart(cv, {
      type: 'line',
      data: {
        labels: serie.map(x => _salPerCorto(x.p)),
        datasets: [
          { label: 'Legajos', data: serie.map(x => x.a.legajos), borderColor: '#f97316', backgroundColor: '#f97316', tension: .25, pointRadius: 4, spanGaps: true },
          { label: 'Personas (CUIL)', data: serie.map(x => x.a.cuiles), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: .25, pointRadius: 4, spanGaps: true, borderDash: [5, 4] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } },
        scales: { y: { beginAtZero: true, grace: '10%', ticks: { precision: 0 } }, x: { grid: { display: false } } },
        onClick: (_e, els) => { if (els.length) salarioHistIr(serie[els[0].index].p); },
      },
    });
  }
}
