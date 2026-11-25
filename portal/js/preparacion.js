// ───────────── Preparación: los 8 pasos antes de arrancar la implementación ─────────────
// El estado de cada paso lo calcula la base (portal_prep_estado): acá solo se dibuja.
// Los pasos se pueden completar en cualquier orden; se sugiere siempre el primero pendiente.
const TIT_PASO = {
  1: 'Completá los datos de tu empresa', 2: 'Completá la información adicional', 3: 'Indicanos quiénes van a usar Salario',
  4: 'Subí el logo y la firma de tu empresa', 5: 'Subí tus liquidaciones y el Excel de control',
  6: 'Indicanos cuántas empresas vas a liquidar', 7: 'Completá el relevamiento inicial', 8: 'Solicitá tu reunión de inicio'
};
let _pasosPrevios = null;               // cuántos pasos había completos la vez anterior (para el "¡Muy bien!")
const _sucio = { 3: false, 6: false };  // el cliente está escribiendo: no pisarle lo que tipea

function claseDelPaso(e) {
  if (e.completo && e.revision === 'ajustes') return 'ajus';
  if (e.completo && e.revision === 'en_revision') return 'rev';
  return e.completo ? 'done' : '';
}

function renderPrep() {
  if (!P.pasos.length) return;
  const pasos = pasosAplican().map(n => ({ n, e: paso(n) }));
  const total = pasos.length;
  const hechos = pasos.filter(x => x.e.completo && x.e.revision !== 'ajustes').length;
  const sug = pasos.find(x => !(x.e.completo && x.e.revision !== 'ajustes'));

  document.querySelectorAll('#tl .st').forEach(st => {
    const n = +st.dataset.n, e = paso(n), cl = claseDelPaso(e);
    const esSug = !!sug && sug.n === n && cl !== 'done' && cl !== 'rev';
    st.className = 'st ' + cl + (esSug ? ' cur' : '');
    st.querySelector('.num').textContent = (cl === 'done' || cl === 'rev') ? '✓' : n;
    // Etiqueta de estado
    const ch = st.querySelector('[data-chip]');
    if (cl === 'done') { ch.className = 'chip c-ok'; ch.textContent = e.revision === 'revisado' ? 'Revisado por Salario' : (n === 8 ? 'Solicitada' : 'Completo'); }
    else if (cl === 'rev') { ch.className = 'chip c-az'; ch.textContent = 'En revisión'; }
    else if (cl === 'ajus') { ch.className = 'chip c-wa'; ch.textContent = 'Necesita un ajuste'; }
    else if (esSug) { ch.className = 'chip c-or'; ch.textContent = 'Te toca a vos'; }
    else { ch.className = 'chip c-gr'; ch.textContent = 'Pendiente'; }
    // Comentario del equipo
    const fb = st.querySelector('[data-fb]');
    if (fb) { fb.hidden = !e.comentario; fb.innerHTML = e.comentario ? '<b>Salario te dejó un comentario:</b> “' + esc(e.comentario) + '”' : ''; }
  });

  // Encabezado y "próximo paso"
  $('prep-hola').textContent = 'Hola, ' + P.cliente.nombre;
  $('ring').style.setProperty('--p', Math.round(hechos / total * 100));
  $('ring-n').textContent = hechos + '/' + total;
  $('hs-n').textContent = total;
  $('tp-n').textContent = hechos + ' de ' + total; $('tp-fill').style.width = Math.round(hechos / total * 100) + '%';   // barra del encabezado
  let m;
  if (!sug) m = '¡Listo, completaste todo! Ahora nuestro equipo prepara tu implementación y te avisamos acá cuando arranque.';
  else if (hechos <= 1) m = 'Te acompaño paso a paso. Podés hacerlos en el orden que quieras, pero te sugiero este primero.';
  else if (hechos === total - 1) m = '¡Último paso! Con esto terminás la preparación.';
  else m = ((_pasosPrevios !== null && hechos > _pasosPrevios) ? '¡Muy bien! ' : '') + 'Ya llevás ' + hechos + ' de ' + total + '. Te sugiero seguir con este.';
  _pasosPrevios = hechos;
  $('nx-t').textContent = sug ? TIT_PASO[sug.n] : 'Preparación completa';
  $('nx-m').textContent = m;
  $('nx-b').hidden = !sug;

  // Paso 1: formulario directo en la tarjeta (razón social y CUIT); se carga una vez para no pisar lo que está escribiendo
  const grilla = (filas) => filas.filter(f => f[1] !== null && f[1] !== undefined && f[1] !== '').map(f => `<div><small>${esc(f[0])}</small><b>${esc(String(f[1]))}</b></div>`).join('');
  $('s1-meta').innerHTML = 'Nombre comercial: <b>' + esc(P.cliente.nombre) + '</b>' + (P.cliente.tipo ? ' · Tipo: <b>' + esc(_TIPO_CLI[P.cliente.tipo] || P.cliente.tipo) + '</b>' : '');
  if (!renderPrep._p1) {
    renderPrep._p1 = true;
    $('s1-razon').value = (P.principal && P.principal.razon_social) || '';
    $('s1-cuit').value = (P.principal && P.principal.cuit) || '';
  }
  // Paso 7: si ya lo aprobó, muestra quién y cuándo (no se edita: ya lo recibió el equipo)
  const ap = P.relevAprob, d7 = $('st7-datos');
  d7.hidden = !ap; $('st7-tip').hidden = !!ap;
  if (ap) d7.innerHTML = grilla([['Estado', 'Aprobado y enviado al equipo'], ['Aprobado por', ap.aprobado_por], ['Fecha', ap.aprobado_at ? fmtFechaLarga(ap.aprobado_at) : '']]);
  $('st7-ir').hidden = !!ap;
  // Paso 8: horarios que pidió o reunión confirmada
  const rr = (P.reuniones || []).find(x => ['pendiente', 'confirmada', 'realizada'].includes(x.estado)), d8 = $('st8-datos');
  d8.hidden = !rr; $('st8-tip').hidden = !!rr;
  if (rr) {
    const hs = x => (typeof fechaHora === 'function' ? fechaHora(x) : x);
    if (rr.estado === 'pendiente') d8.innerHTML = grilla([['Estado', 'Esperando que confirmemos un horario'], ['Horarios que propusiste', (rr.propuestas || []).map(hs).join(' · ')]]);
    else d8.innerHTML = grilla([['Estado', rr.estado === 'realizada' ? 'Realizada' : 'Confirmada'], ['Fecha y hora', rr.confirmado_inicio ? hs(rr.confirmado_inicio) : ''], ['Link de Meet', rr.meet_url]]);
    $('st8-ir').textContent = rr.estado === 'pendiente' ? 'Cambiar horarios' : 'Ver reunión';
  } else $('st8-ir').textContent = 'Solicitar reunión';

  // Paso 2: se abre solo si falta completar o necesita ajuste; se llena con lo ya cargado (si no está tipeando)
  if (P.principal && !renderPrep._p2) {
    renderPrep._p2 = true;
    $('f-domicilio2').value = P.principal.domicilio || ''; opcionesTipo('f-tipo2', P.principal.tipo_empleador || '');
    $('f-legajos2').value = P.principal.cant_legajos ?? '';
    CB2.os.set(P.principal.obra_social || ''); CB2.art.set(P.principal.art || ''); CB2.act.set(P.principal.actividad_principal || '');
    $('f-conv2').value = P.principal.convenios || '';
  }
  $('st2d').classList.add('on');

  // Paso 3: cantidad y nombres
  if (!_sucio[3]) {
    const nombres = P.usuarios.map(u => u.nombre);
    $('n-cant').textContent = Math.max(1, nombres.length || +$('n-cant').textContent);
    dibujarListaUsuarios(nombres);
  }
  // Paso 6: cantidad de empresas
  if (!_sucio[6]) $('e-cant').textContent = (P.prep && P.prep.empresas_declaradas) || +$('e-cant').textContent || 1;

  // Pasos 4 y 5: archivos
  renderFilasArchivo('up4'); renderFilasArchivo('up5');
}
// ── Asistente: línea horizontal, un paso por vez ──
// Al completar el paso que está viendo, avanza solo al siguiente pendiente. Tocando un punto anterior
// puede volver a corregirlo. Con los 8 completos pasa a la pantalla de Implementación.
const V = { act: null, ok: null };
const NOMBRE_CORTO = ['Empresa', 'Información', 'Usuarios', 'Logo y firma', 'Liquidaciones', 'Empresas', 'Relevamiento', 'Reunión'];
const okPaso = n => { if (!pasoAplica(n)) return true; const e = paso(n); return !!e.completo && e.revision !== 'ajustes'; };
// Solo se puede avanzar a un paso si todos los anteriores (los que le corresponden al cliente) están completos
const puedeIrA = n => pasosAplican().every(m => m >= n || okPaso(m));
const MSG_FALTA = { 4: 'Subí el logo y la firma para poder continuar.', 5: 'Subí las dos liquidaciones para poder continuar.', 7: 'Aprobá el relevamiento para poder continuar.' };
function primeroPendiente(desde) {
  for (let k = 0; k < 8; k++) { const n = ((desde - 1 + k) % 8) + 1; if (pasoAplica(n) && !okPaso(n)) return n; }
  return null;
}
function renderAsistente() {
  if (!P.pasos.length) return;
  const ahora = [1, 2, 3, 4, 5, 6, 7, 8].map(okPaso);
  if (V.act === null) V.act = primeroPendiente(1) || 1;
  else if (V.ok && !V.ok[V.act - 1] && ahora[V.act - 1]) {            // completó el paso que estaba viendo
    const sig = primeroPendiente(V.act + 1);
    if (sig) V.act = sig;
    else if (vistaActual === 'prep') { V.ok = ahora; irA('impl'); return; }
  }
  V.ok = ahora;
  const aplican = pasosAplican();
  $('hstep').innerHTML = aplican.map((n, pos) => {
    const nom = NOMBRE_CORTO[n - 1], e = paso(n), cl = claseDelPaso(e);
    return `<div class="hs ${cl} ${n === V.act ? 'cur' : ''} ${puedeIrA(n) ? '' : 'lock'}" style="--i:${pos}" data-hs="${n}" title="${esc(puedeIrA(n) ? TIT_PASO[n] : 'Completá los pasos anteriores para llegar acá')}"><small>${String(pos + 1).padStart(2, '0')}</small><div class="c"><i>${(cl === 'done' || cl === 'rev') ? '✓' : ''}</i></div><span>${nom}</span></div>`;
  }).join('');
  document.querySelectorAll('#tl .st').forEach(st => st.classList.toggle('vista', +st.dataset.n === V.act));
  const todo = ahora.every(Boolean);
  $('wz-ant').hidden = V.act === aplican[0]; $('wz-sig').hidden = V.act === 8; $('wz-fin').hidden = !todo;
  // Animación de entrada del paso mostrado
  const vis = document.querySelector('#tl .st.vista .st-b'); if (vis) { vis.classList.remove('wz-in'); void vis.offsetWidth; vis.classList.add('wz-in'); }
}
$('hstep').addEventListener('click', ev => {
  const h = ev.target.closest('[data-hs]'); if (!h) return;
  const n = +h.dataset.hs;
  if (!puedeIrA(n)) { const f = primeroPendiente(1); toast('Primero completá el paso ' + (pasosAplican().indexOf(f) + 1) + ': ' + NOMBRE_CORTO[f - 1] + '.'); return; }
  V.act = n; renderAsistente();
});
// "Listo, ir al inicio": refresca los datos y pasa a Implementación, donde aparece el menú lateral
// con lo cargado y el estado de la reunión (esperando confirmación)
$('wz-fin').addEventListener('click', async () => {
  try { await cargarTodo(true); } catch (e) { /* si falla el refresco, igual se muestra con lo que hay */ }
  irA('impl');
});
$('wz-ant').addEventListener('click', () => { { const a = pasosAplican(), i = a.indexOf(V.act); V.act = a[Math.max(0, i - 1)]; } renderAsistente(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
// Siguiente: en los pasos con datos, primero guarda (si falta algo avisa y no avanza); después pasa al próximo.
// Se puede volver con Anterior o tocando un punto para corregir lo cargado.
$('wz-sig').addEventListener('click', async () => {
  const antes = V.act, btn = $('wz-sig'), g = GUARDAR_PASO[antes];
  if (g) { btn.disabled = true; const ok = await g(); btn.disabled = false; if (!ok) return; }
  if (!okPaso(antes)) { toast(MSG_FALTA[antes] || 'Completá este paso para poder continuar.'); return; }   // no avanza si el paso no está completo
  if (V.act === antes) { const a = pasosAplican(), i = a.indexOf(V.act); V.act = a[Math.min(a.length - 1, i + 1)]; renderAsistente(); }   // (si al guardar ya avanzó solo, no se salta otro)
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
// Desde otras pantallas (ej. la línea resumida): abrir la preparación en un paso puntual
function irAPaso(n) { if (!puedeIrA(n)) n = primeroPendiente(1) || n; V.act = n; irA('prep'); renderAsistente(); }

RENDERS.push(renderPrep);
RENDERS.push(renderAsistente);
ALENTRAR.prep = () => { renderPrep(); renderAsistente(); };

// ── Paso 1 y 2 ──
async function guardarPaso2() {
  if (!P.principal) { toast('Primero completá los datos de tu empresa (paso 1).'); return false; }
  const os = CB2.os.get(), art = CB2.art.get(), act = CB2.act.get(), conv = $('f-conv2').value.trim();
  const dom = $('f-domicilio2').value.trim(), tipo = $('f-tipo2').value.trim(), leg = $('f-legajos2').value.trim();
  if (!dom || !tipo || !leg || !os || !art || !act || !conv) { toast('Completá todos los datos: domicilio, tipo de empleador, legajos, obra social, ART, actividad y convenios.'); return false; }
  if (!/^\d+$/.test(leg)) { toast('La cantidad de legajos tiene que ser un número entero.'); return false; }
  const q = P.principal;
  if (paso(2).completo && q.domicilio === dom && q.tipo_empleador === tipo && q.cant_legajos === parseInt(leg, 10) && q.obra_social === os && q.art === art && q.actividad_principal === act && q.convenios === conv) return true;   // sin cambios
  const error = await guardarEmpresa({ domicilio: dom, tipo_empleador: tipo, cant_legajos: parseInt(leg, 10), obra_social: os, art, actividad_principal: act, convenios: conv }, P.principal.id, true);
  if (error) { toast('No se pudo guardar. Probá de nuevo.'); return false; }
  toast('Guardado. Nuestro equipo lo revisa.');
  renderPrep._p2 = false;
  await cargarTodo(false);
  return true;
}
$('st2-guardar').addEventListener('click', guardarPaso2);

// ── Paso 1: razón social y CUIT (formulario directo en la tarjeta) ──
async function guardarPaso1() {
  const err = t => { const e = $('s1-err'); e.textContent = t || ''; e.hidden = !t; return false; };
  err('');
  const razon = $('s1-razon').value.trim();
  if (!razon) { $('s1-razon').focus(); return err('Escribí la razón social.'); }
  const c = validarCuit($('s1-cuit').value);
  if (c.error) { $('s1-cuit').focus(); return err(c.error); }
  if (!c.cuit) { $('s1-cuit').focus(); return err('Escribí el CUIT.'); }
  const q = P.principal;
  if (q && paso(1).completo && q.razon_social === razon && q.cuit === c.cuit) return true;   // sin cambios
  const error = await guardarEmpresa({ razon_social: razon, cuit: c.cuit }, q ? q.id : null, true);
  if (error) return err('No se pudo guardar. Probá de nuevo en unos segundos.');
  await cargarTodo(false);
  return true;
}
$('s1-razon').addEventListener('input', () => { $('s1-err').hidden = true; });
$('s1-cuit').addEventListener('input', () => { $('s1-err').hidden = true; });

// ── Paso 3: usuarios de Salario ──
function dibujarListaUsuarios(nombres) {
  const n = +$('n-cant').textContent;
  const actuales = [...document.querySelectorAll('#n-lista .n-in')].map(i => i.value);
  const base = (nombres && nombres.length) ? nombres : actuales;
  $('n-lista').innerHTML = Array.from({ length: n }, (_, i) =>
    `<label>${n === 1 ? 'Nombre y apellido' : 'Persona ' + (i + 1)}</label><input class="n-in" maxlength="120" placeholder="Nombre y apellido" value="${esc(base[i] || '')}" />`).join('');
}
function cambiarCantidad(id, delta, min, max, alCambiar) {
  const el = $(id), v = Math.min(max, Math.max(min, +el.textContent + delta));
  el.textContent = v; if (alCambiar) alCambiar();
}
$('n-menos').addEventListener('click', () => { _sucio[3] = true; cambiarCantidad('n-cant', -1, 1, 30, () => dibujarListaUsuarios()); });
$('n-mas').addEventListener('click', () => { _sucio[3] = true; cambiarCantidad('n-cant', 1, 1, 30, () => dibujarListaUsuarios()); });
$('n-lista').addEventListener('input', () => { _sucio[3] = true; });
async function guardarPaso3() {
  if (!_sucio[3] && paso(3).completo) return true;   // sin cambios
  const nombres = [...document.querySelectorAll('#n-lista .n-in')].map(i => i.value.trim());
  if (nombres.some(x => x.length < 2)) { toast('Completá el nombre y apellido de cada persona.'); return false; }
  const { error } = await sb.rpc('portal_guardar_usuarios', { p_nombres: nombres });
  if (error) { toast(error.message || 'No se pudo guardar.'); return false; }
  _sucio[3] = false;
  toast('Listo. Avisamos a nuestro equipo de programación para que cree ' + (nombres.length === 1 ? '1 acceso.' : nombres.length + ' accesos.'));
  await cargarTodo(false);
  return true;
}
$('n-guardar').addEventListener('click', guardarPaso3);

// ── Paso 6: cantidad de empresas ──
$('e-menos').addEventListener('click', () => { _sucio[6] = true; cambiarCantidad('e-cant', -1, 1, 200); });
$('e-mas').addEventListener('click', () => { _sucio[6] = true; cambiarCantidad('e-cant', 1, 1, 200); });
async function guardarPaso6() {
  if (!_sucio[6] && paso(6).completo) return true;   // sin cambios
  const n = +$('e-cant').textContent;
  const { error } = await sb.rpc('portal_guardar_cantidad_empresas', { p_cant: n });
  if (error) { toast(error.message || 'No se pudo guardar.'); return false; }
  _sucio[6] = false;
  toast('Listo. Anotamos ' + (n === 1 ? '1 empresa.' : n + ' empresas.') + ' Las cargás con todos sus datos cuando arranque la implementación.');
  await cargarTodo(false);
  return true;
}
$('e-guardar').addEventListener('click', guardarPaso6);

// Qué guarda "Siguiente" en cada paso (los demás pasos solo avanzan)
const GUARDAR_PASO = { 1: guardarPaso1, 2: guardarPaso2, 3: guardarPaso3, 6: guardarPaso6 };

// ── Pasos 7 y 8 y botón "Continuar" ──
$('st7-ir').addEventListener('click', () => irA('relev'));
$('st8-ir').addEventListener('click', () => irA('reunion'));
$('nx-b').addEventListener('click', () => { const n = primeroPendiente(1); if (n) { V.act = n; renderAsistente(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
