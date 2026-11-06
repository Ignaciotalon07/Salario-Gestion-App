// salario-historico.js — Pestaña "Histórico" del detalle de un cliente: todo lo que manda Salario, mes a mes.
// Franja de variación, lectura automática, gráfico de evolución (con marcas de cambios de versión/motor),
// empresas (top, participación, altas/bajas, las que más crecieron/bajaron), línea de tiempo de convenios.
// Usa los helpers de salario-historial.js (salarioPeriodosCliente, salarioAgregadoPeriodo, _salDiff…).

window._histMes = null;                            // mes elegido 'YYYY-MM' (null = el más reciente con datos)
window._histCharts = [];

function _histDestruirCharts() {
  (window._histCharts || []).forEach(c => { try { c.destroy(); } catch (e) { /* ya destruido */ } });
  window._histCharts = [];
}

// Mes elegido válido para el cliente (si no existe, el más reciente)
function _histMesSel(clienteId) {
  const todos = salarioPeriodosCliente(clienteId);                   // nuevo → viejo
  return (window._histMes && todos.includes(window._histMes)) ? window._histMes : (todos[0] || null);
}

// Navega al mes anterior (-1) o siguiente (+1) que tenga datos
function histNavMes(dir) {
  if (typeof _detalleClienteId === 'undefined' || !_detalleClienteId) return;
  const todos = salarioPeriodosCliente(_detalleClienteId);           // nuevo → viejo
  const i = todos.indexOf(_histMesSel(_detalleClienteId));
  const j = i - dir;                                                 // +1 = más nuevo = índice menor
  if (j < 0 || j >= todos.length) return;
  window._histMes = todos[j];
  renderDetalleCliente(_detalleClienteId);
}

// Datos hasta el mes elegido: períodos (del más viejo al elegido) + agregados
function _histDatos(clienteId) {
  const sel = _histMesSel(clienteId);
  const pers = salarioPeriodosCliente(clienteId).reverse().filter(p => !sel || p <= sel);   // viejo → elegido
  const agg = {}; pers.forEach(p => { agg[p] = salarioAgregadoPeriodo(clienteId, p); });
  return { pers, agg };
}

// Mes contra el que se comparan los gráficos de empresas: 'ant' (mes anterior), '6m' (6 meses atrás) o 'ini' (primer mes con datos)
function _histPerBase(pers) {
  const n = pers.length; if (n < 2) return pers[0];
  const modo = window._histCmp || 'ant';
  if (modo === 'ini') return pers[0];
  if (modo === 'ant') return pers[n - 2];
  const [a, m] = pers[n - 1].split('-').map(Number);
  const t = new Date(a, m - 1 - 6, 1), lim = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const c = pers.filter((p, i) => i < n - 1 && p <= lim);
  return c.length ? c[c.length - 1] : pers[0];
}
function histCmp(t) { window._histCmp = t; renderDetalleCliente(_detalleClienteId); }

const _histMapaEmp = a => { const m = new Map(); (a.empresas || []).forEach(t => { const e = _salEmpresa(t); const k = _salKey(e.nombre); const cur = m.get(k); m.set(k, { nombre: e.nombre, n: e.n == null ? (cur ? cur.n : null) : (cur && cur.n ? cur.n : 0) + e.n }); }); return m; };

// ────────── Lectura automática ──────────
function _histFrases(d) {
  const { pers, agg } = d;
  const out = [];
  if (pers.length < 2) return ['Solo hay un mes con datos: cuando lleguen más meses se arma la comparación.'];
  const p0 = pers[0], pN = pers[pers.length - 1], a0 = agg[p0], aN = agg[pN];
  const rango = `desde ${_salPerTxt(p0)}`;
  if (a0.legajos != null && aN.legajos != null && a0.legajos !== aN.legajos) {
    const dif = aN.legajos - a0.legajos, pct = a0.legajos ? Math.round(Math.abs(dif) / a0.legajos * 100) : 0;
    out.push(`${dif > 0 ? 'Creció' : 'Bajó'} ${pct}% en legajos ${rango} (${dif > 0 ? '+' : ''}${dif}).`);
  } else if (a0.legajos != null && aN.legajos != null) out.push(`Los legajos se mantienen en ${aN.legajos} ${rango}.`);
  // Racha de subas o bajas consecutivas
  const ls = pers.map(p => agg[p].legajos);
  let racha = 0, signo = 0;
  for (let i = ls.length - 1; i > 0; i--) {
    if (ls[i] == null || ls[i - 1] == null || ls[i] === ls[i - 1]) break;
    const sg = ls[i] > ls[i - 1] ? 1 : -1;
    if (!signo) signo = sg;
    if (sg !== signo) break;
    racha++;
  }
  if (racha >= 2) out.push(`Los legajos ${signo > 0 ? 'subieron' : 'bajaron'} ${racha} meses seguidos.`);
  // Altas y bajas de empresas en todo el rango
  let altas = 0, bajas = 0;
  for (let i = 1; i < pers.length; i++) { const df = _salDiff(agg[pers[i]], agg[pers[i - 1]]); altas += df.empNuevas.length; bajas += df.empIdas.length; }
  if (altas || bajas) out.push(`Sumó ${altas} empresa${altas !== 1 ? 's' : ''} y perdió ${bajas} en el período.`);
  // Última variación de convenios
  const dfU = _salDiff(aN, agg[pers[pers.length - 2]]);
  if (dfU.convNuevos.length) out.push(`En ${_salPerTxt(pN)} se agregó${dfU.convNuevos.length > 1 ? 'ron' : ''} ${dfU.convNuevos.length} convenio${dfU.convNuevos.length > 1 ? 's' : ''}: ${dfU.convNuevos.slice(0, 3).join(', ')}${dfU.convNuevos.length > 3 ? '…' : ''}.`);
  // Versión / motor
  for (let i = 1; i < pers.length; i++) {
    const v0 = agg[pers[i - 1]].versiones.join(', '), v1 = agg[pers[i]].versiones.join(', ');
    if (v0 && v1 && v0 !== v1) out.push(`Actualizó Salario de ${v0} a ${v1} en ${_salPerTxt(pers[i])}.`);
    const m0 = agg[pers[i - 1]].motores.map(_salMotorTxt).join(', '), m1 = agg[pers[i]].motores.map(_salMotorTxt).join(', ');
    if (m0 && m1 && m0 !== m1) out.push(`Cambió el motor de datos de ${m0} a ${m1} en ${_salPerTxt(pers[i])}.`);
  }
  // Empresa más grande
  const emp = [..._histMapaEmp(aN).values()].filter(e => e.n);
  const tot = emp.reduce((t, e) => t + e.n, 0);
  if (emp.length > 1 && tot) {
    const top = emp.sort((x, y) => y.n - x.n)[0];
    out.push(`${top.nombre} concentra el ${Math.round(top.n / tot * 100)}% de los empleados (${top.n} de ${tot}).`);
  }
  if (aN.legajos != null && aN.cuiles != null && aN.legajos > aN.cuiles) out.push(`Hay ${aN.legajos - aN.cuiles} legajos de personas que tienen más de uno.`);
  return out;
}

// ────────── Botón inteligente: "Qué cambió mes a mes" (modal que lo cuenta en palabras) ──────────
window._histCambiosAbierto = null;   // id del cliente con el modal abierto

const _hMeses = per => { const [a, m] = per.split('-').map(Number); return a * 12 + m; };
const _hPl = (n, s, p) => `${n} ${n === 1 ? s : p}`;
// "A, B, C y 2 más" (máx. k nombres)
function _hLista(arr, k = 4) {
  const v = arr.slice(0, k).map(x => `<b>${x}</b>`);
  const resto = arr.length - k;
  if (resto > 0) return v.join(', ') + ` y ${resto} más`;
  return v.length > 1 ? v.slice(0, -1).join(', ') + ' y ' + v[v.length - 1] : (v[0] || '');
}

// Cuenta en frases qué cambió en un mes respecto del anterior con datos
function _histNarrar(aN, aP, per, perP) {
  if (!aP) {
    const partes = [];
    if (aN.legajos != null) partes.push(`${aN.legajos} legajos`);
    if (aN.cuiles != null && aN.cuiles !== aN.legajos) partes.push(`${aN.cuiles} personas`);
    if (aN.empresas) partes.push(_hPl(aN.empresas.length, 'empresa', 'empresas'));
    if (aN.convenios) partes.push(_hPl(aN.convenios.length, 'convenio', 'convenios'));
    return { nivel: 0, frases: [`Es el primer mes con datos: ${partes.join(', ') || 'sin números todavía'}${aN.versiones.length ? ` · Salario ${_escHtml(aN.versiones.join(', '))}` : ''}${aN.motores.length ? ` · ${aN.motores.map(_salMotorTxt).join(', ')}` : ''}.`] };
  }
  const df = _salDiff(aN, aP), fr = [];
  const gap = _hMeses(per) - _hMeses(perP) - 1;
  if (df.legajos) {
    const pct = aP.legajos ? Math.round(Math.abs(df.legajos) / aP.legajos * 100) : 0;
    fr.push(`Los legajos ${df.legajos > 0 ? '<span class="hi-up"><b>subieron</b></span>' : '<span class="hi-down"><b>bajaron</b></span>'} de <b>${aP.legajos}</b> a <b>${aN.legajos}</b> (${df.legajos > 0 ? '+' : ''}${df.legajos}${pct ? `, ${pct}%` : ''}).`);
  }
  if (df.cuiles && df.cuiles !== df.legajos) fr.push(`Las personas (CUIL) pasaron de <b>${aP.cuiles}</b> a <b>${aN.cuiles}</b>.`);
  if (df.empNuevas.length) fr.push(`<span class="hi-up"><b>Entraron ${_hPl(df.empNuevas.length, 'empresa', 'empresas')}</b></span>: ${_hLista(df.empNuevas.map(e => _escHtml(e.nombre) + (e.n != null ? ` (${e.n})` : '')))}.`);
  if (df.empIdas.length) fr.push(`<span class="hi-down"><b>${df.empIdas.length === 1 ? 'Salió 1 empresa' : 'Salieron ' + df.empIdas.length + ' empresas'}</b></span>: ${_hLista(df.empIdas.map(e => _escHtml(e.nombre) + (e.n != null ? ` <b class="hi-down">(-${e.n})</b>` : '')))}.`);
  if (df.empCambio.length) fr.push(`Cambió la cantidad de empleados de ${_hPl(df.empCambio.length, 'empresa', 'empresas')}: ${df.empCambio.slice(0, 5).map(e => `${_escHtml(e.nombre)} <b class="${e.a > e.de ? 'hi-up' : 'hi-down'}">${e.de} → ${e.a}</b>`).join(', ')}${df.empCambio.length > 5 ? ` y ${df.empCambio.length - 5} más` : ''}.`);
  if (df.convNuevos.length) fr.push(`<span class="hi-up"><b>Se ${df.convNuevos.length === 1 ? 'agregó el convenio' : 'agregaron los convenios'}</b></span> ${_hLista(df.convNuevos.map(_escHtml))}.`);
  if (df.convIdos.length) fr.push(`<span class="hi-down"><b>${df.convIdos.length === 1 ? 'Dejó de estar el convenio' : 'Dejaron de estar los convenios'}</b></span> ${_hLista(df.convIdos.map(_escHtml))}.`);
  if (df.version) fr.push(`Actualizó Salario de la versión <b>${_escHtml(df.version[0])}</b> a la <b>${_escHtml(df.version[1])}</b>.`);
  if (df.motor) fr.push(`Cambió el motor de datos de <b>${df.motor[0]}</b> a <b>${df.motor[1]}</b>.`);
  const peso = (df.legajos ? 1 : 0) + df.empNuevas.length + df.empIdas.length + df.empCambio.length + df.convNuevos.length + df.convIdos.length + (df.version ? 2 : 0) + (df.motor ? 2 : 0);
  if (!fr.length) fr.push('Sin cambios respecto del mes anterior.');
  if (gap > 0) fr.push(`<span class="hi-nota">Se compara con ${_salPerTxt(perP)}: no hay datos de ${_hPl(gap, 'mes', 'meses')} en el medio.</span>`);
  return { nivel: peso === 0 ? 0 : peso <= 3 ? 1 : peso <= 8 ? 2 : 3, frases: fr };
}

function abrirCambiosMes(clienteId) {
  window._histCambiosAbierto = clienteId;
  const hoja = document.querySelector('#salario-overlay .kb-modal-sheet');
  if (hoja) { hoja.style.maxWidth = '760px'; hoja.style.width = '94%'; }
  document.getElementById('salario-overlay').classList.add('kb-modal--open');
  salarioHistRefrescar();
}

function salarioHistCerrar() {
  window._histCambiosAbierto = null;
  const hoja = document.querySelector('#salario-overlay .kb-modal-sheet');
  if (hoja) { hoja.style.maxWidth = ''; hoja.style.width = ''; }
}

function salarioHistRefrescar() {
  const id = window._histCambiosAbierto;
  if (!id) return;
  const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => String(x.id) === String(id));
  const titulo = document.getElementById('salario-modal-titulo'), body = document.getElementById('salario-modal-body');
  if (!c || !titulo || !body) return;
  titulo.textContent = `Qué cambió mes a mes — ${c.nombre}`;
  const todos = salarioPeriodosCliente(id);                          // nuevo → viejo
  if (!todos.length) { body.innerHTML = '<div class="hi-vacio">Todavía no hay datos de Salario para contar.</div>'; return; }
  const agg = {}; todos.forEach(p => { agg[p] = salarioAgregadoPeriodo(id, p); });
  const meses = todos.map((p, i) => ({ p, ...(_histNarrar(agg[p], todos[i + 1] ? agg[todos[i + 1]] : null, p, todos[i + 1])) }));
  // Resumen general (usa toda la historia)
  const asc = [...todos].reverse();
  const general = _histFrases({ pers: asc, agg });
  const mayor = [...meses].filter(m => m.nivel > 0 && todos.indexOf(m.p) < todos.length - 1).sort((x, y) => y.nivel - x.nivel)[0];
  const etiqueta = ['Sin cambios', 'Poco movimiento', 'Movimiento medio', 'Mucho movimiento'];
  // Agrupar por año (más nuevo primero); solo el año más reciente arranca abierto
  const anios = [];
  meses.forEach(m => { const a = m.p.split('-')[0]; let g = anios.find(x => x.anio === a); if (!g) { g = { anio: a, items: [] }; anios.push(g); } g.items.push(m); });
  body.innerHTML = `
    <div class="hi-smart">
      <div class="hi-smart__t">Resumen</div>
      ${general.map(f => `<div class="hi-smart__f">${_escHtml(f)}</div>`).join('')}
      ${mayor && meses.length > 2 ? `<div class="hi-smart__f">El mes con más movimiento fue <b>${_salPerTxt(mayor.p)}</b>.</div>` : ''}
    </div>
    ${(() => {
      // Resumen de cada año (variación de legajos, altas y bajas de empresas)
      const res = an => {
        let dLeg = 0, altas = 0, bajas = 0;
        an.items.forEach(m => { const j = todos.indexOf(m.p); const df = _salDiff(agg[m.p], todos[j + 1] ? agg[todos[j + 1]] : null); dLeg += df.legajos || 0; altas += df.empNuevas.length; bajas += df.empIdas.length; });
        const rs = [];
        if (dLeg) rs.push(`<span class="${dLeg > 0 ? 'hi-up' : 'hi-down'}">${dLeg > 0 ? '+' : ''}${dLeg} legajos</span>`);
        if (altas) rs.push(`${altas} ${altas === 1 ? 'alta' : 'altas'} de empresas`);
        if (bajas) rs.push(`${bajas} ${bajas === 1 ? 'baja' : 'bajas'} de empresas`);
        return rs.join(' · ') || 'Sin cambios en el año';
      };
      const act = anios.some(x => x.anio === window._histAnio) ? window._histAnio : anios[0].anio;
      return `${`<div class="hi-anios">${anios.map(an => `<button type="button" class="hi-anio-b${an.anio === act ? ' hi-anio-b--on' : ''}" data-a="${an.anio}" onclick="histAnio('${an.anio}')">${an.anio}</button>`).join('')}</div>`}`
        + anios.map(an => `<div class="hi-anio-p" data-a="${an.anio}"${an.anio === act ? '' : ' style="display:none"'}>
          <div class="hi-anio-res">${res(an)}</div>
          <div class="hi-mes-lista">
            ${an.items.map(m => `
              <div class="hi-mes">
                <div class="hi-mes__h"><span class="hi-mes__t">${_salPerTxt(m.p)}</span>${m.p === todos[0] ? '<span class="hi-mes__b">más reciente</span>' : ''}<span class="hi-mes__n hi-mes__n--${m.nivel}">${etiqueta[m.nivel]}</span></div>
                <ul>${m.frases.map(f => `<li>${f}</li>`).join('')}</ul>
              </div>`).join('')}
          </div>
        </div>`).join('');
    })()}`;
}

// Cambia de año sin volver a dibujar el modal
function histAnio(a) {
  window._histAnio = a;
  document.querySelectorAll('#salario-modal-body .hi-anio-b').forEach(e => e.classList.toggle('hi-anio-b--on', e.dataset.a === a));
  document.querySelectorAll('#salario-modal-body .hi-anio-p').forEach(e => { e.style.display = e.dataset.a === a ? '' : 'none'; });
}

// ────────── Render ──────────
function renderSalarioHistorico(cliente) {
  const d = _histDatos(cliente.id);
  if (!d.pers.length) {
    return `<div class="hi-vacio"><div class="hi-vacio__t">Todavía no hay histórico de Salario</div>Se va armando solo: cada mes que Salario manda los datos de este cliente se suma acá.</div>`;
  }
  const { pers, agg } = d;
  const a0 = agg[pers[0]], aN = agg[pers[pers.length - 1]];
  const unico = pers.length === 1;
  const todos = salarioPeriodosCliente(cliente.id);                  // nuevo → viejo
  const sel = pers[pers.length - 1];
  const hayAnt = todos.indexOf(sel) < todos.length - 1, haySig = todos.indexOf(sel) > 0;
  const aPrev = unico ? null : agg[pers[pers.length - 2]];           // mes anterior con datos

  // Franja de variación
  const kpi = (lbl, v0, vN) => {
    const dif = (v0 != null && vN != null) ? vN - v0 : null;
    const pct = dif != null && v0 ? Math.round(Math.abs(dif) / v0 * 100) : null;
    const cls = dif ? (dif > 0 ? 'hi-up' : 'hi-down') : '';
    return `<div class="hi-kpi">
      <div class="hi-kpi__k">${lbl}</div>
      <div class="hi-kpi__v">${vN != null ? vN : '—'}</div>
      <div class="hi-kpi__d ${cls}">${unico || dif == null ? 'sin comparación' : (dif === 0 ? 'sin cambios' : `${dif > 0 ? '▲ +' : '▼ '}${dif}${pct != null ? ` (${pct}%)` : ''}`)}</div>
      <div class="hi-kpi__s">${unico ? '' : `vs ${_salPerCorto(pers[pers.length - 2])}`}</div>
    </div>`;
  };
  const nEmp = x => x.empresas ? x.empresas.length : null, nCon = x => x.convenios ? x.convenios.length : null;

  const frases = _histFrases(d);

  // Empresas (top, participación, movimientos)
  const perBase = _histPerBase(pers), mapaN = _histMapaEmp(aN), mapa0 = _histMapaEmp(agg[perBase]);
  const hayEmp = mapaN.size > 0;
  const hayEmpN = [...mapaN.values()].some(e => e.n);
  const movers = [];
  mapaN.forEach((e, k) => { const o = mapa0.get(k); if (o && e.n != null && o.n != null && e.n !== o.n) movers.push({ nombre: e.nombre, de: o.n, a: e.n, dif: e.n - o.n }); });
  const suben = movers.filter(x => x.dif > 0).sort((x, y) => y.dif - x.dif).slice(0, 5);
  const bajan = movers.filter(x => x.dif < 0).sort((x, y) => x.dif - y.dif).slice(0, 5);
  const filaMov = m => `<div class="hi-mov"><span title="${_escHtml(m.nombre)}">${_escHtml(m.nombre)}</span><b class="${m.dif > 0 ? 'hi-up' : 'hi-down'}">${m.de} → ${m.a} (${m.dif > 0 ? '+' : ''}${m.dif})</b></div>`;

  // Convenios: línea de tiempo (una fila por convenio, una celda por mes)
  const conv = new Map();
  pers.forEach(p => (agg[p].convenios || []).forEach(n => { const k = _salKey(n); if (!conv.has(k)) conv.set(k, { nombre: n, en: new Set() }); conv.get(k).en.add(p); }));
  const filasConv = [...conv.values()].sort((x, y) => (y.en.has(pers[pers.length - 1]) - x.en.has(pers[pers.length - 1])) || x.nombre.localeCompare(y.nombre, 'es'));
  const cols = `grid-template-columns: minmax(150px, 230px) repeat(${pers.length}, minmax(26px, 1fr));`;

  // Versión / motor
  const cambios = [];
  pers.forEach((p, i) => {
    const v = agg[p].versiones.join(', '), m = agg[p].motores.map(_salMotorTxt).join(', ');
    const vp = i ? agg[pers[i - 1]].versiones.join(', ') : null, mp = i ? agg[pers[i - 1]].motores.map(_salMotorTxt).join(', ') : null;
    if (!i) { if (v) cambios.push([p, `Salario ${v}`]); if (m) cambios.push([p, m]); }
    else { if (v && v !== vp) cambios.push([p, `Versión ${vp || '—'} → ${v}`]); if (m && m !== mp) cambios.push([p, `Motor ${mp || '—'} → ${m}`]); }
  });

  return `
    <div class="hi">
      <div class="panel-mes-nav hi-nav">
        <button class="panel-mes-nav__btn" ${hayAnt ? 'onclick="histNavMes(-1)"' : 'disabled'} title="Mes anterior">◀</button>
        <span class="panel-mes-nav__label">${_salPerTxt(sel)}</span>
        <button class="panel-mes-nav__btn" ${haySig ? 'onclick="histNavMes(1)"' : 'disabled'} title="Mes siguiente">▶</button>
        <button class="hi-r hi-r--det hi-smartbtn" onclick="abrirCambiosMes('${cliente.id}')" title="Te cuenta en palabras qué cambió cada mes">✨ Qué cambió mes a mes</button>
      </div>

      <div class="hi-lectura">
        <div class="hi-lectura__t">Lectura rápida</div>
        ${frases.map(f => `<div class="hi-lectura__f">${_escHtml(f)}</div>`).join('')}
      </div>

      <div class="hi-kpis">
        ${kpi('Legajos', aPrev && aPrev.legajos, aN.legajos)}
        ${kpi('Personas (CUIL)', aPrev && aPrev.cuiles, aN.cuiles)}
        ${kpi('Empresas', aPrev && nEmp(aPrev), nEmp(aN))}
        ${kpi('Convenios', aPrev && nCon(aPrev), nCon(aN))}
      </div>

      <div class="hi-panel">
        <div class="hi-panel__t">Evolución de legajos y personas</div>
        <div class="hi-chart hi-chart--alto"><canvas id="hi-c-evo"></canvas></div>
        ${cambios.length ? `<div class="hi-eventos">${cambios.map(([p, t]) => `<span><i></i>${_salPerCorto(p)} · ${_escHtml(t)}</span>`).join('')}</div>` : ''}
      </div>

      ${hayEmp ? `
      <div class="hi-seccion">Empresas</div>
      ${unico ? '' : `<div class="hi-cmp"><span>Comparar con</span>${[['ant', 'Mes anterior'], ['6m', '6 meses atrás'], ['ini', 'El inicio']].map(([k, t]) => `<button type="button" class="hi-cmp__b${(window._histCmp || 'ant') === k ? ' hi-cmp__b--on' : ''}" onclick="histCmp('${k}')">${t}</button>`).join('')}<small>${_salPerCorto(perBase)}</small></div>`}
      <div class="hi-dos">
        ${hayEmpN ? `<div class="hi-panel"><div class="hi-panel__t">Las 10 con más empleados${unico ? '' : ` (${_salPerCorto(perBase)} vs ${_salPerCorto(pers[pers.length - 1])})`}</div><div class="hi-chart hi-chart--barras"><canvas id="hi-c-top"></canvas></div></div>
        <div class="hi-panel"><div class="hi-panel__t">Participación en los empleados</div><div class="hi-chart hi-chart--dona"><canvas id="hi-c-dona"></canvas></div></div>` : ''}
        ${pers.length > 1 ? `<div class="hi-panel"><div class="hi-panel__t">Altas y bajas de empresas por mes</div><div class="hi-chart"><canvas id="hi-c-mov"></canvas></div></div>` : ''}
        ${(suben.length || bajan.length) ? `<div class="hi-panel"><div class="hi-panel__t">Las que más cambiaron (${_salPerCorto(perBase)} → ${_salPerCorto(pers[pers.length - 1])})</div>
          ${suben.length ? `<div class="hi-mini hi-up">Más crecieron</div>${suben.map(filaMov).join('')}` : ''}
          ${bajan.length ? `<div class="hi-mini hi-down">Más bajaron</div>${bajan.map(filaMov).join('')}` : ''}</div>` : ''}
      </div>` : ''}

      ${filasConv.length ? `
      <div class="hi-seccion">Convenios <span>${filasConv.length}</span></div>
      <div class="hi-panel hi-time">
        <div class="hi-time__h" style="${cols}"><span></span>${pers.map(p => `<span>${_salPerCorto(p).replace(' ', '<br>')}</span>`).join('')}</div>
        ${filasConv.map(f => `<div class="hi-time__f" style="${cols}"><span class="hi-time__n" title="${_escHtml(f.nombre)}">${_escHtml(f.nombre)}</span>${pers.map((p, i) => {
          const esta = f.en.has(p), antes = i ? f.en.has(pers[i - 1]) : esta;
          return `<span class="hi-cel${esta ? ' hi-cel--on' : ''}${esta && !antes ? ' hi-cel--nuevo' : ''}${!esta && antes ? ' hi-cel--fin' : ''}"></span>`;
        }).join('')}</div>`).join('')}
        <div class="hi-time__ley"><span class="hi-cel hi-cel--on"></span> estuvo cargado <span class="hi-cel hi-cel--on hi-cel--nuevo"></span> apareció <span class="hi-cel hi-cel--fin"></span> dejó de estar</div>
      </div>` : ''}
    </div>`;
}

// ────────── Gráficos (después de que el HTML existe) ──────────
function initSalarioHistorico(cliente) {
  _histDestruirCharts();
  if (typeof Chart === 'undefined') return;
  const d = _histDatos(cliente.id);
  if (!d.pers.length) return;
  const { pers, agg } = d;
  const css = getComputedStyle(document.documentElement);
  const txt = (css.getPropertyValue('--text3') || '#888').trim(), grid = (css.getPropertyValue('--border') || '#333').trim();
  const NAR = '#f97316', AZU = '#3b82f6', VER = '#22c55e', ROJ = '#ef4444';
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: txt, boxWidth: 10, usePointStyle: true } } } };
  const ejes = (extra = {}) => ({ x: { ticks: { color: txt }, grid: { display: false }, ...(extra.x || {}) }, y: { ticks: { color: txt, precision: 0 }, grid: { color: grid }, beginAtZero: true, grace: '8%', ...(extra.y || {}) } });
  const nuevo = (id, cfg) => { const cv = document.getElementById(id); if (cv) window._histCharts.push(new Chart(cv, cfg)); };

  // Marcas verticales en los meses donde cambió la versión o el motor
  const marcas = [];
  pers.forEach((p, i) => {
    if (!i) return;
    const v0 = agg[pers[i - 1]].versiones.join(), v1 = agg[p].versiones.join(), m0 = agg[pers[i - 1]].motores.join(), m1 = agg[p].motores.join();
    if ((v1 && v0 && v1 !== v0) || (m1 && m0 && m1 !== m0)) marcas.push({ i, txt: (v1 && v0 && v1 !== v0) ? 'v' + agg[p].versiones.join(', ') : _salMotorTxt(agg[p].motores[0]) });
  });
  const plugMarcas = {
    id: 'histMarcas',
    afterDatasetsDraw(ch) {
      const { ctx, chartArea: ar, scales: { x } } = ch;
      marcas.forEach(m => {
        const px = x.getPixelForValue(m.i);
        ctx.save(); ctx.strokeStyle = 'rgba(249,115,22,.55)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(px, ar.top); ctx.lineTo(px, ar.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = NAR; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.txt, px, ar.top - 4); ctx.restore();
      });
    },
  };

  nuevo('hi-c-evo', {
    type: 'line', plugins: [plugMarcas],
    data: { labels: pers.map(_salPerCorto), datasets: [
      { label: 'Legajos', data: pers.map(p => agg[p].legajos), borderColor: NAR, backgroundColor: 'rgba(249,115,22,.12)', fill: true, tension: .25, pointRadius: 4, spanGaps: true },
      { label: 'Personas (CUIL)', data: pers.map(p => agg[p].cuiles), borderColor: AZU, backgroundColor: AZU, tension: .25, pointRadius: 4, spanGaps: true, borderDash: [5, 4] },
    ] },
    options: { ...base, layout: { padding: { top: 16 } }, scales: ejes() },
  });

  // Empresas: top 10 (inicio vs último), dona, altas y bajas
  const mN = _histMapaEmp(agg[pers[pers.length - 1]]), m0 = _histMapaEmp(agg[_histPerBase(pers)]);
  const top = [...mN.values()].filter(e => e.n).sort((x, y) => y.n - x.n).slice(0, 10);
  if (top.length) {
    const corto = s => s.length > 26 ? s.slice(0, 25) + '…' : s;
    const sets = [];
    if (pers.length > 1) sets.push({ label: _salPerCorto(_histPerBase(pers)), data: top.map(e => { const o = m0.get(_salKey(e.nombre)); return o && o.n != null ? o.n : 0; }), backgroundColor: 'rgba(148,163,184,.55)', borderRadius: 4 });
    sets.push({ label: _salPerCorto(pers[pers.length - 1]), data: top.map(e => e.n), backgroundColor: NAR, borderRadius: 4 });
    nuevo('hi-c-top', { type: 'bar', data: { labels: top.map(e => corto(e.nombre)), datasets: sets },
      options: { ...base, indexAxis: 'y', scales: { x: { ticks: { color: txt, precision: 0 }, grid: { color: grid } }, y: { ticks: { color: txt }, grid: { display: false } } } } });
    const todas = [...mN.values()].filter(e => e.n).sort((x, y) => y.n - x.n);
    const t8 = todas.slice(0, 8), resto = todas.slice(8).reduce((t, e) => t + e.n, 0);
    const colores = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#64748b'];
    nuevo('hi-c-dona', { type: 'doughnut', data: { labels: [...t8.map(e => corto(e.nombre)), ...(resto ? ['Otras'] : [])], datasets: [{ data: [...t8.map(e => e.n), ...(resto ? [resto] : [])], backgroundColor: colores, borderWidth: 0 }] },
      options: { ...base, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: txt, boxWidth: 10, usePointStyle: true, font: { size: 11 } } } } } });
  }
  if (pers.length > 1) {
    const altas = [], bajas = [];
    for (let i = 1; i < pers.length; i++) { const df = _salDiff(agg[pers[i]], agg[pers[i - 1]]); altas.push(df.empNuevas.length); bajas.push(-df.empIdas.length); }
    nuevo('hi-c-mov', { type: 'bar', data: { labels: pers.slice(1).map(_salPerCorto), datasets: [
      { label: 'Altas', data: altas, backgroundColor: VER, borderRadius: 4 }, { label: 'Bajas', data: bajas, backgroundColor: ROJ, borderRadius: 4 } ] },
      options: { ...base, scales: { x: { stacked: true, ticks: { color: txt }, grid: { display: false } }, y: { stacked: true, ticks: { color: txt, precision: 0 }, grid: { color: grid } } } } });
  }
}
