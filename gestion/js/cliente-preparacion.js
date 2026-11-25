// ───────────── Clientes en "preparación" (cliente nuevo con acceso al portal que todavía no arrancó) ─────────────
// Estado que se calcula en el navegador a partir de portal_usuarios, portal_prep, portal_novedades y prep_pasos().
//  - Un cliente en preparación NO aparece en Disponibilidad: recién entra cuando se confirma el inicio (con fechas).
//  - Aviso en el Panel general cuando completó los 8 pasos ("armá el cronograma").
//  - Alerta cuando pasan PREP_DIAS_SIN_AVANCE días sin que complete nada.
const PREP_DIAS_SIN_AVANCE = 7;
window._prepEst = window._prepEst || {};   // cid -> { portal, iniciada, completos, alta, ultima }
let _prepCargando = false;

function implEnPrepRapido(cid) {
  const e = window._prepEst[cid];
  return !!(e && e.portal && !e.iniciada);
}

async function prepEstadoCargar() {
  if (_prepCargando || typeof sb !== 'function') return;
  _prepCargando = true;
  try {
    const [us, pr, nv] = await Promise.all([
      sb().from('portal_usuarios').select('cliente_id, created_at, activo'),
      sb().from('portal_prep').select('cliente_id, implementacion_iniciada_at'),
      sb().from('portal_novedades').select('cliente_id, created_at').order('created_at', { ascending: false }).limit(1000)
    ]);
    if (us.error) throw us.error;
    const est = {};
    (us.data || []).forEach(u => {
      const e = est[u.cliente_id] || (est[u.cliente_id] = { portal: false, iniciada: false, completos: 0, alta: u.created_at, ultima: null });
      if (u.activo) e.portal = true;
      if (u.created_at < e.alta) e.alta = u.created_at;
    });
    (pr.data || []).forEach(p => { if (est[p.cliente_id] && p.implementacion_iniciada_at) est[p.cliente_id].iniciada = true; });
    (nv.data || []).forEach(n => { const e = est[n.cliente_id]; if (e && !e.ultima) e.ultima = n.created_at; });   // vienen de más nuevo a más viejo
    // Cuántos pasos completó cada cliente que sigue en preparación
    await Promise.all(Object.keys(est).filter(cid => est[cid].portal && !est[cid].iniciada).map(async cid => {
      const r = await sb().rpc('prep_pasos', { p_cliente: cid });
      est[cid].completos = r.error ? 0 : (r.data || []).filter(x => x.completo).length;
    }));
    window._prepEst = est;
  } catch (e) { console.warn('No se pudo cargar el estado de preparación de clientes', e); }
  finally { _prepCargando = false; }
  if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
  if (typeof refreshAlertas === 'function') { try { refreshAlertas(); } catch (e) { /* se recalcula luego */ } }
  if (typeof renderImplementacion === 'function' && document.getElementById('implementacion')?.classList.contains('active')) renderImplementacion();
}

// Clientes que completaron los 8 pasos y todavía no se les dio el inicio (aviso del Panel general)
function prepListosPanel() {
  return Object.keys(window._prepEst)
    .filter(cid => { const e = window._prepEst[cid]; return e.portal && !e.iniciada && e.completos >= 8 && !(typeof ausAvisoVisto === 'function' && ausAvisoVisto('prepok:' + cid)); })
    .map(cid => ({ cid, nombre: (clientes.find(c => c.id === cid) || {}).nombre || 'Un cliente' }));
}
function prepAvisoIr(cid) {
  if (typeof ausAvisoMarcarVisto === 'function') ausAvisoMarcarVisto('prepok:' + cid);
  if (typeof goTo === 'function' && typeof _saludoNavBtn === 'function') goTo(_saludoNavBtn('implementacion'), 'implementacion');
  setTimeout(() => { if (typeof abrirClienteImpl === 'function') abrirClienteImpl(cid); }, 80);
}

// Clientes en preparación sin avances hace PREP_DIAS_SIN_AVANCE días o más (alerta)
function prepSinAvance() {
  const lim = Date.now() - PREP_DIAS_SIN_AVANCE * 86400000;
  return Object.keys(window._prepEst)
    .filter(cid => { const e = window._prepEst[cid]; return e.portal && !e.iniciada && e.completos < 8 && new Date(e.ultima || e.alta).getTime() <= lim; })
    .map(cid => {
      const e = window._prepEst[cid], desde = new Date(e.ultima || e.alta);
      return { cid, nombre: (clientes.find(c => c.id === cid) || {}).nombre || 'Un cliente', dias: Math.floor((Date.now() - desde) / 86400000), completos: e.completos, nunca: !e.ultima };
    });
}

window.addEventListener('app-ready', () => {
  setTimeout(prepEstadoCargar, 1500);
  setInterval(prepEstadoCargar, 120000);
  try {
    let t = null; const luego = () => { clearTimeout(t); t = setTimeout(prepEstadoCargar, 1200); };
    sb().channel('prep-estado')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_prep' }, luego)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_novedades' }, luego)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_usuarios' }, luego)
      .subscribe();
  } catch (e) { console.warn('Sin realtime del estado de preparación', e); }
});

// ───────────── Confirmar inicio: pide fecha de inicio y fecha objetivo, calcula el fin y recién ahí arranca ─────────────
function inicioFechasAbrir(cid) {
  const c = clientes.find(x => x.id === cid); if (!c) return;
  const pp = (typeof _reuPrep !== 'undefined') ? _reuPrep[cid] : null;
  const faltan = pp ? pp.pasos.filter(x => !x.completo).length : 0;   // los pasos que no aplican ya vienen completos desde la base
  let m = document.getElementById('modal-inicio-impl');
  if (!m) {
    m = document.createElement('div'); m.id = 'modal-inicio-impl'; m.className = 'kb-modal-overlay'; m.style.display = 'none';
    m.onclick = ev => { if (ev.target === m) inicioFechasCerrar(); };
    document.body.appendChild(m);
  }
  // Fecha local (no UTC) para que de noche no cuente como mañana
  const d0 = new Date(), hoy = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  m.innerHTML = `<div class="kb-modal acp"><div class="acp__head"><div><div class="acp__t">🚀 Iniciar implementación</div><div class="acp__s">${_acEsc(c.nombre)}</div></div><button class="kb-modal-close" onclick="inicioFechasCerrar()" style="font-size:18px">✕</button></div>
    <div class="acp__body">
      ${faltan ? `<p class="acp__err" style="margin-bottom:8px">Atención: al cliente le faltan ${faltan} pasos de la preparación.</p>` : ''}
      <p class="acp__p">Hoy arranca la implementación: se calcula el cronograma y el cliente entra a Disponibilidad. Indicá hasta cuándo querés terminarla. El cliente recibe el aviso y ve sus tareas y fechas.</p>
      <p class="acp__p"><b>Fecha de inicio: hoy</b> (${formatFechaImpl(hoy)}).</p>
      <label class="acp__l">Fecha objetivo de fin</label><input id="ini-f-obj" class="acp__in" type="date" value="${(c.fecha_fin_objetivo || '').substring(0, 10)}" />
      <p class="acp__msg" id="ini-msg"></p>
      <div class="acp__acc"><button class="btn-primary" id="ini-ok" onclick="inicioFechasConfirmar('${cid}')">Iniciar implementación</button><button class="btn-secondary" onclick="inicioFechasCerrar()">Cancelar</button></div>
    </div></div>`;
  m.style.display = 'flex'; m.classList.add('kb-modal--open');
}
function inicioFechasCerrar() { const m = document.getElementById('modal-inicio-impl'); if (m) { m.style.display = 'none'; m.classList.remove('kb-modal--open'); } }

async function inicioFechasConfirmar(cid) {
  const d0 = new Date(), ini = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');   // hoy
  const obj = document.getElementById('ini-f-obj').value;
  const msg = t => { document.getElementById('ini-msg').textContent = t || ''; };
  if (!obj) { msg('Elegí la fecha objetivo de fin.'); return; }
  if (obj < ini) { msg('La fecha objetivo no puede ser anterior a hoy.'); return; }
  const btn = document.getElementById('ini-ok'); btn.disabled = true; btn.textContent = 'Iniciando…';
  try {
    const c = clientes.find(x => x.id === cid);
    await dbUpdate('clientes', cid, { fecha_inicio_implementacion: ini, fecha_fin_objetivo: obj });
    if (c) { c.fecha_inicio_implementacion = ini; c.fecha_fin_objetivo = obj; }
    await recalcularGanttCliente(cid);                       // fechas de inicio y fin de cada tarea
    const { error } = await sb().rpc('iniciar_implementacion', { p_cliente: cid });   // avisa al cliente y le abre sus tareas
    if (error) throw error;
    inicioFechasCerrar();
    // Fin calculado = última fecha estimada de sus tareas
    const fines = implTareas.filter(t => t.cliente_id === cid).map(t => t.fecha_estimada).filter(Boolean).sort();
    const fin = fines.length ? fines[fines.length - 1].substring(0, 10) : null;
    toast('Implementación iniciada' + (fin ? ` · fin calculado: ${formatFechaImpl(fin)}` : '') + '. Le avisamos al cliente.');
    if (fin && fin > obj) alert(`Ojo: el fin calculado (${formatFechaImpl(fin)}) pasa de la fecha objetivo (${formatFechaImpl(obj)}). Podés ajustar duraciones o el objetivo desde el detalle.`);
    if (window._prepEst[cid]) window._prepEst[cid].iniciada = true;
    if (typeof reunionEqCargar === 'function') await reunionEqCargar(cid);
    prepEstadoCargar();
  } catch (e) {
    console.error(e); btn.disabled = false; btn.textContent = 'Iniciar implementación';
    msg(e.message || 'No se pudo iniciar.');
  }
}
