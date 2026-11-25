// ───────────── Reunión de inicio (paso 8) ─────────────
// El cliente propone hasta 3 horarios (lunes a viernes) y el equipo confirma uno con el link de Meet.
// Todo se escribe con funciones de la base (portal_solicitar_reunion / portal_cancelar_reunion).
const REU = { editando: false, filas: [], firma: null };
// Horario de reuniones: de 9:00 a 12:00 y de 14:00 a 16:00 (horas de inicio posibles).
const HORAS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TZ = 'America/Argentina/Buenos_Aires';

const fmtHorario = iso => {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  const dia = p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1);
  const fin = new Date(d.getTime() + 45 * 60000);
  const hf = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(fin);
  return `${dia} ${p.day}/${p.month} · ${p.hour}:${p.minute} a ${hf}`;
};
// Partes de un horario para dibujar el "calendario": día de la semana, número, mes y hora de inicio y fin
function tileHorario(iso) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  const hf = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d.getTime() + 45 * 60000));
  return { dia: p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1), num: p.day, mes: String(p.month).replace('.', ''), hi: p.hour + ':' + p.minute, hf };
}
// Fecha (YYYY-MM-DD) + hora → instante en hora de Argentina (UTC-3, sin horario de verano)
const aInstante = (fecha, hora) => new Date(`${fecha}T${hora}:00-03:00`);
const esFinDeSemana = fecha => { const d = new Date(fecha + 'T12:00:00Z').getUTCDay(); return d === 0 || d === 6; };
const manana = () => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); };

function reunionActiva() { return (P.reuniones || []).find(r => ['pendiente', 'confirmada', 'realizada'].includes(r.estado)) || null; }

function filaHorario(i, f) {
  return `<div class="rq-slot" data-fila="${i}">
    <div class="rq-slot__h"><span class="rq-slot__n">Opción ${i + 1}</span>${REU.filas.length > 1 ? `<button type="button" class="rq-x" data-r="quitar" data-i="${i}" title="Quitar este horario">Quitar</button>` : ''}</div>
    <span class="rq-l">Fecha</span><input type="date" data-r="fecha" min="${manana()}" value="${esc(f.fecha)}" />
    <span class="rq-l">Hora</span><select data-r="hora">${HORAS.map(h => `<option ${h === f.hora ? 'selected' : ''}>${h}</option>`).join('')}</select>
    <small class="rq-slot__f">45 min · Google Meet</small></div>`;
}
function htmlFormulario(r) {
  if (!REU.filas.length) REU.filas = [{ fecha: '', hora: '09:00' }];
  return `<div class="rq-card"><div class="rq-card__h"><h2>Elegí hasta 3 horarios</h2>
    <p>Proponé las opciones que mejor te queden y nosotros confirmamos una. Dura aprox. 45 minutos: revisamos juntos tus datos y te explicamos cómo sigue la implementación.</p></div>
    <div class="rq-nota"><span class="rq-nota__i">i</span><p>Conviene que estén las personas que van a usar Salario y quien tome las decisiones. Los horarios son de lunes a viernes, de 9:00 a 12:00 y de 14:00 a 16:00.</p></div>
    <div id="reu-error" class="msg-error" hidden></div>
    <div class="rq-slots" id="reu-filas">${REU.filas.map((f, i) => filaHorario(i, f)).join('')}${REU.filas.length < 3 ? '<button type="button" class="rq-mas" data-r="mas"><b>+</b>Agregar otro horario</button>' : ''}</div>
    <span class="rq-l" style="margin-top:22px">Algo que quieras contarnos antes (opcional)</span>
    <input id="reu-com" class="rq-com" maxlength="300" placeholder="Ej.: somos 3 personas en administración" value="${esc(r ? r.comentario_cliente || '' : '')}" />
    <div class="rq-acc">${r ? '<button class="btn sec" type="button" data-r="cancelar-edicion">Volver</button>' : ''}<button class="btn" type="button" data-r="enviar">${r ? 'Guardar cambios' : 'Solicitar reunión'}</button></div></div>`;
}
function renderReunion() {
  const cont = $('reunion-cont'); if (!cont || !P.cliente) return;
  const r = reunionActiva();
  const firma = JSON.stringify([r && r.estado, r && r.propuestas, r && r.confirmado_inicio, r && r.meet_url, REU.editando]);
  if (vistaActual === 'reunion' && firma === REU.firma) return;      // sin cambios: no pisar lo que se está escribiendo
  REU.firma = firma;
  let html;
  if (!r || r.estado === 'cancelada') html = htmlFormulario(null);
  else if (r.estado === 'pendiente' && REU.editando) html = htmlFormulario(r);
  else if (r.estado === 'pendiente') {
    html = `<div class="rq-card rq-est">
      <div class="rq-est__top"><div class="rq-pulse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div>
        <div><span class="rq-badge rq-badge--pend">Pendiente de confirmación</span><h2>Recibimos tu solicitud de reunión</h2>
        <p>Estamos revisando los horarios que propusiste. Apenas confirmemos uno, te aparece acá el link de Meet.</p></div></div>
      <div class="rq-prog"><div class="rq-prog__i ok"><span>✓</span>Solicitud enviada</div><i class="rq-prog__l ok"></i><div class="rq-prog__i act"><span>2</span>Confirmamos un horario</div><i class="rq-prog__l"></i><div class="rq-prog__i"><span>3</span>Recibís el link de Meet</div></div>
      <div class="rq-h">Los horarios que propusiste</div>
      <div class="rq-tiles">${r.propuestas.map((h, i) => { const t = tileHorario(h); return `<div class="rq-tile"><div class="rq-cal"><span>${esc(t.dia)}</span><b>${esc(t.num)}</b><span>${esc(t.mes)}</span></div><div class="rq-tile__t"><small>Opción ${i + 1}</small><b>${esc(t.hi)} a ${esc(t.hf)}</b><span>Google Meet · 45 min</span></div></div>`; }).join('')}</div>
      ${r.comentario_cliente ? `<div class="rq-com-ok"><small>Tu comentario</small>${esc(r.comentario_cliente)}</div>` : ''}
      <div class="rq-acc rq-acc--l"><button class="btn sec" type="button" data-r="editar">Cambiar horarios</button><button class="btn sec" type="button" data-r="cancelar">Cancelar solicitud</button></div></div>`;
  } else {
    const t = tileHorario(r.confirmado_inicio), real = r.estado === 'realizada';
    html = `<div class="rq-card rq-est rq-conf">
      <div class="rq-est__top"><div class="rq-pulse rq-pulse--ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div><span class="rq-badge rq-badge--ok">${real ? 'Reunión realizada' : 'Reunión confirmada'}</span><h2>Reunión de inicio${r.confirmado_por ? ' con ' + esc(r.confirmado_por) : ''}</h2>
        <p>${real ? 'Ya nos juntamos. Ahora el equipo arma tu cronograma de implementación.' : 'Ya tenemos fecha. Te esperamos por Google Meet.'}</p></div></div>
      <div class="rq-conf__hero"><div class="rq-cal rq-cal--xl"><span>${esc(t.dia)}</span><b>${esc(t.num)}</b><span>${esc(t.mes)}</span></div>
        <div class="rq-conf__d"><small>Horario</small><b>${esc(t.hi)} a ${esc(t.hf)}</b><span>Google Meet · 45 min</span>
        ${!real && r.meet_url ? `<a class="btn rq-meet" href="${esc(r.meet_url)}" target="_blank" rel="noopener">Unirme al Meet</a>` : ''}</div></div>
      ${real ? '' : `<div class="rq-h">Para llegar preparado</div>
      <div class="rq-prep"><div><b>1</b>Tené a mano el relevamiento y una liquidación reciente.</div><div><b>2</b>Probá el link de Meet unos minutos antes.</div><div><b>3</b>Si no podés asistir, avisanos con tiempo y reprogramamos.</div></div>
      <p class="rq-pie">Mientras tanto podés revisar o corregir tus datos. Después de la reunión arranca tu implementación con todas las tareas.</p>`}
    </div>`;
  }
  cont.innerHTML = /^\s*<div class="rq-card/.test(html) ? html : `<div class="card" id="rq">${html}</div>`;
  const aplican = pasosAplican(), hecho = aplican.filter(n => paso(n).completo).length;
  
  $('reu-sig-conf').classList.toggle('ok', !!(r && ['confirmada', 'realizada'].includes(r.estado)));
}
const errReu = t => { const e = $('reu-error'); if (e) { e.textContent = t || ''; e.hidden = !t; } };
function leerFilas() {
  REU.filas = [...document.querySelectorAll('#reu-filas [data-fila]')].map(el => ({ fecha: el.querySelector('[data-r=fecha]').value, hora: el.querySelector('[data-r=hora]').value }));
}
$('v-reunion').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-r]'); if (!b) return;
  const a = b.dataset.r;
  if (a === 'mas') { leerFilas(); REU.filas.push({ fecha: '', hora: '09:00' }); REU.firma = null; renderReunion(); return; }
  if (a === 'quitar') { leerFilas(); REU.filas.splice(+b.dataset.i, 1); REU.firma = null; renderReunion(); return; }
  if (a === 'editar') {
    const r = reunionActiva();
    REU.filas = r.propuestas.map(h => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date(h)).map(x => [x.type, x.value])); return { fecha: `${p.year}-${p.month}-${p.day}`, hora: p.hour.padStart(2, '0') + ':00' }; });
    REU.editando = true; renderReunion(); return;
  }
  if (a === 'cancelar-edicion') { REU.editando = false; renderReunion(); return; }
  if (a === 'cancelar') {
    if (!confirm('¿Querés cancelar la solicitud de reunión?')) return;
    const { error } = await sb.rpc('portal_cancelar_reunion');
    if (error) { toast(error.message || 'No se pudo cancelar.'); return; }
    REU.filas = []; REU.editando = false; toast('Solicitud cancelada.'); await cargarTodo(false); renderReunion(); return;
  }
  if (a === 'enviar') {
    leerFilas(); errReu('');
    if (REU.filas.some(f => !f.fecha)) { errReu('Elegí la fecha de cada horario (o quitá el que no uses).'); return; }
    if (REU.filas.some(f => esFinDeSemana(f.fecha))) { errReu('Los horarios tienen que ser de lunes a viernes.'); return; }
    const inst = REU.filas.map(f => aInstante(f.fecha, f.hora));
    if (inst.some(d => d.getTime() < Date.now())) { errReu('Los horarios tienen que ser futuros.'); return; }
    if (new Set(inst.map(d => d.getTime())).size !== inst.length) { errReu('Hay horarios repetidos.'); return; }
    b.disabled = true;
    const { error } = await sb.rpc('portal_solicitar_reunion', { p_propuestas: inst.map(d => d.toISOString()), p_comentario: ($('reu-com').value || '').trim() || null });
    b.disabled = false;
    if (error) { errReu(error.message || 'No se pudo enviar la solicitud.'); return; }
    REU.editando = false; REU.filas = []; toast('Recibimos tu solicitud. Te avisamos cuando la confirmemos.');
    await cargarTodo(false); REU.firma = null; renderReunion();
  }
});
RENDERS.push(renderReunion);
ALENTRAR.reunion = () => { REU.firma = null; renderReunion(); };

// Botón "Chatear con nosotros": abre el WhatsApp del equipo (número en compartido/config.js)
$('rq-chat').addEventListener('click', () => {
  const n = (typeof PORTAL_CONTACTO !== 'undefined' && PORTAL_CONTACTO.whatsapp || '').replace(/\D/g, '');
  if (!n) { toast('Estamos configurando el chat. Mientras tanto, escribinos por tu canal habitual.'); return; }
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(PORTAL_CONTACTO.mensaje || ''), '_blank', 'noopener');
});

// Sábados y domingos no se pueden elegir: apenas se marca uno, se borra y se avisa
$('v-reunion').addEventListener('change', ev => {
  const t = ev.target;
  if (!t.matches || !t.matches('[data-r=fecha]') || !t.value || !esFinDeSemana(t.value)) return;
  t.value = '';
  errReu('Las reuniones son de lunes a viernes: elegí otro día.');
  toast('Elegí un día de lunes a viernes.');
  t.focus();
});
// Al elegir un día válido se limpia el aviso
$('v-reunion').addEventListener('input', ev => { if (ev.target.matches && ev.target.matches('[data-r=fecha]') && ev.target.value && !esFinDeSemana(ev.target.value)) errReu(''); });

// Ayuda: botones de chat (mismo WhatsApp que el de la reunión) y buscador de preguntas frecuentes
['ay-chat', 'ay-chat2'].forEach(id => $(id).addEventListener('click', () => $('rq-chat').click()));
$('ay-q').addEventListener('input', () => {
  const t = $('ay-q').value.trim().toLowerCase(); let hay = 0;
  document.querySelectorAll('#v-ayuda .ay-q').forEach(d => { const ok = !t || d.textContent.toLowerCase().includes(t); d.hidden = !ok; if (ok) hay++; if (t && ok) d.open = true; });
  $('ay-nada').hidden = !!hay;
});
