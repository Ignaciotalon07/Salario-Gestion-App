// ───────────── Implementación antes del inicio ─────────────
// Con los 8 pasos de Preparación listos y mientras el equipo arma y confirma el cronograma, el cliente ve
// acá en qué etapa va (centro) y la línea de tiempo de lo que fue completando (derecha).
// Sus tareas aparecen en este mismo lugar cuando el equipo confirma el inicio de la implementación.
function fechaHora(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
// Lo que el cliente fue haciendo, armado con sus propios datos (más nuevo primero)
function eventosCliente() {
  const ev = [];
  const add = (iso, ico, txt) => { if (iso) ev.push({ iso, ico, txt }); };
  if (P.principal) add(P.principal.updated_at || P.principal.created_at, 'emp', 'Completaste los datos de tu empresa');
  if (P.usuarios.length) add(P.usuarios.map(u => u.created_at).filter(Boolean).sort().pop(), 'usr', 'Indicaste quiénes usan Salario (' + P.usuarios.length + ')');
  if (P.prep && P.prep.empresas_declaradas) add(P.prep.updated_at, 'cant', 'Indicaste cuántas empresas liquidás (' + P.prep.empresas_declaradas + ')');
  P.docs.forEach(d => add(d.created_at, 'doc', 'Subiste «' + d.nombre + '»'));
  if (P.relevAprob) add(P.relevAprob.aprobado_at, 'rel', 'Aprobaste el relevamiento inicial');
  const r = (P.reuniones || []).find(x => ['pendiente', 'confirmada', 'realizada'].includes(x.estado));
  if (r) {
    add(r.created_at, 'reu', 'Pediste la reunión de inicio');
    if (r.estado !== 'pendiente' && r.confirmado_inicio) add(r.updated_at, 'ok', 'Confirmamos tu reunión de inicio');
  }
  return ev.sort((a, b) => new Date(b.iso) - new Date(a.iso));
}
const NOMBRES_PASOS = ['Datos de tu empresa', 'Información adicional', 'Usuarios de Salario', 'Logo y firma', 'Liquidaciones y Excel de control', 'Cantidad de empresas', 'Relevamiento inicial', 'Reunión de inicio'];
// Una fila por paso, con su botón para editar. El relevamiento NO se edita: una vez aprobado llega al equipo.
function filaPreparacion(n, nombre, r) {
  let sub = 'Completo', boton = `<button class="btn sec sm" type="button" data-editar-paso="${n}">Editar</button>`;
  if (n === 7) {
    sub = P.relevAprob ? 'Aprobado por ' + esc(P.relevAprob.aprobado_por) + ' · ya lo recibimos' : 'Enviado';
    boton = '<span class="chip c-gr">Enviado</span>';
  }
  if (n === 8) {
    if (r && r.estado === 'pendiente') { sub = 'Pedida, esperando confirmación'; boton = '<button class="btn sec sm" type="button" data-ir="reunion">Cambiar horarios</button>'; }
    else if (r) { sub = 'Confirmada · si necesitás moverla, escribinos'; boton = '<button class="btn sec sm" type="button" data-ir="reunion">Ver</button>'; }
  }
  return `<div class="it ok"><div class="dot">✓</div><div class="t">${esc(nombre)}<small>${sub}</small></div>${boton}</div>`;
}
// Editar un paso: se va a Preparación y se marca el paso elegido
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-editar-paso]'); if (!b) return;
  irAPaso(+b.dataset.editarPaso);
});

function renderImplPre() {
  if (!P.cliente || !$('pre-centro')) return;
  const r = (P.reuniones || []).find(x => ['pendiente', 'confirmada', 'realizada'].includes(x.estado));
  const conf = !!r && (r.estado === 'confirmada' || r.estado === 'realizada');

  // Mensaje de la etapa en la que va
  let etapa, msg;
  if (!conf) {
    etapa = 'Coordinando tu reunión de inicio';
    msg = r ? 'Recibimos tu pedido de reunión. Apenas confirmemos un horario te avisamos y vas a ver acá el link de Meet.' : 'Ya completaste tu preparación. Solo falta coordinar la reunión de inicio.';
  } else {
    etapa = 'Armando tu cronograma';
    msg = 'El equipo de Salario está confirmando tus tareas. Pronto las vas a ver acá, cuando den inicio a tu implementación.';
  }
  // Las 4 etapas, en línea
  // Cuatro tarjetas a todo el ancho; la etapa actual se resalta
  const et = (n, estado, tit, sub) => `<div class="pi-st pi-st--${estado}"><span class="pi-st__n">${estado === 'ok' ? '✓' : n}</span><b>${tit}</b><small>${sub}</small><em>${estado === 'ok' ? 'Listo' : estado === 'act' ? 'En curso' : 'Próximo'}</em></div>`;
  const track = `<div class="pi-track">
    ${et(1, 'ok', 'Preparación', 'Completaste los ' + pasosAplican().length + ' pasos')}
    ${et(2, conf ? 'ok' : 'act', 'Reunión de inicio', conf ? (r.estado === 'realizada' ? 'Realizada' : 'Confirmada') : (r ? 'Esperando confirmación' : 'Pendiente'))}
    ${et(3, conf ? 'act' : '', 'Armado de tu cronograma', 'Tareas, responsables y fechas')}
    ${et(4, '', 'Arranque', 'Aparecen tus tareas y tu avance')}</div>`;
  $('pre-track').innerHTML = track;
  // Bloque central según el estado de la reunión
  let bloque;
  if (conf) {
    const t = tileHorario(r.confirmado_inicio);
    bloque = `<div class="pi-reu"><div class="rq-cal"><span>${esc(t.dia)}</span><b>${esc(t.num)}</b><span>${esc(t.mes)}</span></div>
      <div class="pi-reu__d"><small>Tu reunión de inicio</small><b>${esc(t.hi)} a ${esc(t.hf)}</b><span>Google Meet · 45 min</span>
      <div class="pi-reu__b">${r.estado === 'confirmada' && r.meet_url ? `<a class="btn" href="${esc(r.meet_url)}" target="_blank" rel="noopener">Unirme al Meet</a>` : ''}<button class="btn sec" type="button" data-ir="reunion">Ver detalles</button></div></div></div>`;
  } else if (r) {
    bloque = `<div class="pi-reu"><div class="rq-pulse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div>
      <div class="pi-reu__d"><small>Tu solicitud</small><b>Esperando confirmación</b><span>Propusiste ${r.propuestas.length} ${r.propuestas.length === 1 ? 'horario' : 'horarios'}. Apenas confirmemos uno te avisamos.</span>
      <div class="pi-reu__b"><button class="btn sec" type="button" data-ir="reunion">Ver o cambiar horarios</button></div></div></div>`;
  } else {
    bloque = `<div class="pi-reu"><div class="rq-pulse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/></svg></div>
      <div class="pi-reu__d"><small>Falta un paso</small><b>Coordinar la reunión</b><span>Elegí hasta 3 horarios y nosotros confirmamos uno.</span>
      <div class="pi-reu__b"><button class="btn" type="button" data-ir="reunion">Solicitar reunión</button></div></div></div>`;
  }

  $('pre-centro').innerHTML = `<div class="rq-card rq-est">
    <div><span class="rq-badge rq-badge--pend">Etapa actual</span><h2 class="pi-h">${esc(etapa)}</h2><p class="pi-p">${esc(msg)}</p></div>
    ${bloque}
  </div>`;

  $('pre-ring-n').textContent = pasosAplican().length + '/' + pasosAplican().length;
  // Tu preparación: un renglón por paso (cada uno lleva a editar ese paso; el relevamiento ya no se edita)
  const lista = NOMBRES_PASOS.map((nom, i) => ({ nom, n: i + 1 })).filter(x => pasoAplica(x.n));
  $('pre-prog').innerHTML = `<div class="pc-h"><div><div class="rq-next__t">Tu preparación</div><p>Podés cambiar o borrar lo que cargaste hasta que arranque la implementación.</p></div><span class="pc-n">${lista.length}/${lista.length}</span></div>
    <div class="pc-bar"><i></i></div>
    <div class="pc-l">${lista.map(({ nom, n }, i) => {
      let accion = `<button class="pc-b" type="button" data-editar-paso="${n}">Editar</button>`;
      if (n === 7) accion = '<span class="pc-ok">Enviado</span>';
      if (n === 8) accion = (r && r.estado === 'pendiente') ? '<button class="pc-b" type="button" data-ir="reunion">Cambiar</button>' : '<button class="pc-b" type="button" data-ir="reunion">Ver</button>';
      return `<div class="pc-i"><span class="pc-d">${i + 1}</span><span class="pc-t">${esc(nom)}</span>${accion}</div>`;
    }).join('')}</div>`;

  // Lo que fuiste completando: línea de tiempo con ícono por tipo
  const SV = {
    emp: '<path d="M3 21V7l8-4v18M21 21V11l-10-3"/><path d="M7 9h2M7 13h2M7 17h2M15 14h2M15 18h2"/>',
    usr: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    cant: '<path d="M3 21V10l6 4V10l6 4V6h4v15z"/>',
    doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    rel: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/>',
    reu: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>'
  };
  const ev = eventosCliente();
  $('pre-tl').innerHTML = `<div class="pc-h"><div><div class="rq-next__t">Lo que fuiste completando</div><p>Tu actividad en el portal, de lo más nuevo a lo más viejo.</p></div><span class="pc-n">${ev.length}</span></div>` + (ev.length
    ? `<div class="pt-l">${ev.map(e => `<div class="pt-i"><span class="pt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SV[e.ico] || SV.ok}</svg></span><div class="pt-c"><b>${esc(e.txt)}</b><small>${esc(fechaHora(e.iso))}</small></div></div>`).join('')}</div>`
    : '<div class="vacio">Todavía no hay movimientos.</div>');
}
