// AVISOS LLAMATIVOS (sonido + parpadeo de pestaña + popup)
//
// 1) Repositorio: cuando otra persona (ej: Alfred) sube o edita algo, suena un
//    "pop" tipo mensaje y el título de la pestaña parpadea hasta que entremos
//    a la sección Repositorio (es decir, hasta que ya no queden items nuevos).
// 2) Viernes desde las 16hs (solo Ignacio y Matías): popup grande con campana
//    que pide actualizar las tareas de Implementación y mandar los Gantt.
//    Se repite cada 30 min hasta que se marca como hecho.
//
// El sonido se genera con Web Audio (sin archivos). Los navegadores solo dejan
// reproducir audio después de que el usuario interactuó con la página, algo que
// ya pasó al iniciar sesión.
//
// Para silenciar los sonidos en este navegador:  localStorage.setItem('avisos_silencio','1')

// ────────── Sonido ──────────
let _avisoCtx = null;

function _avisoAudioCtx() {
  try {
    if (!_avisoCtx) _avisoCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_avisoCtx.state === 'suspended') _avisoCtx.resume();
    return _avisoCtx;
  } catch (e) { return null; }
}

// Una nota corta con envolvente suave (evita el "clic" al cortar)
function _avisoNota(ctx, freq, inicio, dur, vol) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(vol, inicio + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(inicio); osc.stop(inicio + dur + 0.02);
}

// tipo: 'mensaje' (dos notas cortas, tipo WhatsApp) | 'alerta' (tres tonos, más insistente)
function avisoSonido(tipo = 'mensaje') {
  if (localStorage.getItem('avisos_silencio') === '1') return;
  const ctx = _avisoAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  if (tipo === 'alerta') {
    [[880, 0], [1175, 0.22], [880, 0.44], [1175, 0.66]].forEach(([f, d]) => _avisoNota(ctx, f, t + d, 0.25, 0.35));
  } else {
    _avisoNota(ctx, 988,  t,        0.14, 0.30);
    _avisoNota(ctx, 1319, t + 0.13, 0.22, 0.30);
  }
}

// Desbloquear el audio con la primera interacción (política de autoplay)
['click', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { _avisoAudioCtx(); }, { once: true, passive: true })
);

// Si la pestaña se abrió ya con la sesión iniciada (sin ningún clic), el navegador
// bloquea el audio. En ese caso mostramos un botoncito para activarlo: cualquier
// clic en la página lo desbloquea y el botón desaparece.
window.addEventListener('app-ready', () => {
  const ua = navigator.userActivation;
  if (!ua || ua.hasBeenActive || localStorage.getItem('avisos_silencio') === '1') return;
  const b = document.createElement('button');
  b.id = 'aviso-activar-sonido';
  b.textContent = '🔔 Tocá acá para activar los sonidos de aviso';
  b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:1500;padding:9px 14px;border-radius:999px;border:1px solid #f97316;'
                  + 'background:var(--surface,#fff);color:#f97316;font-weight:600;font-size:12.5px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2)';
  b.onclick = () => { _avisoAudioCtx(); avisoSonido('mensaje'); b.remove(); };
  document.body.appendChild(b);
  const quitar = () => { _avisoAudioCtx(); b.remove(); };
  ['click', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, quitar, { once: true, passive: true }));
});

// ────────── Parpadeo del título de la pestaña ──────────
let _avisoTituloOriginal = null;
let _avisoTituloTimer = null;
let _avisoTituloStop = null;   // función: devuelve true cuando hay que dejar de parpadear

function avisoParpadearTitulo(texto, debeParar) {
  if (_avisoTituloOriginal === null) _avisoTituloOriginal = document.title;
  _avisoTituloStop = debeParar || null;
  if (_avisoTituloTimer) clearInterval(_avisoTituloTimer);
  let alterna = false;
  _avisoTituloTimer = setInterval(() => {
    if (_avisoTituloStop && _avisoTituloStop()) { avisoPararTitulo(); return; }
    alterna = !alterna;
    document.title = alterna ? texto : _avisoTituloOriginal;
  }, 900);
}

function avisoPararTitulo() {
  if (_avisoTituloTimer) clearInterval(_avisoTituloTimer);
  _avisoTituloTimer = null;
  _avisoTituloStop = null;
  if (_avisoTituloOriginal !== null) document.title = _avisoTituloOriginal;
  _avisoTituloOriginal = null;
}

// ────────── 1) Repositorio: item nuevo/editado por otra persona ──────────
// Se llama desde el realtime de repositorio.js
function avisoRepositorioNovedad(item, fueEditado) {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  const autor = fueEditado ? (item.editado_por || item.subido_por) : item.subido_por;
  if (!autor || autor === me) return;   // lo que cargo yo no me avisa

  avisoSonido('mensaje');
  if (typeof toast === 'function') {
    toast(`🆕 ${autor} ${fueEditado ? 'editó' : 'subió'} algo en el Repositorio: ${item.titulo || 'sin título'}`);
  }
  // Parpadea hasta que ya no queden items nuevos (se limpia al abrir la sección)
  // También para si ya estás mirando la sección con la pestaña a la vista.
  avisoParpadearTitulo(`🔔 Nuevo en Repositorio — ${autor}`, () => {
    const viendoRepo = document.getElementById('repositorio')?.classList.contains('active') && !document.hidden;
    const sinNuevos  = typeof _repoNuevosCount === 'function' ? _repoNuevosCount() === 0 : false;
    return viendoRepo || sinNuevos;
  });
}

// ────────── Pendiente asignado/reasignado a mí ──────────
// Suena igual que el Repositorio. Si estás en otra pestaña, el título parpadea
// hasta que volvés a la plataforma.
function avisoPendienteAsignado(cliente, reasignado) {
  avisoSonido('mensaje');
  if (document.hidden) {
    avisoParpadearTitulo(`📌 ${reasignado ? 'Te reasignaron' : 'Nuevo pendiente'}: ${cliente || ''}`, () => !document.hidden);
  }
}

// ────────── Pendientes que otros me generaron (para el Panel general) ──────────
// Se arma con el audit log (pendiente_eventos): eventos 'creado' / 'reasignado'
// de los últimos 3 días, de pendientes que hoy tengo asignados y que NO hizo
// el propio usuario. El Panel general (saludo.js) los muestra con un botón para
// ir a verlos y con "hace X". Cuando se toca el botón, se marcan como vistos.
window._pendAsignados = window._pendAsignados || [];   // [{pid, autor, cuando, cliente, reasignado}]

function _pendVistosGet() {
  try { return JSON.parse(localStorage.getItem('pend_asig_vistos') || '{}'); } catch (e) { return {}; }
}

function pendAsignadoMarcarVisto(pid) {
  const v = _pendVistosGet();
  const it = (window._pendAsignados || []).find(a => a.pid === pid);
  if (it) v[pid] = it.cuando;
  // Limpieza: guardamos solo lo reciente
  const limite = Date.now() - 10 * 86400000;
  Object.keys(v).forEach(k => { if (new Date(v[k]).getTime() < limite) delete v[k]; });
  localStorage.setItem('pend_asig_vistos', JSON.stringify(v));
  if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
}

// ────────── Pendientes con más de 50 días sin cerrar ──────────
// Recordatorio diario ("¿te olvidaste de cerrarlo?"): se muestra en el Panel
// general. Una vez visto (botón o entrando a Pendientes) se oculta por HOY y
// vuelve a aparecer mañana, todos los días, hasta que el pendiente se cierre.
const PEND_VIEJO_DIAS = 50;

// { pendienteId: 'YYYY-M-D' del último día que lo vi }
function _pendViejosVistosGet() {
  try {
    const v = JSON.parse(localStorage.getItem('pend_viejos_vistos') || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};   // formato viejo (lista) → se ignora
  } catch (e) { return {}; }
}

// Mis pendientes abiertos con más de 50 días desde su creación que todavía no vi HOY
function pendViejosActivos(me, pendArr) {
  const vistos = _pendViejosVistosGet();
  const hoy = _avisoHoyKey();
  const limite = PEND_VIEJO_DIAS * 86400000;
  return (pendArr || []).filter(p =>
    p.asesor === me && !p.resuelto && p.createdAt &&
    (Date.now() - new Date(p.createdAt).getTime()) > limite &&
    vistos[p.id] !== hoy
  );
}

function pendViejosMarcarVistos() {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  const pend = (typeof pendientes !== 'undefined') ? pendientes : [];
  const activos = pendViejosActivos(me, pend);
  if (!activos.length) return;
  const vistos = _pendViejosVistosGet();
  const hoy = _avisoHoyKey();
  activos.forEach(p => { vistos[p.id] = hoy; });
  // Limpieza: se descartan los de pendientes que ya no están abiertos
  const abiertos = new Set(pend.map(p => p.id));
  Object.keys(vistos).forEach(k => { if (!abiertos.has(k)) delete vistos[k]; });
  localStorage.setItem('pend_viejos_vistos', JSON.stringify(vistos));
  if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
}

// Al entrar a la sección Pendientes se dan por vistos todos los avisos
// (igual que el Repositorio: entrar a la sección ya cuenta como "abrirlo").
function pendAsignadoMarcarTodosVistos() {
  const lista = window._pendAsignados || [];
  if (!lista.length) return;
  const v = _pendVistosGet();
  lista.forEach(a => { v[a.pid] = a.cuando; });
  localStorage.setItem('pend_asig_vistos', JSON.stringify(v));
  window._pendAsignados = [];
  avisoPararTitulo();
  if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
}

async function refrescarPendAsignados() {
  try {
    const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
    if (!me || typeof sb !== 'function' || typeof pendientes === 'undefined') return;
    const desde = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data, error } = await sb().from('pendiente_eventos')
      .select('pendiente_id, tipo, autor_nombre, detalle, created_at')
      .in('tipo', ['creado', 'reasignado'])
      .gte('created_at', desde)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const vistos = _pendVistosGet();
    const porPend = {};
    (data || []).forEach(ev => { if (!porPend[ev.pendiente_id]) porPend[ev.pendiente_id] = ev; });  // el más reciente

    const lista = [];
    Object.values(porPend).forEach(ev => {
      const p = pendientes.find(x => x.id === ev.pendiente_id);
      if (!p || p.resuelto || p.asesor !== me) return;          // solo abiertos y míos
      if (ev.autor_nombre === me) return;                          // lo hice yo
      if (vistos[ev.pendiente_id] === ev.created_at) return;      // ya lo vi
      lista.push({ pid: ev.pendiente_id, autor: ev.autor_nombre, cuando: ev.created_at,
                   cliente: p.cliente, reasignado: ev.tipo === 'reasignado' });
    });
    lista.sort((a, b) => new Date(b.cuando) - new Date(a.cuando));
    window._pendAsignados = lista;
    if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
  } catch (e) { console.warn('No se pudieron cargar las asignaciones de pendientes', e); }
}

// Primera carga, y refresco cada minuto (también actualiza los "hace X min")
window.addEventListener('app-ready', () => {
  setTimeout(refrescarPendAsignados, 2500);
  setInterval(refrescarPendAsignados, 60000);
});

// ────────── 2) Viernes: actualizar tareas y mandar los Gantt ──────────
const AVISO_VIERNES_USUARIOS = ['Ignacio Talon', 'Matias Ferro'];
const AVISO_VIERNES_HORA     = 16;   // desde las 16:00
const AVISO_VIERNES_REPETIR  = 30;   // minutos entre recordatorios

function _avisoHoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function _avisoViernesDebeMostrar() {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  if (!me || !AVISO_VIERNES_USUARIOS.includes(me)) return false;
  const ahora = new Date();
  if (ahora.getDay() !== 5 || ahora.getHours() < AVISO_VIERNES_HORA || ahora.getHours() >= 20) return false;
  if (localStorage.getItem('aviso_viernes_hecho') === _avisoHoyKey()) return false;
  const posponer = parseInt(localStorage.getItem('aviso_viernes_posponer') || '0', 10);
  return Date.now() >= posponer;
}

function avisoViernesMostrar() {
  if (document.getElementById('aviso-viernes-overlay')) return;
  const el = document.createElement('div');
  el.id = 'aviso-viernes-overlay';
  el.className = 'aviso-viernes-overlay';
  el.innerHTML = `
    <div class="aviso-viernes-card" role="alertdialog" aria-label="Recordatorio de viernes">
      <div class="aviso-viernes-campana">🔔</div>
      <div class="aviso-viernes-titulo">¡Cierre de semana!</div>
      <div class="aviso-viernes-texto">
        Antes de irte:<br>
        <b>1.</b> Actualizá las tareas de Implementación con el avance de la semana.<br>
        <b>2.</b> Mandá los Gantt a los clientes.
      </div>
      <div class="aviso-viernes-acciones">
        <button class="btn-primary" onclick="avisoViernesIr()">Ir a Implementación →</button>
        <button class="btn-secondary" onclick="avisoViernesHecho()">✅ Ya lo hice</button>
        <button class="btn-secondary" onclick="avisoViernesPosponer()">⏰ Recordarme en ${AVISO_VIERNES_REPETIR} min</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  avisoSonido('alerta');
  avisoParpadearTitulo('📄 ¡Actualizá tareas y mandá los Gantt!', () => !document.getElementById('aviso-viernes-overlay'));

  // Si estás en otra pestaña, la alarma se repite hasta que vuelvas a la plataforma.
  // Al volver se calla (el popup y el parpadeo del título siguen hasta que lo resuelvas).
  if (_avisoViernesLoop) clearInterval(_avisoViernesLoop);
  _avisoViernesLoop = setInterval(() => {
    if (!document.getElementById('aviso-viernes-overlay')) { clearInterval(_avisoViernesLoop); _avisoViernesLoop = null; return; }
    if (document.hidden) avisoSonido('alerta');
  }, 3500);
}

let _avisoViernesLoop = null;

function _avisoViernesCerrar() {
  document.getElementById('aviso-viernes-overlay')?.remove();
  if (_avisoViernesLoop) { clearInterval(_avisoViernesLoop); _avisoViernesLoop = null; }
  avisoPararTitulo();
}

function avisoViernesHecho() {
  localStorage.setItem('aviso_viernes_hecho', _avisoHoyKey());
  _avisoViernesCerrar();
}

function avisoViernesPosponer() {
  localStorage.setItem('aviso_viernes_posponer', String(Date.now() + AVISO_VIERNES_REPETIR * 60000));
  _avisoViernesCerrar();
}

// "Ir a Implementación" cierra el popup pero NO lo da por hecho: vuelve a
// avisar a los 30 min hasta que toque "Ya lo hice".
function avisoViernesIr() {
  avisoViernesPosponer();
  if (typeof goTo === 'function' && typeof _saludoNavBtn === 'function') {
    goTo(_saludoNavBtn('implementacion'), 'implementacion');
  }
}

// Revisa cada minuto (la app puede estar abierta desde la mañana)
window.addEventListener('app-ready', () => {
  const revisar = () => { if (_avisoViernesDebeMostrar()) avisoViernesMostrar(); };
  setTimeout(revisar, 4000);
  setInterval(revisar, 60000);
});
