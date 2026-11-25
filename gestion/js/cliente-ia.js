// ====================================================================
// IA por cliente — panel lateral derecho dentro del detalle de un cliente.
// Le preguntás datos de ESE cliente (consultas, pendientes, Salario) y responde
// la Edge Function `cliente-ia`. La charla vive solo mientras el panel está abierto
// y se borra al cerrar o al cambiar de cliente. No se guarda nada.
// ====================================================================

let _ciaClienteId = null;   // cliente de la charla actual
let _ciaHistorial = [];     // [{role:'user'|'assistant', content}]
let _ciaEnviando  = false;
let _ciaUltimo    = Date.now(); // último uso (para vencer la charla)
const CIA_VENCE_MS = 30 * 60 * 1000;
let _ciaModo      = 'soporte'; // 'soporte' (detalle de cliente) | 'impl' (implementación)

const CIA_SUGERIDAS = [
  '¿Qué fue lo que más consultó el mes pasado?',
  '¿Qué fue lo que más repitió?',
  '¿Cómo viene este cliente en los últimos meses?',
  '¿Tiene pendientes abiertos?',
  '¿Cuánto tiempo le dedicamos este año?',
  '¿Cómo evolucionaron sus legajos?'
];

const CIA_SUGERIDAS_IMPL = [
  '¿Cómo viene esta implementación?',
  '¿Qué etapas están demoradas?',
  '¿Qué falta para terminar?',
  '¿Qué ya está listo?',
  '¿Qué le toca hacer al cliente?',
  '¿Llegamos al objetivo de fin?'
];
const _ciaLista = () => _ciaModo === 'impl' ? CIA_SUGERIDAS_IMPL : CIA_SUGERIDAS;

function _ciaEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Texto de la IA → HTML simple (negritas, listas con guión, saltos de línea)
function _ciaFormato(txt) {
  const lineas = _ciaEsc(txt).split('\n');
  let html = '', enLista = false;
  for (const l of lineas) {
    const m = l.match(/^\s*[-•*]\s+(.*)$/);
    if (m) { if (!enLista) { html += '<ul>'; enLista = true; } html += `<li>${m[1]}</li>`; continue; }
    if (enLista) { html += '</ul>'; enLista = false; }
    if (l.trim()) html += `<p>${l}</p>`;
  }
  if (enLista) html += '</ul>';
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Arma el panel una sola vez
function _ciaAsegurarPanel() {
  let ov = document.getElementById('cia-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'cia-overlay';
  ov.className = 'cia-overlay';
  ov.innerHTML = `
    <aside class="cia-drawer" role="dialog" aria-label="Preguntale a la IA">
      <div class="cia-head">
        <div>
          <div class="cia-head__t">✨ Preguntale a la IA</div>
          <div class="cia-head__s" id="cia-cliente"></div>
        </div>
        <div class="cia-head__acc">
          <button type="button" class="cia-ghost" onclick="clienteIaLimpiar()" title="Empezar una charla nueva">Nueva charla</button>
          <button type="button" class="cia-x" onclick="clienteIaCerrar()" aria-label="Cerrar">✕</button>
        </div>
      </div>
      <div class="cia-msgs" id="cia-msgs"></div>
      <form class="cia-form" onsubmit="clienteIaEnviar(event)">
        <textarea id="cia-input" rows="1" maxlength="1000" placeholder="Preguntá algo sobre este cliente…"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();clienteIaEnviar(event);}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
        <button type="submit" class="cia-send" id="cia-send" aria-label="Enviar">↑</button>
      </form>
      <div class="cia-pie">La IA responde solo con los datos registrados de este cliente. Revisá los números importantes.</div>
    </aside>`;
  // Click en el fondo oscuro cierra el panel
  ov.addEventListener('click', e => { if (e.target === ov) clienteIaCerrar(); });
  document.body.appendChild(ov);
  return ov;
}

function _ciaNombreCliente() {
  try {
    const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === _ciaClienteId);
    return c ? c.nombre : '';
  } catch (e) { return ''; }
}

function _ciaRenderBienvenida() {
  const box = document.getElementById('cia-msgs');
  if (!box) return;
  box.innerHTML = `
    <div class="cia-bienvenida">
      <div class="cia-bienvenida__t">¿Qué querés saber de este cliente?</div>
      <div class="cia-bienvenida__s">${_ciaModo === 'impl' ? 'Cronograma, etapas, demoras y avance. También consultas y datos de Salario.' : 'Consultas, pendientes, datos de Salario y, si tiene, su implementación.'} Podés repreguntar sobre lo anterior.</div>
      <div class="cia-chips">
        ${_ciaLista().map((q, i) => `<button type="button" class="cia-chip" onclick="clienteIaSugerida(${i})">${_ciaEsc(q)}</button>`).join('')}
      </div>
    </div>`;
}

function _ciaAgregarMsg(rol, html, extraClase) {
  const box = document.getElementById('cia-msgs');
  if (!box) return null;
  const bienv = box.querySelector('.cia-bienvenida');
  if (bienv) bienv.remove();
  const d = document.createElement('div');
  d.className = `cia-msg cia-msg--${rol}${extraClase ? ' ' + extraClase : ''}`;
  d.innerHTML = html;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

// id y modo son opcionales: sin parámetros usa el cliente abierto en Clientes.
// Desde Implementación se llama con (id, 'impl').
function clienteIaAbrir(idParam, modo) {
  const id = idParam || ((typeof _detalleClienteId !== 'undefined') ? _detalleClienteId : null);
  if (!id) return;
  const nuevoModo = modo === 'impl' ? 'impl' : 'soporte';
  const ov = _ciaAsegurarPanel();
  // Otro cliente, otro modo o más de 30 min sin usarla → charla nueva
  const vencida = _ciaHistorial.length && (Date.now() - _ciaUltimo > CIA_VENCE_MS);
  if (_ciaClienteId !== id || _ciaModo !== nuevoModo || vencida) {
    _ciaClienteId = id; _ciaHistorial = []; _ciaModo = nuevoModo;
    document.getElementById('cia-msgs').innerHTML = '';
  }
  document.getElementById('cia-cliente').textContent = _ciaNombreCliente();
  if (!_ciaHistorial.length) _ciaRenderBienvenida();
  ov.classList.remove('cia-out');
  ov.classList.add('cia-open', 'cia-in');
  setTimeout(() => { const i = document.getElementById('cia-input'); if (i) i.focus(); }, 280);
}

// Cerrar solo oculta el panel: la charla se conserva para poder retomarla
// (cerrarlo sin querer no pierde nada). Se borra con clienteIaReset().
function clienteIaCerrar() {
  const ov = document.getElementById('cia-overlay');
  if (!ov || !ov.classList.contains('cia-open')) return;
  ov.classList.remove('cia-in');
  ov.classList.add('cia-out');
  setTimeout(() => ov.classList.remove('cia-open', 'cia-out'), 220);
}

// Borra la charla y cierra: al volver a la lista, al cambiar de cliente o tras 30 min sin usarla
function clienteIaReset() {
  _ciaHistorial = [];
  _ciaClienteId = null;
  const b = document.getElementById('cia-msgs'); if (b) b.innerHTML = '';
  clienteIaCerrar();
}

function clienteIaLimpiar() {
  _ciaHistorial = [];
  _ciaRenderBienvenida();
}

function clienteIaSugerida(i) {
  const inp = document.getElementById('cia-input');
  if (inp) inp.value = _ciaLista()[i];
  clienteIaEnviar();
}

async function clienteIaEnviar(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (_ciaEnviando || !_ciaClienteId) return;
  const inp = document.getElementById('cia-input');
  const pregunta = (inp ? inp.value : '').trim();
  if (!pregunta) return;
  inp.value = ''; inp.style.height = 'auto';
  _ciaUltimo = Date.now();

  _ciaEnviando = true;
  const btn = document.getElementById('cia-send'); if (btn) btn.disabled = true;
  _ciaAgregarMsg('user', `<p>${_ciaEsc(pregunta)}</p>`);
  const espera = _ciaAgregarMsg('ia', '<span class="cia-puntos"><i></i><i></i><i></i></span>', 'cia-msg--espera');
  const clienteDeEstaPregunta = _ciaClienteId;

  try {
    const { data, error } = await sb().functions.invoke('cliente-ia', {
      body: { cliente_id: clienteDeEstaPregunta, pregunta, historial: _ciaHistorial }
    });
    // Si cerró el panel o cambió de cliente mientras esperaba, se descarta
    if (_ciaClienteId !== clienteDeEstaPregunta) return;
    if (error || !data || data.error || !data.respuesta) {
      let msg = (data && data.error) || 'No pude responder ahora. Probá de nuevo en un momento.';
      // Cuando la función devuelve un código de error, el detalle viene en error.context
      if (error && error.context && typeof error.context.json === 'function') {
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* queda el mensaje general */ }
      }
      espera.classList.remove('cia-msg--espera');
      espera.classList.add('cia-msg--error');
      espera.innerHTML = `<p>${_ciaEsc(msg)}</p>`;
    } else {
      _ciaHistorial.push({ role: 'user', content: pregunta }, { role: 'assistant', content: data.respuesta });
      espera.classList.remove('cia-msg--espera');
      espera.innerHTML = _ciaFormato(data.respuesta);
    }
  } catch (e) {
    espera.classList.remove('cia-msg--espera');
    espera.classList.add('cia-msg--error');
    espera.innerHTML = '<p>No pude conectarme. Revisá tu conexión e intentá de nuevo.</p>';
  } finally {
    _ciaEnviando = false;
    _ciaUltimo = Date.now();
    if (btn) btn.disabled = false;
    const box = document.getElementById('cia-msgs'); if (box) box.scrollTop = box.scrollHeight;
    const i = document.getElementById('cia-input'); if (i) i.focus();
  }
}

// Esc cierra el panel
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('cia-overlay');
    if (ov && ov.classList.contains('cia-open')) clienteIaCerrar();
  }
});
