// CLIENTE → bloque "Reunión de inicio" + "Inicio de la implementación" (pestaña Inicio, detalle de Implementación)
// El cliente propone hasta 3 horarios desde su app; acá el equipo confirma uno (o propone otro) y carga
// el link de Meet. Al confirmar, el cliente recibe el aviso en su campanita (lo hace un trigger de la base).
// Tabla: portal_reuniones (migración 081).

const _reuEq = {};          // clienteId -> [reuniones]
const _reuEqCargando = {};
const _reuPrep = {};        // clienteId -> { iniciada, aprobado } (para el botón Iniciar implementación)
const _reuTZ = 'America/Argentina/Buenos_Aires';
const _reuEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function reunionEqCargar(cid, rerender) {
  if (_reuEqCargando[cid]) return;
  _reuEqCargando[cid] = true;
  try {
    const [r, pr, ap, us, ps, nv] = await Promise.all([
      sb().from('portal_reuniones').select('*').eq('cliente_id', cid).eq('tipo', 'inicio').order('created_at', { ascending: false }).limit(5),
      sb().from('portal_prep').select('implementacion_iniciada_at, iniciada_por').eq('cliente_id', cid).maybeSingle(),
      sb().from('relevamiento_aprobacion').select('aprobado_por, aprobado_at').eq('cliente_id', cid).maybeSingle(),
      sb().from('portal_usuarios').select('user_id', { count: 'exact', head: true }).eq('cliente_id', cid).eq('activo', true),
      sb().rpc('prep_pasos', { p_cliente: cid }),
      sb().from('portal_novedades').select('id, tipo, detalle, created_at').eq('cliente_id', cid).order('created_at', { ascending: false }).limit(40)
    ]);
    if (r.error) throw r.error;
    _reuEq[cid] = r.data || [];
    _reuPrep[cid] = { iniciada: pr.error ? null : (pr.data || null), aprobado: ap.error ? null : (ap.data || null), portal: !us.error && (us.count || 0) > 0, pasos: ps.error ? [] : (ps.data || []), nov: nv.error ? [] : (nv.data || []) };
  } catch (e) {
    console.warn('No se pudo cargar la reunión del cliente (¿falta correr la migración 081?)', e);
    _reuEq[cid] = _reuEq[cid] || [];
    _reuPrep[cid] = _reuPrep[cid] || { iniciada: null, aprobado: null, portal: false, pasos: [], nov: [] };
  } finally { delete _reuEqCargando[cid]; }
  if (rerender !== false && !['documentos', 'relev'].includes(window._implTab) && window._implClienteAbierto === cid && typeof renderImplementacion === 'function') renderImplementacion();
}

function _reuFmt(iso, conHoraFin) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', { timeZone: _reuTZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  const dia = p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1);
  return `${dia} ${p.day}/${p.month} · ${p.hour}:${p.minute}`;
}
const _reuActiva = cid => (_reuEq[cid] || []).find(r => ['pendiente', 'confirmada', 'realizada'].includes(r.estado)) || null;

function renderReunionEquipo(cid) {
  if (!_reuEq[cid]) { reunionEqCargar(cid); return '<section class="reu-eq"><div class="info-cargando">Cargando reunión…</div></section>'; }
  const r = _reuActiva(cid);
  let cuerpo;
  if (!r) {
    cuerpo = '<p class="reu-eq__vacio">El cliente todavía no solicitó la reunión de inicio.</p>';
  } else if (r.estado === 'pendiente') {
    cuerpo = `<span class="reu-eq__chip reu-eq__chip--pend">⏳ Pendiente de confirmar</span>
      ${r.comentario_cliente ? `<p class="reu-eq__com">💬 ${_reuEsc(r.comentario_cliente)}</p>` : ''}
      <div class="reu-eq__ops">${r.propuestas.map((h, i) => `<label class="reu-eq__op"><input type="radio" name="reu-h-${cid}" value="${_reuEsc(h)}" ${i === 0 ? 'checked' : ''}> ${_reuEsc(_reuFmt(h))}</label>`).join('')}
        <label class="reu-eq__op"><input type="radio" name="reu-h-${cid}" value="otro"> Otro horario: <input type="datetime-local" id="reu-otro-${cid}" onfocus="this.closest('label').querySelector('input[type=radio]').checked=true"></label></div>
      <input type="url" id="reu-meet-${cid}" class="reu-eq__meet" placeholder="Link de Google Meet (https://meet.google.com/…)">
      <div class="reu-eq__acc"><button class="btn-primary btn-primary--sm" onclick="reunionConfirmar('${cid}','${r.id}')">Confirmar reunión</button>
        <button class="btn-secondary" onclick="reunionCambiarEstado('${r.id}','cancelada','${cid}')">Rechazar solicitud</button></div>`;
  } else {
    cuerpo = `<span class="reu-eq__chip ${r.estado === 'realizada' ? 'reu-eq__chip--ok' : 'reu-eq__chip--conf'}">${r.estado === 'realizada' ? '✓ Realizada' : '✓ Confirmada'}</span>
      <div class="reu-eq__fecha">${_reuEsc(_reuFmt(r.confirmado_inicio))}</div>
      ${r.meet_url ? `<a class="reu-eq__link" href="${_reuEsc(r.meet_url)}" target="_blank" rel="noopener">🎥 Abrir Meet</a>` : ''}
      <div class="reu-eq__acc">${r.estado === 'confirmada' ? `<button class="btn-primary btn-primary--sm" onclick="reunionCambiarEstado('${r.id}','realizada','${cid}')">Marcar como realizada</button>
        <button class="btn-secondary" onclick="reunionCambiarEstado('${r.id}','cancelada','${cid}')">Cancelar reunión</button>` : ''}</div>`;
  }
  return `<section class="reu-eq"><div class="reu-eq__h">📅 Reunión de inicio</div>${cuerpo}</section>`;
}

// ¿Este cliente está en "preparación"? Tiene acceso a la app de Clientes y todavía no se inició la implementación.
// En ese caso la pestaña Tareas se llama "Inicio": ahí se revisa que esté todo listo, se arma el cronograma
// (duración, responsable, predecesoras) y recién al confirmar el inicio el cliente ve sus tareas.
function implEnPreparacion(cid) {
  const pp = _reuPrep[cid];
  return !!(pp && pp.portal && !(pp.iniciada && pp.iniciada.implementacion_iniciada_at));
}
// Pasos que no le corresponden a un estudio contable (no carga su propia empresa en Salario). La base los marca como completos.
const _INI_NO_APLICAN = { estudio: [2, 4, 5] };
function _iniAplica(cid, n) {
  const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === cid);
  return !((_INI_NO_APLICAN[c && c.tipo] || []).includes(n));
}
const _INI_PASOS = [
  ['Datos de la empresa', 'info'], ['Información adicional', 'info'], ['Usuarios de Salario', 'info'], ['Logo y firma', 'documentos'],
  ['Liquidaciones y Excel de control', 'documentos'], ['Cantidad de empresas', 'info'], ['Relevamiento inicial', 'relev'], ['Reunión de inicio', 'info']
];
// Línea de tiempo lateral: lo que el cliente fue completando en su app y lo que todavía le falta
const _TL_ICONO = { etapa_completada: '✅', empresa_cargada: '🏢', empresa_editada: '✏️', archivo_subido: '📎', usuarios_cargados: '👥', cantidad_empresas: '🏢', relevamiento_aprobado: '📝', reunion_solicitada: '📅', duda_cliente: '💬', tiempo_pedido: '⏳' };
function _iniTimelineHtml(cid) {
  const pp = _reuPrep[cid]; if (!pp) return '';
  const fmt = iso => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const pendientes = _INI_PASOS.map(([nom], i) => ({ nom, n: i + 1, e: pp.pasos.find(x => x.paso === i + 1) || {} })).filter(x => _iniAplica(cid, x.n) && !x.e.completo);
  const titulo = n => (typeof _infoNovTitulo === 'function') ? _infoNovTitulo(n) : (n.detalle || n.tipo);
  const eventos = (pp.nov || []).map(n => `<div class="tl-ev"><span class="tl-dot">${_TL_ICONO[n.tipo] || '•'}</span><div><div class="tl-t">${titulo(n)}</div><div class="tl-f">${_reuEsc(fmt(n.created_at))}</div></div></div>`).join('');
  const inic = pp.iniciada && pp.iniciada.implementacion_iniciada_at;
  return `<aside class="tl-eq"><div class="reu-eq__h">🕒 Lo que hizo el cliente</div>
    ${inic ? `<div class="tl-ev"><span class="tl-dot">🚀</span><div><div class="tl-t">Implementación iniciada</div><div class="tl-f">${_reuEsc(fmt(inic))}</div></div></div>` : `
    ${pendientes.length
      ? `<div class="tl-falta"><b>Le falta completar</b>${pendientes.map(x => `<div class="tl-fi">○ ${x.nom}</div>`).join('')}</div>`
      : '<div class="tl-ok">✓ Completó toda su preparación</div>'}`}
    <div class="tl-lista">${eventos || '<div class="tl-vacio">Todavía no hizo nada en su app.</div>'}</div>
  </aside>`;
}

// Bloque "Inicio de la implementación" (arriba de la pestaña Inicio/Tareas)
// conSide=false: devuelve solo la parte principal (el detalle de Implementación pone la línea de tiempo en una columna lateral)
function renderInicioEquipo(cid, conSide = true) {
  const bloque = _renderInicioBloque(cid);
  if (!bloque) return '';
  const pp = _reuPrep[cid];
  const iniciada = !!(pp && pp.iniciada && pp.iniciada.implementacion_iniciada_at);
  // La reunión de inicio se confirma desde acá (antes de iniciar la implementación)
  const reunion = iniciada ? '' : renderReunionEquipo(cid);
  if (!conSide) return `<div class="ini-top ini-top--solo"><div class="ini-top__main">${reunion}${bloque}</div></div>`;
  return `<div class="ini-top"><div class="ini-top__main">${reunion}${bloque}</div>${_iniTimelineHtml(cid)}</div>`;
}
// Línea de tiempo de lo que hizo el cliente (columna lateral del detalle). Vacío si el cliente no usa la app de Clientes.
function renderInicioSide(cid) {
  const pp = _reuPrep[cid];
  return (pp && pp.portal) ? _iniTimelineHtml(cid) : '';
}
function _renderInicioBloque(cid) {
  const pp = _reuPrep[cid];
  if (!pp) { if (!_reuEq[cid]) reunionEqCargar(cid); return ''; }
  if (!pp.portal) return '';                    // clientes que no usan la app de Clientes: sin este bloque
  const inic = pp.iniciada && pp.iniciada.implementacion_iniciada_at;
  if (inic) return `<section class="reu-eq ini-eq"><span class="reu-eq__chip reu-eq__chip--ok">🚀 Implementación iniciada el ${_reuEsc(new Date(inic).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }))}</span> <span class="reu-eq__com">El cliente ve sus tareas, avance y fechas en su app.</span></section>`;
  const tareas = (typeof implTareas !== 'undefined' ? implTareas : []).filter(t => t.cliente_id === cid).length;
  const r = _reuActiva(cid);
  const pasos = _INI_PASOS.map(([nom, tab], i) => {
    if (!_iniAplica(cid, i + 1)) return '';
    const e = pp.pasos.find(x => x.paso === i + 1) || {};
    let sub = e.completo ? 'Completo' : 'Pendiente del cliente';
    if (i === 6) sub = pp.aprobado ? 'Aprobado por ' + _reuEsc(pp.aprobado.aprobado_por) : 'Falta la aprobación del cliente';
    if (i === 7) sub = r ? (r.estado === 'realizada' ? 'Realizada' : r.estado === 'confirmada' ? 'Confirmada, falta marcarla como realizada' : 'Solicitada, falta confirmarla') : 'Todavía no la solicitó';
    return `<div class="ini-eq__it ${e.completo ? 'ini-eq__it--ok' : ''}"><span>${e.completo ? '✓' : '○'}</span><div>${nom}<small>${sub}</small></div>${tab ? `<button class="ini-eq__ver" onclick="setImplTab('${tab}')">Ver</button>` : ''}</div>`;
  }).join('');
  const aplican = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => _iniAplica(cid, n)), hechos = aplican.filter(n => (pp.pasos.find(x => x.paso === n) || {}).completo).length;
  const listo = !!pp.aprobado && tareas > 0;
  return `<section class="reu-eq ini-eq"><div class="reu-eq__h">🚀 Inicio de la implementación</div>
    <p class="reu-eq__com" style="margin:0 0 10px">1) Revisá que el cliente haya completado su preparación. 2) Armá el cronograma de abajo. 3) Confirmá el inicio: recién ahí el cliente ve sus tareas.</p>
    <div class="ini-eq__t">Preparación del cliente · ${hechos} de ${aplican.length}</div>
    <div class="ini-eq__lista">${pasos}</div>
    <div class="ini-eq__t" style="margin-top:12px">Cronograma</div>
    <div class="ini-eq__lista"><div class="ini-eq__it ${tareas > 0 ? 'ini-eq__it--ok' : ''}"><span>${tareas > 0 ? '✓' : '○'}</span><div>${tareas > 0 ? tareas + ' tareas armadas' : 'Todavía no hay tareas'}<small>${tareas > 0 ? 'Ajustá duración, responsable y predecesoras en la lista de abajo. El cliente todavía no las ve.' : 'Creá las etapas desde la plantilla (abajo) y después ajustalas.'}</small></div></div></div>
    <div class="reu-eq__acc"><button class="btn-primary btn-primary--sm" ${listo ? '' : 'disabled title="Falta el relevamiento aprobado y las tareas armadas"'} onclick="inicioImplementar('${cid}')">🚀 Confirmar inicio de la implementación</button></div>
    <p class="reu-eq__com">Al confirmar, el cliente recibe un aviso y pasa a ver sus tareas, su avance, y las fechas de inicio, objetivo y fin.</p>
  </section>`;
}
// Confirmar inicio: abre el modal de fechas (gestion/js/cliente-preparacion.js)
function inicioImplementar(cid) { inicioFechasAbrir(cid); }

async function reunionConfirmar(cid, id) {
  const sel = document.querySelector(`input[name="reu-h-${cid}"]:checked`);
  if (!sel) { toast('Elegí un horario'); return; }
  let inicio = sel.value;
  if (inicio === 'otro') {
    const v = (document.getElementById('reu-otro-' + cid) || {}).value;
    if (!v) { toast('Elegí la fecha y hora'); return; }
    inicio = new Date(v).toISOString();
  }
  const meet = ((document.getElementById('reu-meet-' + cid) || {}).value || '').trim();
  if (!/^https:\/\//i.test(meet)) { toast('Pegá el link de Meet (tiene que empezar con https://)'); return; }
  const por = (typeof getCurrentUserName === 'function' && getCurrentUserName()) || null;
  const { error } = await sb().from('portal_reuniones').update({ estado: 'confirmada', confirmado_inicio: inicio, meet_url: meet, confirmado_por: por, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('No se pudo confirmar: ' + (error.message || error)); return; }
  toast('Reunión confirmada. Le avisamos al cliente.');
  await reunionEqCargar(cid);
}

async function reunionCambiarEstado(id, estado, cid) {
  if (estado === 'cancelada' && !confirm('¿Seguro? El cliente va a poder pedir la reunión de nuevo.')) return;
  const { error } = await sb().from('portal_reuniones').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('No se pudo actualizar: ' + (error.message || error)); return; }
  await reunionEqCargar(cid);
}

// Si el cliente pide o cambia la reunión mientras el equipo mira la pestaña, se actualiza
window.addEventListener('app-ready', () => {
  try {
    sb().channel('cliente-reunion').on('postgres_changes', { event: '*', schema: 'public', table: 'portal_reuniones' }, pl => {
      const cid = (pl.new && pl.new.cliente_id) || (pl.old && pl.old.cliente_id);
      if (!cid || !_reuEq[cid]) return;
      const escribiendo = document.activeElement && document.activeElement.closest && document.activeElement.closest('.reu-eq');
      reunionEqCargar(cid, !escribiendo);
    }).subscribe();
  } catch (e) { console.warn('Sin realtime de reuniones', e); }
});

// ═════════ Inicio de un cliente EN PREPARACIÓN (rediseño) ═════════
// 3 etapas: ① el cliente completa su preparación → ② el equipo arma el cronograma → ③ se confirma el inicio.
// Acá no se muestran fechas: la de inicio es el día que se confirma y la de fin se pide en ese momento.
const _IPX_ICONO = ['🏢', '🧾', '👥', '🖼️', '📑', '🗂️', '📝', '📅'];
function renderInicioPrepHtml(c) {
  const cid = c.id, pp = _reuPrep[cid];
  if (!pp) { reunionEqCargar(cid); return '<div class="ipx"><div class="info-cargando">Cargando…</div></div>'; }
  const aplican = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => _iniAplica(cid, n));
  const comp = n => !!(pp.pasos.find(x => x.paso === n) || {}).completo;
  const hechos = aplican.filter(comp).length, total = aplican.length, prepOk = hechos === total;
  const tareas = (typeof implTareas !== 'undefined' ? implTareas : []).filter(t => t.cliente_id === cid).length;
  const r = _reuActiva(cid);
  const listo = prepOk && !!pp.aprobado && tareas > 0;
  const etapa = !prepOk ? 1 : (listo ? 3 : 2);
  const pct = Math.round(hechos / total * 100);

  const et = (n, ico, tit, sub) => `<div class="ipx-st ${n < etapa ? 'ipx-st--ok' : n === etapa ? 'ipx-st--act' : ''}"><div class="ipx-st__n">${n < etapa ? '✓' : ico}</div><div><b>${tit}</b><small>${sub}</small></div></div>`;
  const tracker = `<div class="ipx-track">
    ${et(1, '1', 'El cliente completa su parte', `${hechos} de ${total} pasos`)}<span class="ipx-line ${etapa > 1 ? 'ipx-line--ok' : ''}"></span>
    ${et(2, '2', 'Armamos el cronograma', tareas ? `${tareas} tareas creadas` : 'Sin tareas todavía')}<span class="ipx-line ${etapa > 2 ? 'ipx-line--ok' : ''}"></span>
    ${et(3, '3', 'Iniciamos la implementación', listo ? 'Listo para confirmar' : 'Cuando todo esté listo')}</div>`;

  const msg = !prepOk
    ? 'Estamos esperando que el cliente complete su preparación. Mientras tanto podés ir revisando lo que cargó y ajustando el cronograma.'
    : (listo ? '¡El cliente terminó su parte! Revisá el cronograma y confirmá el inicio cuando quieras.'
      : (!pp.aprobado ? 'Falta la aprobación del relevamiento por parte del cliente.' : 'Falta crear las tareas del cronograma.'));

  const NOMBRES = _INI_PASOS.map(x => x[0]);
  const cards = aplican.map(n => {
    const nom = NOMBRES[n - 1], tab = _INI_PASOS[n - 1][1], ok = comp(n);
    let sub = ok ? 'Completo' : 'Pendiente del cliente';
    if (n === 7) sub = pp.aprobado ? 'Aprobado por ' + _reuEsc(pp.aprobado.aprobado_por) : 'Falta la aprobación';
    if (n === 8) sub = r ? (r.estado === 'realizada' ? 'Realizada' : r.estado === 'confirmada' ? 'Confirmada · falta marcarla realizada' : 'Solicitada · falta confirmarla') : 'Todavía no la pidió';
    return `<div class="ipx-card ${ok ? 'ipx-card--ok' : ''}"><div class="ipx-card__ico">${ok ? '✓' : _IPX_ICONO[n - 1]}</div>
      <div class="ipx-card__t"><b>${nom}</b><small>${sub}</small></div>${tab ? `<button class="ipx-card__ver" onclick="setImplTab('${tab}')">Ver →</button>` : ''}</div>`;
  }).join('');

  return `<div class="ipx">
    <div class="ipx-hero"><div class="ipx-ring" style="--p:${pct}"><span>${hechos}<small>/${total}</small></span></div>
      <div class="ipx-hero__t"><span class="ipx-chip">${prepOk ? '✅ Preparación completa' : '⏳ En preparación'}</span><p>${msg}</p></div></div>
    ${tracker}
    <div class="ipx-cols">
      <div class="ipx-main">
        <div class="ipx-h">Lo que tiene que completar el cliente</div>
        <div class="ipx-cards">${cards}</div>
        ${prepOk || r ? renderReunionEquipo(cid) : ''}
      </div>
      ${_iniTimelineHtml(cid)}
    </div>
  </div>`;
}
// Barra fija al pie: confirmar el inicio
function renderInicioCtaHtml(c) {
  const pp = _reuPrep[c.id]; if (!pp) return '';
  const aplican = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => _iniAplica(c.id, n));
  const prepOk = aplican.every(n => !!(pp.pasos.find(x => x.paso === n) || {}).completo);
  const tareas = (typeof implTareas !== 'undefined' ? implTareas : []).filter(t => t.cliente_id === c.id).length;
  const listo = prepOk && !!pp.aprobado && tareas > 0;
  const falta = !prepOk ? 'Falta que el cliente complete su preparación' : (!pp.aprobado ? 'Falta que el cliente apruebe el relevamiento' : (!tareas ? 'Faltan crear las tareas' : ''));
  return `<div class="ipx-cta"><div class="ipx-cta__t"><b>${listo ? 'Todo listo para arrancar' : 'Todavía no se puede iniciar'}</b>
    <small>${listo ? 'Al confirmar, hoy es la fecha de inicio, te pedimos la fecha estimada de fin y el cliente ve sus tareas.' : falta}</small></div>
    <button class="btn-primary" ${listo ? '' : 'disabled'} onclick="inicioImplementar('${c.id}')">🚀 Iniciar implementación</button></div>`;
}
