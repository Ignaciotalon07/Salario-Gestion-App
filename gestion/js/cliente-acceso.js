// ───────────── Acceso del cliente a "Salario Gestión - Clientes" ─────────────
// Desde acá el equipo crea el usuario (email + clave) de un cliente, le cambia la clave o le desactiva el acceso.
// La creación pasa por la Edge Function `portal-crear-acceso` (la clave de servicio nunca sale al navegador).
// 1 usuario por cliente. Los accesos viven en la tabla portal_usuarios (migración 073).
const PORTAL_URL = 'https://salariogestion.pages.dev';
let _accesoCliente = null;     // id del cliente del modal abierto
let _accesoClave = '';         // última clave creada/cambiada (solo para mostrarla una vez)

const _acEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _acGenerarClave() {
  // 12 caracteres sin letras que se confunden (0/O, 1/l/I)
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  return [...r].map(n => a[n % a.length]).join('');
}

function _acModal() {
  let m = document.getElementById('modal-acceso-portal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'modal-acceso-portal';
  m.className = 'kb-modal-overlay';
  m.style.display = 'none';
  m.onclick = ev => { if (ev.target === m) accesoCerrar(); };
  m.innerHTML = '<div class="kb-modal acp"><div class="acp__head"><div><div class="acp__t">🔑 Acceso a Salario Clientes</div><div class="acp__s" id="acp-cli"></div></div><button class="kb-modal-close" onclick="accesoCerrar()" style="font-size:18px">✕</button></div><div class="acp__body" id="acp-body"></div></div>';
  document.body.appendChild(m);
  return m;
}

async function accesoAbrir(clienteId) {
  _accesoCliente = clienteId; _accesoClave = '';
  const m = _acModal();
  const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === clienteId);
  document.getElementById('acp-cli').textContent = c ? c.nombre : '';
  document.getElementById('acp-body').innerHTML = '<p class="muted">Cargando…</p>';
  m.style.display = 'flex'; m.classList.add('kb-modal--open');
  await accesoRender();
}
function accesoCerrar() {
  const m = document.getElementById('modal-acceso-portal'); if (!m) return;
  m.style.display = 'none'; m.classList.remove('kb-modal--open'); _accesoCliente = null; _accesoClave = '';
}

async function accesoRender() {
  const body = document.getElementById('acp-body'); if (!body || !_accesoCliente) return;
  const { data, error } = await sb().from('portal_usuarios').select('user_id, email, activo, created_at, creado_por').eq('cliente_id', _accesoCliente);
  if (error) { body.innerHTML = '<p class="acp__err">No se pudo leer el acceso: ' + _acEsc(error.message) + '</p>'; return; }
  const u = (data || [])[0];
  const claveBloque = _accesoClave ? `<div class="acp__ok"><b>Listo. Pasale estos datos al cliente:</b>
      <pre id="acp-datos">Ingresá a ${PORTAL_URL}\nEmail: ${_acEsc(u ? u.email : '')}\nClave: ${_acEsc(_accesoClave)}</pre>
      <button class="btn-secondary" onclick="accesoCopiar()">📋 Copiar</button><small>Esta clave se muestra solo ahora: no queda guardada en ningún lado.</small></div>` : '';
  if (!u) {
    body.innerHTML = `<p class="acp__p">Este cliente todavía no tiene acceso. Creá su usuario con el email que nos pasó y una clave.</p>
      <label class="acp__l">Email del cliente</label><input id="acp-email" class="acp__in" type="email" autocomplete="off" placeholder="cliente@empresa.com" />
      <label class="acp__l">Clave (mínimo 8 caracteres)</label>
      <div class="acp__fila"><input id="acp-pass" class="acp__in" type="text" autocomplete="off" value="${_acGenerarClave()}" /><button class="btn-secondary" type="button" onclick="document.getElementById('acp-pass').value=_acGenerarClave()">🎲 Generar</button></div>
      <p class="acp__msg" id="acp-msg"></p>
      <div class="acp__acc"><button class="btn-primary" id="acp-crear" onclick="accesoCrear()">Crear acceso</button></div>`;
    return;
  }
  body.innerHTML = `${claveBloque}
    <div class="acp__u"><div><b>${_acEsc(u.email)}</b><small>${u.activo ? '<span class="acp__on">● Acceso activo</span>' : '<span class="acp__off">● Acceso desactivado</span>'} · creado ${new Date(u.created_at).toLocaleDateString('es-AR')}${u.creado_por ? ' por ' + _acEsc(u.creado_por) : ''}</small></div></div>
    <label class="acp__l">Nueva clave (mínimo 8 caracteres)</label>
    <div class="acp__fila"><input id="acp-pass" class="acp__in" type="text" autocomplete="off" placeholder="Escribí una o generá una" /><button class="btn-secondary" type="button" onclick="document.getElementById('acp-pass').value=_acGenerarClave()">🎲 Generar</button></div>
    <p class="acp__msg" id="acp-msg"></p>
    <div class="acp__acc"><button class="btn-primary" onclick="accesoCambiarClave('${u.user_id}')">Cambiar clave</button>
      <button class="btn-secondary" onclick="accesoEstado('${u.user_id}', ${u.activo ? 'false' : 'true'})">${u.activo ? 'Desactivar acceso' : 'Activar acceso'}</button></div>`;
}

function _acMsg(t, ok) { const e = document.getElementById('acp-msg'); if (e) { e.textContent = t || ''; e.className = 'acp__msg' + (ok ? ' acp__msg--ok' : ''); } }

async function _acLlamar(body) {
  const { data, error } = await sb().functions.invoke('portal-crear-acceso', { body });
  if (error) {
    let msg = 'No se pudo completar. ¿Está desplegada la función "portal-crear-acceso"?';
    if (error.context && typeof error.context.json === 'function') { try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* queda el general */ } }
    return { error: msg };
  }
  if (data && data.error) return { error: data.error };
  return { data };
}

async function accesoCrear() {
  const email = (document.getElementById('acp-email').value || '').trim(), password = document.getElementById('acp-pass').value || '';
  if (!email) { _acMsg('Escribí el email del cliente.'); return; }
  if (password.length < 8) { _acMsg('La clave tiene que tener al menos 8 caracteres.'); return; }
  const btn = document.getElementById('acp-crear'); btn.disabled = true; btn.textContent = 'Creando…'; _acMsg('');
  const r = await _acLlamar({ accion: 'crear', cliente_id: _accesoCliente, email, password });
  if (r.error) { btn.disabled = false; btn.textContent = 'Crear acceso'; _acMsg(r.error); return; }
  _accesoClave = password;
  if (typeof toast === 'function') toast('Acceso creado');
  await accesoRender();
  if (typeof reunionEqCargar === 'function') reunionEqCargar(_accesoCliente);   // ahora el cliente "usa la app": aparece Inicio, etc.
}
async function accesoCambiarClave(userId) {
  const password = document.getElementById('acp-pass').value || '';
  if (password.length < 8) { _acMsg('La clave tiene que tener al menos 8 caracteres.'); return; }
  const r = await _acLlamar({ accion: 'clave', cliente_id: _accesoCliente, user_id: userId, password });
  if (r.error) { _acMsg(r.error); return; }
  _accesoClave = password; if (typeof toast === 'function') toast('Clave cambiada');
  await accesoRender();
}
async function accesoEstado(userId, activo) {
  if (!activo && !confirm('¿Desactivar el acceso? El cliente ya no va a poder entrar (no se borra nada).')) return;
  const r = await _acLlamar({ accion: 'estado', cliente_id: _accesoCliente, user_id: userId, activo });
  if (r.error) { _acMsg(r.error); return; }
  if (typeof toast === 'function') toast(activo ? 'Acceso activado' : 'Acceso desactivado');
  await accesoRender();
}
function accesoCopiar() {
  const t = document.getElementById('acp-datos'); if (!t) return;
  navigator.clipboard.writeText(t.textContent).then(() => { if (typeof toast === 'function') toast('Copiado'); });
}

// ───────────── Alta rápida: cliente nuevo + acceso al portal (nombre, email, tipo, clave) ─────────────
// El cliente completa después el resto de sus datos en el portal y se copian solos a su ficha (migración 089).
function altaPortalAbrir() {
  _accesoCliente = null; _accesoClave = '';
  const m = _acModal();
  document.getElementById('acp-cli').textContent = 'Cliente nuevo de Implementación';
  document.querySelector('#modal-acceso-portal .acp__t').textContent = '🆕 Nuevo cliente con acceso';
  document.getElementById('acp-body').innerHTML = `<p class="acp__p">Cargá solo estos datos. El resto (razón social, CUIT, domicilio…) lo completa el cliente en el portal y se copia solo a su ficha.</p>
    <label class="acp__l">Nombre del cliente</label><input id="acp-nombre" class="acp__in" autocomplete="off" placeholder="Ej: Estudio Maineri" />
    <label class="acp__l">Tipo de cliente</label>
    <select id="acp-tipo" class="acp__in"><option value="empresa">Empresa</option><option value="estudio">Estudio contable</option><option value="colegio">Colegio</option><option value="municipalidad">Municipalidad</option></select>
    <label class="acp__l">Email del cliente (con este va a entrar)</label><input id="acp-email" class="acp__in" type="email" autocomplete="off" placeholder="cliente@empresa.com" />
    <label class="acp__l">Clave (mínimo 8 caracteres)</label>
    <div class="acp__fila"><input id="acp-pass" class="acp__in" type="text" autocomplete="off" value="${_acGenerarClave()}" /><button class="btn-secondary" type="button" onclick="document.getElementById('acp-pass').value=_acGenerarClave()">🎲 Generar</button></div>
    <p class="acp__msg" id="acp-msg"></p>
    <div class="acp__acc"><button class="btn-primary" id="acp-crear" onclick="altaPortalCrear()">Crear cliente y acceso</button></div>`;
  m.style.display = 'flex'; m.classList.add('kb-modal--open');
  document.getElementById('acp-nombre').focus();
}

async function altaPortalCrear() {
  const g = id => (document.getElementById(id).value || '').trim();
  const nombre = g('acp-nombre'), tipo = g('acp-tipo'), email = g('acp-email'), password = document.getElementById('acp-pass').value || '';
  if (!nombre) { _acMsg('Escribí el nombre del cliente.'); return; }
  if (!email) { _acMsg('Escribí el email del cliente.'); return; }
  if (password.length < 8) { _acMsg('La clave tiene que tener al menos 8 caracteres.'); return; }
  const btn = document.getElementById('acp-crear'); btn.disabled = true; btn.textContent = 'Creando…'; _acMsg('');
  const r = await _acLlamar({ accion: 'alta', nombre, email, tipo, password });
  if (r.error) { btn.disabled = false; btn.textContent = 'Crear cliente y acceso'; _acMsg(r.error); return; }
  const cli = r.data.cliente;
  // Se arman las etapas de implementación con la plantilla del tipo (igual que "Nuevo cliente")
  try { await sb().rpc('crear_implementacion_para_cliente', { p_cliente_id: cli.id, p_tipo: tipo }); }
  catch (e) { console.warn('No se pudieron crear las etapas', e); }
  if (typeof clientes !== 'undefined' && !clientes.find(x => x.id === cli.id) && typeof dbRowToCliente === 'function') clientes.unshift(dbRowToCliente(cli));
  if (typeof renderClientes === 'function') renderClientes();
  if (typeof renderImplementacion === 'function') renderImplementacion();
  if (typeof toast === 'function') toast('Cliente creado con acceso');
  document.querySelector('#modal-acceso-portal .acp__t').textContent = '🔑 Acceso a Salario Clientes';
  _accesoCliente = cli.id; _accesoClave = password;
  document.getElementById('acp-cli').textContent = cli.nombre;
  await accesoRender();
}

// ───────────── "Agregar cliente": ¿nuevo o viejo? ─────────────
function clienteElegirAbrir() {
  const m = _acModal();
  document.querySelector('#modal-acceso-portal .acp__t').textContent = 'Agregar cliente';
  document.getElementById('acp-cli').textContent = '¿Qué tipo de cliente es?';
  document.getElementById('acp-body').innerHTML = `<div class="acp__elegir">
    <button type="button" class="acp__op" onclick="accesoCerrar();altaPortalAbrir()"><b>🆕 Cliente nuevo</b><span>Va a Implementación y entra a Salario Clientes. Cargás solo nombre, email y tipo; el resto lo completa él.</span></button>
    <button type="button" class="acp__op" onclick="accesoCerrar();showClienteFormCompleto()"><b>📁 Cliente viejo</b><span>Ya usa Salario. Completás la ficha con todos los datos. Por ahora no tiene acceso a Salario Clientes.</span></button></div>`;
  m.style.display = 'flex'; m.classList.add('kb-modal--open');
}
