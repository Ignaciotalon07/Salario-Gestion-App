// ════════════════════════════════════
// CONEXIONES (accesos al escritorio remoto de cada cliente)
// Cada cliente puede tener varias conexiones: usuario + clave + un check
// "Instalado". Se ven y se administran desde un modal que se abre con el
// botón "Conexiones" de la card del cliente (detalle de cliente).
//
// Tabla: cliente_conexiones (migración 044). Realtime entre todo el equipo.
// La clave se muestra oculta (••••••) con botón para verla y para copiarla.
// ════════════════════════════════════

let clienteConexiones = {};      // { cliente_id: [conexion, ...] }
let _conexClienteId   = null;    // cliente cuyo modal está abierto
let _conexVisibles    = {};      // { conexion_id: true } claves que se están mostrando
let _conexFormModo    = null;    // null | 'nuevo' | id de la conexión que se edita

// ────────── Carga inicial + realtime ──────────

window.addEventListener('app-ready', () => {
  initConexiones();
});

async function initConexiones() {
  try {
    const { data, error } = await sb()
      .from('cliente_conexiones')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    clienteConexiones = {};
    (data || []).forEach(_conexAgregarLocal);
  } catch (e) {
    // Si la tabla todavía no existe (falta correr la migración 044), la app
    // sigue funcionando; solo no se muestran conexiones.
    console.warn('No se pudieron cargar las conexiones', e);
  }
  _actualizarBtnConexiones();
  _suscribirConexiones();
}

function _conexAgregarLocal(row) {
  if (!clienteConexiones[row.cliente_id]) clienteConexiones[row.cliente_id] = [];
  const lista = clienteConexiones[row.cliente_id];
  const idx = lista.findIndex(c => c.id === row.id);
  if (idx === -1) lista.push(row); else lista[idx] = row;
}

function _conexQuitarLocal(id) {
  for (const cid in clienteConexiones) {
    clienteConexiones[cid] = clienteConexiones[cid].filter(c => c.id !== id);
  }
}

function _suscribirConexiones() {
  sb().channel('cliente-conexiones-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_conexiones' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'DELETE') _conexQuitarLocal(o.id);
      else _conexAgregarLocal(n);
      _actualizarBtnConexiones();
      if (_conexClienteId) _renderModalConexiones();
    }).subscribe();
}

// ────────── Botón en la card del cliente ──────────

function _conexDeCliente(clienteId) {
  return clienteConexiones[clienteId] || [];
}

// HTML del botón "Conexiones (N)" para el header del detalle de cliente.
function renderBtnConexiones(clienteId) {
  const lista     = _conexDeCliente(clienteId);
  const total     = lista.length;
  const instaladas = lista.filter(c => c.instalado).length;
  const estado = total === 0 ? '' :
    instaladas === total ? '<span class="conex-dot conex-dot--ok"></span>' :
    '<span class="conex-dot conex-dot--pend"></span>';
  const titulo = total === 0
    ? 'Todavía no hay conexiones cargadas'
    : `${instaladas} de ${total} instalada${total !== 1 ? 's' : ''}`;
  return `
    <button class="btn-sm btn-conexiones-detalle" title="${titulo}"
      onclick="abrirConexiones('${clienteId}')">
      🖥 Conexiones${total > 0 ? ` (${total})` : ''} ${estado}
    </button>`;
}

// Tarjeta "Conexiones" para el bloque destacado del header (desktop).
function renderTarjetaConexiones(clienteId) {
  const lista = _conexDeCliente(clienteId);
  const total = lista.length;
  const instaladas = lista.filter(c => c.instalado).length;
  const estado = total === 0 ? '' :
    instaladas === total ? '<span class="conex-dot conex-dot--ok"></span>' :
    '<span class="conex-dot conex-dot--pend"></span>';
  return `
    <button class="detalle-vivo__item detalle-vivo__item--btn tarjeta-conexiones-detalle"
      onclick="abrirConexiones('${clienteId}')">
      <div class="detalle-vivo__k"><span class="detalle-vivo__ico">🖥</span> <span class="detalle-vivo__lbl">Conexiones</span></div>
      <div class="detalle-vivo__v">${total} ${estado}</div>
      <div class="detalle-vivo__ver">${total ? `${instaladas} de ${total} instalada${total !== 1 ? 's' : ''} →` : 'Agregar →'}</div>
    </button>`;
}

// Actualiza solo el botón (sin re-renderizar todo el detalle del cliente,
// para no perder los filtros que tenga puestos).
function _actualizarBtnConexiones() {
  if (typeof _detalleClienteId === 'undefined' || !_detalleClienteId) return;
  // El botón existe dos veces en el header (una por cada diseño: mobile y
  // desktop), así que se actualizan todas las copias.
  document.querySelectorAll('.btn-conexiones-detalle').forEach(btn => {
    btn.outerHTML = renderBtnConexiones(_detalleClienteId);
  });
  document.querySelectorAll('.tarjeta-conexiones-detalle').forEach(btn => {
    btn.outerHTML = renderTarjetaConexiones(_detalleClienteId);
  });
}

// ────────── Modal ──────────

function abrirConexiones(clienteId) {
  _conexClienteId = clienteId;
  _conexVisibles  = {};
  _conexFormModo  = null;
  _renderModalConexiones();
  const overlay = document.getElementById('conexiones-overlay');
  if (overlay) overlay.classList.add('kb-modal--open');
  document.body.style.overflow = 'hidden';
}

function cerrarConexiones() {
  const overlay = document.getElementById('conexiones-overlay');
  if (overlay) overlay.classList.remove('kb-modal--open');
  document.body.style.overflow = '';
  _conexClienteId = null;
  _conexFormModo  = null;
  _conexVisibles  = {};
}

function _escConex(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _renderModalConexiones() {
  const body = document.getElementById('conexiones-body');
  if (!body || !_conexClienteId) return;

  const cliente = (typeof clientes !== 'undefined') ? clientes.find(c => c.id === _conexClienteId) : null;
  const lista   = _conexDeCliente(_conexClienteId);
  const instaladas = lista.filter(c => c.instalado).length;

  const titulo = document.getElementById('conexiones-titulo');
  if (titulo) titulo.textContent = cliente ? `Conexiones — ${cliente.nombre}` : 'Conexiones';

  const resumen = lista.length === 0
    ? 'Todavía no hay conexiones cargadas para este cliente.'
    : `${lista.length} conexión${lista.length !== 1 ? 'es' : ''} · ${instaladas} instalada${instaladas !== 1 ? 's' : ''}`;

  const itemsHTML = lista.map((c, i) => {
    const visible = !!_conexVisibles[c.id];
    const claveTxt = c.clave
      ? (visible ? _escConex(c.clave) : '••••••••')
      : '<span style="color:var(--text3)">—</span>';
    return `
      <div class="conex-item">
        <div class="conex-item__top">
          <span class="conex-item__nombre">Conexión ${i + 1}</span>
          <label class="conex-estado ${c.instalado ? 'conex-estado--on' : ''}">
            <input type="checkbox" ${c.instalado ? 'checked' : ''}
              onchange="toggleInstaladoConexion('${c.id}', this.checked)">
            ${c.instalado ? 'Instalado' : 'No instalado'}
          </label>
        </div>
        <div class="conex-campos">
          <div>
            <div class="conex-label">Usuario</div>
            <div class="conex-valor">
              <span class="conex-mono">${_escConex(c.usuario)}</span>
              <button class="conex-icon-btn" title="Copiar usuario" onclick="copiarCampoConexion('${c.id}','usuario')">📋</button>
            </div>
          </div>
          <div>
            <div class="conex-label">Clave</div>
            <div class="conex-valor">
              <span class="conex-mono">${claveTxt}</span>
              ${c.clave ? `
                <button class="conex-icon-btn" title="${visible ? 'Ocultar' : 'Mostrar'} clave" onclick="toggleVerClaveConexion('${c.id}')">${visible ? '🙈' : '👁'}</button>
                <button class="conex-icon-btn" title="Copiar clave" onclick="copiarCampoConexion('${c.id}','clave')">📋</button>` : ''}
            </div>
          </div>
        </div>
        <div class="conex-item__acciones">
          <button class="conex-link" onclick="editarConexion('${c.id}')">✏️ Editar</button>
          <button class="conex-link conex-link--danger" onclick="eliminarConexion('${c.id}')">🗑 Eliminar</button>
        </div>
      </div>`;
  }).join('');

  // Formulario para agregar / editar
  let formHTML;
  if (_conexFormModo) {
    const editando = _conexFormModo !== 'nuevo'
      ? lista.find(c => c.id === _conexFormModo)
      : null;
    formHTML = `
      <div class="conex-form">
        <div class="conex-form__titulo">${editando ? 'Editar conexión' : 'Nueva conexión'}</div>
        <div class="conex-form__campos">
          <div class="form-group" style="margin:0">
            <label class="fl">Usuario</label>
            <input type="text" id="conex-usuario" autocomplete="off" value="${_escConex(editando ? editando.usuario : '')}" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="fl">Clave</label>
            <input type="text" id="conex-clave" autocomplete="off" value="${_escConex(editando ? (editando.clave || '') : '')}" />
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn-primary" onclick="guardarConexion()">${editando ? 'Guardar cambios' : 'Agregar'}</button>
          <button class="btn-secondary" onclick="cancelarFormConexion()">Cancelar</button>
        </div>
      </div>`;
  } else {
    formHTML = `<button class="btn-secondary" style="width:100%" onclick="nuevaConexion()">+ Agregar conexión</button>`;
  }

  body.innerHTML = `
    <div class="conex-resumen">${resumen}</div>
    <div class="conex-lista">${itemsHTML}</div>
    ${formHTML}`;

  if (_conexFormModo) {
    const inp = document.getElementById('conex-usuario');
    if (inp) inp.focus();
  }
}

// ────────── Acciones ──────────

function nuevaConexion() {
  _conexFormModo = 'nuevo';
  _renderModalConexiones();
}

function editarConexion(id) {
  _conexFormModo = id;
  _renderModalConexiones();
}

function cancelarFormConexion() {
  _conexFormModo = null;
  _renderModalConexiones();
}

async function guardarConexion() {
  const usuario = (document.getElementById('conex-usuario') || {}).value || '';
  const clave   = (document.getElementById('conex-clave')   || {}).value || '';
  if (!usuario.trim()) { alert('Escribí el usuario de la conexión.'); return; }

  try {
    if (_conexFormModo && _conexFormModo !== 'nuevo') {
      const id = _conexFormModo;
      const actualizado = await dbUpdate('cliente_conexiones', id, {
        usuario: usuario.trim(),
        clave: clave || null,
        updated_at: new Date().toISOString(),
      });
      if (actualizado) _conexAgregarLocal(actualizado);
      else {
        // dbUpdate puede no devolver la fila: actualizamos a mano en memoria
        const c = _conexDeCliente(_conexClienteId).find(x => x.id === id);
        if (c) { c.usuario = usuario.trim(); c.clave = clave || null; }
      }
      toast('Conexión actualizada');
    } else {
      const inserted = await dbInsert('cliente_conexiones', {
        cliente_id: _conexClienteId,
        usuario: usuario.trim(),
        clave: clave || null,
        instalado: false,
      });
      if (inserted) _conexAgregarLocal(inserted);
      toast('Conexión agregada');
    }
    _conexFormModo = null;
    _renderModalConexiones();
    _actualizarBtnConexiones();
  } catch (e) {
    console.error('Error guardando conexión', e);
    alert('No se pudo guardar la conexión: ' + (e.message || e));
  }
}

async function toggleInstaladoConexion(id, instalado) {
  const c = _conexDeCliente(_conexClienteId).find(x => x.id === id);
  if (!c) return;
  const anterior = c.instalado;
  c.instalado = instalado; // optimista
  _renderModalConexiones();
  _actualizarBtnConexiones();
  try {
    await dbUpdate('cliente_conexiones', id, { instalado, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('Error actualizando instalado', e);
    c.instalado = anterior; // se revierte si falló
    _renderModalConexiones();
    _actualizarBtnConexiones();
    toast('No se pudo actualizar la conexión.');
  }
}

async function eliminarConexion(id) {
  const c = _conexDeCliente(_conexClienteId).find(x => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar la conexión del usuario "${c.usuario}"?\n\nSe borra para todo el equipo.`)) return;
  try {
    await dbDelete('cliente_conexiones', id);
    _conexQuitarLocal(id);
    _renderModalConexiones();
    _actualizarBtnConexiones();
    toast('Conexión eliminada');
  } catch (e) {
    console.error('Error eliminando conexión', e);
    toast('No se pudo eliminar la conexión.');
  }
}

function toggleVerClaveConexion(id) {
  _conexVisibles[id] = !_conexVisibles[id];
  _renderModalConexiones();
}

function copiarCampoConexion(id, campo) {
  const c = _conexDeCliente(_conexClienteId).find(x => x.id === id);
  if (!c || !c[campo]) return;
  const etiqueta = campo === 'clave' ? 'Clave' : 'Usuario';
  navigator.clipboard.writeText(c[campo])
    .then(() => toast(`${etiqueta} copiado`))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = c[campo]; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(`${etiqueta} copiado`); }
      catch (e) { toast('No se pudo copiar'); }
      document.body.removeChild(ta);
    });
}
