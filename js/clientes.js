// CLIENTES (Supabase + realtime)
// Fuente de verdad: tabla 'clientes' en Supabase.
// Reemplaza la version anterior basada en localStorage.

let clientes = [];
let areaFilter = '';
let tipoFilter = '';
let autFilter  = '';
let sortBy     = 'nombre';

// ────────── Mapeo DB <-> UI ──────────

function dbRowToCliente(row) {
  return {
    id:                          row.id,
    nombre:                      row.nombre,
    tipo:                        row.tipo,
    area:                        row.area,
    asesor:                      row.asesor,
    autonomia:                   row.autonomia,
    iniciales:                   row.iniciales,
    adopcion:                    row.adopcion || 0,
    score:                       row.score || 0,
    nota:                        row.nota,
    razon_social:                row.razon_social || null,
    cuit:                        row.cuit || null,
    whaticket_url:               row.whaticket_url,
    fecha_inicio_implementacion: row.fecha_inicio_implementacion,
    fecha_fin_objetivo:          row.fecha_fin_objetivo
  };
}

// Normaliza la URL/UUID que el usuario pega en el prompt o en el form.
// Acepta:
//   - URL completa: https://app.whaticket.com/tickets/<UUID>
//   - Solo el UUID: 318e4576-5b0e-4f05-a583-fe94eb9ae8df
// Devuelve null si no es valido.
function normalizeWhaticketUrl(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) {
    return `https://app.whaticket.com/tickets/${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed) && trimmed.includes('whaticket.com')) {
    return trimmed;
  }
  return null;
}

// ────────── Init ──────────

async function initClientes() {
  try {
    const rows = await dbList('clientes', { orderBy: 'score', ascending: false });
    clientes = rows.map(dbRowToCliente);

    // Poblar el lookup global que usa pendientes.js para inferir tipo/iniciales/whaticket
    clientes.forEach(c => {
      CLIENTES_LOOKUP[c.nombre] = { tipo: c.tipo, iniciales: c.iniciales, whaticket_url: c.whaticket_url };
    });

    renderClientes();
    refrescarSelectsCliente(clientes.map(c => c.nombre));
    // Actualizar métricas del panel con el conteo real de clientes
    if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
    suscribirClientes();
  } catch (e) {
    console.error('Error cargando clientes', e);
    const cont = document.getElementById('client-cards');
    if (cont) cont.innerHTML = `<div class="card" style="text-align:center;color:var(--red);padding:24px">No se pudieron cargar los clientes. ${e.message}</div>`;
  }
}

function refrescarSelectsCliente(nombres) {
  const selects = ['pf-cliente', 'r-cliente'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Limpiar opciones existentes y agregar todos los nombres
    const otroOpt = Array.from(sel.options).find(o => o.text === 'Otro cliente');
    sel.innerHTML = '';
    nombres.forEach(n => {
      const opt = document.createElement('option');
      opt.text = n;
      sel.add(opt);
    });
    if (otroOpt) {
      const opt = document.createElement('option');
      opt.text = 'Otro cliente';
      sel.add(opt);
    }
  });
}

// ────────── Stats por cliente (desde array global de consultas) ──────────

function getStatsCliente(nombre) {
  const ahora = new Date();
  const todas = (typeof consultas !== 'undefined') ? consultas : [];

  // Todas las consultas históricas del cliente
  const delCliente = todas.filter(c => c.cliente === nombre);
  const totalHistorico = delCliente.length;

  // Consultas de este mes (para % repetidas y hs)
  const estesMes = delCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth()    === ahora.getMonth() &&
           d.getFullYear() === ahora.getFullYear();
  });

  const repetidasMes = estesMes.filter(c => c.repetida === 'si').length;
  const pctRep       = estesMes.length > 0 ? Math.round((repetidasMes / estesMes.length) * 100) : null;

  // Horas consumidas este mes
  const hsMes = estesMes.reduce((sum, c) => sum + (parseFloat(c.tiempo) || 0), 0);

  // Categoría más frecuente (histórico)
  const catCounts = {};
  delCliente.forEach(c => {
    if (c.categoria) catCounts[c.categoria] = (catCounts[c.categoria] || 0) + 1;
  });
  const topCatKey = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topCatLabel = topCatKey
    ? ((typeof CATS !== 'undefined' && CATS[topCatKey]?.label) || topCatKey)
    : null;

  return { totalHistorico, pctRep, topCatLabel, hsMes };
}

// ────────── Render ──────────

function renderClientes() {
  const cont = document.getElementById('client-cards');
  if (!cont) return;

  let visible = clientes.slice();
  if (areaFilter) visible = visible.filter(c => c.area === areaFilter);
  if (tipoFilter) visible = visible.filter(c => c.tipo === tipoFilter);
  if (autFilter)  visible = visible.filter(c => c.autonomia === autFilter);

  const todasConsultas = (typeof consultas !== 'undefined') ? consultas : [];

  // Al ordenar por riesgo: solo clientes con al menos 1 consulta registrada
  if (sortBy === 'score') {
    const conConsultas = new Set(todasConsultas.map(c => c.cliente).filter(Boolean));
    visible = visible.filter(c => conConsultas.has(c.nombre));
  }

  visible.sort((a, b) => {
    if (sortBy === 'score') {
      // Score bajo primero (mayor riesgo)
      return (a.score || 0) - (b.score || 0);
    }
    if (sortBy === 'consultas') {
      const totalA = todasConsultas.filter(c => c.cliente === a.nombre).length;
      const totalB = todasConsultas.filter(c => c.cliente === b.nombre).length;
      return totalB - totalA;
    }
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  if (visible.length === 0) {
    cont.innerHTML = '<div class="card" style="text-align:center;color:var(--text3);padding:40px">No hay clientes que coincidan con los filtros.</div>';
    return;
  }
  cont.innerHTML = visible.map(renderClienteCard).join('');
  // Re-render también cuando llegan nuevas consultas (para actualizar stats)
  if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
}

function renderClienteCard(c) {
  const tipoLabel    = TIPO_LABELS[c.tipo] || c.tipo;
  const areaTexto    = c.area === 'impl' ? 'Implementacion' : 'Soporte';
  const scoreClass   = c.score >= 7 ? 'b-green' : (c.score >= 4 ? 'b-amber' : 'b-red');
  const adopcionColor = c.adopcion >= 70 ? 'var(--green)' : c.adopcion >= 50 ? 'var(--amber)' : 'var(--red)';

  const autBadgeClass = { alta: 'b-green', media: 'b-amber', baja: 'b-red' }[c.autonomia] || 'b-gray';
  const autLabel      = { alta: 'Alta autonomia', media: 'Media autonomia', baja: 'Baja autonomia' }[c.autonomia] || '—';

  // Stats desde consultas
  const { totalHistorico, pctRep, topCatLabel, hsMes } = getStatsCliente(c.nombre);

  // Texto de tiempo: "X hs este mes"
  const fmtHs = h => h % 1 === 0 ? h + ' hs' : h.toFixed(1) + ' hs';
  const tiempoMesTexto = hsMes > 0 ? fmtHs(hsMes) : '—';
  const tiempoColor = hsMes >= 5 ? 'var(--red)' : hsMes >= 2 ? 'var(--amber)' : 'var(--text)';

  // Color % repetidas: verde=bajo, rojo=alto
  let repColor = 'var(--text3)';
  let repTexto = '—';
  if (pctRep !== null) {
    repTexto = pctRep + '%';
    repColor = pctRep >= 40 ? 'var(--red)' : pctRep >= 20 ? 'var(--amber)' : 'var(--green)';
  }

  const topCatHTML = topCatLabel
    ? `<div class="cli-card__stat-val cli-card__stat-val--sm">${escapeHtml(topCatLabel)}</div>`
    : `<div class="cli-card__stat-val cli-card__stat-val--sm" style="color:var(--text3)">Sin datos</div>`;

  return `
    <div class="cli-card"
         data-id="${c.id}"
         data-area="${c.area}"
         data-aut="${c.autonomia}"
         data-score="${c.score}"
         data-nombre="${escapeHtml(c.nombre)}"
         data-tipo="${c.tipo}"
         onclick="goClienteDetail('${c.id}')"
         style="cursor:pointer">

      <!-- Header -->
      <div class="cli-card__header">
        <div class="cli-card__identity">
          <div class="av av-lg av-${c.tipo}">${escapeHtml(c.iniciales)}</div>
          <div style="min-width:0;flex:1">
            <div class="cli-card__name">${escapeHtml(c.nombre)}
              <span class="tipo-tag tipo-${c.tipo}" style="font-size:9px;vertical-align:middle">${tipoLabel}</span>
            </div>
            <div class="cli-card__meta">${areaTexto} &middot; ${escapeHtml(c.asesor)}</div>
          </div>
        </div>
        <div class="cli-card__badges">
          <span class="badge ${scoreClass}">${c.score}/10</span>
          <span class="badge ${autBadgeClass}">${autLabel}</span>
          ${c.area === 'impl' ? '<span class="badge b-blue">Implementacion</span>' : ''}
        </div>
      </div>

      <!-- Stats: consultas / repetidas / tiempo este mes / consulta más repetida -->
      <div class="cli-card__stats">
        <div class="cli-card__stat">
          <div class="cli-card__stat-val">${totalHistorico}</div>
          <div class="cli-card__stat-lbl">consultas históricas</div>
        </div>
        <div class="cli-card__stat">
          <div class="cli-card__stat-val" style="color:${repColor}">${repTexto}</div>
          <div class="cli-card__stat-lbl">% repetidas</div>
        </div>
        <div class="cli-card__stat">
          <div class="cli-card__stat-val" style="color:${tiempoColor}">${tiempoMesTexto}</div>
          <div class="cli-card__stat-lbl">hs este mes</div>
        </div>
        <div class="cli-card__stat">
          ${topCatHTML}
          <div class="cli-card__stat-lbl">consulta más repetida</div>
        </div>
      </div>

      <!-- Adopción -->
      <div class="cli-card__body">
        <div class="bar-wrap">
          <div class="bar-label">
            <span>Adopcion de herramientas</span><span>${c.adopcion}%</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${c.adopcion}%;background:${adopcionColor}"></div>
          </div>
        </div>
        ${c.nota ? `<div class="cli-card__nota">"${escapeHtml(c.nota)}"</div>` : ''}
      </div>

      <!-- Footer: botones — stopPropagation para no abrir el detalle al clickearlos -->
      <div class="cli-card__footer" onclick="event.stopPropagation()">
        <button class="btn-sm btn-primary" style="font-size:12px"
          onclick="irARegistrarConsulta('${escapeHtml(c.nombre)}')">
          + Consulta
        </button>
        ${c.whaticket_url
          ? `<a class="btn-sm wt-btn" href="${escapeHtml(c.whaticket_url)}" target="_blank" rel="noopener">🎫 Whaticket</a>`
          : `<button class="btn-sm" onclick="vincularWhaticket('${c.id}')">🎫 Vincular</button>`}
      </div>
    </div>`;
}

// ────────── Form: agregar cliente ──────────

function showClienteForm() {
  const f = document.getElementById('cliente-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function guardarCliente() {
  const nombre = document.getElementById('cf-nombre').value.trim();
  if (!nombre) { alert('Ingresá el nombre comercial del cliente.'); return; }

  const tipo         = document.getElementById('cf-tipo').value;
  const area         = document.getElementById('cf-area').value;
  const razon_social = (document.getElementById('cf-razon')?.value || '').trim() || null;
  const cuit         = (document.getElementById('cf-cuit')?.value || '').replace(/[^0-9]/g, '') || null;
  const nota         = document.getElementById('cf-nota').value.trim();
  const wtRaw        = ((document.getElementById('cf-whaticket') || {}).value || '').trim();

  // Verificar duplicado por nombre (case-insensitive)
  if (clientes.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    alert('Ya existe un cliente con ese nombre.');
    return;
  }

  // Si pego algo en el campo Whaticket, validamos que sea un link/UUID valido
  let whaticket_url = null;
  if (wtRaw) {
    whaticket_url = normalizeWhaticketUrl(wtRaw);
    if (!whaticket_url) {
      alert('El link de Whaticket no parece valido.\n\nPega la URL completa (https://app.whaticket.com/tickets/...) o solo el UUID.');
      return;
    }
  }

  const palabras = nombre.replace(/[^A-Za-z0-9áéíóúÁÉÍÓÚñÑ ]/g, ' ').split(' ').filter(p => p);
  const iniciales = palabras.length >= 2
    ? (palabras[0][0] + palabras[1][0]).toUpperCase()
    : (palabras[0] || 'XX').substring(0, 2).toUpperCase();

  const row = {
    nombre, razon_social, cuit, tipo, area, iniciales,
    autonomia: 'media',
    adopcion: 0, score: 0,
    nota: nota || null,
    whaticket_url
  };

  try {
    const inserted = await dbInsert('clientes', row);
    const ya = clientes.find(c => c.id === inserted.id);
    if (!ya) clientes.unshift(dbRowToCliente(inserted));
    CLIENTES_LOOKUP[nombre] = { tipo, iniciales, whaticket_url };
    refrescarSelectsCliente(clientes.map(c => c.nombre));
    renderClientes();

    // Si el cliente es de implementacion, crear las etapas desde la plantilla
    // que corresponde al tipo del cliente (empresa, estudio, colegio, municipalidad)
    if (area === 'impl') {
      try {
        await sb().rpc('crear_implementacion_para_cliente', {
          p_cliente_id: inserted.id,
          p_tipo:       tipo   // usa el tipo seleccionado en el form
        });
        toast(`Cliente agregado y etapas creadas desde plantilla ${tipo}`);
      } catch (errImpl) {
        console.warn('No se pudieron crear tareas de implementacion automaticamente', errImpl);
        toast('Cliente agregado. Creá las etapas manualmente desde Implementación.');
      }
    }

    // Reset form
    ['cf-nombre', 'cf-razon', 'cf-cuit', 'cf-nota', 'cf-whaticket'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('cliente-form').style.display = 'none';
    if (area !== 'impl') toast('Cliente agregado correctamente');
  } catch (e) {
    console.error('Error guardando cliente', e);
    if (e.code === '23505') {
      alert('Ya existe un cliente con ese nombre en la base.');
    } else {
      alert('No se pudo guardar el cliente: ' + e.message);
    }
  }
}

async function vincularWhaticket(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  const input = prompt(
    `Pegar el link del chat de Whaticket para ${c.nombre}:\n\n` +
    `Ej: https://app.whaticket.com/tickets/318e4576-5b0e-4f05-a583-fe94eb9ae8df\n\n` +
    `(Tambien podes pegar solo el UUID)`,
    c.whaticket_url || ''
  );
  if (input === null) return; // cancelo
  const trimmed = input.trim();
  if (!trimmed) {
    // Permite vaciar el campo si pega vacio
    try {
      await dbUpdate('clientes', id, { whaticket_url: null });
      toast(`Whaticket desvinculado de ${c.nombre}`);
    } catch (e) {
      console.error('Error desvinculando whaticket', e);
      alert('No se pudo desvincular: ' + e.message);
    }
    return;
  }
  const url = normalizeWhaticketUrl(trimmed);
  if (!url) {
    alert('El link no parece valido. Tiene que ser una URL de https://app.whaticket.com/... o un UUID.');
    return;
  }
  try {
    await dbUpdate('clientes', id, { whaticket_url: url });
    toast(`Whaticket vinculado a ${c.nombre}`);
    // El realtime actualiza la UI; si no esta suscripto, actualizamos local
    const idx = clientes.findIndex(x => x.id === id);
    if (idx !== -1) {
      clientes[idx].whaticket_url = url;
      if (CLIENTES_LOOKUP[c.nombre]) CLIENTES_LOOKUP[c.nombre].whaticket_url = url;
      renderClientes();
    }
  } catch (e) {
    console.error('Error vinculando whaticket', e);
    alert('No se pudo vincular: ' + e.message);
  }
}

async function eliminarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Eliminar a ${c.nombre}? Tambien se eliminaran sus pendientes y consultas asociados.`)) return;
  try {
    await dbDelete('clientes', id);
    clientes = clientes.filter(x => x.id !== id);
    delete CLIENTES_LOOKUP[c.nombre];
    refrescarSelectsCliente(clientes.map(c => c.nombre));
    renderClientes();
    toast(`${c.nombre} eliminado`);
  } catch (e) {
    console.error('Error eliminando cliente', e);
    alert('No se pudo eliminar: ' + e.message);
  }
}

// ────────── Filtros y orden (los que ya tenia el HTML) ──────────

function filterClientes(v) {
  const q = (v || '').toLowerCase();
  document.querySelectorAll('#client-cards .cli-card').forEach(c => {
    c.style.display = c.dataset.nombre && c.dataset.nombre.toLowerCase().includes(q) ? '' : 'none';
  });
}

function filtAct(btn, val) {
  document.querySelectorAll('.filter-chip').forEach(b => {
    if (b.closest('#clientes')) b.classList.remove('active');
  });
  btn.classList.add('active');
  areaFilter = val;
  renderClientes();
}

function filtAut(val) { autFilter  = val; renderClientes(); }
function filtTipo(val) { tipoFilter = val; renderClientes(); }
function sortClientes(v) { sortBy = v; renderClientes(); }

// ────────── Realtime ──────────

let _clientesChannel = null;
function suscribirClientes() {
  if (_clientesChannel) return;
  _clientesChannel = sb()
    .channel('clientes-realtime')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clientes' },
        (payload) => handleClienteChange(payload))
    .subscribe();
}

function handleClienteChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    if (!clientes.find(c => c.id === newRow.id)) {
      clientes.push(dbRowToCliente(newRow));
      CLIENTES_LOOKUP[newRow.nombre] = { tipo: newRow.tipo, iniciales: newRow.iniciales, whaticket_url: newRow.whaticket_url };
      refrescarSelectsCliente(clientes.map(c => c.nombre));
      renderClientes();
      if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
      // Re-render pendientes para que aparezca el boton de Whaticket si lo tiene
      if (typeof renderPendientes === 'function') renderPendientes();
    }
  } else if (eventType === 'UPDATE') {
    const idx = clientes.findIndex(c => c.id === newRow.id);
    if (idx !== -1) {
      const oldNombre = clientes[idx].nombre;
      clientes[idx] = dbRowToCliente(newRow);
      if (oldNombre !== newRow.nombre) delete CLIENTES_LOOKUP[oldNombre];
      CLIENTES_LOOKUP[newRow.nombre] = { tipo: newRow.tipo, iniciales: newRow.iniciales, whaticket_url: newRow.whaticket_url };
      refrescarSelectsCliente(clientes.map(c => c.nombre));
      renderClientes();
      if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
      // Re-render pendientes en caso de que el cliente haya cambiado de Whaticket URL
      if (typeof renderPendientes === 'function') renderPendientes();
    }
  } else if (eventType === 'DELETE') {
    const c = clientes.find(c => c.id === oldRow.id);
    if (c) delete CLIENTES_LOOKUP[c.nombre];
    clientes = clientes.filter(c => c.id !== oldRow.id);
    refrescarSelectsCliente(clientes.map(c => c.nombre));
    renderClientes();
    if (typeof refreshClientMetrics === 'function') refreshClientMetrics();
  }
}

window.addEventListener('app-ready', initClientes);
