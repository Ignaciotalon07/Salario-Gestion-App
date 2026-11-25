// ───────────── Implementación: tus tareas y las nuestras ─────────────
// El cliente solo ve la vista segura portal_etapas. Marcar una tarea como hecha va por una
// función de la base que valida que sea de su cliente y de responsable "cliente".
const NOMBRE_FASE = { relevamiento: 'Relevamiento', analisis: 'Análisis', configuracion: 'Configuración', pruebas: 'Pruebas', golive: 'Go-live' };
const ORDEN_FASE = ['relevamiento', 'analisis', 'configuracion', 'pruebas', 'golive'];
let _filtroTareas = 'todas';
const _abiertas = new Set();   // tareas desplegadas (se conservan al redibujar)

const hoyISO = () => new Date().toISOString().slice(0, 10);
const esMia = e => e.responsable_tipo === 'cliente' || e.responsable_tipo === 'ambos';
const esNuestra = e => e.responsable_tipo === 'equipo' || e.responsable_tipo === 'ambos';
const hecha = e => e.estado === 'completada';
const atrasada = e => !hecha(e) && e.fecha_fin && String(e.fecha_fin).slice(0, 10) < hoyISO();
const diasAtraso = e => Math.max(1, Math.round((new Date(hoyISO()) - new Date(String(e.fecha_fin).slice(0, 10))) / 86400000));

function pct(lista) { return lista.length ? Math.round(lista.filter(hecha).length / lista.length * 100) : 0; }

function renderImpl() {
  const et = P.etapas;
  const corriendo = iniciada();
  $('impl-pre').hidden = corriendo; $('impl-run').hidden = !corriendo;
  if (!corriendo) { if (typeof renderImplPre === 'function') renderImplPre(); return; }
  const total = pct(et), mias = et.filter(esMia), nuestras = et.filter(esNuestra);
  const fin = et.map(e => e.fecha_fin).filter(Boolean).sort().pop();
  $('impl-sub').innerHTML = fin ? 'Fin estimado: <b>' + esc(fmtFechaLarga(fin)) + '</b>' : 'Tu plan de trabajo con Salario';
  $('impl-ring').style.setProperty('--p', total); $('impl-pct').textContent = total + '%';

  $('impl-metrics').innerHTML = [
    ['Avance general', total, 'var(--or)'], ['Tu parte', pct(mias), 'var(--text2)'], ['Nuestra parte', pct(nuestras), 'var(--green)']
  ].map(([t, v, c]) => `<div class="metric"><small>${t}</small><strong>${v}%</strong><div class="bar"><i style="width:${v}%;background:${c}"></i></div></div>`).join('');

  renderProximas(et);

  // Banner de "arrancó" (hasta que el cliente lo cierra)
  const clave = 'portal-inicio-visto-' + P.cliente.id;
  let visto = false; try { visto = !!localStorage.getItem(clave); } catch (e) { /* sin almacenamiento */ }
  $('inicio-b').hidden = visto;
  $('inicio-tx').innerHTML = 'Salario ya armó tu plan de trabajo: tenés <b>' + et.length + ' tareas</b> listas para revisar y empezar. Las tuyas están marcadas en naranja y las nuestras en gris.' +
    (fin ? ' Fin estimado: ' + esc(fmtFechaLarga(fin)) + '.' : '');

  // Alerta de atrasadas (solo las del cliente)
  const tarde = mias.filter(atrasada);
  $('impl-alerta').innerHTML = tarde.length
    ? `<div class="alerta">⚠️ <div class="sp"><b>Tenés ${tarde.length} ${tarde.length === 1 ? 'tarea atrasada' : 'tareas atrasadas'}:</b> “${esc(tarde[0].tarea)}” venció hace ${diasAtraso(tarde[0])} ${diasAtraso(tarde[0]) === 1 ? 'día' : 'días'}${tarde.length > 1 ? ' y ' + (tarde.length - 1) + ' más' : ''}. ¿Necesitás ayuda? Escribinos.</div></div>`
    : '';

  // Tareas agrupadas por lo que importa: qué hago yo, qué hace el equipo, qué viene después, qué ya está listo
  const grupos = [
    ['yo', 'Te toca a vos', et.filter(e => !hecha(e) && esMia(e) && !e.bloqueada)],
    ['eq', 'En manos de nuestro equipo', et.filter(e => !hecha(e) && !esMia(e) && !e.bloqueada)],
    ['sig', 'Más adelante', et.filter(e => !hecha(e) && e.bloqueada)],
    ['ok', 'Completadas', et.filter(hecha)]
  ].filter(g => g[2].length);
  // Igual que en Gestión: barra con Lista / Gantt y las fases como filas plegables
  const fases = [...new Set([...ORDEN_FASE, ...et.map(e => e.fase || 'relevamiento')])].filter(f => et.some(e => (e.fase || 'relevamiento') === f));
  const actualF = (et.find(e => !hecha(e)) || {}).fase || null;
  const bloques = fases.map((f, i) => {
    const todas = et.filter(e => (e.fase || 'relevamiento') === f);
    const lista = _soloMio ? todas.filter(esMia) : todas;
    if (!lista.length) return '';
    const n = todas.filter(hecha).length, p = Math.round(n / todas.length * 100), completa = p === 100, activa = f === actualF;
    const abierto = (f in _fasesTog) ? _fasesTog[f] : activa;
    const badge = completa ? '<span class="ph2-ok">✓ Completa</span>' : activa ? `<span class="ph2-act">${n}/${todas.length}</span>` : `<span class="ph2-cnt">${n}/${todas.length}</span>`;
    return `<section class="ph2${completa ? ' ok' : ''}${activa ? ' cur' : ''}${abierto ? ' open' : ''}">
      <header class="ph2-h" data-bl-t="${esc(f)}"><span class="ph2-n">FASE ${i + 1}</span><span class="ph2-ic">${ICONO_FASE[f] || '📌'}</span><b>${esc(nombreFase(f))}</b><span class="ph2-sp"></span>
        ${badge}<span class="ph2-bar"><i style="width:${p}%"></i></span><span class="ph2-c">▾</span></header>
      <div class="ph2-b">${lista.map(htmlTarea).join('')}</div></section>`;
  }).join('');
  const barra = `<div class="tools"><div class="seg2 seg2-v"><button type="button" data-vista="lista" class="${_vistaT === 'lista' ? 'on' : ''}">📋 Lista</button><button type="button" data-vista="gantt" class="${_vistaT === 'gantt' ? 'on' : ''}">📊 Gantt</button></div><span class="sp"></span><div class="seg2"><button type="button" data-solo="0" class="${_soloMio ? '' : 'on'}">Todo</button><button type="button" data-solo="1" class="${_soloMio ? 'on' : ''}">Lo mío</button></div></div>`;
  $('impl-tareas').innerHTML = et.length ? barra + (_vistaT === 'gantt' ? ganttHtml(_soloMio ? et.filter(esMia) : et) : `<div class="ph2-lista">${bloques}</div>`) : '<div class="vacio">Todavía no hay tareas para mostrar.</div>';
  // En Gantt se oculta la actividad del equipo y el tablero ocupa todo el ancho
  const cols = document.querySelector('.impl-cols'); if (cols) cols.classList.toggle('gantt', _vistaT === 'gantt');
  $('impl-run').classList.toggle('gantt-on', _vistaT === 'gantt');
  renderActividadEquipo();
}
let _vistaT = 'lista';     // 'lista' | 'gantt'

// Gantt de solo lectura: una barra por tarea, agrupadas por fase
function ganttHtml(et) {
  const d = x => new Date(String(x).slice(0, 10) + 'T00:00:00');
  const con = et.filter(e => e.fecha_inicio && e.fecha_fin);
  if (!con.length) return '<div class="vacio">Todavía no hay fechas definidas para mostrar el Gantt.</div>';
  const DAY = 86400000;
  const ini = new Date(Math.min(...con.map(e => d(e.fecha_inicio)))), fin = new Date(Math.max(...con.map(e => d(e.fecha_fin))));
  ini.setDate(ini.getDate() - ini.getDay() + 1);                       // arranca en lunes
  const dias = Math.round((fin - ini) / DAY) + 8;
  // El ancho de cada día se ajusta para que el Gantt llene la pantalla
  const libre = Math.max(600, (($('impl-tareas').clientWidth || 1200) - 232));
  const DW = Math.max(14, Math.floor(libre / dias)), ancho = dias * DW;
  const pos = x => Math.round((d(x) - ini) / DAY) * DW;
  // Cabecera de meses
  let meses = '', cur = new Date(ini);
  while (cur < new Date(ini.getTime() + dias * DAY)) {
    const sig = new Date(cur.getFullYear(), cur.getMonth() + 1, 1), hasta = Math.min(sig, new Date(ini.getTime() + dias * DAY));
    meses += `<div class="gt-m" style="width:${Math.round((hasta - cur) / DAY) * DW}px">${cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })}</div>`;
    cur = sig;
  }
  const hoyX = Math.round((d(hoyISO()) - ini) / DAY) * DW;
  const fases = [...new Set([...ORDEN_FASE, ...et.map(e => e.fase || 'relevamiento')])];
  const filas = fases.map(f => {
    const l = et.filter(e => (e.fase || 'relevamiento') === f); if (!l.length) return '';
    return `<div class="gt-f"><div class="gt-l"><b>${ICONO_FASE[f] || '📌'} ${esc(nombreFase(f))}</b></div><div class="gt-tr" style="width:${ancho}px"></div></div>` + l.map(e => {
      const cl = hecha(e) ? 'ok' : atrasada(e) ? 'late' : e.estado === 'en_progreso' ? 'cur' : e.bloqueada ? 'lock' : 'pen';
      const bar = (e.fecha_inicio && e.fecha_fin) ? `<i class="gt-b gt-${cl}${esMia(e) ? ' mia' : ''}" style="left:${pos(e.fecha_inicio)}px;width:${Math.max(DW, pos(e.fecha_fin) - pos(e.fecha_inicio) + DW)}px" title="${esc(e.tarea)}"></i>` : '';
      return `<div class="gt-r"><div class="gt-l" title="${esc(e.tarea)}">${esc(e.tarea)}${esMia(e) && !hecha(e) ? ' <span class="tr-yo">Vos</span>' : ''}</div><div class="gt-tr" style="width:${ancho}px">${bar}</div></div>`;
    }).join('');
  }).join('');
  return `<div class="gt"><div class="gt-in" style="--w:${ancho}px"><div class="gt-h"><div class="gt-l"></div><div class="gt-ms" style="width:${ancho}px">${meses}</div></div>${filas}<i class="gt-hoy" style="left:calc(230px + ${hoyX}px)" title="Hoy"></i></div>
    <div class="gt-ley"><span><i class="gt-ok"></i>Completa</span><span><i class="gt-cur"></i>En curso</span><span><i class="gt-late"></i>Demorada</span><span><i class="gt-pen"></i>Pendiente</span></div></div>`;
}
const ICONO_FASE = { relevamiento: '🔍', analisis: '📊', configuracion: '⚙️', pruebas: '✅', golive: '🚀' };

// Lo que fue haciendo el equipo (al revés de Gestión, donde se ve lo que hace el cliente)
function renderActividadEquipo() {
  const ev = [];
  const porId = Object.fromEntries(P.etapas.map(e => [e.id, e]));
  const conAviso = new Set((P.avisos || []).filter(a => a.tipo === 'tarea_completada' && a.ref_id).map(a => a.ref_id));
  P.etapas.filter(e => hecha(e) && e.fecha_completada && e.responsable_tipo !== 'cliente' && !conAviso.has(e.id))
    .forEach(e => ev.push({ t: e.fecha_completada, i: '✅', x: 'Completamos «' + e.tarea + '»' }));
  (P.avisos || []).filter(a => a.tipo !== 'nota_tarea').forEach(a => ev.push({ t: a.created_at, i: ICONO_AVISO[a.tipo] || '🔔', x: (a.titulo || '') + ' ' + (a.detalle || '') }));
  (P.notasTarea || []).forEach(n => ev.push({ t: n.created_at, i: '📝', x: 'Nota en «' + ((porId[n.tarea_id] || {}).tarea || 'una tarea') + '»: ' + n.texto, q: n.autor }));
  ev.sort((a, b) => new Date(b.t) - new Date(a.t));
  $('impl-act').innerHTML = '<div class="card-title">Lo que hizo el equipo</div>' + (ev.length
    ? '<div class="act-l">' + ev.slice(0, 25).map(e => `<div class="act-i"><span class="act-d">${e.i}</span><div><div class="act-x">${esc(e.x.trim())}</div><small>${e.q ? esc(e.q) + ' · ' : ''}${esc(hace(e.t))}</small></div></div>`).join('') + '</div>'
    : '<div class="vacio" style="padding:14px">Cuando avancemos con tus tareas lo vas a ver acá.</div>');
}
const COLOR_FASE = { relevamiento: '#14b8c4', analisis: '#8b5cf6', configuracion: '#f97316', pruebas: '#ec4899', golive: '#22c55e' };
const _fasesTog = {};      // fases abiertas o cerradas a mano (se conserva al redibujar)
let _soloMio = false;      // mostrar solo las tareas del cliente
// ── Tu próxima tarea / lo que hacemos nosotros ahora / recorrido por fases ──
function renderProximas(et) {
  const pend = et.filter(e => !hecha(e));
  const prox = pend.find(e => esMia(e) && !e.bloqueada && e.responsable_tipo === 'cliente') || pend.find(esMia);
  let a;
  if (!prox) {
    a = `<div class="px px-ok"><small>Tu próxima tarea</small><h3>🎉 No tenés tareas pendientes</h3><p class="muted">Ahora nos toca a nosotros. Te avisamos acá cuando haya algo para vos.</p></div>`;
  } else {
    const lista = !prox.bloqueada;
    const tarde = atrasada(prox);
    const cuando = prox.fecha_inicio ? 'Previsto: ' + fmtFecha(prox.fecha_inicio) + (prox.fecha_fin ? ' al ' + fmtFecha(prox.fecha_fin) : '') : '';
    a = `<div class="px ${lista ? 'px-on' : 'px-off'}"><small>Tu próxima tarea</small>
      <h3>${esc(prox.tarea)}</h3>
      <div class="px-st">${lista ? '<span class="chip c-ok">✅ Habilitada: ya podés hacerla</span>' : '<span class="chip c-gr">🔒 Todavía no habilitada</span>'}${tarde ? ' <span class="chip c-ko">Atrasada · ' + diasAtraso(prox) + ' d</span>' : ''}</div>
      <p class="muted sm">${lista ? esc(cuando) : (prox.espera_a ? 'Se habilita cuando se complete: <b>' + esc(prox.espera_a) + '</b>.' : 'Se habilita cuando se complete una tarea anterior.') + (cuando ? ' ' + esc(cuando) + '.' : '')}</p>
      <div class="px-ac">${lista && prox.le_toca_cliente ? `<button class="btn sm" type="button" data-hecha="${esc(prox.id)}">Marcar como hecha</button>` : ''}<button class="btn sec sm" type="button" data-ver="${esc(prox.id)}">Ver la tarea</button></div></div>`;
  }
  const nos = pend.find(e => esNuestra(e) && !esMia(e) && e.estado === 'en_progreso') || pend.find(e => esNuestra(e) && !esMia(e) && !e.bloqueada);
  const b = nos
    ? `<div class="px px-eq"><small>Lo que hacemos nosotros ahora</small><h3>${esc(nos.tarea)}</h3><div class="px-st"><span class="chip ${nos.estado === 'en_progreso' ? 'c-az' : 'c-gr'}">${nos.estado === 'en_progreso' ? 'En curso' : 'Siguiente del equipo'}</span></div><p class="muted sm">${nos.fecha_fin ? 'Prevista para el ' + esc(fmtFecha(nos.fecha_fin)) + '.' : ''} Es una tarea de nuestro equipo: no tenés que hacer nada.</p></div>`
    : `<div class="px px-eq"><small>Lo que hacemos nosotros ahora</small><h3>Sin tareas nuestras en curso</h3><p class="muted sm">Cuando haya algo de nuestro lado lo vas a ver acá.</p></div>`;
  $('impl-prox').innerHTML = a + b;

  // Recorrido por fases: línea minimalista, un punto por fase (verde completa · rojo demorada · azul en curso · gris sin tocar)
  const fases = [...new Set([...ORDEN_FASE, ...et.map(e => e.fase || 'relevamiento')])].filter(f => et.some(e => (e.fase || 'relevamiento') === f));
  const actual = (pend[0] && (pend[0].fase || 'relevamiento')) || null;
  $('impl-fases').innerHTML = '<div class="frec">' + fases.map((f, i) => {
    const l = et.filter(e => (e.fase || 'relevamiento') === f), n = l.filter(hecha).length, p = Math.round(n / l.length * 100);
    const cl = p === 100 ? 'ok' : l.some(atrasada) ? 'late' : (f === actual || n > 0 || l.some(e => e.estado === 'en_progreso')) ? 'cur' : '';
    const col = { ok: '#22c55e', late: '#ef4444', cur: '#3b82f6', '': '#8b909c' }[cl];
    return `<div class="fp ${cl}" style="--p:${p}%;--c:${col}" title="${n} de ${l.length} tareas${cl === 'late' ? ' · con tareas demoradas' : ''}"><div class="fp-d"><i>${p === 100 ? '✓' : ''}</i></div><b>${esc((NOMBRE_FASE[f] || f).replace(/^./, c => c.toUpperCase()))}</b><small>${n}/${l.length}</small></div>`;
  }).join('') + '</div>';
}
RENDERS.push(renderImpl);
ALENTRAR.impl = renderImpl;

// Notas que el equipo dejó (y compartió) en la tarea
function htmlNotasTarea(id) {
  const ns = (P.notasTarea || []).filter(n => n.tarea_id === id);
  if (!ns.length) return '';
  return '<div class="notas-eq"><b>Notas del equipo</b>' + ns.map(n => `<div class="nota-eq"><div>${esc(n.texto)}</div><small>${esc(n.autor)} · ${esc(fmtFecha(n.created_at))}</small></div>`).join('') + '</div>';
}

const nombreFase = f => (NOMBRE_FASE[f || 'relevamiento'] || f).replace(/^./, c => c.toUpperCase());
function htmlTarea(e) {
  const tarde = atrasada(e) && !hecha(e), mia = esMia(e);
  let fecha = '';
  if (hecha(e) && e.fecha_completada) fecha = 'Completada ' + fmtFecha(e.fecha_completada);
  else if (e.fecha_fin) fecha = tarde ? 'Venció hace ' + diasAtraso(e) + (diasAtraso(e) === 1 ? ' día' : ' días') : 'Vence ' + fmtFecha(e.fecha_fin);
  const puede = e.le_toca_cliente && !hecha(e) && !e.bloqueada;
  let icono;
  if (hecha(e)) icono = '<span class="tr-i tr-ok">✓</span>';
  else if (puede) icono = `<button class="tr-ck" type="button" data-hecha="${esc(e.id)}" title="Marcar como hecha" aria-label="Marcar como hecha"></button>`;
  else if (e.bloqueada) icono = '<span class="tr-i tr-lock">🔒</span>';
  else icono = '<span class="tr-i tr-eq" title="Tarea de nuestro equipo">S</span>';
  const sub = [mia && !hecha(e) ? '<span class="tr-yo">Vos</span>' : '', e.estado === 'en_progreso' && !hecha(e) ? '<span class="tr-cur">En curso</span>' : '', fecha ? '<span class="tr-f' + (tarde ? ' late' : '') + '">' + esc(fecha) + '</span>' : ''].filter(Boolean).join('');
  const abierta = _abiertas.has(e.id);
  const nota = (P.notasTarea || []).some(n => n.tarea_id === e.id) ? ' <span title="Tiene notas del equipo">📝</span>' : '';
  return `<div class="tk tr${hecha(e) ? ' done' : ''}${puede ? ' go' : ''}${abierta ? ' open' : ''}" data-id="${esc(e.id)}">
    <div class="tr-h" data-tk="${esc(e.id)}">${icono}
      <div class="tr-t"><b>${esc(e.tarea)}${nota}</b>${sub ? '<small>' + sub + '</small>' : ''}</div><span class="tr-c">▾</span></div>
    <div class="tk-b">
      ${htmlNotasTarea(e.id)}
      <p class="muted sm" style="margin-top:6px">${e.fecha_inicio ? 'Previsto: ' + esc(fmtFecha(e.fecha_inicio)) + (e.fecha_fin ? ' al ' + esc(fmtFecha(e.fecha_fin)) : '') : 'Sin fechas definidas todavía.'}${e.bloqueada ? ' Se habilita cuando se complete: ' + esc(e.espera_a || 'una tarea anterior') + '.' : ''}</p>
      ${puede ? `<div class="tk-ac"><button class="btn sm" type="button" data-hecha="${esc(e.id)}">✓ Marcar como hecha</button></div>` : ''}
    </div></div>`;
}
async function marcarHecha(bt) {
  const e = P.etapas.find(x => x.id === bt.dataset.hecha);
  if (!e || !confirm('¿Confirmás que completaste esta tarea?\n\n' + e.tarea)) return;
  bt.disabled = true; bt.textContent = 'Guardando…';
  const { error } = await sb.rpc('portal_completar_etapa', { p_tarea_id: e.id });
  if (error) { toast(error.message || 'No se pudo marcar la tarea.'); bt.disabled = false; bt.textContent = '✓ Marcar como hecha'; return; }
  toast('¡Listo! Avisamos al equipo.');
  await cargarTodo(false);
}
$('impl-tareas').addEventListener('click', async ev => {
  const bt = ev.target.closest('[data-hecha]');
  if (bt) { marcarHecha(bt); return; }
  const bt2 = ev.target.closest('[data-bl-t]');
  if (bt2) { const f = bt2.dataset.blT; _fasesTog[f] = !bt2.parentElement.classList.contains('open'); bt2.parentElement.classList.toggle('open'); return; }
  const vv = ev.target.closest('[data-vista]');
  if (vv) { _vistaT = vv.dataset.vista; renderImpl(); return; }
  const so = ev.target.closest('[data-solo]');
  if (so) { _soloMio = so.dataset.solo === '1'; renderImpl(); return; }
  const h = ev.target.closest('[data-tk]');
  if (h) {
    const id = h.dataset.tk;
    _abiertas.has(id) ? _abiertas.delete(id) : _abiertas.add(id);
    h.parentElement.classList.toggle('open');
  }
});
function cerrarBanner() { try { localStorage.setItem('portal-inicio-visto-' + P.cliente.id, '1'); } catch (e) { /* idem */ } $('inicio-b').hidden = true; }
$('inicio-x').addEventListener('click', cerrarBanner);
$('inicio-ver').addEventListener('click', () => { cerrarBanner(); $('i-tareas').scrollIntoView({ behavior: 'smooth' }); });

// Al cambiar el tamaño de la ventana, el Gantt se vuelve a ajustar al ancho
let _rsz; window.addEventListener('resize', () => { if (_vistaT !== 'gantt') return; clearTimeout(_rsz); _rsz = setTimeout(() => { try { renderImpl(); } catch (e) { /* sin datos todavía */ } }, 200); });

// Desde la campanita: ir a la tarea del aviso (se abre su fase y la tarea, y destella para que se vean las notas)
function irATareaPortal(id) {
  const e = P.etapas.find(x => x.id === id);
  if (!e) { toast('Esa tarea ya no está disponible.'); return; }
  $('notis').classList.remove('on');
  _vistaT = 'lista'; _soloMio = false;
  _fasesTog[e.fase || 'relevamiento'] = true; _abiertas.add(id);
  irA('impl');
  const hasta = Date.now() + 5000; let scrolleado = false;
  const timer = setInterval(() => {
    const el = document.querySelector('.tk[data-id="' + id + '"]');
    if (el) {
      if (!scrolleado) { scrolleado = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (!el.classList.contains('tk-flash') && Date.now() < hasta - 300) { void el.offsetWidth; el.classList.add('tk-flash'); }
    }
    if (Date.now() >= hasta) { clearInterval(timer); if (el) el.classList.remove('tk-flash'); }
  }, 250);
}
$('notis-lista').addEventListener('click', ev => { const n = ev.target.closest('[data-tarea]'); if (n) irATareaPortal(n.dataset.tarea); });

// ── Secciones de Implementación (Inicio · Empresas · Documentos): se despliegan en la barra lateral solo estando en Implementación ──
function aplicarTabImpl() {
  document.querySelectorAll('#snav-sub [data-itab]').forEach(b => b.classList.toggle('on', b.dataset.itab === tabImpl));
  ['inicio', 'empresas', 'docs'].forEach(k => $('itp-' + k).classList.toggle('on', k === tabImpl));
  window.scrollTo(0, 0);
}
$('snav-sub').addEventListener('click', ev => {
  const b = ev.target.closest('[data-itab]'); if (!b) return;
  tabImpl = b.dataset.itab; aplicarTabImpl();
});
$('sn-impl').addEventListener('click', () => { tabImpl = 'inicio'; if (vistaActual === 'impl') aplicarTabImpl(); });
