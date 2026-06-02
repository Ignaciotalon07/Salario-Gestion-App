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
    solucionId:    row.solucion_id,
    tiempo:        row.tiempo_resolucion || null,
    material:      row.material || null,
    remota:        row.conexion_remota || false,
    tipoConsulta:  row.tipo_consulta || 'soporte',
    timestamp:     row.created_at
  };
}

// ────────── Modal de registrar consulta ──────────

function abrirModalConsulta(clientePreseleccionado) {
  const modal = document.getElementById('modal-consulta');
  if (!modal) return;
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden'; // evitar scroll del fondo

  // Si viene con cliente pre-seleccionado, rellenarlo
  if (clientePreseleccionado) {
    setTimeout(() => elegirClienteSearch(clientePreseleccionado), 50);
  }
}

function cerrarModalConsulta() {
  const modal = document.getElementById('modal-consulta');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  resetFormConsulta();
}

// Guardar y dejar el modal abierto para registrar otra consulta
async function guardarConsultaYOtra() {
  await guardarConsulta(true); // true = no cerrar modal
}

// Navegación desde card de cliente → abre el modal con cliente pre-seleccionado
function irARegistrarConsulta(nombreCliente) {
  abrirModalConsulta(nombreCliente);
}

// ────────── Init ──────────

// Muestra u oculta campos del form según el tipo de consulta seleccionado.
// Programación: form simplificado (sin repetida, material, remota, base soluciones)
// Soporte: form completo con base de soluciones
// Comercial: form sin base de soluciones
function onTipoConsultaChange() {
  const tipo = (document.getElementById('r-tipo-consulta') || {}).value || 'soporte';
  const esProg = tipo === 'programacion';
  const esSop  = tipo === 'soporte';

  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  };

  // Categoría/subtema estándar ↔ subtema libre de programación
  show('r-row-cat',        !esProg);
  show('r-row-prog-sub',   esProg);

  // Repetida ↔ oculta en programación
  show('r-row-rep',        !esProg);
  show('r-row-tiempo-solo', esProg);

  // Material + remota: solo soporte/comercial
  show('r-row-material',   !esProg);

  // Programación realizada: solo programación
  show('r-group-prog-realizada', esProg);

  // Base de soluciones: solo soporte
  show('r-group-soluciones', esSop);

  // Label de descripción
  const lbl = document.getElementById('r-desc-label');
  if (lbl) lbl.textContent = esProg ? '¿Qué consultó el cliente?' : 'Descripción del problema';

  // Poblar datalist de subtemas previos de programación
  if (esProg) {
    const datalist = document.getElementById('r-sub-prog-list');
    if (datalist && typeof consultas !== 'undefined') {
      const subtemasPrev = [...new Set(
        consultas
          .filter(c => c.tipoConsulta === 'programacion' && c.subtema)
          .map(c => c.subtema)
      )].sort();
      datalist.innerHTML = subtemasPrev.map(s => `<option value="${escapeHtmlConsulta(s)}">`).join('');
    }
  }
}

// Llena el select de tipo-consulta con las opciones habilitadas según el usuario logueado.
// - Alfredo Cesar     → soporte + programacion
// - Daniel Ferro      → soporte + comercial
// - Resto del equipo  → solo soporte
function initTipoConsulta() {
  const sel = document.getElementById('r-tipo-consulta');
  if (!sel) return;

  // window._currentAuthEmail se setea en auth.js al momento del login
  const email = (window._currentAuthEmail || '').toLowerCase();

  const esAlfredo     = email.includes('alfredo');
  const esDanielFerro = email.includes('danielferro') || email.includes('daniel.ferro');

  const valorActual = sel.value;
  sel.innerHTML = '<option value="soporte">Soporte</option>';
  if (esAlfredo)     sel.innerHTML += '<option value="programacion">Programación</option>';
  if (esDanielFerro) sel.innerHTML += '<option value="comercial">Comercial</option>';

  if (sel.querySelector('option[value="' + valorActual + '"]')) sel.value = valorActual;
}

async function initConsultas() {
  try {
    // Cargar todas las consultas (para métricas históricas)
    const rows = await dbList('consultas', { orderBy: 'created_at', ascending: false });
    consultas = rows.map(dbRowToConsulta);
    // Refrescar métricas del panel con los datos reales
    if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
    // Re-renderizar cards de clientes para que muestren las stats correctas
    if (typeof renderClientes === 'function') renderClientes();
    suscribirConsultas();
    // Filtrar opciones del select según el rol y ajustar el form
    initTipoConsulta();
    onTipoConsultaChange();
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
  const cat           = document.getElementById('r-cat').value;
  const sel           = document.getElementById('r-sub');
  const catCustom     = document.getElementById('r-cat-custom');
  const subCustom     = document.getElementById('r-sub-custom');

  // Mostrar/ocultar input de categoría custom
  if (catCustom) {
    catCustom.style.display = cat === 'otro' ? 'block' : 'none';
    if (cat !== 'otro') catCustom.value = '';
  }

  // Siempre limpiar el input de subtema custom al cambiar categoría
  if (subCustom) { subCustom.style.display = 'none'; subCustom.value = ''; }

  if (!cat) {
    sel.innerHTML = '<option value="">Primero elegí categoría</option>';
    return;
  }

  if (cat === 'otro') {
    // Categoría libre → subtema también libre
    sel.innerHTML = '<option value="otro">Otro — escribí el subtema</option>';
    if (subCustom) subCustom.style.display = 'block';
    return;
  }

  // Categoría conocida: llenar lista + "Otro" al final
  sel.innerHTML = CATS[cat].sub.map(s => `<option>${s}</option>`).join('')
    + '<option value="otro">Otro — nuevo subtema</option>';
}

function toggleRSubCustom() {
  const subVal    = (document.getElementById('r-sub') || {}).value;
  const subCustom = document.getElementById('r-sub-custom');
  if (!subCustom) return;
  subCustom.style.display = subVal === 'otro' ? 'block' : 'none';
  if (subVal !== 'otro') subCustom.value = '';
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

async function guardarConsulta(mantenerAbierto = false) {
  const cliente    = (document.getElementById('r-cliente') || {}).value || '';

  // Categoría y subtema: se calculan más abajo según el tipo de consulta
  const catSelect  = (document.getElementById('r-cat') || {}).value || '';
  const catCustom  = ((document.getElementById('r-cat-custom') || {}).value || '').trim();
  const subSelect  = (document.getElementById('r-sub') || {}).value || '';
  const subCustom  = ((document.getElementById('r-sub-custom') || {}).value || '').trim();

  const repetida = (document.getElementById('r-rep')     || {}).value || 'no';
  const desc     = ((document.getElementById('r-desc')   || {}).value || '').trim();
  const solucion = ((document.getElementById('r-sol')    || {}).value || '').trim();
  const tiempoRaw = (document.getElementById('r-tiempo') || {}).value || '';
  const tiempo    = tiempoRaw ? parseFloat(tiempoRaw) : null;
  const material      = (document.getElementById('r-material')      || {}).value || 'ninguno';
  const remota        = (document.getElementById('r-remota')        || {}).value || 'no';
  const tipoConsulta  = (document.getElementById('r-tipo-consulta') || {}).value || 'soporte';
  const esProg        = tipoConsulta === 'programacion';

  // ── Para programación: leer campos específicos ──
  let cat, subtema;
  if (esProg) {
    cat = 'programacion';
    subtema = ((document.getElementById('r-sub-prog') || {}).value || '').trim();
    if (!cliente) { alert('Elegí un cliente.'); return; }
    if (!subtema) { alert('Escribí el subtema o módulo.'); document.getElementById('r-sub-prog').focus(); return; }
  } else {
    // ── Validaciones soporte/comercial ──
    if (!cliente) { alert('Elegí un cliente.'); return; }
    if (!catSelect) { alert('Elegí una categoría.'); document.getElementById('r-cat').focus(); return; }
    if (catSelect === 'otro' && !catCustom) {
      alert('Escribí el nombre de la nueva categoría.'); document.getElementById('r-cat-custom').focus(); return;
    }
    if (!subSelect || subSelect.toLowerCase().includes('primero')) {
      alert('Elegí un subtema.'); document.getElementById('r-sub').focus(); return;
    }
    if (subSelect === 'otro' && !subCustom) {
      alert('Escribí el nombre del nuevo subtema.'); document.getElementById('r-sub-custom').focus(); return;
    }
    cat = catSelect === 'otro' ? catCustom : catSelect;
    subtema = subSelect === 'otro' ? subCustom : subSelect;
  }

  // ── Lógica de solución (solo para SOPORTE) ──
  // Programación y Comercial NO alimentan la base de soluciones.
  let nuevaSolucionId = null;

  if (!esProg && tipoConsulta !== 'comercial') {
    if (consultaSolucionId) {
      if (typeof incrementarUsoSolucion === 'function') {
        try { await incrementarUsoSolucion(consultaSolucionId); }
        catch (e) { console.warn('No se pudo sumar uso a la solución', e); }
      }
    } else {
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
      const autor          = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
      const tituloSolucion = desc.length > 200 ? desc.substring(0, 197) + '...' : desc;
      try {
        const inserted = await dbInsert('soluciones', {
          titulo: tituloSolucion, cat, sub: subtema,
          pasos, material: 'Sin material', aplica: 'Todos', autor, usos: 1
        });
        nuevaSolucionId = inserted.id;
      } catch (e) {
        console.error('Error creando solución', e);
        alert('No se pudo guardar la solución en la base: ' + e.message + '\n\nLa consulta tampoco se guardó. Probá de nuevo.');
        return;
      }
    }
  }

  // Para programación: leer tiempo y descripción de sus campos específicos
  const tiempoProgRaw = (document.getElementById('r-tiempo-prog') || {}).value || '';
  const tiempoProg    = tiempoProgRaw ? parseFloat(tiempoProgRaw) : null;
  const progRealizada = ((document.getElementById('r-prog-realizada') || {}).value || '').trim();
  const tiempoFinal   = esProg ? tiempoProg : tiempo;

  // ── Persistencia en Supabase ──
  const asesor = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
  const clienteObj = (typeof clientes !== 'undefined') ? clientes.find(c => c.nombre === cliente) : null;

  try {
    await dbInsert('consultas', {
      cliente_id:        clienteObj ? clienteObj.id : null,
      cliente_nombre:    cliente,
      asesor,
      categoria:         cat,
      subtema,
      repetida:          esProg ? false : repetida === 'si',
      descripcion:       esProg && progRealizada
                           ? (desc ? desc + '\n\n✅ Programado: ' + progRealizada : '✅ Programado: ' + progRealizada)
                           : (desc || null),
      // Para programación: no usa base de soluciones
      solucion_id:       esProg ? null : (consultaSolucionId || nuevaSolucionId || null),
      tiempo_resolucion: (tiempoFinal && !isNaN(tiempoFinal) && tiempoFinal > 0) ? tiempoFinal : null,
      material:          esProg ? null : (material !== 'ninguno' ? material : null),
      conexion_remota:   esProg ? false : (remota === 'si' ? true : false),
      tipo_consulta:     tipoConsulta
    });

    consultas.unshift({
      id:           '_temp_' + Date.now(),
      cliente,
      asesor,
      categoria:    cat,
      subtema,
      repetida:     esProg ? 'no' : (repetida === 'si' ? 'si' : 'no'),
      descripcion:  desc || null,
      solucionId:   esProg ? null : (consultaSolucionId || nuevaSolucionId || null),
      tiempo:       (tiempoFinal && !isNaN(tiempoFinal) && tiempoFinal > 0) ? tiempoFinal : null,
      material:     esProg ? null : (material !== 'ninguno' ? material : null),
      remota:       esProg ? false : remota === 'si',
      tipoConsulta: tipoConsulta,
      timestamp:    new Date().toISOString()
    });

    if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
    // Recalcular autonomía y score del cliente con la nueva consulta incluida
    await recalcularAutonomiaCliente(cliente);
    await recalcularScoreCliente(cliente);
  } catch (e) {
    console.error('Error guardando consulta', e);
    alert('No se pudo guardar la consulta: ' + e.message);
    return;
  }

  // ── Reset y cierre del modal ──
  resetFormConsulta();

  if (mantenerAbierto) {
    // "Guardar y registrar otra": mostrar confirmación brevemente dentro del modal
    const ok = document.getElementById('reg-ok');
    if (ok) {
      ok.style.display = 'flex';
      ok.innerHTML = nuevaSolucionId
        ? '<strong>Consulta guardada.</strong>&nbsp;Se agregó una nueva solución a la base.'
        : '<strong>Consulta guardada.</strong>&nbsp;Podés registrar otra.';
      setTimeout(() => ok.style.display = 'none', 3000);
    }
  } else {
    // Cierre normal: cerrar modal y mostrar toast
    cerrarModalConsulta();
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

// ────────── Cálculo de autonomía automática ──────────
//
// Se alimenta de las consultas reales del cliente (últimos 3 meses).
// Dos señales:
//   - Frecuencia mensual promedio (cuánto nos llama)
//   - % consultas repetidas (si repite preguntas, no aprende)
//
// Puntaje 0-6:
//   Frecuencia (0-3 pts): ≤2/mes → 3 | 3-5/mes → 2 | 6-8/mes → 1 | >8/mes → 0
//   Repetición (0-3 pts): ≤15%   → 3 | 16-35%  → 2 | 36-55%  → 1 | >55%   → 0
//
//   Alta:  5-6 pts
//   Media: 3-4 pts
//   Baja:  0-2 pts
//
// Requiere mínimo 3 consultas históricas para disparar.
// Si no hay datos suficientes, no modifica el valor existente.

async function recalcularAutonomiaCliente(nombreCliente) {
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.nombre === nombreCliente)
    : null;
  if (!cliente) return;

  const todasDelCliente = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === nombreCliente)
    : [];

  // Sin datos suficientes → no tocar
  if (todasDelCliente.length < 3) return;

  // Últimos 3 meses
  const ahora     = new Date();
  const hace3Meses = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
  const recientes  = todasDelCliente.filter(c => new Date(c.timestamp) >= hace3Meses);

  // Si no hay actividad reciente tampoco tocamos (cliente inactivo, sin señal)
  if (recientes.length === 0) return;

  // ── Frecuencia mensual promedio (últimos 3 meses) ──
  const avgMensual = recientes.length / 3;
  const frecPts = avgMensual <= 2 ? 3
                : avgMensual <= 5 ? 2
                : avgMensual <= 8 ? 1
                : 0;

  // ── % consultas repetidas (histórico completo) ──
  const pctRep = todasDelCliente.filter(c => c.repetida === 'si').length / todasDelCliente.length;
  const repPts = pctRep <= 0.15 ? 3
               : pctRep <= 0.35 ? 2
               : pctRep <= 0.55 ? 1
               : 0;

  // ── % con material enviado (señal negativa: necesitó material de apoyo) ──
  const conMaterial = todasDelCliente.filter(c => c.material && c.material !== 'ninguno').length;
  const pctMaterial = conMaterial / todasDelCliente.length;
  // Si en más del 50% de las consultas hubo que mandarle material → resta 1 pt
  const materialPenalty = pctMaterial > 0.50 ? -1 : 0;

  // ── % con conexión remota (señal negativa: no pudo resolverlo solo) ──
  const conRemota = todasDelCliente.filter(c => c.remota === true || c.remota === 'si').length;
  const pctRemota = conRemota / todasDelCliente.length;
  // Si en más del 40% de las consultas hubo que conectarse → resta 1 pt
  const remotaPenalty = pctRemota > 0.40 ? -1 : 0;

  // ── Resultado ──
  const total = frecPts + repPts + materialPenalty + remotaPenalty;
  const nuevaAutonomia = total >= 5 ? 'alta'
                       : total >= 3 ? 'media'
                       : 'baja';

  // Solo guardar si cambió
  if (nuevaAutonomia === cliente.autonomia) return;

  try {
    await dbUpdate('clientes', cliente.id, { autonomia: nuevaAutonomia });
    cliente.autonomia = nuevaAutonomia;
    if (typeof renderClientes    === 'function') renderClientes();
    if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
    if (typeof refreshAlertas    === 'function') refreshAlertas();
  } catch (e) {
    console.warn('No se pudo actualizar la autonomía de', nombreCliente, e);
  }
}

// ────────── Buscador de clientes (reemplaza el select nativo) ──────────

let _clienteSearchTimeout = null;

function filtrarClienteSearch() {
  const input    = document.getElementById('r-cliente-search');
  const dropdown = document.getElementById('r-cliente-dropdown');
  const select   = document.getElementById('r-cliente');
  if (!input || !dropdown || !select) return;

  // Posicionar el dropdown justo debajo del input
  const rect = input.getBoundingClientRect();
  dropdown.style.top   = (rect.bottom + 2) + 'px';
  dropdown.style.left  = rect.left + 'px';
  dropdown.style.width = rect.width + 'px';

  const q = input.value.trim().toLowerCase();

  // Obtener la lista de opciones del select oculto
  const opciones = Array.from(select.options)
    .map(o => o.text)
    .filter(t => t && t !== 'Cargando clientes...');

  const filtradas = q
    ? opciones.filter(n => n.toLowerCase().includes(q))
    : opciones;

  if (filtradas.length === 0) {
    dropdown.innerHTML = `<div style="padding:10px 14px;color:var(--text3);font-size:13px">Sin resultados</div>`;
  } else {
    dropdown.innerHTML = filtradas.map(n => `
      <div
        class="cliente-search-opt"
        onmousedown="elegirClienteSearch('${n.replace(/'/g, "\\'")}')"
        style="padding:9px 14px;cursor:pointer;font-size:13px;border-radius:6px"
      >${n}</div>`).join('');
  }
  // Forzar fondo sólido tomando el color computado del body/html
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#1e1e2e';
  dropdown.style.background = bg;
  dropdown.style.display = 'block';
}

function elegirClienteSearch(nombre) {
  const input    = document.getElementById('r-cliente-search');
  const select   = document.getElementById('r-cliente');
  const dropdown = document.getElementById('r-cliente-dropdown');
  if (input)    input.value  = nombre;
  if (select)   select.value = nombre;
  if (dropdown) dropdown.style.display = 'none';
}

function cerrarClienteSearch() {
  // Pequeño delay para que el onmousedown del item alcance a disparar primero
  setTimeout(() => {
    const dropdown = document.getElementById('r-cliente-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }, 150);
}

// ────────── Reset del form ──────────

function resetFormConsulta() {
  // Limpiar buscador de cliente
  const clienteSearch = document.getElementById('r-cliente-search');
  if (clienteSearch) clienteSearch.value = '';
  const clienteDrop = document.getElementById('r-cliente-dropdown');
  if (clienteDrop) clienteDrop.style.display = 'none';

  // Selects y inputs con ID
  const ids = ['r-cliente', 'r-rep', 'r-material', 'r-remota'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });

  // Categoría: resetear a "Seleccioná..." y actualizar subtemas (también oculta los inputs custom)
  const selCat = document.getElementById('r-cat');
  if (selCat) {
    selCat.value = '';
    updateRegSubtemas();
  }
  const catCustom = document.getElementById('r-cat-custom');
  if (catCustom) { catCustom.value = ''; catCustom.style.display = 'none'; }
  const subCustom = document.getElementById('r-sub-custom');
  if (subCustom) { subCustom.value = ''; subCustom.style.display = 'none'; }

  // Tiempo de resolución
  const tiempo = document.getElementById('r-tiempo');
  if (tiempo) tiempo.value = '';
  const tiempoProg = document.getElementById('r-tiempo-prog');
  if (tiempoProg) tiempoProg.value = '';
  const subProg = document.getElementById('r-sub-prog');
  if (subProg) subProg.value = '';
  const progRealizada = document.getElementById('r-prog-realizada');
  if (progRealizada) progRealizada.value = '';

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
