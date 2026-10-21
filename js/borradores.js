// borradores.js — Sección "Por registrar"
// Borradores de consultas que arma automáticamente la Edge Function
// `whaticket-sync` cuando un chat se resuelve en Whaticket.
// El asesor los abre, completa lo que falta y los registra como consulta normal.
// Ver docs/integracion-whaticket.md

// ── Estado ────────────────────────────────────────────────────────────────────
let borradores = [];                 // borradores abiertos (estado='borrador') visibles para mí
window._borradorActivoId = null;     // borrador que se está registrando en el modal

window.addEventListener('app-ready', () => { initBorradores(); });

async function initBorradores() {
  try {
    const { data, error } = await sb()
      .from('consultas_borradores')
      .select('*')
      .eq('estado', 'borrador')
      .order('cierre_at', { ascending: false });
    if (error) throw error;
    borradores = data || [];
  } catch (e) {
    console.warn('No se pudieron cargar los borradores', e);
    borradores = [];
  }
  renderBorradores();
  _actualizarBadgeBorradores();
  suscribirBorradores();
}

// Realtime: los borradores nuevos aparecen solos (la RLS filtra los que no son míos)
function suscribirBorradores() {
  sb().channel('borradores-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_borradores' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'DELETE') {
        borradores = borradores.filter(b => b.id !== o.id);
      } else if (n.estado !== 'borrador') {
        borradores = borradores.filter(b => b.id !== n.id); // registrado o descartado
      } else {
        const idx = borradores.findIndex(b => b.id === n.id);
        if (idx !== -1) borradores[idx] = n;
        else {
          borradores.unshift(n);
          if (eventType === 'INSERT' && typeof avisoSonido === 'function') avisoSonido('mensaje');
        }
        borradores.sort((a, b) => new Date(b.cierre_at || 0) - new Date(a.cierre_at || 0));
      }
      renderBorradores();
      _actualizarBadgeBorradores();
      if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
    }).subscribe();
}

function _actualizarBadgeBorradores() {
  const badge = document.getElementById('borradores-nav-badge');
  if (!badge) return;
  if (borradores.length > 0) { badge.textContent = borradores.length; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _bEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "Veronica Bulnes - Taborin" → "Veronica Bulnes" (la agenda usa "Persona – Empresa")
function _bNombrePersona(contactoNombre) {
  if (!contactoNombre) return '';
  return String(contactoNombre).split(/\s+[-–—]\s+/)[0].trim();
}

function _bClienteNombre(b) {
  if (!b.cliente_id || typeof clientes === 'undefined') return null;
  const c = clientes.find(x => x.id === b.cliente_id);
  return c ? c.nombre : null;
}

function _bFechaCierre(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return 'Hoy ' + hora;
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer ' + hora;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + hora;
}

function _bFmtTiempo(horas) {
  if (horas == null) return '—';
  const min = Math.round(Number(horas) * 60);
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ── Lista ─────────────────────────────────────────────────────────────────────
let _bFiltro = 'todos';   // todos | sin_cliente | viejos
let _bBusqueda = '';

function buscarBorradores(v) { _bBusqueda = (v || '').trim().toLowerCase(); renderBorradores(); }
function filtrarBorradores(f) { _bFiltro = f; renderBorradores(); }

function _bEsViejo(b) {
  return b.cierre_at && (Date.now() - new Date(b.cierre_at).getTime()) > 24 * 3600 * 1000;
}

// "hace 5 min" / "hace 3 h" / "hace 2 d"
function _bHace(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function renderBorradores() {
  const cont = document.getElementById('borradores-lista');
  const sub  = document.getElementById('borradores-sub');
  const tb   = document.getElementById('borradores-toolbar');
  const fil  = document.getElementById('borradores-filtros');
  if (!cont) return;

  if (sub) {
    sub.textContent = borradores.length
      ? `${borradores.length} chat${borradores.length !== 1 ? 's' : ''} de Whaticket esperando que los registres`
      : 'Los chats que resuelvas en Whaticket aparecen acá para registrarlos';
  }

  if (!borradores.length) {
    if (tb) tb.style.display = 'none';
    cont.innerHTML = `
      <div class="bd-empty">
        <div class="bd-empty__icon">✓</div>
        <div class="bd-empty__t">Todo al día</div>
        <div class="bd-empty__s">Cuando resuelvas un chat en Whaticket, aparece acá en menos de un minuto.</div>
      </div>`;
    return;
  }

  // Filtros con contadores
  const nSin = borradores.filter(b => !b.cliente_id).length;
  const nViejos = borradores.filter(_bEsViejo).length;
  if (tb) tb.style.display = '';
  if (fil) {
    const pill = (k, label, n) =>
      `<button class="bd-pill${_bFiltro === k ? ' bd-pill--on' : ''}" onclick="filtrarBorradores('${k}')">${label}<span>${n}</span></button>`;
    fil.innerHTML = pill('todos', 'Todos', borradores.length)
                  + pill('sin_cliente', 'Sin cliente', nSin)
                  + pill('viejos', 'Más de 24 h', nViejos);
  }

  // Aplicar filtro + búsqueda
  let lista = borradores.filter(b => {
    if (_bFiltro === 'sin_cliente' && b.cliente_id) return false;
    if (_bFiltro === 'viejos' && !_bEsViejo(b)) return false;
    if (_bBusqueda) {
      const hay = [_bClienteNombre(b), b.contacto_nombre, b.detalle_sugerido].join(' ').toLowerCase();
      if (!hay.includes(_bBusqueda)) return false;
    }
    return true;
  });

  if (!lista.length) {
    cont.innerHTML = '<div class="bd-empty"><div class="bd-empty__s">No hay chats que coincidan con el filtro.</div></div>';
    return;
  }

  cont.innerHTML = '<div class="bd-grid">' + lista.map(b => {
    const cliente = _bClienteNombre(b);
    const persona = _bNombrePersona(b.contacto_nombre) || b.contacto_nombre || 'Contacto';
    const viejo = _bEsViejo(b);
    const inicial = (cliente || persona || '?').trim().charAt(0).toUpperCase();
    const detalle = b.detalle_sugerido
      ? _bEsc(b.detalle_sugerido)
      : '<em>Sin detalle detectado. Abrí el chat para verlo.</em>';
    const ico = [
      b.conexion_sugerida ? '<span title="Conexión remota">🖥</span>' : '',
      b.repetida_sugerida ? '<span title="Posible consulta repetida">↻</span>' : '',
      b.tiene_audio       ? '<span title="Tiene audios">🎤</span>' : '',
      b.tramos > 1        ? `<span title="${b.tramos} chats juntos">⧉ ${b.tramos}</span>` : '',
      b.ia_generado       ? '<span title="Resumen redactado con IA">✨</span>' : '',
      `<span title="Mensajes">💬 ${b.cant_mensajes || 0}</span>`,
    ].join('');

    return `
      <div class="bd-card${viejo ? ' bd-card--viejo' : ''}" onclick="abrirBorrador('${b.id}')">
        <div class="bd-card__top">
          <div class="bd-avatar${cliente ? '' : ' bd-avatar--sin'}">${_bEsc(inicial)}</div>
          <div class="bd-card__who">
            <div class="bd-card__cliente">${cliente ? _bEsc(cliente) : '<span class="bd-sin">Sin cliente</span>'}</div>
            <div class="bd-card__persona">${_bEsc(persona)}</div>
          </div>
          <div class="bd-card__hace${viejo ? ' bd-card__hace--viejo' : ''}" title="${_bFechaCierre(b.cierre_at)}">${_bHace(b.cierre_at)}</div>
        </div>
        <div class="bd-card__detalle">${detalle}</div>
        ${b.categoria_sugerida ? `<div class="bd-card__cat">🏷 ${_bEsc((typeof CATS !== 'undefined' && CATS[b.categoria_sugerida] && CATS[b.categoria_sugerida].label) || b.categoria_sugerida)}${b.subtema_sugerido ? ' · ' + _bEsc(b.subtema_sugerido) : ''}</div>` : ''}
        <div class="bd-card__meta">
          <span class="bd-tiempo">⏱ ${_bFmtTiempo(b.tiempo_sugerido)}</span>
          <span class="bd-ico">${ico}</span>
        </div>
        <div class="bd-card__acc">
          <button class="bd-btn bd-btn--ghost" onclick="event.stopPropagation();descartarBorrador('${b.id}')">Descartar</button>
          <button class="bd-btn bd-btn--main" onclick="event.stopPropagation();abrirBorrador('${b.id}')">Registrar</button>
        </div>
      </div>`;
  }).join('') + '</div>';
}

// ── Abrir un borrador en el modal "Registrar consulta" ───────────────────────
function abrirBorrador(id) {
  const b = borradores.find(x => x.id === id);
  if (!b) return;
  window._borradorActivoId = id;

  abrirModalConsulta(_bClienteNombre(b) || undefined);

  // Esperar a que el modal termine de inicializarse (elegirClienteSearch corre a los 50 ms)
  setTimeout(() => {
    const set = (el, v) => { const n = document.getElementById(el); if (n) n.value = v; };
    if (b.detalle_sugerido) set('r-desc', b.detalle_sugerido);
    if (b.solucion_sugerida) set('r-sol', b.solucion_sugerida);
    // tiempo_sugerido está en horas decimales; el formulario usa horas.minutos (0.13 = 13 min)
    if (b.tiempo_sugerido != null) {
      const min = Math.round(Number(b.tiempo_sugerido) * 60);
      set('r-tiempo', typeof minutosAHHMM === 'function' ? minutosAHHMM(min) : Math.round(Number(b.tiempo_sugerido) * 100) / 100);
    }
    if (typeof actualizarHintTiempo === 'function') actualizarHintTiempo();
    set('r-remota', b.conexion_sugerida ? 'si' : 'no');
    set('r-material', b.material_sugerido || 'ninguno');
    set('r-rep', b.repetida_sugerida ? 'si' : 'no');
    set('r-contacto', _bNombrePersona(b.contacto_nombre));
    // Categoría y subtema sugeridos por la IA (solo si existen como opción en el formulario)
    const selCat = document.getElementById('r-cat');
    if (b.categoria_sugerida && selCat && [...selCat.options].some(o => o.value === b.categoria_sugerida)) {
      selCat.value = b.categoria_sugerida;
      if (typeof updateRegSubtemas === 'function') updateRegSubtemas();
      const selSub = document.getElementById('r-sub');
      if (b.subtema_sugerido && selSub && [...selSub.options].some(o => o.value === b.subtema_sugerido || o.text === b.subtema_sugerido)) {
        selSub.value = b.subtema_sugerido;
      }
    }
    if (typeof actualizarContactosDatalist === 'function') actualizarContactosDatalist();
  }, 150);

  _renderChatBorrador(b);
}

// Panel derecho con la conversación limpia (cliente / asesor)
function _renderChatBorrador(b) {
  const panel = document.getElementById('r-chat-panel');
  const shell = document.getElementById('mc-shell');
  if (!panel || !shell) return;
  const msgs = (b.mensajes || []).filter(m => m.de === 'cliente' || m.de === 'asesor');
  const fmtH = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const fmtD = iso => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
  const nombre = b.contacto_nombre || 'Conversación';
  const inicial = (_bNombrePersona(nombre) || '?').trim().charAt(0).toUpperCase();

  let ultimoDia = '';
  const cuerpo = msgs.map(m => {
    const dia = fmtD(m.at);
    const sep = dia !== ultimoDia ? `<div class="mc-day"><span>${_bEsc(dia)}</span></div>` : '';
    ultimoDia = dia;
    const esCli = m.de === 'cliente';
    const texto = m.texto
      ? _bEsc(m.texto)
      : (m.tipo === 'audio' ? '🎤 Audio' : (m.tipo && m.tipo !== 'chat' ? '📎 ' + _bEsc(m.tipo) : ''));
    return sep + `
      <div class="mc-msg ${esCli ? 'mc-msg--cli' : 'mc-msg--ase'}">
        <div class="mc-bubble">${texto}<span class="mc-time">${fmtH(m.at)}</span></div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="mc-chat-head">
      <div class="mc-chat-avatar">${_bEsc(inicial)}</div>
      <div>
        <div class="mc-chat-name">${_bEsc(nombre)}</div>
        <div class="mc-chat-meta">${msgs.length} mensajes · WhatsApp</div>
      </div>
    </div>
    <div class="mc-chat-body">${cuerpo || '<div style="color:var(--text3);font-size:12px;padding:12px 0">Sin mensajes.</div>'}</div>`;

  shell.classList.add('mc-shell--dual');
  const sub = document.getElementById('mc-sub');
  if (sub) sub.textContent = b.ia_generado ? '✨ Resumen redactado con IA — revisalo y completá lo que falta' : 'Datos precargados desde el chat — revisalos y completá lo que falta';
  const otra = document.getElementById('btn-guardar-otra');
  if (otra) otra.style.display = 'none';
  const desc = document.getElementById('btn-descartar-borrador');
  if (desc) desc.style.display = '';
  // Ir al final de la conversación
  const bodyEl = panel.querySelector('.mc-chat-body');
  if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
}

// Limpia el modo borrador (lo llama cerrarModalConsulta)
function borradorLimpiarModal() {
  window._borradorActivoId = null;
  const shell = document.getElementById('mc-shell');
  if (shell) shell.classList.remove('mc-shell--dual');
  const panel = document.getElementById('r-chat-panel');
  if (panel) panel.innerHTML = '';
  const sub = document.getElementById('mc-sub');
  if (sub) sub.textContent = 'Completá después de cada atención por WhatsApp';
  const otra = document.getElementById('btn-guardar-otra');
  if (otra) otra.style.display = '';
  const desc = document.getElementById('btn-descartar-borrador');
  if (desc) desc.style.display = 'none';
}

// Se llama desde guardarConsulta() cuando el insert salió bien
async function borradorMarcarRegistrado(consultaId, clienteObj) {
  const id = window._borradorActivoId;
  if (!id) return;
  const b = borradores.find(x => x.id === id);
  const yo = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
  try {
    await dbUpdate('consultas_borradores', id, {
      estado: 'registrado', consulta_id: consultaId,
      cliente_id: clienteObj ? clienteObj.id : (b ? b.cliente_id : null),
      resuelto_at: new Date().toISOString(), resuelto_por: yo,
    });
    // Si el asesor eligió el cliente (o lo corrigió), queda guardado para los próximos chats de ese contacto
    if (b && b.whaticket_contact_id && clienteObj) {
      await sb().from('whaticket_contactos').upsert({
        whaticket_contact_id: b.whaticket_contact_id,
        nombre: b.contacto_nombre || null, numero: b.contacto_numero || null,
        ticket_id: b.ticket_id, cliente_id: clienteObj.id, vinculado_por: yo,
      });
    }
  } catch (e) {
    console.warn('No se pudo cerrar el borrador', e);
  }
  borradores = borradores.filter(x => x.id !== id);
  renderBorradores();
  _actualizarBadgeBorradores();
}

// ── Descartar ─────────────────────────────────────────────────────────────────
async function descartarBorrador(id) {
  if (!confirm('¿Descartar este chat? Se saca de "Soporte" y no se carga como consulta.')) return false;
  const yo = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
  try {
    await dbUpdate('consultas_borradores', id, {
      estado: 'descartado', resuelto_at: new Date().toISOString(), resuelto_por: yo,
    });
    borradores = borradores.filter(x => x.id !== id);
    renderBorradores();
    _actualizarBadgeBorradores();
    if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
    if (typeof toast === 'function') toast('Chat descartado');
    return true;
  } catch (e) {
    alert('No se pudo descartar: ' + e.message);
    return false;
  }
}

// Botón "Descartar consulta" dentro del modal: descarta el borrador abierto y cierra el modal
async function descartarBorradorActivo() {
  const id = window._borradorActivoId;
  if (!id) return;
  if (await descartarBorrador(id)) cerrarModalConsulta();
}
