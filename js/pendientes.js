// PENDIENTES (Supabase + realtime + notas)
// Fuente de verdad: tabla 'pendientes' en Supabase.
// Soporta filtro 'mis' / 'equipo', notas con historial por pendiente,
// y realtime cross-user.

let pendientes = [];
let notasByPendiente = {}; // { pendiente_id: [nota, nota, ...] }
let eventosByPendiente = {}; // { pendiente_id: [evento, ...] }
let historialAbierto = {};   // { pendiente_id: bool }
let viewMode   = 'mis';     // 'mis' | 'equipo'
let catFilter  = '';        // '' | 'liquidacion' | 'errores' | 'configuracion' | 'actualizaciones' | 'fuera'
let searchText = '';
let groupByCliente = false;
let pendientesCerradosMes = 0; // contador de pendientes cerrados este mes

const TEAM_ASESORES = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Daniel Ferro', 'Renzo Moretti', 'Alfredo Cesar'];

// ────────── Mapeo DB <-> UI ──────────

function dbRowToPendiente(row) {
  const lookup = CLIENTES_LOOKUP[row.cliente_nombre] || { tipo: 'empresa', iniciales: row.cliente_nombre.substring(0, 2).toUpperCase() };
  return {
    id:             row.id,
    cliente:        row.cliente_nombre,
    tipo:           lookup.tipo,
    iniciales:      lookup.iniciales,
    asesor:         row.asesor,
    prioridad:      row.prioridad,
    categoriaLabel: row.categoria || '',
    categoriaBadge: categoriaBadge(row.categoria),
    cuando:         tiempoRelativo(row.created_at),
    descripcion:    row.descripcion,
    intento:        row.intento,
    proxPaso:       row.prox_paso,
    resuelto:       row.resuelto,
    tipoPendiente:  row.tipo_pendiente || 'soporte',
    fechaVencimiento: row.fecha_vencimiento,
    createdAt:      row.created_at,
    interno:        row.interno || false
  };
}

// Calcular el estado de vencimiento automaticamente.
// Cada pendiente tiene un plazo standard de 5 dias desde la creacion.
// Si pasan mas de 5, muestra "Vencido hace X dias".
function vencimientoInfo(createdAt) {
  if (!createdAt) return null;
  const dias = diasDesde(createdAt);
  if (dias > 5) {
    const venc = dias - 5;
    return {
      label: `Vencido hace ${venc} dia${venc !== 1 ? 's' : ''}`,
      badge: 'b-red',
      urgente: true
    };
  }
  return null;
}

// Configuracion visual y default-asesor por tipo
const TIPO_PENDIENTE = {
  soporte:        { label: 'Soporte',              emoji: '🎧', badge: 'b-blue',   defaultAsesor: null },
  implementacion: { label: 'Implementación',       emoji: '🚀', badge: 'b-amber',  defaultAsesor: null },
  bug:            { label: 'Programación',         emoji: '🐛', badge: 'b-red',    defaultAsesor: 'Alfredo Cesar' },
  comercial:      { label: 'Comercial (Adm.)', emoji: '💼', badge: 'b-green',  defaultAsesor: 'Daniel Ferro' }
};

function categoriaBadge(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('liquidac'))   return 'b-red';
  if (c.includes('error'))      return 'b-blue';
  if (c.includes('config'))     return 'b-purple';
  if (c.includes('actualiz'))   return 'b-amber';
  if (c.includes('fuera'))      return 'b-gray';
  return 'b-gray';
}

function tiempoRelativo(timestamp) {
  if (!timestamp) return 'Ahora';
  const ms = Date.now() - new Date(timestamp).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 5)   return 'Ahora';
  if (min < 60)  return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)  return hrs === 1 ? 'Hace 1 hora' : `Hace ${hrs} horas`;
  const dias = Math.floor(hrs / 24);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Hace 1 dia';
  return `Hace ${dias} dias`;
}

function diasDesde(timestamp) {
  if (!timestamp) return 0;
  return Math.floor((Date.now() - new Date(timestamp).getTime()) / (24 * 60 * 60 * 1000));
}

// ────────── Init ──────────

async function initPendientes() {
  try {
    const rows = await dbList('pendientes', { orderBy: 'created_at', ascending: false });
    pendientes = rows.filter(r => !r.resuelto).map(dbRowToPendiente);

    // Contar pendientes cerrados este mes (resolved_at dentro del mes actual)
    const ahora     = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const { count: cerradosCount } = await sb()
      .from('pendientes')
      .select('*', { count: 'exact', head: true })
      .eq('resuelto', true)
      .gte('resolved_at', inicioMes);
    pendientesCerradosMes = cerradosCount ?? 0;

    // Cargar notas de los pendientes activos en una sola query
    const ids = pendientes.map(p => p.id);
    notasByPendiente = {};
    if (ids.length > 0) {
      const { data, error } = await sb()
        .from('pendiente_notas')
        .select('*')
        .in('pendiente_id', ids)
        .order('created_at', { ascending: true });
      if (error) throw error;
      (data || []).forEach(n => {
        if (!notasByPendiente[n.pendiente_id]) notasByPendiente[n.pendiente_id] = [];
        notasByPendiente[n.pendiente_id].push(n);
      });
    }

    renderPendientes();
    updatePendCount();
    suscribirPendientes();
    pedirPermisoNotificaciones();
    // Mostrar solo los tipos de trabajo habilitados para el usuario logueado
    filtrarOpcionesTipoPendiente();
    // Recalcular alertas con los pendientes recién cargados
    if (typeof refreshAlertas === 'function') refreshAlertas();
  } catch (e) {
    console.error('Error cargando pendientes', e);
    const list = document.getElementById('pend-list');
    if (list) list.innerHTML = `<div class="card" style="text-align:center;color:var(--red);padding:24px">No se pudieron cargar los pendientes. ${e.message}</div>`;
  }
}

function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('#pendientes .pend-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  renderPendientes();
  updatePendCount();
}

function getVisiblePendientes() {
  let arr = pendientes;

  // Filtro Mis / Equipo
  // "Mis pendientes"  → solo los asignados a mí
  // "Todos del equipo" → solo los de los demás (los míos ya los veo en "Mis pendientes")
  const me = getCurrentUserName();
  if (viewMode === 'mis') {
    arr = me ? arr.filter(p => p.asesor === me) : [];
  } else if (viewMode === 'equipo') {
    arr = me ? arr.filter(p => p.asesor !== me) : arr;
  }

  // Filtro por categoria (matchea substring en categoriaLabel, o flag interno)
  if (catFilter === '__interno__') {
    arr = arr.filter(p => p.interno);
  } else if (catFilter) {
    arr = arr.filter(p => {
      const c = (p.categoriaLabel || '').toLowerCase();
      return c.includes(catFilter);
    });
  }

  // Filtro por texto (cliente, descripcion, asesor)
  if (searchText) {
    const q = searchText.toLowerCase();
    arr = arr.filter(p =>
      (p.cliente || '').toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q) ||
      (p.asesor || '').toLowerCase().includes(q) ||
      (p.intento || '').toLowerCase().includes(q) ||
      (p.proxPaso || '').toLowerCase().includes(q)
    );
  }

  return arr;
}

function setCatFilter(cat, btn) {
  catFilter = cat || '';
  document.querySelectorAll('#pendientes .pend-cat').forEach(b => {
    b.classList.toggle('active', b === btn);
  });
  renderPendientes();
}

function setSearchText(text) {
  searchText = (text || '').trim();
  renderPendientes();
}

function renderPendientes() {
  const list = document.getElementById('pend-list');
  if (!list) return;
  const visible = getVisiblePendientes();
  if (visible.length === 0) {
    const txt = viewMode === 'mis'
      ? 'No tenes pendientes activos. Buen trabajo.'
      : 'No hay pendientes activos en el equipo.';
    list.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:40px"><div style="font-size:14px">${txt}</div></div>`;
    return;
  }

  if (groupByCliente) {
    // Agrupar por cliente
    const groups = {};
    visible.forEach(p => {
      if (!groups[p.cliente]) groups[p.cliente] = [];
      groups[p.cliente].push(p);
    });
    // Ordenar clientes por cantidad de pendientes (descendente), luego alfabetico
    const orderedClientes = Object.keys(groups).sort((a, b) => {
      const diff = groups[b].length - groups[a].length;
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    list.innerHTML = orderedClientes.map(cliente => {
      const lookup = CLIENTES_LOOKUP[cliente] || { tipo: 'empresa', iniciales: cliente.substring(0, 2).toUpperCase() };
      const tipoLabel = TIPO_LABELS[lookup.tipo] || '';
      const cards = groups[cliente].map(renderPendienteCard).join('');
      return `
        <div class="grupo-cliente">
          <div class="grupo-cliente-header">
            <div class="av av-${lookup.tipo}">${lookup.iniciales}</div>
            <div class="grupo-cliente-name">${cliente}</div>
            ${tipoLabel ? `<span class="tipo-tag tipo-${lookup.tipo}">${tipoLabel}</span>` : ''}
            <span class="grupo-cliente-count">${groups[cliente].length} pendiente${groups[cliente].length !== 1 ? 's' : ''}</span>
          </div>
          ${cards}
        </div>`;
    }).join('');
  } else {
    list.innerHTML = visible.map(renderPendienteCard).join('');
  }
}

function toggleGroupByCliente() {
  groupByCliente = !groupByCliente;
  const btn = document.getElementById('group-by-cliente-btn');
  if (btn) {
    btn.classList.toggle('active', groupByCliente);
    btn.textContent = groupByCliente ? 'Lista plana' : 'Agrupar por cliente';
  }
  renderPendientes();
}

function renderPendienteCard(p) {
  // Color por tipo de pendiente (pastel)
  const TIPO_COLORES = {
    soporte:        { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)'  },  // azul
    implementacion: { border: '#f59e0b', bg: 'rgba(245,158,11,0.07)'  },  // ámbar
    bug:            { border: '#ef4444', bg: 'rgba(239,68,68,0.06)'   },  // rojo
    comercial:      { border: '#22c55e', bg: 'rgba(34,197,94,0.07)'   },  // verde
    interno:        { border: '#8b5cf6', bg: 'rgba(139,92,246,0.07)'  },  // violeta
  };

  const tipoClave  = p.interno ? 'interno' : (p.tipoPendiente || 'soporte');
  const tipoColor  = TIPO_COLORES[tipoClave] || TIPO_COLORES.soporte;

  const borderColor = tipoColor.border;
  const cardBg      = tipoColor.bg;

  const prioBadge   = { alta: 'b-red', media: 'b-amber', baja: 'b-gray' }[p.prioridad] || 'b-gray';
  const prioLabel   = { alta: 'Alta prioridad', media: 'Media prioridad', baja: 'Baja prioridad' }[p.prioridad] || p.prioridad;
  const tipoLabel   = TIPO_LABELS[p.tipo] || '';
  const tipoPend    = TIPO_PENDIENTE[p.tipoPendiente] || null;
  const venc        = vencimientoInfo(p.createdAt);
  // Si está vencido o vence hoy, forzar borde rojo
  const finalBorder = (!p.interno && venc && venc.urgente) ? '#ef4444' : borderColor;
  const notas = notasByPendiente[p.id] || [];
  // Whaticket URL viene del cliente vinculado (CLIENTES_LOOKUP se llena en clientes.js)
  const whaticketUrl = (CLIENTES_LOOKUP[p.cliente] || {}).whaticket_url;
  // Permisos: solo el asesor asignado (o nadie asignado) puede modificar
  const puedoEditar = puedeEditarPendiente(p);

  return `
    <div class="card" data-pend-id="${p.id}" style="border-left:5px solid ${finalBorder};${(!p.interno && venc && venc.urgente) ? 'background:rgba(239,68,68,0.08)' : ''}">
      <div class="card-header-row" style="margin-bottom:12px">
        <div class="identity-row identity-row--top">
          ${p.interno
            ? `<div class="av" style="margin-top:2px;background:var(--amber-bg,#fef8ee);color:var(--amber,#b45309);font-size:11px;font-weight:700">CF</div>`
            : `<div class="av av-${p.tipo}" style="margin-top:2px">${p.iniciales}</div>`
          }
          <div>
            <div class="tag-row">
              <span class="pendiente-name">${p.interno ? 'Consultora Ferro' : p.cliente}</span>
              ${!p.interno && tipoLabel ? `<span class="tipo-tag tipo-${p.tipo}">${tipoLabel}</span>` : ''}
              ${p.interno
                ? (p.categoriaLabel ? `<span class="badge b-blue">${p.categoriaLabel}</span>` : '')
                : (tipoPend ? `<span class="badge ${tipoPend.badge}" title="Tipo: ${tipoPend.label}">${tipoPend.emoji} ${tipoPend.label}</span>` : '')
              }
              <span class="badge ${prioBadge}">${prioLabel}</span>
              ${venc ? `<span class="badge ${venc.badge}" title="Plazo de 5 dias">⏰ ${venc.label}</span>` : ''}
              <span class="text-meta-sm">${p.cuando} &middot; ${p.asesor}</span>
            </div>
            <div class="pendiente-desc">${p.descripcion}</div>
          </div>
        </div>
        ${p.interno
          ? `<span class="badge b-amber" style="flex-shrink:0">🔒 Interno</span>`
          : `<span class="badge ${p.categoriaBadge || 'b-gray'}">${p.categoriaLabel || ''}</span>`
        }
      </div>
      ${p.intento  ? `<div class="info-pill"><div class="info-pill__label">Lo que se intento</div><div class="info-pill__body">${p.intento}</div></div>` : ''}
      ${p.proxPaso ? `<div class="info-pill info-pill--accent"><div class="info-pill__label">Proximo paso</div><div class="info-pill__body">${p.proxPaso}</div></div>` : ''}

      <div class="notas-section" data-pend-id="${p.id}">
        ${notas.length > 0 ? `
          <div class="notas-label">Notas (${notas.length})</div>
          <div class="notas-list">
            ${notas.map(renderNota).join('')}
          </div>` : ''}
        <div class="nota-form" id="nota-form-${p.id}" style="display:none">
          <textarea class="nota-textarea" id="nota-input-${p.id}" placeholder="Que paso? Ej: llame, no atendio. Le mande mensaje al WhatsApp..."></textarea>
          <div class="btn-row" style="margin-top:6px">
            <button class="btn-primary btn-primary--sm" onclick="agregarNota('${p.id}')">Guardar nota</button>
            <button class="btn-sm" onclick="toggleNotaForm('${p.id}', false)">Cancelar</button>
          </div>
        </div>
      </div>

      ${renderHistorial(p)}

      <div class="btn-row">
        ${puedoEditar ? `<button class="btn-primary btn-primary--sm" onclick="cerrarPendiente('${p.id}',this)">Marcar como resuelto</button>` : ''}
        <button class="btn-secondary btn-secondary--sm" onclick="toggleNotaForm('${p.id}', true)">Agregar nota</button>
        ${puedoEditar ? `<button class="btn-sm" onclick="reasignarPendiente('${p.id}',this)">Reasignar</button>` : ''}
        ${whaticketUrl ? `<a class="btn-sm wt-btn" href="${escapeHtml(whaticketUrl)}" target="_blank" rel="noopener" title="Abrir chat en Whaticket">🎫 Whaticket</a>` : ''}
        <button class="btn-sm" onclick="toggleHistorial('${p.id}')">${historialAbierto[p.id] ? 'Ocultar' : 'Ver'} historial</button>
        ${!puedoEditar ? `<span class="readonly-badge" title="Solo ${escapeHtml(p.asesor)} puede modificar este pendiente">🔒 Asignado a ${escapeHtml(p.asesor)}</span>` : ''}
      </div>
    </div>`;
}

// Devuelve true si el usuario actual puede modificar este pendiente.
// Regla:
//   - Sin asesor asignado → cualquiera puede tomarla
//   - Con asesor → solo esa persona puede modificar (cerrar, reasignar)
function puedeEditarPendiente(p) {
  const me = getCurrentUserName();
  if (!me) return false;
  if (!p.asesor) return true;
  return p.asesor === me;
}

function renderNota(nota) {
  return `
    <div class="nota">
      <div class="nota-header">
        <span class="nota-autor">${nota.autor_nombre}</span>
        <span class="nota-time">${tiempoRelativo(nota.created_at)}</span>
      </div>
      <div class="nota-texto">${escapeHtml(nota.texto)}</div>
    </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

// ────────── Notas ──────────

function toggleNotaForm(pendienteId, show) {
  const form = document.getElementById(`nota-form-${pendienteId}`);
  if (!form) return;
  form.style.display = show ? 'block' : 'none';
  if (show) {
    const ta = document.getElementById(`nota-input-${pendienteId}`);
    if (ta) ta.focus();
  }
}

async function agregarNota(pendienteId) {
  const ta = document.getElementById(`nota-input-${pendienteId}`);
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }

  if (!currentMember) {
    alert('No se pudo identificar tu sesion. Recargá la página.');
    return;
  }

  const row = {
    pendiente_id: pendienteId,
    autor_email:  currentMember.email,
    autor_nombre: currentMember.nombre,
    texto:        texto
  };

  try {
    const inserted = await dbInsert('pendiente_notas', row);
    if (!notasByPendiente[pendienteId]) notasByPendiente[pendienteId] = [];
    if (!notasByPendiente[pendienteId].find(n => n.id === inserted.id)) {
      notasByPendiente[pendienteId].push(inserted);
    }
    logEvento(pendienteId, 'nota', texto.length > 80 ? texto.substring(0, 77) + '...' : texto);
    ta.value = '';
    toggleNotaForm(pendienteId, false);
    renderPendientes();
    toast('Nota agregada');
  } catch (e) {
    console.error('Error guardando nota', e);
    alert('No se pudo guardar la nota: ' + e.message);
  }
}

// ────────── Acciones existentes ──────────

function showPendForm() {
  const f = document.getElementById('pend-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

// Muestra/oculta campos según si el pendiente es interno
function toggleInternoForm() {
  const esInterno = document.getElementById('pf-interno')?.checked;

  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  };

  show('pf-cliente-group',       !esInterno);
  show('pf-tipo-group',          !esInterno);
  show('pf-cat-group',           !esInterno);
  show('pf-intento-row',         !esInterno);  // ocultar "lo que se intentó" en internos
  show('pf-asesor-group',        !esInterno);
  show('pf-asesores-multi-group', esInterno);
  show('pf-tipo-interno-row',     esInterno);

  // Actualizar placeholder del textarea de descripción
  const lbl = document.getElementById('pf-desc-label');
  if (lbl) lbl.textContent = esInterno ? 'Descripción / detalle' : '¿Qué quedó pendiente? Describilo en detalle';

  // Limpiar chips al desactivar
  if (!esInterno) {
    document.querySelectorAll('.pf-asesor-chip').forEach(c => c.classList.remove('selected'));
  }
}

// Activa/desactiva un chip de asesor
function toggleAsesorChip(btn) {
  if (btn.classList.contains('pf-asesor-chip--todos')) return; // maneja toggleTodosAsesores
  btn.classList.toggle('selected');
}

// Selecciona / deselecciona todos los asesores
function toggleTodosAsesores() {
  const chk   = document.getElementById('pf-todos-check');
  const chips = document.querySelectorAll('.pf-asesor-chip');
  const marcar = chk ? chk.checked : !Array.from(chips).every(c => c.classList.contains('selected'));
  chips.forEach(c => c.classList.toggle('selected', marcar));
  if (chk) chk.checked = marcar;
}

// Muestra/oculta el input custom del tipo interno
function togglePfTipoInternoCustom() {
  const val    = document.getElementById('pf-tipo-interno')?.value;
  const custom = document.getElementById('pf-tipo-interno-custom');
  if (custom) {
    custom.style.display = val === 'otro' ? 'block' : 'none';
    if (val !== 'otro') custom.value = '';
  }
}

function togglePfCatCustom() {
  const val    = (document.getElementById('pf-cat') || {}).value;
  const custom = document.getElementById('pf-cat-custom');
  if (!custom) return;
  custom.style.display = val === 'otro' ? 'block' : 'none';
  if (val !== 'otro') custom.value = '';
}

async function guardarPendiente() {
  const desc = document.getElementById('pf-desc').value.trim();
  if (!desc) { alert('Describi que quedo pendiente.'); return; }

  const cliente = document.getElementById('pf-cliente').value;
  const asesor  = document.getElementById('pf-asesor').value;
  const prio    = document.getElementById('pf-prio').value;
  const intento = document.getElementById('pf-intento').value.trim();
  const prox    = document.getElementById('pf-prox').value.trim();
  const catSelect  = document.getElementById('pf-cat').value;
  const catCustom  = ((document.getElementById('pf-cat-custom') || {}).value || '').trim();
  const cat        = catSelect === 'otro' ? catCustom : catSelect;
  if (catSelect === 'otro' && !catCustom) {
    alert('Escribí el nombre de la nueva categoría.'); document.getElementById('pf-cat-custom').focus(); return;
  }
  const tipoP   = (document.getElementById('pf-tipo') || {}).value || 'soporte';

  const internoCheck = document.getElementById('pf-interno');
  const esInterno    = internoCheck ? internoCheck.checked : false;

  // Para internos: leer asesores desde chips y tipo interno
  let asesoresDestino = [];
  let categoriaFinal  = cat;
  if (esInterno) {
    asesoresDestino = Array.from(document.querySelectorAll('.pf-asesor-chip.selected:not(.pf-asesor-chip--todos)'))
      .map(c => c.dataset.asesor);
    if (asesoresDestino.length === 0) {
      alert('Seleccioná al menos un asesor para el pendiente interno.');
      return;
    }
    const tipoInterno     = document.getElementById('pf-tipo-interno')?.value || 'reunion';
    const tipoCustom      = document.getElementById('pf-tipo-interno-custom')?.value.trim() || '';
    const tipoInternoLabels = { reunion: 'Reunión', actualizacion: 'Actualización', revision: 'Revisión', otro: tipoCustom };
    categoriaFinal = tipoInterno === 'otro' ? (tipoCustom || 'Interno') : (tipoInternoLabels[tipoInterno] || 'Interno');
  } else {
    asesoresDestino = [asesor];
  }

  const baseRow = {
    cliente_nombre: esInterno ? 'Consultora Ferro' : cliente,
    prioridad:      prio,
    categoria:      categoriaFinal,
    descripcion:    desc,
    intento:        esInterno ? null : (intento || null),
    prox_paso:      prox || null,
    tipo_pendiente: esInterno ? 'soporte' : tipoP,
    resuelto:       false,
    interno:        esInterno
  };

  try {
    // Crear un pendiente por cada asesor seleccionado
    for (const a of asesoresDestino) {
      const row = { ...baseRow, asesor: a };
      const inserted = await dbInsert('pendientes', row);
      const ya = pendientes.find(p => p.id === inserted.id);
      if (!ya) pendientes.unshift(dbRowToPendiente(inserted));
      logEvento(inserted.id, 'creado', `Asignado a ${a}, prioridad ${prio}`);
    }

    document.getElementById('pend-form').style.display = 'none';
    document.getElementById('pf-desc').value = '';
    document.getElementById('pf-intento').value = '';
    document.getElementById('pf-prox').value = '';
    // Limpiar buscador de cliente
    const pfSearch = document.getElementById('pf-cliente-search');
    if (pfSearch) pfSearch.value = '';
    const pfDrop = document.getElementById('pf-cliente-dropdown');
    if (pfDrop) pfDrop.style.display = 'none';
    const pfSel = document.getElementById('pf-cliente');
    if (pfSel) pfSel.value = '';
    const chk = document.getElementById('pf-interno');
    if (chk) { chk.checked = false; toggleInternoForm(); }
    document.querySelectorAll('.pf-asesor-chip').forEach(c => c.classList.remove('selected'));
    renderPendientes();
    updatePendCount();
    const me = getCurrentUserName();
    const msg = esInterno && asesoresDestino.length > 1
      ? `${asesoresDestino.length} pendientes internos creados`
      : (me && asesoresDestino[0] !== me) ? `Pendiente asignado a ${asesoresDestino[0]}` : 'Pendiente guardado';
    toast(msg);
  } catch (e) {
    console.error('Error guardando pendiente', e);
    alert('No se pudo guardar el pendiente: ' + e.message);
  }
}

// cerrarPendiente: abre el modal de cierre con tiempo (obligatorio) y solución (opcional).
// Al confirmar, marca el pendiente como resuelto Y crea una consulta en Supabase
// para que las métricas del panel se alimenten automáticamente.
//
// Excepcion: tipo 'implementacion' se cierra directo (son tareas de onboarding,
// no consultas de soporte, no generan métricas).
function cerrarPendiente(id, btn) {
  const p = pendientes.find(x => x.id === id);
  if (!p) {
    cerrarPendienteEjecutar(id, btn);
    return;
  }
  if (!puedeEditarPendiente(p)) {
    alert(`Solo ${p.asesor} puede marcar este pendiente como resuelto.`);
    return;
  }
  // Interno: cierre directo sin modal ni métricas (tarea del equipo, no del cliente)
  if (p.interno) {
    cerrarPendienteEjecutar(id, btn);
    return;
  }
  // Implementacion: cierre directo sin métricas
  if (p.tipoPendiente === 'implementacion') {
    cerrarPendienteEjecutar(id, btn);
    return;
  }
  // Daniel Ferro (comercial): cierre directo sin modal ni métricas
  // Sus pendientes son agendas y reuniones, no consultas de soporte.
  if (['Daniel Ferro'].includes(getCurrentUserName())) {
    cerrarPendienteEjecutar(id, btn);
    return;
  }

  // Todos los demás: modal con tiempo + solución opcional
  abrirModalCierrePendiente(p, btn);
}

// ── Estado del modal de cierre ──
let _cierreState = null; // { p, btn, solucionId }

// Abre el modal de cierre: tiempo obligatorio + solución opcional.
// Alfred y Daniel Ferro ven solo el campo de tiempo (sin selector de solución).
function abrirModalCierrePendiente(p, btn) {
  const esProg      = p.tipoPendiente === 'bug';
  const mostrarSolucion = !esProg && !['Alfredo Cesar'].includes(getCurrentUserName());

  _cierreState = { p, btn, solucionId: null };

  const anterior = document.getElementById('modal-cierre-pendiente');
  if (anterior) anterior.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-cierre-pendiente';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:460px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Marcar como resuelto</div>
          <div class="modal-sub">Cliente: <strong>${escapeHtmlPend(p.cliente)}</strong> &middot; ${escapeHtmlPend(p.descripcion ? p.descripcion.substring(0, 60) + (p.descripcion.length > 60 ? '…' : '') : '')}</div>
        </div>
        <button class="btn-sm" onclick="cancelarCierrePendiente()" title="Cancelar">✕</button>
      </div>

      <div class="modal-body">
      <!-- Tiempo: siempre -->
      <div class="form-group" style="margin-bottom:18px">
        <label class="fl">
          ⏱ Tiempo de ${esProg ? 'programación' : 'resolución'} (hs)
          <span style="color:var(--red);margin-left:2px">*</span>
        </label>
        <input type="number" id="cierre-tiempo" placeholder="Ej: 1.5" step="0.5" min="0"
          style="font-size:15px;font-weight:600" />
        <div style="font-size:11px;color:var(--text3);margin-top:5px">
          Obligatorio. Nos permite medir cuánto consume cada cliente.
        </div>
      </div>

      <!-- Qué se programó: solo programación -->
      ${esProg ? `
      <div class="form-group" style="margin-bottom:18px">
        <label class="fl">🐛 ¿Qué se programó? <span style="color:var(--red);margin-left:2px">*</span></label>
        <textarea id="cierre-prog-realizada" placeholder="Describí qué fue lo que se desarrolló o modificó para el cliente..."
          style="min-height:80px;font-size:13px;resize:vertical"></textarea>
      </div>
      ` : `
      <!-- Repetida: solo soporte/comercial -->
      <div class="form-group" style="margin-bottom:18px">
        <label class="fl">
          🔁 ¿Es una consulta repetida?
          <span style="color:var(--red);margin-left:2px">*</span>
        </label>
        <select id="cierre-repetida" style="font-size:13px">
          <option value="no">No — es una consulta nueva</option>
          <option value="si">Sí — el cliente ya consultó esto antes</option>
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:5px">
          Alimenta el % de repetición del cliente en el panel.
        </div>
      </div>

      <!-- Material + Remota -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
        <div class="form-group" style="margin-bottom:0">
          <label class="fl">📎 Material enviado <span style="color:var(--red);margin-left:2px">*</span></label>
          <select id="cierre-material" style="font-size:13px">
            <option value="ninguno">Ninguno</option>
            <option value="video">Video</option>
            <option value="pdf">PDF / imagen</option>
            <option value="varios">Varios materiales</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="fl">🖥 Conexión remota <span style="color:var(--red);margin-left:2px">*</span></label>
          <select id="cierre-remota" style="font-size:13px">
            <option value="no">No — solo por chat</option>
            <option value="si">Sí — nos conectamos</option>
            <option value="llamada">Llamada de voz</option>
          </select>
        </div>
      </div>

      <!-- Solución: solo soporte -->
      ${mostrarSolucion ? `
      <div class="form-group" id="cierre-sol-section" style="margin-bottom:18px">
        <label class="fl">¿Cómo lo resolviste? <span style="color:var(--text3)">(opcional)</span></label>
        <div id="cierre-sol-elegida" style="display:none;margin-bottom:8px"></div>
        <button type="button" class="btn-sm" onclick="elegirSolucionCierre()" id="cierre-btn-elegir">
          🔗 Elegir de la base de soluciones
        </button>
        <div style="margin-top:10px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:5px">
            O escribí los pasos directamente — se van a guardar en la base de soluciones:
          </div>
          <textarea id="cierre-sol-nueva" placeholder="Paso 1: ...&#10;Paso 2: ...&#10;Paso 3: ..."
            style="min-height:80px;font-size:12px;resize:vertical"></textarea>
        </div>
      </div>
      ` : ''}
      `}
      </div><!-- /.modal-body -->

      <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border);flex-shrink:0">
        <button class="btn-secondary" onclick="cancelarCierrePendiente()">Cancelar</button>
        <button class="btn-primary" onclick="confirmarCierrePendiente()">✓ Marcar como resuelto</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) cancelarCierrePendiente(); });
  document.body.appendChild(overlay);
  setTimeout(() => { const el = document.getElementById('cierre-tiempo'); if (el) el.focus(); }, 80);
}

function cancelarCierrePendiente() {
  const m = document.getElementById('modal-cierre-pendiente');
  if (m) m.remove();
  _cierreState = null;
}

// Abre el selector de soluciones dentro del modal de cierre
function elegirSolucionCierre() {
  if (!_cierreState) return;
  const p = _cierreState.p;
  abrirModalSolucionUsada({
    cliente: p.cliente,
    contextoDescripcion: p.descripcion || '',
    mostrarDocumentar: false,
    tituloModal: '¿Qué solución aplicaste?',
    subtituloModal: `Elegí la solución que usaste para cerrar este pendiente de <strong>${escapeHtmlPend(p.cliente)}</strong>.`,
    onSeleccionar: (solucionId, accion) => {
      if (accion === 'elegida' && solucionId) {
        _cierreState.solucionId = solucionId;
        renderSolucionElegidaCierre(solucionId);
        // Ocultar textarea de solución nueva — ya tienen una de la base
        const ta = document.getElementById('cierre-sol-nueva');
        if (ta) { ta.value = ''; ta.style.display = 'none'; }
        const btn = document.getElementById('cierre-btn-elegir');
        if (btn) btn.style.display = 'none';
      }
    }
  });
}

// Muestra la solución elegida en el modal de cierre
function renderSolucionElegidaCierre(solucionId) {
  const cont = document.getElementById('cierre-sol-elegida');
  if (!cont) return;
  const s = (soluciones || []).find(x => x.id === solucionId);
  if (!s) { cont.style.display = 'none'; return; }
  const cat = (typeof CATS !== 'undefined' && CATS[s.cat]) || { label: s.cat, bg: '#eee', text: '#444' };
  cont.style.display = 'flex';
  cont.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--green-bg);border-radius:8px;margin-bottom:8px';
  cont.innerHTML = `
    <div>
      <div style="font-weight:600;font-size:13px">${escapeHtmlPend(s.titulo)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        <span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
        &middot; ${s.usos} uso${s.usos !== 1 ? 's' : ''}
      </div>
    </div>
    <button class="btn-sm" onclick="
      _cierreState.solucionId=null;
      document.getElementById('cierre-sol-elegida').style.display='none';
      const ta=document.getElementById('cierre-sol-nueva');
      if(ta) ta.style.display='';
      const btn=document.getElementById('cierre-btn-elegir');
      if(btn) btn.style.display='';
    " title="Quitar">✕</button>
  `;
}

// Confirma el cierre: valida tiempo, cierra el pendiente y crea la consulta
async function confirmarCierrePendiente() {
  if (!_cierreState) return;

  const tiempoVal = document.getElementById('cierre-tiempo')?.value;
  const tiempo = parseFloat(tiempoVal);
  if (!tiempoVal || isNaN(tiempo) || tiempo <= 0) {
    alert('El tiempo de resolución es obligatorio. Ingresá cuántas horas te llevó (ej: 0.5, 1, 2.5).');
    document.getElementById('cierre-tiempo')?.focus();
    return;
  }

  const { p, btn, solucionId } = _cierreState;
  const esProg = p.tipoPendiente === 'bug';

  // Para programación: leer qué se programó (obligatorio)
  const progRealizada = (document.getElementById('cierre-prog-realizada')?.value || '').trim();
  if (esProg && !progRealizada) {
    alert('Describí qué se programó para el cliente.');
    document.getElementById('cierre-prog-realizada')?.focus();
    return;
  }

  // Para soporte/comercial: leer campos estándar
  const solNuevaTexto = esProg ? '' : (document.getElementById('cierre-sol-nueva')?.value || '').trim();
  const repetida = esProg ? 'no' : (document.getElementById('cierre-repetida')?.value || 'no');
  const material = esProg ? 'ninguno' : (document.getElementById('cierre-material')?.value || 'ninguno');
  const remota   = esProg ? 'no'     : (document.getElementById('cierre-remota')?.value   || 'no');

  // Si eligieron solución de la base → sumar uso
  // Si escribieron pasos → crear nueva solución en la base
  let solucionIdFinal = solucionId;

  if (!solucionId && solNuevaTexto) {
    // Crear nueva solución desde los pasos escritos
    const pasos = solNuevaTexto.split('\n')
      .map(l => l.replace(/^\s*paso\s*\d+\s*[:\.\-]?\s*/i, '').trim())
      .filter(l => l.length > 0);

    if (pasos.length > 0) {
      const autor    = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
      const titulo   = p.descripcion
        ? (p.descripcion.length > 200 ? p.descripcion.substring(0, 197) + '...' : p.descripcion)
        : 'Solución desde pendiente';
      // Mapear categoria del pendiente a clave de CATS
      const catKey = Object.keys(CATS || {}).find(k =>
        (p.categoriaLabel || '').toLowerCase().includes(k.toLowerCase())
      ) || 'fuera';

      try {
        const inserted = await dbInsert('soluciones', {
          titulo, cat: catKey, sub: 'Seguimiento',
          pasos, material: 'Sin material', aplica: 'Todos',
          autor, usos: 1
        });
        solucionIdFinal = inserted.id;
        toast('Nueva solución guardada en la base');
      } catch (e) {
        console.warn('No se pudo crear la solución', e);
      }
    }
  } else if (solucionId && typeof incrementarUsoSolucion === 'function') {
    incrementarUsoSolucion(solucionId).catch(e => console.warn('No se pudo sumar uso', e));
  }

  cancelarCierrePendiente();

  // 1. Marcar pendiente como resuelto
  await cerrarPendienteEjecutar(p.id, btn);

  // 2. Crear consulta para alimentar las métricas
  await crearConsultaDesdePendiente(p, tiempo, solucionIdFinal, repetida, material, remota, progRealizada);
}

// Crea un registro en la tabla consultas a partir de un pendiente cerrado.
// Esto alimenta las métricas del panel (gráficos, score de cliente, etc.).
async function crearConsultaDesdePendiente(p, tiempo, solucionId, repetida = 'no', material = 'ninguno', remota = 'no', progRealizada = '') {
  const asesor     = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
  const clienteObj = (typeof clientes !== 'undefined') ? clientes.find(c => c.nombre === p.cliente) : null;

  const esProg = p.tipoPendiente === 'bug';

  // Categoría: programación usa su propia categoría, el resto mapea desde el pendiente
  const categoria = esProg
    ? 'programacion'
    : ((typeof CATS !== 'undefined' && p.categoriaLabel && CATS[p.categoriaLabel])
        ? p.categoriaLabel
        : ({ comercial: 'fuera', soporte: 'fuera' }[p.tipoPendiente] || 'fuera'));

  const tipoConsulta = esProg ? 'programacion'
    : (p.tipoPendiente === 'comercial' ? 'comercial' : 'soporte');

  try {
    const inserted = await dbInsert('consultas', {
      cliente_id:        clienteObj?.id || null,
      cliente_nombre:    p.cliente,
      asesor,
      categoria,
      subtema:           esProg ? (p.categoriaLabel || 'Programación') : 'Seguimiento',
      repetida:          esProg ? false : repetida === 'si',
      descripcion:       esProg && progRealizada
                           ? (p.descripcion ? p.descripcion + '\n\n✅ Programado: ' + progRealizada : '✅ Programado: ' + progRealizada)
                           : (p.descripcion || null),
      tiempo_resolucion: tiempo,
      solucion_id:       esProg ? null : (solucionId || null),
      material:          esProg ? null : (material !== 'ninguno' ? material : null),
      conexion_remota:   esProg ? false : remota === 'si',
      tipo_consulta:     tipoConsulta
    });

    if (typeof consultas !== 'undefined') {
      consultas.unshift({
        id:           inserted.id,
        cliente:      p.cliente,
        asesor,
        categoria,
        subtema:      esProg ? (p.categoriaLabel || 'Programación') : 'Seguimiento',
        repetida:     esProg ? 'no' : (repetida === 'si' ? 'si' : 'no'),
        descripcion:  p.descripcion || null,
        solucionId:   esProg ? null : (solucionId || null),
        material:     esProg ? null : (material !== 'ninguno' ? material : null),
        remota:       esProg ? false : remota === 'si',
        tipoConsulta: tipoConsulta,
        tiempo:       tiempo,
        timestamp:    inserted.created_at || new Date().toISOString()
      });
    }

    if (typeof refreshPanelMetrics  === 'function') refreshPanelMetrics();
    if (typeof renderClientes       === 'function') renderClientes();
    if (typeof recalcularScoreCliente === 'function') recalcularScoreCliente(p.cliente);

  } catch (e) {
    console.error('Error creando consulta desde pendiente', e);
    // No alertar: el pendiente ya se cerró correctamente, esto es secundario
  }
}

// Helper de escape para este módulo
function escapeHtmlPend(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// La logica real de cierre. Devuelve una Promise para encadenar el incremento.
async function cerrarPendienteEjecutar(id, btn) {
  const card = document.querySelector(`[data-pend-id="${id}"]`);
  if (card) {
    card.style.opacity = '0.45';
    card.style.transition = 'opacity .3s';
    if (btn) {
      btn.textContent = 'Resuelto';
      btn.disabled = true;
      btn.style.background = 'var(--green)';
    }
  }

  try {
    await dbUpdate('pendientes', id, { resuelto: true, resolved_at: new Date().toISOString() });
    logEvento(id, 'cerrado', null);

    // Sincronizar con tarea de implementacion vinculada (si existe).
    // Consultamos siempre la DB para no depender del estado local que puede
    // estar desactualizado por el realtime.
    try {
      const { data: tareasLink, error: errLink } = await sb()
        .from('implementacion_tareas')
        .select('id, estado')
        .eq('pendiente_id', id);
      if (errLink) {
        console.warn('Error buscando tareas vinculadas', errLink);
      } else if (Array.isArray(tareasLink) && tareasLink.length > 0) {
        for (const tl of tareasLink) {
          if (tl.estado !== 'completada') {
            await dbUpdate('implementacion_tareas', tl.id, { estado: 'completada' });
          }
        }
      }
    } catch (errImpl) {
      console.warn('No se pudo sincronizar tarea de implementacion al cerrar pendiente', errImpl);
    }

    pendientes = pendientes.filter(p => p.id !== id);
    delete notasByPendiente[id];
    pendientesCerradosMes++;
    setTimeout(() => { renderPendientes(); }, 800);
    updatePendCount();
    toast('Pendiente cerrado correctamente');
  } catch (e) {
    console.error('Error cerrando pendiente', e);
    alert('No se pudo cerrar el pendiente: ' + e.message);
    if (card) {
      card.style.opacity = '1';
      if (btn) {
        btn.textContent = 'Marcar como resuelto';
        btn.disabled = false;
        btn.style.background = '';
      }
    }
  }
}

// Modal opcional para preguntar que solucion se uso.
// Es reusable: lo usan pendientes.js (al cerrar pendiente) y consultas.js
// (al registrar consulta).
//
// opts:
//   - cliente             (string) nombre del cliente, para mostrar en el subtitulo
//   - onSeleccionar(idOrNull, accion) callback cuando el usuario elige.
//                                     accion = 'elegida' | 'salto' | 'documentar-nueva'
//   - mostrarDocumentar   (bool, default true) si muestra el boton "Documentar nueva"
//   - contextoDescripcion (string, opcional) texto que pre-carga el form de KB
//                          si el usuario elige "Documentar nueva"
//   - tituloModal         (string, opcional) override del titulo
//   - subtituloModal      (string, opcional) override del subtitulo
function abrirModalSolucionUsada(opts) {
  // Compatibilidad hacia atras: si se llama con (pendiente, onSeleccionar)
  // armamos opts como antes
  if (arguments.length >= 2 && typeof arguments[1] === 'function') {
    const pend = arguments[0];
    const cb   = arguments[1];
    opts = {
      cliente: pend.cliente,
      contextoDescripcion: pend.descripcion,
      mostrarDocumentar: true,
      onSeleccionar: cb
    };
  }
  opts = opts || {};
  const cliente             = opts.cliente || '';
  const onSeleccionar       = opts.onSeleccionar || function() {};
  const mostrarDocumentar   = opts.mostrarDocumentar !== false; // default true
  const contextoDescripcion = opts.contextoDescripcion || '';
  const tituloModal         = opts.tituloModal || '¿Qué solución usaste?';
  const subtituloModal      = opts.subtituloModal ||
    `Opcional. Sumar 1 al contador de la solución que aplicaste${cliente ? ' para <strong>' + escapeHtml(cliente) + '</strong>' : ''}.`;

  // Cerrar cualquier modal previo
  const existing = document.getElementById('modal-solucion-usada');
  if (existing) existing.remove();

  // Si todavia no se cargaron las soluciones, saltamos directo
  if (!Array.isArray(soluciones) || soluciones.length === 0) {
    onSeleccionar(null, 'salto');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'modal-solucion-usada';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <div class="modal-title">${escapeHtml(tituloModal)}</div>
          <div class="modal-sub">${subtituloModal}</div>
        </div>
        <button class="btn-sm" onclick="cerrarModalSolucion()" title="Cerrar sin marcar">✕</button>
      </div>

      <input type="text" id="modal-sol-search" class="modal-search" placeholder="Buscar solución por título o categoría..." oninput="filtrarModalSoluciones()">

      <div class="modal-list" id="modal-sol-list"></div>

      <div class="modal-actions">
        ${mostrarDocumentar ? `<button class="btn-sm" onclick="documentarNuevaDesdeModal()" title="Abrir el formulario de Base de Soluciones con el contexto pre-cargado">📝 Documentar solución nueva</button>` : ''}
        <button class="btn-secondary btn-secondary--sm" style="margin-left:auto" onclick="cerrarModalSolucionYContinuar()" title="Continuar sin marcar ninguna solución">Saltar / sin marcar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Estado del modal
  window._modalSolucionState = {
    onSeleccionar,
    contextoDescripcion,
    busqueda: ''
  };

  // Render inicial
  renderModalSoluciones();

  // Foco en busqueda
  setTimeout(() => {
    const input = document.getElementById('modal-sol-search');
    if (input) input.focus();
  }, 50);

  // Cerrar con Escape o click fuera
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModalSolucionYContinuar();
  });
  document.addEventListener('keydown', _modalEscHandler);
}

function _modalEscHandler(e) {
  if (e.key === 'Escape') cerrarModalSolucionYContinuar();
}

function cerrarModalSolucion() {
  const m = document.getElementById('modal-solucion-usada');
  if (m) m.remove();
  document.removeEventListener('keydown', _modalEscHandler);
  delete window._modalSolucionState;
}

function cerrarModalSolucionYContinuar() {
  const state = window._modalSolucionState;
  cerrarModalSolucion();
  if (state && state.onSeleccionar) state.onSeleccionar(null, 'salto');
}

function filtrarModalSoluciones() {
  const state = window._modalSolucionState;
  if (!state) return;
  const input = document.getElementById('modal-sol-search');
  state.busqueda = (input.value || '').toLowerCase().trim();
  renderModalSoluciones();
}

function renderModalSoluciones() {
  const state = window._modalSolucionState;
  if (!state) return;
  const cont = document.getElementById('modal-sol-list');
  if (!cont) return;

  let lista = soluciones.slice().sort((a, b) => (b.usos || 0) - (a.usos || 0));
  if (state.busqueda) {
    const q = state.busqueda;
    lista = lista.filter(s =>
      (s.titulo || '').toLowerCase().includes(q) ||
      ((CATS[s.cat] || {}).label || '').toLowerCase().includes(q) ||
      (s.sub || '').toLowerCase().includes(q)
    );
  }
  // Mostrar solo las primeras 30 para no saturar
  lista = lista.slice(0, 30);

  if (lista.length === 0) {
    cont.innerHTML = `<div class="modal-empty">No hay coincidencias. Podés cerrar sin marcar o documentar una nueva.</div>`;
    return;
  }

  cont.innerHTML = lista.map(s => {
    const cat = CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' };
    return `
      <button class="modal-sol-item" onclick="elegirSolucionEnModal('${s.id}')">
        <div class="modal-sol-item__title">${escapeHtml(s.titulo)}</div>
        <div class="modal-sol-item__meta">
          <span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
          <span style="color:var(--text3)">${escapeHtml(s.sub || '')} &middot; ${s.usos} uso${s.usos === 1 ? '' : 's'}</span>
        </div>
      </button>
    `;
  }).join('');
}

function elegirSolucionEnModal(solucionId) {
  const state = window._modalSolucionState;
  cerrarModalSolucion();
  if (state && state.onSeleccionar) state.onSeleccionar(solucionId, 'elegida');
}

function documentarNuevaDesdeModal() {
  const state = window._modalSolucionState;
  const contexto = state ? state.contextoDescripcion : '';
  cerrarModalSolucion();
  // Avisar al caller que el usuario eligio "documentar nueva"
  if (state && state.onSeleccionar) state.onSeleccionar(null, 'documentar-nueva');
  // Navegar a Base de soluciones y abrir el form pre-cargado
  setTimeout(() => {
    const navBtn = document.querySelector('.nav-item[onclick*=biblioteca]');
    if (navBtn) goTo(navBtn, 'biblioteca');
    setTimeout(() => {
      const f = document.getElementById('kb-form');
      if (f) f.style.display = 'block';
      const tituloInput = document.getElementById('kb-titulo');
      if (tituloInput && contexto) {
        const desc = String(contexto).trim();
        tituloInput.value = desc.length > 120 ? desc.substring(0, 117) + '...' : desc;
        tituloInput.focus();
      }
      const f2 = document.getElementById('kb-form');
      if (f2) f2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, 200);
}

function reasignarPendiente(id, btn) {
  const p = pendientes.find(x => x.id === id);
  if (!p) return;
  // Permiso: solo el asesor actual puede reasignar
  if (!puedeEditarPendiente(p)) {
    alert(`Solo ${p.asesor} puede reasignar este pendiente.`);
    return;
  }

  const row = btn.parentElement;
  const existing = row.querySelector('.reasignar-select');
  if (existing) {
    existing.remove();
    btn.style.display = '';
    return;
  }

  const actual = p.asesor || '';

  const sel = document.createElement('select');
  sel.className = 'reasignar-select';
  sel.innerHTML = '<option value="">Reasignar a...</option>' +
    TEAM_ASESORES.filter(a => a !== actual).map(a => `<option value="${a}">${a}</option>`).join('');

  sel.addEventListener('change', async () => {
    const nuevo = sel.value;
    if (!nuevo) return;
    sel.disabled = true;
    try {
      await dbUpdate('pendientes', id, { asesor: nuevo });
      logEvento(id, 'reasignado', `${actual || '(sin asignar)'} → ${nuevo}`);
      const idx = pendientes.findIndex(p => p.id === id);
      if (idx !== -1) pendientes[idx].asesor = nuevo;
      sel.remove();
      btn.style.display = '';
      renderPendientes();
      updatePendCount();
      toast(`Reasignado a ${nuevo}`);
    } catch (e) {
      console.error('Error reasignando', e);
      alert('No se pudo reasignar: ' + e.message);
      sel.disabled = false;
    }
  });

  sel.addEventListener('blur', () => {
    setTimeout(() => {
      if (sel.parentElement) {
        sel.remove();
        btn.style.display = '';
      }
    }, 200);
  });

  btn.style.display = 'none';
  row.insertBefore(sel, btn);
  sel.focus();
}

function updatePendCount() {
  const me = getCurrentUserName();
  const myCount = me ? pendientes.filter(p => p.asesor === me).length : 0;
  const total   = pendientes.length;

  // Badge del sidebar, filtros y mobile nav
  const navBadge = document.getElementById('pend-nav-badge');
  if (navBadge) navBadge.textContent = myCount;
  if (typeof syncMobilePendBadge === 'function') syncMobilePendBadge();

  const el = document.getElementById('pend-count');
  if (el) el.textContent = total;  // siempre el total (mis + equipo)

  const misCount    = document.getElementById('pend-mis-count');
  const equipoCount = document.getElementById('pend-equipo-count');
  if (misCount)    misCount.textContent    = myCount;
  if (equipoCount) equipoCount.textContent = total;

  // ── Más antiguo (sobre TODOS los pendientes activos, no solo los del filtro) ──
  const valEl = document.getElementById('pend-mas-antiguo-val');
  const subEl = document.getElementById('pend-mas-antiguo-sub');
  if (valEl && subEl) {
    if (pendientes.length === 0) {
      valEl.textContent = '—';
      valEl.style.color = 'var(--text3)';
      subEl.textContent = 'Sin pendientes activos';
    } else {
      // Ordenar por createdAt ascendente para encontrar el más viejo
      const masAntiguo = pendientes.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      const dias = diasDesde(masAntiguo.createdAt);
      if (dias === 0) {
        valEl.textContent = 'Hoy';
        valEl.style.color = 'var(--amber)';
      } else {
        valEl.textContent = dias === 1 ? '1 día' : dias + ' días';
        valEl.style.color = dias >= 3 ? 'var(--red)' : 'var(--amber)';
      }
      // Subtítulo: cliente + inicio de descripción
      const desc = masAntiguo.descripcion
        ? masAntiguo.descripcion.substring(0, 40) + (masAntiguo.descripcion.length > 40 ? '…' : '')
        : '';
      subEl.textContent = masAntiguo.cliente + (desc ? ' — ' + desc : '');
    }
  }

  // ── Cerrados este mes ──
  const cerradosEl = document.getElementById('pend-cerrados-mes');
  if (cerradosEl) cerradosEl.textContent = pendientesCerradosMes;
}



// Genera URL de WhatsApp desde un telefono. Acepta formatos varios y los
// normaliza a digitos. Si el telefono ya tiene codigo de pais lo respeta;
// si no, asume Argentina (+54).
function whatsappLink(tel) {
  if (!tel) return '#';
  let digits = tel.replace(/[^0-9]/g, '');
  if (digits.length === 0) return '#';
  // Si empieza con 0 (formato local AR), lo sacamos y agregamos 54
  if (digits.startsWith('0')) digits = '54' + digits.substring(1);
  // Si no tiene codigo de pais, asumir Argentina
  else if (digits.length === 10) digits = '54' + digits;
  return `https://wa.me/${digits}`;
}

// ────────── Audit log ──────────

async function logEvento(pendienteId, tipo, detalle) {
  if (!currentMember) return;
  try {
    await dbInsert('pendiente_eventos', {
      pendiente_id: pendienteId,
      tipo:         tipo,
      autor_email:  currentMember.email,
      autor_nombre: currentMember.nombre,
      detalle:      detalle || null
    });
  } catch (e) {
    console.warn('Error logueando evento', e);
    // No lo propagamos: la accion principal ya tuvo exito
  }
}

async function cargarEventos(pendienteId) {
  if (eventosByPendiente[pendienteId]) return; // ya cargados
  try {
    const data = await dbList('pendiente_eventos', { filter: { pendiente_id: pendienteId }, orderBy: 'created_at', ascending: false });
    eventosByPendiente[pendienteId] = data || [];
  } catch (e) {
    console.error('Error cargando eventos', e);
    eventosByPendiente[pendienteId] = [];
  }
}

async function toggleHistorial(pendienteId) {
  if (historialAbierto[pendienteId]) {
    historialAbierto[pendienteId] = false;
    renderPendientes();
    return;
  }
  await cargarEventos(pendienteId);
  historialAbierto[pendienteId] = true;
  renderPendientes();
}

function renderHistorial(p) {
  if (!historialAbierto[p.id]) return '';
  const eventos = eventosByPendiente[p.id] || [];
  const items = eventos.length === 0
    ? '<div class="historial-empty">Aun no hay eventos registrados.</div>'
    : eventos.map(e => `
        <div class="historial-item">
          <div class="historial-tipo historial-tipo--${e.tipo}">${eventoLabel(e.tipo)}</div>
          <div class="historial-cuerpo">
            <div class="historial-meta">${escapeHtml(e.autor_nombre)} &middot; ${tiempoRelativo(e.created_at)}</div>
            ${e.detalle ? `<div class="historial-detalle">${escapeHtml(e.detalle)}</div>` : ''}
          </div>
        </div>`).join('');
  return `<div class="historial-section"><div class="historial-label">Historial completo</div>${items}</div>`;
}

function eventoLabel(tipo) {
  return ({
    creado:           '➕ Creado',
    reasignado:       '↔ Reasignado',
    cerrado:          '✓ Cerrado',
    reabierto:        '↻ Reabierto',
    editado:          '✎ Editado',
    nota:             '✉ Nota',
    venc_actualizado: '⏰ Vencimiento'
  })[tipo] || tipo;
}

// ────────── Notificaciones del navegador ──────────

// Pedir permiso una sola vez por sesion. Lo guardamos en localStorage
// para no insistir.
function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const yaPedido = localStorage.getItem('salario.notif.asked');
  if (yaPedido) return false;
  localStorage.setItem('salario.notif.asked', '1');
  Notification.requestPermission();
  return false;
}

// Mostrar notificacion si esta permitido y la pestaña no esta visible.
// (Si la pestaña esta activa, alcanza con el toast.)
function notificar(titulo, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const n = new Notification(titulo, {
      body: body,
      icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%232d2d8e"/><text x="50" y="64" font-size="56" font-family="Arial" font-weight="bold" fill="white" text-anchor="middle">S</text></svg>',
      tag: 'salario-pendiente'
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { console.warn('No se pudo crear notificacion', e); }
}

// ────────── Realtime (pendientes + notas) ──────────

let _pendientesChannel = null;

function suscribirPendientes() {
  if (_pendientesChannel) return;
  _pendientesChannel = sb()
    .channel('pendientes-realtime')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pendientes' },
        (payload) => handlePendienteChange(payload))
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pendiente_notas' },
        (payload) => handleNotaChange(payload))
    .subscribe();
}

function handlePendienteChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    if (!pendientes.find(p => p.id === newRow.id) && !newRow.resuelto) {
      pendientes.unshift(dbRowToPendiente(newRow));
      renderPendientes();
      updatePendCount();
      const me = getCurrentUserName();
      if (newRow.asesor === me) {
        toast(`Te asignaron un pendiente: ${newRow.cliente_nombre}`);
        notificar('Nuevo pendiente asignado', `${newRow.cliente_nombre}: ${newRow.descripcion.substring(0, 80)}`);
      } else {
        toast(`Nuevo pendiente del equipo: ${newRow.cliente_nombre}`);
      }
    }
  } else if (eventType === 'UPDATE') {
    const idx = pendientes.findIndex(p => p.id === newRow.id);
    if (newRow.resuelto && idx !== -1) {
      pendientes.splice(idx, 1);
      delete notasByPendiente[newRow.id];
      renderPendientes();
      updatePendCount();
    } else if (!newRow.resuelto && idx === -1) {
      pendientes.unshift(dbRowToPendiente(newRow));
      renderPendientes();
      updatePendCount();
    } else if (idx !== -1) {
      const oldAsesor = pendientes[idx].asesor;
      pendientes[idx] = dbRowToPendiente(newRow);
      renderPendientes();
      updatePendCount();
      const me = getCurrentUserName();
      if (oldAsesor !== newRow.asesor && newRow.asesor === me) {
        toast(`Te reasignaron un pendiente: ${newRow.cliente_nombre}`);
        notificar('Pendiente reasignado a vos', `${newRow.cliente_nombre}: ${newRow.descripcion.substring(0, 80)}`);
      }
    }
  } else if (eventType === 'DELETE') {
    pendientes = pendientes.filter(p => p.id !== oldRow.id);
    delete notasByPendiente[oldRow.id];
    renderPendientes();
    updatePendCount();
  }
  // Recalcular alertas cada vez que cambia un pendiente
  if (typeof refreshAlertas === 'function') refreshAlertas();
}

function handleNotaChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    const pid = newRow.pendiente_id;
    if (!notasByPendiente[pid]) notasByPendiente[pid] = [];
    if (!notasByPendiente[pid].find(n => n.id === newRow.id)) {
      notasByPendiente[pid].push(newRow);
      renderPendientes();
      const me = currentMember ? currentMember.email : null;
      if (me && newRow.autor_email !== me) {
        const p = pendientes.find(p => p.id === pid);
        if (p) {
          toast(`${newRow.autor_nombre} agrego una nota a ${p.cliente}`);
          // Si el pendiente es mio, tambien mando notificacion del navegador
          if (p.asesor === getCurrentUserName()) {
            notificar(`${newRow.autor_nombre} agrego una nota`, `${p.cliente}: ${newRow.texto.substring(0, 80)}`);
          }
        }
      }
    }
  } else if (eventType === 'DELETE') {
    const pid = oldRow.pendiente_id;
    if (notasByPendiente[pid]) {
      notasByPendiente[pid] = notasByPendiente[pid].filter(n => n.id !== oldRow.id);
      renderPendientes();
    }
  }
}



// Cuando cambia el tipo de pendiente, autoasigna el asesor por default
// (Alfred para bugs, Daniel Ferro para comercial)
function onTipoPendienteChange() {
  const tipoSel  = document.getElementById('pf-tipo');
  const asesorSel = document.getElementById('pf-asesor');
  if (!tipoSel || !asesorSel) return;
  const tipo = tipoSel.value;
  const cfg  = TIPO_PENDIENTE[tipo];
  if (cfg && cfg.defaultAsesor) {
    asesorSel.value = cfg.defaultAsesor;
  }
}

// ────────── Sugerencias de la Base de Soluciones ──────────
// Cuando el usuario escribe la descripcion de un pendiente, buscamos
// en el array global 'soluciones' (cargado desde Supabase por kb.js) por
// matches de keywords y mostramos los 3
// mas relevantes plegables debajo del textarea.

function findMatchingSolutions(query, limit) {
  limit = limit || 3;
  const q = (query || '').toLowerCase().trim();
  if (q.length < 4) return [];

  // Tomar palabras significativas (>3 letras) como keywords
  const stopwords = new Set(['cliente', 'pero', 'para', 'puede', 'sabe', 'esta', 'tiene', 'tienen', 'hace', 'desde', 'cuando', 'como', 'mismo', 'todo', 'todos', 'algun', 'alguna', 'donde', 'porque', 'paso', 'pasa', 'sigue']);
  const queryWords = q.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 3 && !stopwords.has(w));
  if (queryWords.length === 0) return [];

  // Las soluciones vienen de Supabase (cargadas por kb.js en el array global 'soluciones').
  const fuente = (typeof soluciones !== 'undefined' && soluciones.length > 0) ? soluciones : [];
  const scored = fuente.map(sol => {
    const text = (sol.titulo + ' ' + (sol.sub || '') + ' ' + (sol.pasos || []).join(' ')).toLowerCase();
    let score = 0;
    queryWords.forEach(w => {
      if (text.includes(w)) score++;
    });
    return { sol, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.sol);
}

let _kbSugTimeout = null;
function actualizarSugerenciasKB() {
  clearTimeout(_kbSugTimeout);
  _kbSugTimeout = setTimeout(() => {
    const desc = document.getElementById('pf-desc').value;
    const cont = document.getElementById('kb-suggestions');
    if (!cont) return;

    const matches = findMatchingSolutions(desc, 3);
    if (matches.length === 0) {
      cont.style.display = 'none';
      cont.innerHTML = '';
      return;
    }

    cont.style.display = 'block';
    const plural = matches.length > 1;
    cont.innerHTML = `
      <div class="kb-sug-label">${matches.length} solucion${plural ? 'es' : ''} de la base coincide${plural ? 'n' : ''}:</div>
      ${matches.map(s => `
        <details class="kb-sug-item">
          <summary>${escapeHtml(s.titulo)} <span class="kb-sug-cat">${escapeHtml(s.sub || '')}</span></summary>
          <ol class="kb-sug-steps">
            ${(s.pasos || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}
          </ol>
          <div class="kb-sug-meta">
            <span>${s.usos} usos &middot; ${escapeHtml(s.autor || '')}${s.mat && s.mat !== 'Sin material' ? ' &middot; ' + escapeHtml(s.mat) : ''}</span>
          </div>
        </details>
      `).join('')}
    `;
  }, 250);
}

// Muestra u oculta las opciones Bug y Comercial del form de nuevo pendiente
// según el usuario logueado:
//   - Alfredo Cesar     → soporte + implementacion + bug
//   - Daniel Ferro      → soporte + implementacion + comercial
//   - Resto del equipo  → solo soporte + implementacion
// Renderiza las opciones del select "Tipo de trabajo" del form de pendientes
// según el usuario logueado. Se llama al init y cada vez que se abre el form.
//   - Alfredo Cesar     → soporte + implementacion + bug
//   - Daniel Ferro      → soporte + implementacion + comercial
//   - Resto del equipo  → solo soporte + implementacion
function filtrarOpcionesTipoPendiente() {
  const sel = document.getElementById('pf-tipo');
  if (!sel) return;
  const email         = (window._currentAuthEmail || '').toLowerCase();
  const esAlfredo     = email.includes('alfredo');
  const esDanielFerro = email.includes('danielferro') || email.includes('daniel.ferro');

  // Reconstruir las opciones para evitar problemas de display:none en Safari/Firefox
  const valorActual = sel.value;
  sel.innerHTML =
    '<option value="soporte">Soporte</option>' +
    '<option value="implementacion">Implementación</option>' +
    (esAlfredo     ? '<option value="bug">Programación</option>' : '') +
    (esDanielFerro ? '<option value="comercial">Comercial (Administración)</option>' : '');

  // Restaurar el valor previo si todavía es válido para este usuario
  if (sel.querySelector(`option[value="${valorActual}"]`)) {
    sel.value = valorActual;
  }
}

window.addEventListener('app-ready', initPendientes);

// ────────── Buscador de clientes en form de nuevo pendiente ──────────

function filtrarPfClienteSearch() {
  const input    = document.getElementById('pf-cliente-search');
  const dropdown = document.getElementById('pf-cliente-dropdown');
  const select   = document.getElementById('pf-cliente');
  if (!input || !dropdown || !select) return;

  // Posicionar dropdown justo debajo del input
  const rect = input.getBoundingClientRect();
  dropdown.style.top   = (rect.bottom + 2) + 'px';
  dropdown.style.left  = rect.left + 'px';
  dropdown.style.width = rect.width + 'px';

  const q = input.value.trim().toLowerCase();

  const opciones = Array.from(select.options)
    .map(o => o.text)
    .filter(t => t && t !== 'Cargando clientes...');

  const filtradas = q
    ? opciones.filter(n => n.toLowerCase().includes(q))
    : opciones;

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#1e1e2e';
  dropdown.style.background = bg;

  if (filtradas.length === 0) {
    dropdown.innerHTML = `<div style="padding:10px 14px;color:var(--text3);font-size:13px">Sin resultados</div>`;
  } else {
    dropdown.innerHTML = filtradas.map(n => `
      <div
        class="cliente-search-opt"
        onmousedown="elegirPfClienteSearch('${n.replace(/'/g, "\\'")}')"
        style="padding:9px 14px;cursor:pointer;font-size:13px;border-radius:6px"
      >${n}</div>`).join('');
  }
  dropdown.style.display = 'block';
}

function elegirPfClienteSearch(nombre) {
  const input    = document.getElementById('pf-cliente-search');
  const select   = document.getElementById('pf-cliente');
  const dropdown = document.getElementById('pf-cliente-dropdown');
  if (input)    input.value  = nombre;
  if (select)   select.value = nombre;
  if (dropdown) dropdown.style.display = 'none';
}

function cerrarPfClienteSearch() {
  setTimeout(() => {
    const dropdown = document.getElementById('pf-cliente-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }, 150);
}
