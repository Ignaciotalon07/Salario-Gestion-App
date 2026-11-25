// ───────────────────────── Portal de implementación: base ─────────────────────────
// Misma base de Supabase que la plataforma del equipo, pero con OTRA clave de sesión:
// abrir el portal en tu navegador no pisa la sesión del equipo.
// La seguridad está en la base (RLS + vistas portal_* + funciones RPC), no en estos archivos.
// Login único: usa la MISMA sesión que la app del equipo (clave de sesión por defecto).
// Quien entra por el login de la raíz y es cliente llega acá; si es del equipo, se lo manda a su app.
const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(txt) {
  const t = $('toast'); t.textContent = txt; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3800);
}
function fmtFecha(f) {
  if (!f) return '';
  const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}
function fmtFechaLarga(f) {
  if (!f) return '';
  const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function hace(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'Recién';
  if (min < 60) return 'Hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'Hace ' + h + (h === 1 ? ' hora' : ' horas');
  const d = Math.round(h / 24);
  return d === 1 ? 'Ayer' : 'Hace ' + d + ' días';
}
const iniciales = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

// ── Datos del cliente en memoria (se recargan juntos; ver cargarTodo) ──
const P = {
  cliente: null,      // portal_mi_cliente
  email: '',
  empresas: [],       // cliente_empresas (la principal tiene es_principal)
  principal: null,
  docs: [],           // archivos que subió el cliente
  docsEquipo: [],     // archivos del equipo visibles para el cliente
  prep: null,         // portal_prep (cantidad de empresas declarada, inicio de la implementación)
  usuarios: [],       // portal_usuarios_salario
  pasos: [],          // portal_prep_estado: estado de cada paso de Preparación (1 a 8)
  etapas: [],         // portal_etapas
  avisos: [],         // portal_avisos (campanita)
  consultas: [],      // consultas de soporte del cliente (portal_mis_consultas)
  notasTarea: [],     // notas que el equipo compartió en las tareas (portal_tarea_notas)
  reuniones: [],      // portal_reuniones (reunión de inicio)
  relevPreg: [],      // relevamiento_preguntas (activas)
  relevResp: [],      // relevamiento_respuestas del cliente
  relevAprob: null,   // relevamiento_aprobacion (quién y cuándo aprobó)
  avisosOk: true      // false si todavía no existe la tabla (migración sin correr)
};
// Pasos que NO le corresponden según el tipo de cliente. Un estudio contable no carga su propia empresa en
// Salario (carga las de sus clientes), así que no pide información adicional, logo y firma ni liquidaciones.
// La base los marca como completos (migración 091) y acá se ocultan.
const PASOS_NO_APLICAN = { estudio: [2, 4, 5] };
const pasoAplica = n => !((PASOS_NO_APLICAN[P.cliente && P.cliente.tipo] || []).includes(n));
const pasosAplican = () => [1, 2, 3, 4, 5, 6, 7, 8].filter(pasoAplica);
// Los pasos de Preparación completos (y ninguno con un ajuste pendiente)
const prepCompleta = () => P.pasos.length >= 5 && pasosAplican().every(n => { const e = P.pasos.find(p => p.paso === n); return e && e.completo && e.revision !== 'ajustes'; });
const iniciada = () => !!(P.prep && P.prep.implementacion_iniciada_at);
const paso = n => P.pasos.find(p => p.paso === n) || { paso: n, completo: false, revision: null, comentario: null };

// ── Vistas ──
const VISTAS = ['inicio', 'bienvenida', 'prep', 'relev', 'reunion', 'impl', 'empresa', 'ayuda', 'config', 'consultas'];
const ALENTRAR = {};          // cada módulo registra qué dibujar al entrar a su vista
const RENDERS = [];           // funciones que redibujan cuando cambian los datos
let vistaActual = null;

// La bienvenida se muestra una sola vez, la primera vez que entra y todavía no empezó nada
const claveBienv = () => 'portal-bienvenida-' + (P.cliente ? P.cliente.id : '');
function bienvenidaVista() { try { return !!localStorage.getItem(claveBienv()); } catch (e) { return false; } }
function marcarBienvenidaVista() { try { localStorage.setItem(claveBienv(), '1'); } catch (e) { /* sin almacenamiento */ } }
// ¿Este cliente tiene Implementación? Los clientes de soporte de siempre no: solo ven "Mis consultas"
function tieneImpl() { return !!(P.cliente && (P.cliente.area === 'impl' || P.prep || (P.etapas && P.etapas.length))); }
function vistaBase() {
  if (!tieneImpl()) return 'consultas';
  if (!paso(1).completo && !bienvenidaVista()) return 'bienvenida';
  if (iniciada() || prepCompleta()) return 'impl';     // con los 8 pasos listos, "Implementación" muestra en qué etapa va
  return 'prep';
}
// Estado de las pestañas de Implementación: 'inicio' | 'empresas' | 'docs'
let tabImpl = 'inicio';
// ¿Está todavía armando su preparación? Mientras sea así NO se muestra el menú lateral en ninguna pantalla
// (ni en el relevamiento ni en la reunión): solo la barra de arriba. El menú aparece al terminar los pasos.
const enPreparacion = () => tieneImpl() && !iniciada() && !prepCompleta();
function irA(v) {
  if (v === 'docs') { tabImpl = 'docs'; v = 'impl'; }      // Documentos vive dentro de Implementación
  else if (v === 'empresas') { tabImpl = 'empresas'; v = 'impl'; }
  VISTAS.forEach(x => $('v-' + x).classList.toggle('on', x === v));
  vistaActual = v;
  document.body.classList.toggle('etapa-impl', iniciada());
  // La barra de secciones aparece pasada la Bienvenida; "Implementación" queda marcada dentro de su flujo
  const enPrep = enPreparacion();
  $('snav').hidden = enPrep || v === 'bienvenida'; $('snav2').hidden = $('snav').hidden;
  document.body.classList.toggle('onb', v === 'prep');                         // Preparación a pantalla completa, sin distracciones
  document.body.classList.toggle('enprep', enPrep && v !== 'bienvenida');      // en preparación: barra de arriba con el progreso
  document.body.classList.toggle('lateral', !enPrep && v !== 'bienvenida');    // menú lateral solo pasada la preparación
  $('sn-impl').classList.toggle('on', ['prep', 'relev', 'reunion', 'impl'].includes(v)); $('sn-cons').classList.toggle('on', v === 'consultas');
  $('sn-inicio').classList.toggle('on', v === 'inicio');
  $('sn-ayuda').classList.toggle('on', v === 'ayuda'); $('sn-config').classList.toggle('on', v === 'config');
  $('btn-perfil').classList.toggle('on', v === 'empresa');
  $('snav-sub').classList.toggle('open', v === 'impl');
  document.body.classList.toggle('rail', v === 'impl' && !enPrep);   // las secciones de Implementación solo se ven estando ahí
  window.scrollTo(0, 0);
  if (ALENTRAR[v]) ALENTRAR[v]();
  if (v === 'impl' && typeof aplicarTabImpl === 'function') aplicarTabImpl();
}
const volver = () => irA(vistaBase());
$('sn-impl').addEventListener('click', volver);
document.querySelector('.top .logo').addEventListener('click', () => { if (enPreparacion()) volver(); });   // en preparación, el logo vuelve a los pasos

// Login único: el formulario de ingreso es el de la raíz (index.html), no hay otro acá
function irAlLogin(aviso) {
  try { if (aviso) sessionStorage.setItem('login-aviso', aviso); } catch (e) { /* sin almacenamiento */ }
  window.location.replace('index.html');
}
function mostrar(vista) {
  $('vista-portal').hidden = vista !== 'portal';
}

// ── Salida ──
$('btn-salir').addEventListener('click', async () => { await sb.auth.signOut(); irAlLogin(); });

// ── Tema (Configuración) ──
function aplicarTema(t) {
  if (t === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  $('t-claro').classList.toggle('on', t !== 'oscuro');
  $('t-oscuro').classList.toggle('on', t === 'oscuro');
  try { localStorage.setItem('portal-tema', t); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}
$('t-claro').addEventListener('click', () => aplicarTema('claro'));
$('t-oscuro').addEventListener('click', () => aplicarTema('oscuro'));
try { aplicarTema(localStorage.getItem('portal-tema') === 'oscuro' ? 'oscuro' : 'claro'); } catch (e) { /* idem */ }

// Botones con data-ir (ir a una vista) y data-volver, en todo el portal
document.addEventListener('click', ev => {
  const ir = ev.target.closest('[data-ir]');
  if (ir) { irA(ir.dataset.ir); return; }
  if (ev.target.closest('[data-volver]')) volver();
});

// ── Campanita ──
const ICONO_AVISO = {
  reunion_confirmada: '📅', respuesta_equipo: '💬', paso_revisado: '✅', paso_ajustes: '📝',
  tiempo_respondido: '⏳', implementacion_iniciada: '🚀', tarea_completada: '✅', nota_tarea: '📝'
};
// Títulos fijos: así también quedan bien los avisos que ya se guardaron con otro texto
// Avisos leídos: se guardan también en este navegador, así el contador baja al instante y no vuelve a subir
const _claveLeidos = () => 'portal-avisos-leidos-' + (P.cliente ? P.cliente.id : '');
function _leidosLocal() { try { return new Set(JSON.parse(localStorage.getItem(_claveLeidos()) || '[]')); } catch (e) { return new Set(); } }
const TITULO_AVISO = { nota_tarea: 'El equipo de Salario te dejó una nota en la tarea', tarea_completada: 'El equipo de Salario completó la tarea' };
const NT_SVG = {
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  nota: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 01-3.4 0"/>'
};
const NT_ICO = { reunion_confirmada: 'cal', respuesta_equipo: 'chat', paso_revisado: 'ok', paso_ajustes: 'nota', tiempo_respondido: 'reloj', implementacion_iniciada: 'flag', tarea_completada: 'ok', nota_tarea: 'nota' };
function renderAvisos() {
  const bell = $('bell');
  if (!P.avisosOk) { bell.parentElement.hidden = true; return; }
  bell.parentElement.hidden = false;
  bell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + NT_SVG.bell + '</svg><em id="bell-n" hidden>0</em>';
  const loc = _leidosLocal(), esNuevo = a => !a.leido_at && !loc.has(a.id);
  const nuevos = P.avisos.filter(esNuevo).length;
  $('bell-n').textContent = nuevos; $('bell-n').hidden = !nuevos;
  $('nd-sub').textContent = P.avisos.length ? (nuevos ? nuevos + (nuevos === 1 ? ' sin leer' : ' sin leer') : 'Todo al día') : '';
  const item = a => {
    const iraT = (a.tipo === 'tarea_completada' || a.tipo === 'nota_tarea') && a.ref_id;   // avisos que llevan a una tarea
    return `<div class="nt ${esNuevo(a) ? 'nuevo' : ''}${iraT ? ' ir' : ''}" data-aviso="${esc(a.id)}"${iraT ? ' data-tarea="' + esc(a.ref_id) + '" title="Ver la tarea"' : ''}><span class="i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NT_SVG[NT_ICO[a.tipo]] || NT_SVG.bell}</svg></span><div><b>${esc(TITULO_AVISO[a.tipo] || a.titulo)}</b>${a.detalle ? '<p>' + esc(a.detalle) + '</p>' : ''}<small>${hace(a.created_at)}${iraT ? ' · Ver la tarea →' : ''}</small></div></div>`;
  };
  const nu = P.avisos.filter(esNuevo), vi = P.avisos.filter(a => !esNuevo(a));
  $('notis-lista').innerHTML = P.avisos.length
    ? (nu.length ? '<div class="nd-g">Nuevas</div>' + nu.map(item).join('') : '') + (vi.length ? '<div class="nd-g">Anteriores</div>' + vi.map(item).join('') : '')
    : '<div class="nd-vacio"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + NT_SVG.bell + '</svg></span><b>Todavía no tenés novedades</b><p>Cuando el equipo confirme tu reunión, responda una duda o complete una tarea, lo vas a ver acá.</p></div>';
}
// Panel lateral derecho: se abre con la campanita y se cierra con la X, tocando afuera o con Esc
const cerrarNotis = () => $('notis').classList.remove('on');
document.addEventListener('click', ev => {
  if (ev.target.closest('#bell')) { ev.stopPropagation(); $('notis').classList.toggle('on'); return; }
  if (ev.target.closest('#notis-x') || ev.target.id === 'notis-fondo') cerrarNotis();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarNotis(); });
// Al tocar un aviso se da por visto: baja el contador (y desaparece cuando ya no queda ninguno)
$('notis-lista').addEventListener('click', async ev => {
  const n = ev.target.closest('[data-aviso]'); if (!n) return;
  const id = n.dataset.aviso, a = P.avisos.find(x => x.id === id);
  if (!a || a.leido_at || _leidosLocal().has(id)) return;
  try { const s = _leidosLocal(); s.add(id); localStorage.setItem(_claveLeidos(), JSON.stringify([...s])); } catch (e) { /* sin almacenamiento */ }
  renderAvisos();
  const { error } = await sb.rpc('portal_marcar_aviso_leido', { p_id: id });
  if (!error) a.leido_at = new Date().toISOString();
});
$('notis-leer').addEventListener('click', async () => {
  await sb.rpc('portal_marcar_avisos_leidos');
  P.avisos.forEach(a => { a.leido_at = a.leido_at || new Date().toISOString(); });
  try { localStorage.removeItem(_claveLeidos()); } catch (e) { /* idem */ }
  renderAvisos();
});

// ── Carga de datos: solo vistas seguras y tablas que el cliente puede leer ──
async function cargarTodo(silencioso) {
  const [emp, dc, dce, prep, usr, pasos, et, av, rp, rr, ra, reu, nt, cons] = await Promise.all([
    sb.from('cliente_empresas').select('*').order('created_at'),
    sb.from('cliente_documentos').select('id, nombre, categoria, storage_path, empresa_id, empresa, origen, created_at, tamano_bytes')
      .eq('origen', 'cliente').not('empresa_id', 'is', null).order('created_at'),
    sb.from('cliente_documentos').select('id, nombre, categoria, storage_path, url, created_at, tamano_bytes').eq('origen', 'equipo').order('created_at'),
    sb.from('portal_prep').select('*').maybeSingle(),
    sb.from('portal_usuarios_salario').select('*').order('orden'),
    sb.from('portal_prep_estado').select('*').order('paso'),
    sb.from('portal_etapas').select('*').order('orden'),
    sb.from('portal_avisos').select('*').order('created_at', { ascending: false }).limit(30),
    sb.from('relevamiento_preguntas').select('*').order('seccion').order('orden'),
    sb.from('relevamiento_respuestas').select('*'),
    sb.from('relevamiento_aprobacion').select('*').maybeSingle(),
    sb.from('portal_reuniones').select('*').eq('tipo', 'inicio').order('created_at', { ascending: false }).limit(5),
    sb.from('portal_tarea_notas').select('*').order('created_at'),
    sb.from('portal_mis_consultas').select('*').order('created_at', { ascending: false }).limit(1000)
  ]);
  if (emp.error || pasos.error) {
    if (!silencioso) toast('No se pudieron cargar tus datos. Probá recargar la página.');
    return;
  }
  const nuevo = {
    empresas: emp.data || [], docs: dc.error ? [] : (dc.data || []), docsEquipo: dce.error ? [] : (dce.data || []),
    prep: prep.error ? null : prep.data, usuarios: usr.error ? [] : (usr.data || []), pasos: pasos.data || [],
    etapas: et.error ? [] : (et.data || []), avisos: av.error ? [] : (av.data || []), avisosOk: !av.error,
    reuniones: reu.error ? [] : (reu.data || []), notasTarea: nt.error ? [] : (nt.data || []), consultas: cons.error ? [] : (cons.data || []),
    relevPreg: rp.error ? [] : (rp.data || []), relevResp: rr.error ? [] : (rr.data || []), relevAprob: ra.error ? null : ra.data
  };
  // En las actualizaciones automáticas solo se vuelve a dibujar si algo cambió
  const foto = JSON.stringify(nuevo);
  if (silencioso && foto === cargarTodo._foto) return;
  cargarTodo._foto = foto;
  Object.assign(P, nuevo);
  P.principal = P.empresas.find(e => e.es_principal) || null;
  RENDERS.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}

// Actualización automática: cada 30 s (con la pestaña a la vista) y al volver a ella
async function refrescarSiCorresponde() {
  if (document.hidden || $('vista-portal').hidden) return;
  const { data } = await sb.auth.getSession();
  if (!data.session) { irAlLogin(); return; }
  cargarTodo(true);
}
setInterval(refrescarSiCorresponde, 30000);
document.addEventListener('visibilitychange', refrescarSiCorresponde);
window.addEventListener('focus', refrescarSiCorresponde);

// ── Arranque (lo llama arranque.js cuando todos los módulos están cargados) ──
async function iniciarPortal() {
  const { data: ses } = await sb.auth.getSession();
  if (!ses.session) { irAlLogin(); return; }
  const { data: cli, error } = await sb.from('portal_mi_cliente').select('*').maybeSingle();
  if (error || !cli) {
    // ¿Es del equipo? Entonces su app es la otra: se redirige sin cerrar sesión
    const { data: mie } = await sb.from('team_members').select('email').eq('email', ses.session.user.email).eq('activo', true).maybeSingle();
    if (mie) { window.location.replace('index.html'); return; }
    await sb.auth.signOut();
    irAlLogin('Tu acceso no está habilitado. Escribinos y lo revisamos.');
    return;
  }
  P.cliente = cli;
  P.email = ses.session.user.email || '';
  $('p-nombre').textContent = cli.nombre; $('pc-nombre').textContent = cli.nombre; $('pc-email').textContent = P.email;
  $('p-av').textContent = iniciales(cli.nombre); $('pc-av').textContent = iniciales(cli.nombre);
  mostrar('portal');
  await cargarTodo(false);
  irA(vistaBase());
}

// ── Panel del usuario: todos sus datos (cliente, empresa y accesos) ──
function renderPerfilDatos() {
  if (!P.cliente || !$('perfil-datos')) return;
  const c = P.cliente;
  const stat = (t, v) => (v === null || v === undefined || v === '') ? '' : `<div><b>${esc(String(v))}</b><small>${esc(t)}</small></div>`;
  const tipo = { empresa: 'Empresa', estudio: 'Estudio contable', colegio: 'Colegio', municipalidad: 'Municipalidad' }[c.tipo];
  if ($('pc-tipo')) { $('pc-tipo').textContent = tipo || ''; $('pc-tipo').hidden = !tipo; }
  $('perfil-datos').innerHTML =
    stat('Empresas a liquidar', P.prep && P.prep.empresas_declaradas) +
    stat('Personas en Salario', (P.usuarios || []).length || '') +
    stat('Inicio', c.fecha_inicio_implementacion ? fmtFecha(c.fecha_inicio_implementacion) : '') +
    stat('Objetivo', c.fecha_fin_objetivo ? fmtFecha(c.fecha_fin_objetivo) : '');
}
RENDERS.push(renderPerfilDatos);


// ── Inicio: portada con saludo, próximo paso, números y ayuda ──
function renderInicio() {
  if (!P.cliente || !$('inicio-cont')) return;
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const aplican = pasosAplican(), hechos = aplican.filter(n => paso(n).completo).length;
  const r = (P.reuniones || []).find(x => ['pendiente', 'confirmada', 'realizada'].includes(x.estado));
  const conf = !!r && (r.estado === 'confirmada' || r.estado === 'realizada');
  const run = iniciada(), prep = prepCompleta();
  const et = P.etapas || [];
  const pctT = et.length ? Math.round(et.filter(e => e.estado === 'completada').length / et.length * 100) : 0;
  const nombre = esc(P.cliente.nombre);
  const ico = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', up: '<path d="M7 17L17 7M8 7h9v9"/>', chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'
  };

  // Etapa actual (0 preparación · 1 reunión · 2 cronograma · 3 arranque) y próximo paso
  const etapa = run ? 3 : prep ? (conf ? 2 : 1) : 0;
  let sub, tag, ptit, pdesc, pbtn, pattr;
  if (run) {
    const mia = et.filter(e => (e.responsable_tipo === 'cliente' || e.responsable_tipo === 'ambos') && e.estado !== 'completada').sort((a, b) => String(a.fecha_fin || '9').localeCompare(String(b.fecha_fin || '9')))[0];
    sub = 'Tu implementación está en marcha. Seguí tus tareas y mirá cómo avanza todo.';
    tag = 'Tu próxima tarea';
    ptit = mia ? mia.tarea : 'Estás al día'; pdesc = mia ? (mia.fecha_fin ? 'Vence el ' + fmtFechaLarga(mia.fecha_fin) + '.' : 'Es una tarea que te toca a vos.') : 'No tenés tareas pendientes. Nosotros nos ocupamos del resto.';
    pbtn = 'Ver mis tareas'; pattr = 'data-ir="impl"';
  } else if (prep && conf) {
    const t = tileHorario(r.confirmado_inicio);
    sub = 'Tu reunión de inicio está confirmada. Después de hablar armamos tu cronograma.';
    tag = 'Tu reunión de inicio'; ptit = t.dia + ' ' + t.num + ' de ' + t.mes + ', ' + t.hi + ' h'; pdesc = 'Google Meet · 45 minutos.';
    pbtn = r.meet_url ? 'Unirme al Meet' : 'Ver detalles'; pattr = 'data-ir="reunion"';
  } else if (prep && r) {
    sub = 'Completaste tu parte. Estamos coordinando la reunión de inicio.';
    tag = 'Reunión de inicio'; ptit = 'Esperando confirmación'; pdesc = 'Propusiste ' + r.propuestas.length + (r.propuestas.length === 1 ? ' horario' : ' horarios') + '. Apenas confirmemos uno te avisamos.';
    pbtn = 'Ver o cambiar horarios'; pattr = 'data-ir="reunion"';
  } else if (prep) {
    sub = 'Completaste tu preparación. Solo falta coordinar la reunión de inicio.';
    tag = 'Último paso'; ptit = 'Coordinar la reunión'; pdesc = 'Elegí hasta 3 horarios y nosotros confirmamos uno.';
    pbtn = 'Solicitar reunión'; pattr = 'data-ir="reunion"';
  } else {
    const falta = aplican.find(n => !paso(n).completo) || aplican[0];
    sub = 'Llevás ' + hechos + ' de ' + aplican.length + ' pasos. Completá los que faltan para arrancar tu implementación.';
    tag = 'Tu próximo paso'; ptit = (typeof NOMBRES_PASOS !== 'undefined' ? NOMBRES_PASOS[falta - 1] : 'Seguir con tu preparación'); pdesc = 'Lo guardamos mientras avanzás, así podés retomarlo cuando quieras.';
    pbtn = 'Continuar'; pattr = 'data-editar-paso="' + falta + '"';
  }

  // Los tres números de la barra central
  const stats = run
    ? [[IC.chart, pctT + '%', 'Avance general'], [IC.check, et.filter(e => e.estado === 'completada').length + '/' + et.length, 'Tareas completas'], [IC.flag, (et.map(e => e.fecha_fin).filter(Boolean).sort().pop() ? fmtFecha(et.map(e => e.fecha_fin).filter(Boolean).sort().pop()) : '—'), 'Fin estimado']]
    : [[IC.check, hechos + '/' + aplican.length, 'Pasos completos'], [IC.cal, conf ? 'Confirmada' : r ? 'Pendiente' : 'Sin pedir', 'Reunión de inicio'], [IC.file, String((P.docs || []).length), 'Archivos subidos']];
  const avance = run ? pctT : Math.round(hechos / aplican.length * 100);
  const ETAPAS = ['Preparación', 'Reunión de inicio', 'Cronograma', 'Arranque'];

  $('inicio-cont').innerHTML = `<div class="hm">
    <div class="hm-top">
      <div class="hm-l">
        <div class="hm-eye">Implementación <i></i> Acompañamiento <i></i> Soporte</div>
        <h1>${saludo},<br><em>${nombre}</em></h1>
        <p>${esc(sub)}</p>
        <div class="hm-cta"><button class="hm-btn" type="button" ${pattr}>${esc(pbtn)}${ico(IC.arrow)}</button><button class="hm-ghost" type="button" id="hm-chat"><span>${ico(IC.chat)}</span>Hablar con el equipo</button></div>
      </div>
      <ul class="hm-et">${ETAPAS.map((n, k) => `<li class="${k === etapa ? 'on' : k < etapa ? 'ok' : ''}">${n}</li>`).join('')}</ul>
    </div>
    <div class="hm-bot">
      <div class="hm-g hm-prox"><div class="hm-pi">${ico(run ? IC.check : IC.cal)}</div>
        <div class="hm-px"><div class="hm-pt"><small>${esc(tag)}</small><span>0${etapa + 1} / 04</span></div><h3>${esc(ptit)}</h3><p>${esc(pdesc)}</p>
          <button class="hm-lnk" type="button" ${pattr}>${esc(pbtn)}${ico(IC.arrow)}</button></div></div>
      <div class="hm-g hm-stats">${stats.map(([ic, v, l]) => `<div>${ico(ic)}<b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>
      <div class="hm-g hm-eq"><button class="hm-go" type="button" id="hm-chat2" aria-label="Escribirnos">${ico(IC.up)}</button>
        <h3>¿Necesitás una mano?</h3><p>Escribinos y te respondemos de lunes a viernes de 09:00 a 17:00.</p>
        <div class="hm-bar"><i style="width:${avance}%"></i></div></div>
    </div></div>`;
  ['hm-chat', 'hm-chat2'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => $('rq-chat').click()); });
}
RENDERS.push(renderInicio);
ALENTRAR.inicio = renderInicio;

// Barra superior: transparente arriba de todo (así el resplandor de fondo pasa por detrás) y sólida al bajar
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 8), { passive: true });
