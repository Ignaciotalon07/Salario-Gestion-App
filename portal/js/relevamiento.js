// ───────────── Relevamiento inicial (paso 7 de Preparación) ─────────────
// 10 partes, una por vez. Las preguntas vienen de la base (relevamiento_preguntas); las respuestas
// se guardan solas, una por una, con la función portal_guardar_respuesta (el cliente nunca escribe la tabla).
// La aprobación (Key User) la valida la base: portal_aprobar_relevamiento.
const R = { actual: 0, abierto: null, omitiendo: null, errores: {}, guardando: {} };
const MOTIVOS_RAPIDOS = ['No aplica a mi empresa', 'No lo sé todavía', 'Lo confirma el estudio contable'];

// Preguntas "dual" que piden dos porcentajes (se guardan en las columnas mensuales / jornales)
const DUAL_PCT = { s3_personal_mensual_y_quincenal: [['mensuales', 'Por mes'], ['jornales', 'Por quincena']] };
const esPct = p => !!DUAL_PCT[p.clave] && p.tipo === 'dual_texto';
const pctNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };

// Aclaraciones que se muestran debajo de la consulta de ciertas preguntas (no cambian la pregunta en la base)
const NOTAS_PREGUNTA = {
  s5_interfaces_bancarias: 'Si tenés un archivo de ejemplo del banco, no hace falta que lo mandes ahora: más adelante lo vas a poder subir desde la sección “Documentos”.',
  s6_plan_de_cuentas: 'Si tenés el Excel con las cuentas de la liquidación de sueldos, no hace falta que lo mandes ahora: más adelante lo vas a poder subir desde la sección “Documentos”.',
  s3_personal_con_ganancias: 'Si tenés un Excel para importar con lo acumulado, no hace falta que lo mandes ahora: más adelante lo vas a poder subir desde la sección “Documentos”.'
};

const relevAprobado = () => !!(P.relevAprob);
const relevPreguntas = () => (P.relevPreg || []).filter(p => p.activa !== false && p.clave !== 's3_logos_y_firmas').filter(p => !p.tipos_cliente || !P.cliente.tipo || p.tipos_cliente.includes(P.cliente.tipo));
// Respuesta guardada de una pregunta (por columna)
const resp = (p, col) => (P.relevResp || []).find(r => r.pregunta_id === p.id && r.columna === col) || null;
const vacioT = t => !t || !String(t).trim();

// ¿Está resuelta la pregunta? (mismas reglas que relevamiento_faltantes en la base)
function preguntaOk(p) {
  const omitida = (P.relevResp || []).some(r => r.pregunta_id === p.id && r.omitida);
  if (p.tipo === 'texto') { const r = resp(p, 'unica'); return !!r && (r.omitida || !vacioT(r.texto)); }
  if (p.tipo === 'sino') { const r = resp(p, 'unica'); return !!r && (r.omitida || !!r.sino); }
  if (p.tipo === 'dual_texto') return omitida || ['mensuales', 'jornales'].every(c => { const r = resp(p, c); return r && !vacioT(r.texto); });
  if (p.tipo === 'dual_sino') return omitida || ['mensuales', 'jornales'].every(c => { const r = resp(p, c); return r && !!r.sino; });
  const r = resp(p, 'unica'); return !!r && r.confirmado;     // confirmar / comentario
}
function detalleEmpresaOk() {
  const e = P.principal;
  return !!e && e.cant_legajos !== null && e.cant_legajos !== undefined && !!e.modalidad_pago && (e.modalidad_pago !== 'mixto' || (e.pct_quincenal !== null && e.pct_quincenal !== undefined));
}
function seccionesRelev() {
  const mapa = new Map();
  relevPreguntas().forEach(p => { if (!mapa.has(p.seccion)) mapa.set(p.seccion, { n: p.seccion, titulo: p.seccion_titulo, preg: [] }); mapa.get(p.seccion).preg.push(p); });
  return [...mapa.values()].sort((a, b) => a.n - b.n);
}
// Lo que falta en una parte: [{nombre, motivo, id}]
function faltantesParte(s) {
  const f = s.preg.filter(p => !preguntaOk(p)).map(p => ({
    id: 'q-' + p.id, nombre: p.tema,
    motivo: ['confirmar', 'comentario'].includes(p.tipo) ? 'sin marcar “Entendido”' : 'sin responder ni omitir'
  }));
  if (s.n === 3 && !detalleEmpresaOk()) f.push({ id: 'rl-emp-det', nombre: 'Detalle de tu empresa', motivo: 'faltan datos' });
  return f;
}
const parteCompleta = s => faltantesParte(s).length === 0;

// ── Guardado de una respuesta ──
async function guardarResp(p, col, cambios) {
  const actual = resp(p, col) || { sino: null, texto: null, omitida: false, motivo: null, confirmado: false };
  const nueva = { ...actual, ...cambios };
  // Local primero (la pantalla responde al instante); si la base rechaza, se avisa
  P.relevResp = (P.relevResp || []).filter(r => !(r.pregunta_id === p.id && r.columna === col));
  P.relevResp.push({ ...nueva, pregunta_id: p.id, columna: col });
  const { error } = await sb.rpc('portal_guardar_respuesta', {
    p_clave: p.clave, p_columna: col, p_sino: nueva.sino || null, p_texto: nueva.texto || null,
    p_omitida: !!nueva.omitida, p_motivo: nueva.omitida ? nueva.motivo : null, p_confirmado: !!nueva.confirmado
  });
  if (error) { toast(error.message || 'No se pudo guardar tu respuesta.'); return false; }
  actualizarLateral();
  return true;
}

// ── Dibujo ──
const nl2p = t => String(t || '').split(/\n\s*\n/).map(x => `<p>${esc(x).replace(/^(Mensuales:|Jornales:)/, '<b>$1</b>')}</p>`).join('');
function htmlSino(valor, attrs) {
  return `<div class="sn">${['si', 'no'].map(v => `<button type="button" class="${valor === v ? 'on' : ''}" data-v="${v}" ${attrs}>${v === 'si' ? '✓ Sí' : '✕ No'}</button>`).join('')}</div>`;
}
function htmlOmitir(p) {
  if (!p.omitible || relevAprobado()) return '';
  const om = (P.relevResp || []).find(r => r.pregunta_id === p.id && r.omitida);
  if (om) return `<div class="om"><span class="oc">Omitida: ${esc(om.motivo || '')}</span><button type="button" class="om-b" data-rl="responder" data-p="${p.id}">Responder</button></div>`;
  if (R.omitiendo === p.id) {
    return `<div class="om" style="flex-direction:column;align-items:stretch"><span class="muted sm">Contanos por qué la omitís:</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${MOTIVOS_RAPIDOS.map(m => `<button type="button" class="op" data-rl="motivo" data-p="${p.id}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <input id="om-txt-${p.id}" maxlength="200" placeholder="Otro motivo…" />
      <div style="display:flex;gap:8px"><button type="button" class="btn sm" data-rl="omitir-ok" data-p="${p.id}">Omitir</button><button type="button" class="btn sec sm" data-rl="omitir-no">Cancelar</button></div></div>`;
  }
  return `<div class="om"><button type="button" class="om-b" data-rl="omitir" data-p="${p.id}">Omitir esta pregunta</button></div>`;
}
const ta = (p, col, rows, ph, valor, dis) => `<textarea rows="${rows}" placeholder="${ph}" data-rl="texto" data-p="${p.id}" data-col="${col}" ${dis ? 'disabled' : ''}>${esc(valor || '')}</textarea>`;

function htmlPregunta(p) {
  const dis = relevAprobado();
  const omitida = (P.relevResp || []).some(r => r.pregunta_id === p.id && r.omitida);
  let a = '';
  if (p.tipo === 'texto') a = ta(p, 'unica', 2, 'Tu respuesta…', (resp(p, 'unica') || {}).texto, dis);
  else if (p.tipo === 'sino') {
    const r = resp(p, 'unica') || {};
    a = htmlSino(r.sino, `data-rl="sino" data-p="${p.id}" data-col="unica" ${dis ? 'disabled' : ''}`) + ta(p, 'unica', 1, 'Detalle (opcional)', r.texto, dis);
  } else if (esPct(p)) {
    a = `<div class="rl-pct">${DUAL_PCT[p.clave].map(([c, et]) => `<label class="rl-pct__c"><span>${et}</span><div class="rl-pct__in"><input type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="Ej.: ${c === 'mensuales' ? 70 : 20}" data-rl="texto" data-p="${p.id}" data-col="${c}" value="${esc((resp(p, c) || {}).texto || '')}" ${dis ? 'disabled' : ''}/><b>%</b></div></label>`).join('')}</div>`;
  } else if (p.tipo === 'dual_texto') {
    a = `<div class="rl-cols">${['mensuales', 'jornales'].map(c => `<div><span>${c === 'mensuales' ? 'Mensuales' : 'Jornales'}</span>${ta(p, c, 2, '', (resp(p, c) || {}).texto, dis)}</div>`).join('')}</div>`;
  } else if (p.tipo === 'dual_sino') {
    a = `<div class="rl-cols">${['mensuales', 'jornales'].map(c => { const r = resp(p, c) || {};
      return `<div><span>${c === 'mensuales' ? 'Mensuales' : 'Jornales'}</span>${htmlSino(r.sino, `data-rl="sino" data-p="${p.id}" data-col="${c}" ${dis ? 'disabled' : ''}`)}${ta(p, c, 1, 'Detalle (opcional)', r.texto, dis)}</div>`; }).join('')}</div>`;
  } else if (p.tipo === 'confirmar') {
    const r = resp(p, 'unica') || {};
    a = `<label class="chk"><input type="checkbox" data-rl="conf" data-p="${p.id}" ${r.confirmado ? 'checked' : ''} ${dis ? 'disabled' : ''}/> Revisé que estén correctos</label>`;
  }
  let q = nl2p(p.consulta);
  if (p.clave === 's3_logos_y_firmas') q += htmlLogosRev();
  if (NOTAS_PREGUNTA[p.clave]) q += `<div class="rl-aclara"><b>Aclaración</b>${esc(NOTAS_PREGUNTA[p.clave])}</div>`;
  return `<div class="rl-row ${omitida ? 'omitida' : ''}" id="q-${p.id}"><div class="rl-t">${esc(p.tema)}</div><div class="rl-q">${q}</div><div class="rl-a">${a}${htmlOmitir(p)}</div></div>`;
}
// Logos y firmas cargados en el paso 4, por empresa
function htmlLogosRev() {
  const chip = (n, ok) => `<span class="chip ${ok ? 'c-ok' : 'c-ko'}">${n}${ok ? ' · cargado' : ' · falta'}</span>`;
  const filas = P.empresas.map(e => {
    const tiene = c => P.docs.some(d => d.empresa_id === e.id && d.categoria === c);
    return `<div><b>${esc(e.razon_social || 'Empresa')}</b>${chip('Logo', tiene('logo'))}${chip('Firma', tiene('firma'))}</div>`;
  }).join('');
  return `<div class="rv">${filas}<a data-ir="prep">Cambiar en el paso 4 →</a></div>`;
}
// Detalle de la empresa principal (cantidad de empleados y cómo cobra el personal)
function htmlDetalleEmpresa() {
  const e = P.principal; if (!e) return '';
  const dis = relevAprobado();
  const mp = e.modalidad_pago || '';
  return `<div class="rl-sub">Detalle de tu empresa</div><div class="rl-ayuda">Completá estos datos para tu empresa. Las demás empresas las cargás más adelante, cuando arranque la implementación.</div>
    <div class="rl-emp" id="rl-emp-det"><div class="rl-emp-h"><b>${esc(e.razon_social || 'Tu empresa')} (principal)</b></div>
      <div class="rl-emp-g">
        <div><span>Cantidad de empleados</span><input type="number" min="0" id="rl-e-cant" placeholder="Ej.: 42" value="${e.cant_legajos ?? ''}" ${dis ? 'disabled' : ''}/></div>
        <div><span>¿Cómo cobra el personal?</span><select id="rl-e-mod" ${dis ? 'disabled' : ''}><option value="">Seleccioná una opción</option>
          <option value="mensual" ${mp === 'mensual' ? 'selected' : ''}>Todos mensuales</option><option value="quincenal" ${mp === 'quincenal' ? 'selected' : ''}>Todos quincenales</option><option value="mixto" ${mp === 'mixto' ? 'selected' : ''}>Mixto (mensuales y quincenales)</option></select>
          <div class="mq-p ${mp === 'mixto' ? 'on' : ''}" id="rl-e-pctw"><input type="number" min="0" max="100" id="rl-e-pct" placeholder="% quincenal, ej.: 30" value="${e.pct_quincenal ?? ''}" ${dis ? 'disabled' : ''}/></div></div>
      </div></div>`;
}
function htmlComentarios(s) {
  const dis = relevAprobado();
  const tarjeta = (p, i) => {
    const r = resp(p, 'unica') || {};
    const lineas = String(p.consulta).split('\n');
    const caps = lineas.filter(l => l.trim().startsWith('•'));
    const intro = lineas.filter(l => !l.trim().startsWith('•')).join(' ');
    const cuerpo = caps.length
      ? `<p>${esc(intro)}</p><ul class="rl-caps">${caps.map(l => `<li>${esc(l.replace(/^\s*•\s*/, ''))}</li>`).join('')}</ul>`
      : `<p>${esc(p.consulta)}</p>`;
    const ico = ['🧭', '📄', '🧮', '🧩', '📅', '✅'][i] || 'ℹ️';
    return `<label class="rl-card ${i === 0 ? 'rl-card--ancho' : ''} ${r.confirmado ? 'hecho' : ''}" id="q-${p.id}"><span class="ic">${ico}</span><div class="tx"><b>${esc(p.tema)}</b>${cuerpo}</div>
      <span class="ok"><input type="checkbox" data-rl="conf" data-p="${p.id}" ${r.confirmado ? 'checked' : ''} ${dis ? 'disabled' : ''}/><em>Entendido</em></span></label>`;
  };
  return `<div class="rl-h-info"><span class="ic">ℹ️</span><div><h3>${esc(s.titulo)}</h3><p>No son preguntas: son acuerdos y recomendaciones para que la implementación salga bien. Leelos y marcá “Entendido” en cada uno.</p></div>
    ${dis ? '' : '<button type="button" class="btn sec sm" data-rl="todos">Marcar todos</button>'}</div><div class="rl-cards">${s.preg.map(tarjeta).join('')}</div>`;
}
function htmlSeccion(s, i, total) {
  const comentarios = s.preg.every(p => p.tipo === 'comentario');
  const nombres = P.usuarios.map(u => u.nombre).filter(Boolean);
  const nota = s.n === 1 && nombres.length ? `<div class="rl-nota">💡 En el paso 3 indicaste a: ${esc(nombres.join(', '))}. Podés nombrarlos acá.</div>` : '';
  const cab = comentarios ? '' : `<div class="rl-h"><div class="rl-h__t"><h3>${esc(s.titulo)}</h3><div class="rl-bar"><i style="width:${Math.round((i + 1) / total * 100)}%"></i></div></div><em class="rl-pg">Parte ${i + 1} de ${total}</em></div>`;
  const cuerpo = comentarios ? htmlComentarios(s) : nota + s.preg.map(htmlPregunta).join('') + (s.n === 3 ? htmlDetalleEmpresa() : '');
  const errs = R.errores[s.n] || [];
  const err = errs.length ? `<div class="rl-err"><b>Antes de continuar te falta completar ${errs.length} ${errs.length === 1 ? 'punto' : 'puntos'}:</b><ul>${errs.map(f => `<li>${esc(f.nombre)} <span>· ${f.motivo}</span></li>`).join('')}</ul><p>Respondé cada pregunta, o usá “Omitir esta pregunta” si no aplica o no sabés qué responder.</p></div>` : '';
  const ult = i === total - 1;
  const pie = `<div class="rl-pie"><span class="pi" data-pi="${s.n}"></span><span class="bt">${i > 0 ? '<button type="button" class="btn sec" data-rl="ant">← Anterior</button>' : ''}<button type="button" class="btn" data-rl="${ult ? 'finalizar' : 'sig'}">${ult ? 'Finalizar' : 'Continuar →'}</button></span></div>`;
  const fin = ult ? '<div class="rl-fin" id="rl-fin"></div>' : '';
  return `<div class="rl-sec ${i === R.actual ? 'act' : ''} ${comentarios ? 'rl-info' : ''} ${s.preg.length === 1 ? 'rl-solo' : ''}" id="rl-s${s.n}">${cab}${cuerpo}${err}${pie}${fin}</div>`;
}

function renderRelev() {
  const cont = $('relev-cont');
  if (!P.cliente || !cont) return;
  const secs = seccionesRelev();
  if (!secs.length) { cont.innerHTML = '<div class="card vacio">El relevamiento todavía no está disponible. Escribinos y lo habilitamos.</div>'; return; }
  R.actual = Math.max(0, Math.min(secs.length - 1, R.actual));
  const anterior = $('relev-secs');
  const scroll = window.scrollY;
  cont.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 250px">
      <div id="relev-secs">${secs.length ? `<button type="button" class="rl-back ${R.actual > 0 ? 'on' : ''}" data-rl="ant">← Volver a ${esc(secs[Math.max(0, R.actual - 1)].titulo)}</button>` : ''}${secs.map((s, i) => htmlSeccion(s, i, secs.length)).join('')}</div>
      <div class="rl-side"><div class="card"><div class="card-title">Partes · <span id="rl-n">0</span> de ${secs.length}</div><div class="rl-nav" id="rl-nav">${secs.map((s, i) =>
        `<a data-rl="ir" data-i="${i}" class="${i === R.actual ? 'cur' : ''}"><i class="pt"></i><span>${esc(s.titulo)}</span></a>`).join('')}</div></div>
        <div class="card"><div class="card-title">Aprobación</div><div id="rl-aprob"></div></div></div>
    </div>`;
  if (anterior) window.scrollTo(0, scroll);
  actualizarLateral();
}
// Avance de la línea lateral, contadores de cada parte y estado de la aprobación
function actualizarLateral() {
  const secs = seccionesRelev();
  let hechas = 0;
  secs.forEach((s, i) => {
    const ok = parteCompleta(s);
    if (ok) hechas++;
    const a = document.querySelector(`#rl-nav a[data-i="${i}"]`); if (a) a.classList.toggle('done', ok);
    const pi = document.querySelector(`[data-pi="${s.n}"]`);
    if (pi) {
      const tot = s.preg.length, bien = s.preg.filter(preguntaOk).length;
      pi.innerHTML = `Parte <b>${i + 1}</b> de ${secs.length} · ${bien} de ${tot} ${s.preg.every(p => p.tipo === 'comentario') ? 'entendidos' : 'respondidas'}`;
    }
  });
  if ($('rl-n')) $('rl-n').textContent = hechas;
  // Última parte: sin botón "Finalizar". Un cartel avisa si quedan partes pendientes o si ya se puede aprobar.
  const fin = $('rl-fin');
  if (fin) {
    if (relevAprobado()) fin.classList.remove('on');
    else {
      const pend = secs.map((x, k) => parteCompleta(x) ? null : `${k + 1}. ${x.titulo}`).filter(Boolean);
      fin.classList.add('on');
      fin.innerHTML = pend.length ? `Todavía quedan partes sin completar: <b>${esc(pend.join(' · '))}</b>. Podés volver a cualquiera desde la línea de avance.` : '✓ ¡Listo! Completaste todas las partes. Tocá Finalizar para aprobar el relevamiento.';
    }
  }
  const box = $('rl-aprob'); if (!box) return;
  if (relevAprobado()) {
    box.innerHTML = `<div class="ap-ok" style="display:block">✓ <b>Relevamiento aprobado</b> por ${esc(P.relevAprob.aprobado_por)} el ${fmtFechaLarga(P.relevAprob.aprobado_at)}.</div>
      <p class="muted sm" style="margin-top:10px">Si necesitás cambiar algo, escribinos y lo vemos juntos.</p>`;
    return;
  }
  box.innerHTML = `<p class="muted sm">Cuando completes todas las partes, tocá <b>Finalizar</b> en la última y contanos quién lo completó. Lo repasamos juntos en la reunión de inicio.</p>`;}
function irParte(i) {
  R.actual = i; R.omitiendo = null;
  renderRelev();
  const top = $('v-relev').getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, top - 10), behavior: 'smooth' });
}
function validarParte(s, mover) {
  const falta = faltantesParte(s);
  R.errores[s.n] = falta;
  renderRelev();
  document.querySelectorAll('.falta').forEach(x => x.classList.remove('falta'));
  falta.forEach(f => { const el = $(f.id); if (el) el.classList.add('falta'); });
  if (mover && falta.length) { const el = $(falta[0].id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  return !falta.length;
}

// ── Eventos (un solo oyente para toda la vista) ──
const relevaEl = $('v-relev');
relevaEl.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-rl]'); if (!b) return;
  const acc = b.dataset.rl, secs = seccionesRelev();
  const preg = relevPreguntas().find(x => x.id === b.dataset.p);
  if (acc === 'ir') { irParte(+b.dataset.i); return; }
  if (acc === 'ant') { irParte(R.actual - 1); return; }
  if (acc === 'sig') {
    const s = secs[R.actual];
    if (!validarParte(s, true)) return;
    if (R.actual < secs.length - 1) { irParte(R.actual + 1); return; }
    return;
  }
  if (acc === 'sino' && preg) {
    const col = b.dataset.col, r = resp(preg, col) || {};
    const nuevo = r.sino === b.dataset.v ? null : b.dataset.v;           // tocar de nuevo desmarca
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b && !!nuevo));
    guardarResp(preg, col, { sino: nuevo });
    return;
  }
  if (acc === 'omitir') { R.omitiendo = b.dataset.p; renderRelev(); return; }
  if (acc === 'omitir-no') { R.omitiendo = null; renderRelev(); return; }
  if (acc === 'motivo' || acc === 'omitir-ok') {
    const motivo = acc === 'motivo' ? b.dataset.m : ($('om-txt-' + b.dataset.p).value || '').trim();
    if (motivo.length < 3) { toast('Contanos brevemente el motivo.'); return; }
    R.omitiendo = null;
    const col = ['dual_texto', 'dual_sino'].includes(preg.tipo) ? 'mensuales' : 'unica';
    await guardarResp(preg, col, { omitida: true, motivo });
    renderRelev(); return;
  }
  if (acc === 'responder' && preg) {
    const col = ['dual_texto', 'dual_sino'].includes(preg.tipo) ? 'mensuales' : 'unica';
    await guardarResp(preg, col, { omitida: false, motivo: null });
    renderRelev(); return;
  }
  if (acc === 'todos') {
    const secs10 = secs[R.actual].preg.filter(p => !(resp(p, 'unica') || {}).confirmado);
    for (const p of secs10) await guardarResp(p, 'unica', { confirmado: true });
    renderRelev(); return;
  }
  if (acc === 'finalizar' || acc === 'aprobar') {
    if (relevAprobado()) return;
    // Si falta algo en esta parte, se marcan las tarjetas; si falta en otra parte, se lleva a la primera incompleta
    const s = secs[R.actual];
    if (!validarParte(s, true)) return;
    const k = secs.findIndex(x => !parteCompleta(x));
    if (k >= 0) { toast('Todavía falta completar la parte “' + secs[k].titulo + '”.'); irParte(k); setTimeout(() => validarParte(secs[k], true), 450); return; }
    abrirAprobacion();
  }
});
// ── Ventana de aprobación: nombre de quien completó el relevamiento ──
const apErr = t => { const e = $('ap-error'); e.textContent = t || ''; e.hidden = !t; };
function abrirAprobacion() { apErr(''); $('ap-nom2').value = ''; $('ap-fondo').hidden = false; $('ap-nom2').focus(); }
function cerrarAprobacion() { $('ap-fondo').hidden = true; }
$('ap-cancelar').addEventListener('click', cerrarAprobacion);
$('ap-fondo').addEventListener('mousedown', ev => { if (ev.target === $('ap-fondo')) cerrarAprobacion(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('ap-fondo').hidden) cerrarAprobacion(); });
$('ap-modal').addEventListener('submit', async ev => {
  ev.preventDefault();
  const nom = $('ap-nom2').value.trim();
  if (nom.length < 5 || !nom.includes(' ')) { apErr('Escribí nombre y apellido.'); $('ap-nom2').focus(); return; }
  const btn = $('ap-ok'); btn.disabled = true; btn.textContent = 'Aprobando…'; apErr('');
  const { error } = await sb.rpc('portal_aprobar_relevamiento', { p_nombre: nom });
  btn.disabled = false; btn.textContent = 'Aprobar relevamiento';
  if (error) { apErr(error.message || 'No se pudo aprobar. Probá de nuevo.'); return; }
  cerrarAprobacion();
  toast('Relevamiento aprobado. ¡Gracias! Seguimos con el último paso.');
  await cargarTodo(false);
  irA('prep');          // vuelve a los pasos principales: el relevamiento queda marcado y pasa al siguiente
});
// Textos: se guardan al salir del campo; checks, al tildar
relevaEl.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.rl === 'texto') {
    const p = relevPreguntas().find(x => x.id === t.dataset.p);
    if (p && esPct(p)) {
      // Porcentajes aproximados e independientes: solo el número, entre 0 y 100 (no tienen que sumar 100)
      let n = pctNum(t.value); if (n !== null) n = Math.min(100, Math.max(0, n));
      t.value = n === null ? '' : String(n);
      await guardarResp(p, t.dataset.col, { texto: n === null ? null : String(n) });
    } else if (p) guardarResp(p, t.dataset.col, { texto: t.value.trim() || null });
  } else if (t.dataset.rl === 'conf') {
    const p = relevPreguntas().find(x => x.id === t.dataset.p);
    if (!p) return;
    const card = t.closest('.rl-card'); if (card) card.classList.toggle('hecho', t.checked);
    guardarResp(p, 'unica', { confirmado: t.checked });
  } else if (t.id === 'rl-e-mod') {
    $('rl-e-pctw').classList.toggle('on', t.value === 'mixto');
    guardarDetalleEmpresa();
  } else if (t.id === 'rl-e-cant' || t.id === 'rl-e-pct') guardarDetalleEmpresa();
});
async function guardarDetalleEmpresa() {
  if (!P.principal || relevAprobado()) return;
  const cant = $('rl-e-cant').value, mod = $('rl-e-mod').value, pct = $('rl-e-pct').value;
  const fila = {
    cant_legajos: cant === '' ? null : Math.max(0, parseInt(cant, 10)),
    modalidad_pago: mod || null,
    pct_quincenal: mod === 'mixto' && pct !== '' ? Math.min(100, Math.max(0, parseInt(pct, 10))) : null
  };
  const { error } = await sb.from('cliente_empresas').update(fila).eq('id', P.principal.id);
  if (error) { toast('No se pudo guardar el detalle de tu empresa.'); return; }
  Object.assign(P.principal, fila);
  const i = P.empresas.findIndex(e => e.id === P.principal.id); if (i >= 0) Object.assign(P.empresas[i], fila);
  actualizarLateral();
}

// La vista se redibuja al entrar. Con datos nuevos solo se redibuja si NO está abierta
// (así la actualización automática de 30 s no borra lo que el cliente está escribiendo).
ALENTRAR.relev = () => { R.errores = {}; R.omitiendo = null; renderRelev(); };
RENDERS.push(() => { if (vistaActual !== 'relev') renderRelev(); else actualizarLateral(); });
