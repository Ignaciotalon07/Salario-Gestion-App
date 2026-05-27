// REGISTRAR CONSULTA (Supabase)
// Formulario que se completa después de cada atención por WhatsApp/Whaticket.
// Las consultas se guardan en la tabla 'consultas' de Supabase y se sincronizan
// en tiempo real entre todo el equipo.
//
// Cuando el asesor selecciona una solución de la base, al guardar se le suma
// 1 al contador de usos de esa solución.

// ── Array global de consultas (cargado al init, sincronizado via realtime) ──
let consultas = [];

let consultaSolucionId = null; // id de la solución de la base elegida (si la hay)

// ────────── Mapeo DB <-> UI ──────────

function dbRowToConsulta(row) {
  return {
    id:          row.id,
    cliente:     row.cliente_nombre,          // la DB guarda cliente_nombre
    asesor:      row.asesor,
    categoria:   row.categoria,
    subtema:     row.subtema,
    repetida:    row.repetida ? 'si' : 'no',  // la DB usa boolean, la UI usa 'si'/'no'
    descripcion: row.descripcion,
    solucionId:  row.solucion_id,
    timestamp:   row.created_at
  };
}

// ────────── Init ──────────

async function initConsultas() {
  try {
    // Cargar todas las consultas (para métricas históricas)
    const rows = await dbList('consultas', { orderBy: 'created_at', ascending: false });
    consultas = rows.map(dbRowToConsulta);
    // Refrescar métricas del panel con los datos reales
    if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
    suscribirConsultas();
  } catch (e) {
    console.error('Error cargando consultas', e);
  }
}

// ────────── Realtime ──────────

let _consultasChannel = null;
function suscribirConsultas() {
  if (_consultasChannel) return;
  _consultasChannel = sb()
    .channel('consultas-realtime')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'consultas' },
        (payload) => {
          // Sacar entradas temporales del mismo cliente y reemplazar con el dato real
          consultas = consultas.filter(c => !c.id.toString().startsWith('_temp_'));
          if (!consultas.find(c => c.id === payload.new.id)) {
            consultas.unshift(dbRowToConsulta(payload.new));
            if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
            // Re-render cards de clientes para actualizar stats (consultas/mes, % repetidas)
            if (typeof renderClientes === 'function') renderClientes();
          }
        })
    .subscribe();
}

// ────────── Form: subtemas ──────────

function updateRegSubtemas() {
  const cat = document.getElementById('r-cat').value;
  const sel = document.getElementById('r-sub');
  sel.innerHTML = cat
    ? CATS[cat].sub.map(s => `<option>${s}</option>`).join('')
    : '<option>Primero elegí categoría</option>';
}

// ────────── Modal de solución ──────────

// Abre el modal de "qué solución usaste" para vincular a la consulta.
function elegirSolucionConsulta() {
  const cliente = (document.getElementById('r-cliente') || {}).value || '';
  if (!Array.isArray(soluciones) || soluciones.length === 0) {
    alert('La base de soluciones todavía está cargando. Esperá unos segundos y volvé a intentarlo.');
    return;
  }
  abrirModalSolucionUsada({
    cliente,
    contextoDescripcion: '',
    mostrarDocumentar: true,
    tituloModal: '¿Qué solución aplicaste?',
    subtituloModal: `Si la solución viene de la base, elegila para sumar 1 al contador. ${cliente ? 'Cliente: <strong>' + escapeHtmlConsulta(cliente) + '</strong>' : ''}`,
    onSeleccionar: (solucionId, accion) => {
      if (accion === 'elegida' && solucionId) {
        consultaSolucionId = solucionId;
        renderSolucionElegida();
      } else if (accion === 'documentar-nueva') {
        consultaSolucionId = null;
        renderSolucionElegida();
      }
    }
  });
}

function quitarSolucionConsulta() {
  consultaSolucionId = null;
  renderSolucionElegida();
}

function renderSolucionElegida() {
  const cont     = document.getElementById('r-sol-elegida');
  const solGroup = document.getElementById('r-sol-group');
  if (!cont) return;

  if (!consultaSolucionId) {
    cont.innerHTML = '';
    cont.style.display = 'none';
    if (solGroup) solGroup.style.display = '';
    return;
  }

  const s = (soluciones || []).find(x => x.id === consultaSolucionId);
  if (!s) {
    consultaSolucionId = null;
    cont.innerHTML = '';
    cont.style.display = 'none';
    if (solGroup) solGroup.style.display = '';
    return;
  }

  const cat = (CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' });
  cont.style.display = 'flex';
  cont.innerHTML = `
    <div class="sol-elegida__info">
      <div class="sol-elegida__title">${escapeHtmlConsulta(s.titulo)}</div>
      <div class="sol-elegida__meta">
        <span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
        <span style="color:var(--text3)">${escapeHtmlConsulta(s.sub || '')} &middot; ${s.usos} uso${s.usos === 1 ? '' : 's'}</span>
      </div>
    </div>
    <button type="button" class="btn-sm" onclick="quitarSolucionConsulta()" title="Quitar la solución vinculada">✕ Quitar</button>
  `;

  // Ocultar el textarea de solución — ya tenemos una de la base
  if (solGroup) {
    solGroup.style.display = 'none';
    const ta = document.getElementById('r-sol');
    if (ta) ta.value = '';
  }
}

// ────────── Guardar consulta ──────────

async function guardarConsulta() {
  const cliente  = (document.getElementById('r-cliente') || {}).value || '';
  const cat      = (document.getElementById('r-cat')     || {}).value || '';
  const subtema  = (document.getElementById('r-sub')     || {}).value || '';
  const repetida = (document.getElementById('r-rep')     || {}).value || 'no';
  const desc     = ((document.getElementById('r-desc')   || {}).value || '').trim();
  const solucion = ((document.getElementById('r-sol')    || {}).value || '').trim();

  // ── Validaciones ──
  if (!cliente) { alert('Elegí un cliente.'); return; }
  if (!cat)     { alert('Elegí una categoría.'); document.getElementById('r-cat').focus(); return; }
  if (!subtema || subtema.toLowerCase().includes('primero')) {
    alert('Elegí un subtema.'); document.getElementById('r-sub').focus(); return;
  }

  // ── Lógica de solución ──
  // Caso A: ya hay solución de la base → incrementar uso, no necesitamos texto.
  // Caso B: no hay solución → crear una nueva en la base con desc + pasos.
  let nuevaSolucionId = null;

  if (consultaSolucionId) {
    // Caso A
    if (typeof incrementarUsoSolucion === 'function') {
      try { await incrementarUsoSolucion(consultaSolucionId); }
      catch (e) { console.warn('No se pudo sumar uso a la solución', e); }
    }
  } else {
    // Caso B: obligatorio descripción + solución para crear nueva entry
    if (!desc) {
      alert('Como no elegiste solución de la base, escribí la descripción del problema (será el título de la nueva solución).');
      const el = document.getElementById('r-desc'); if (el) el.focus();
      return;
    }
    if (!solucion) {
      alert('Como no elegiste solución de la base, completá el campo "Solución aplicada" — esos pasos se guardan en la base.');
      const el = document.getElementById('r-sol'); if (el) el.focus();
      return;
    }

    const pasos = solucion.split('\n')
      .map(p => p.replace(/^\s*paso\s*\d+\s*[:\.\-]?\s*/i, '').trim())
      .filter(p => p.length > 0);
    if (pasos.length === 0) {
      alert('Escribí al menos un paso de la solución (uno por línea).');
      const el = document.getElementById('r-sol'); if (el) el.focus();
      return;
    }

    const autor         = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
    const tituloSolucion = desc.length > 200 ? desc.substring(0, 197) + '...' : desc;

    try {
      const inserted = await dbInsert('soluciones', {
        titulo:   tituloSolucion,
        cat,
        sub:      subtema,
        pasos,
        material: 'Sin material',
        aplica:   'Todos',
        autor,
        usos:     1
      });
      nuevaSolucionId = inserted.id;
    } catch (e) {
      console.error('Error creando solución', e);
      alert('No se pudo guardar la solución en la base: ' + e.message + '\n\nLa consulta tampoco se guardó. Probá de nuevo.');
      return;
    }
  }

  // ── Persistencia en Supabase ──
  const asesor = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';

  // Buscar el cliente_id desde el array global (para respetar la FK)
  const clienteObj = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.nombre === cliente)
    : null;

  try {
    await dbInsert('consultas', {
      cliente_id:   clienteObj ? clienteObj.id : null,
      cliente_nombre: cliente,
      asesor,
      categoria:    cat,
      subtema,
      repetida:     repetida === 'si',   // la DB espera boolean
      descripcion:  desc || null,
      solucion_id:  consultaSolucionId || nuevaSolucionId || null
    });
    // Agregar al array local inmediatamente para que refreshPanelMetrics
    // y recalcularScoreCliente lean el dato recién guardado sin esperar el realtime
    consultas.unshift({
      id:          '_temp_' + Date.now(),
      cliente,
      asesor,
      categoria:   cat,
      subtema,
      repetida:    repetida === 'si' ? 'si' : 'no',
      descripcion: desc || null,
      solucionId:  consultaSolucionId || nuevaSolucionId || null,
      timestamp:   new Date().toISOString()
    });

    if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
    // Recalcular el score del cliente con la nueva consulta incluida
    await recalcularScoreCliente(cliente);
  } catch (e) {
    console.error('Error guardando consulta', e);
    alert('No se pudo guardar la consulta: ' + e.message);
    return;
  }

  // ── Reset completo del form ──
  resetFormConsulta();

  const ok = document.getElementById('reg-ok');
  if (ok) {
    ok.style.display = 'flex';
    ok.innerHTML = nuevaSolucionId
      ? '<strong>Consulta guardada.</strong>&nbsp;Se agregó una nueva solución a la base de conocimiento.'
      : '<strong>Consulta guardada.</strong>&nbsp;Se sumó 1 al contador de la solución vinculada.';
    setTimeout(() => ok.style.display = 'none', 4000);
  }
  toast(nuevaSolucionId ? 'Consulta guardada y nueva solución agregada a la base' : 'Consulta guardada correctamente');
}

// ────────── Cálculo de score de riesgo ──────────
//
// Score 0-10: cuanto más alto, mejor cliente.
//   - Adopción (0-4 pts):      adopcion% / 100 * 4
//   - Autonomía (0-3 pts):     alta=3, media=1.5, baja=0
//   - No repetición (0-3 pts): (1 - pct_repetidas) * 3
//                               si no hay consultas aún → 1.5 (neutral)
//
// Se recalcula y guarda en Supabase cada vez que se registra una consulta.

async function recalcularScoreCliente(nombreCliente) {
  // Buscar el cliente en el array global
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.nombre === nombreCliente)
    : null;
  if (!cliente) return;

  // ── Componente adopción (0-4 pts) ──
  const adopcionPts = ((cliente.adopcion || 0) / 100) * 4;

  // ── Componente autonomía (0-3 pts) ──
  const autonomiaPts = { alta: 3, media: 1.5, baja: 0 }[cliente.autonomia] ?? 1.5;

  // ── Componente no-repetición (0-3 pts) ──
  // Usa todas las consultas históricas del cliente
  const todasDelCliente = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === nombreCliente)
    : [];
  let repPts;
  if (todasDelCliente.length === 0) {
    repPts = 1.5; // neutral si no hay datos todavía
  } else {
    const repetidas  = todasDelCliente.filter(c => c.repetida === 'si').length;
    const pctRepetidas = repetidas / todasDelCliente.length;
    repPts = (1 - pctRepetidas) * 3;
  }

  // ── Score final (redondeado, clampeado a 0-10) ──
  const scoreNuevo = Math.min(10, Math.max(0, Math.round(adopcionPts + autonomiaPts + repPts)));

  // Solo actualizar si cambió para no generar escrituras innecesarias
  if (scoreNuevo === cliente.score) return;

  try {
    await dbUpdate('clientes', cliente.id, { score: scoreNuevo });
    // Actualizar en memoria para que la tabla de score se refresque al instante
    cliente.score = scoreNuevo;
    if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
  } catch (e) {
    console.warn('No se pudo actualizar el score de', nombreCliente, e);
  }
}

// ────────── Reset del form ──────────

function resetFormConsulta() {
  // Selects y inputs con ID
  const ids = ['r-cliente', 'r-rep', 'r-resuelto', 'r-material', 'r-autonomia', 'r-remota'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });

  // Categoría: resetear a "Seleccioná..." y actualizar subtemas
  const selCat = document.getElementById('r-cat');
  if (selCat) {
    selCat.value = '';
    updateRegSubtemas(); // resetea el dropdown de subtemas
  }

  // Tiempo de resolución
  const tiempo = document.getElementById('r-tiempo');
  if (tiempo) tiempo.value = '';

  // Textareas
  const desc = document.getElementById('r-desc');
  if (desc) desc.value = '';

  // Solución elegida de la base y su textarea
  consultaSolucionId = null;
  renderSolucionElegida();
  const sol = document.getElementById('r-sol');
  if (sol) sol.value = '';

  // Asegurarse de que el grupo de solución quede visible
  const solGroup = document.getElementById('r-sol-group');
  if (solGroup) solGroup.style.display = '';
}

// ────────── Helpers ──────────

function escapeHtmlConsulta(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('app-ready', initConsultas);
