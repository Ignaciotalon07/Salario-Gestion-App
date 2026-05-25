// CLIENTES (Supabase + realtime)
// Fuente de verdad: tabla 'clientes' en Supabase.
// Reemplaza la version anterior basada en localStorage.

let clientes = [];
let areaFilter = '';
let tipoFilter = '';
let autFilter  = '';
let sortBy     = 'score';

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

// ────────── Render ──────────

function renderClientes() {
  const cont = document.getElementById('client-cards');
  if (!cont) return;

  let visible = clientes.slice();
  if (areaFilter) visible = visible.filter(c => c.area === areaFilter);
  if (tipoFilter) visible = visible.filter(c => c.tipo === tipoFilter);
  if (autFilter)  visible = visible.filter(c => c.autonomia === autFilter);

  visible.sort((a, b) => {
    if (sortBy === 'score')     return (b.score || 0) - (a.score || 0);
    if (sortBy === 'consultas') return 0; // sin datos por ahora
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  if (visible.length === 0) {
    cont.innerHTML = '<div class="card" style="text-align:center;color:var(--text3);padding:40px">No hay clientes que coincidan con los filtros.</div>';
    return;
  }
  cont.innerHTML = visible.map(renderClienteCard).join('');
}

function renderClienteCard(c) {
  const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
  const areaTexto = c.area === 'impl' ? 'Implementacion' : 'Soporte';
  const areaBadge = c.area === 'impl' ? '<span class="badge b-blue">Implementacion</span>' : '';
  const autonomiaBadge = ({
    baja:  '<span class="badge b-red">Baja autonomia</span>',
    media: '<span class="badge b-amber">Media autonomia</span>',
    alta:  '<span class="badge b-green">Alta autonomia</span>'
  })[c.autonomia] || '';
  const scoreClass = c.score >= 7 ? 'b-red' : (c.score >= 4 ? 'b-amber' : 'b-green');
  const scoreBadge = `<span class="badge ${scoreClass}">Riesgo ${c.score}/10</span>`;

  const adopcionColor = c.adopcion >= 70 ? 'var(--green)' : c.adopcion >= 50 ? 'var(--amber)' : 'var(--red)';

  return `
    <div class="card" data-id="${c.id}" data-area="${c.area}" data-aut="${c.autonomia}" data-score="${c.score}" data-nombre="${escapeHtml(c.nombre)}" data-tipo="${c.tipo}">
      <div class="card-header-row">
        <div class="identity-row">
          <div class="av av-${c.tipo}">${escapeHtml(c.iniciales)}</div>
          <div>
            <div class="tag-row"><span style="font-weight:600">${escapeHtml(c.nombre)}</span><span class="tipo-tag tipo-${c.tipo}">${tipoLabel}</span></div>
            <div class="text-meta">${areaTexto} &middot; Resp: ${escapeHtml(c.asesor)}</div>
          </div>
        </div>
        <div class="badge-stack">${scoreBadge}${autonomiaBadge}${areaBadge}</div>
      </div>
      <div class="bar-wrap" style="margin-top:4px"><div class="bar-label"><span>Adopcion de herramientas</span><span>${c.adopcion}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${c.adopcion}%;background:${adopcionColor}"></div></div></div>
      ${c.nota ? `<div class="text-meta" style="margin:8px 0">${escapeHtml(c.nota)}</div>` : ''}
      <div class="btn-row btn-row--spaced">
        <button class="btn-sm" onclick="goTo(document.querySelector('.nav-item[onclick*=registrar]'),'registrar')">+ Consulta</button>
        ${c.whaticket_url
          ? `<a class="btn-sm wt-btn" href="${escapeHtml(c.whaticket_url)}" target="_blank" rel="noopener" title="Abrir chat en Whaticket">🎫 Whaticket</a>`
          : `<button class="btn-sm" onclick="vincularWhaticket('${c.id}')" title="Vincular el chat de Whaticket de este cliente">🎫 Vincular Whaticket</button>`}
        <button class="btn-sm" style="margin-left:auto" onclick="eliminarCliente('${c.id}')" title="Eliminar cliente">Eliminar cliente</button>
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
  if (!nombre) { alert('Ingresa un nombre.'); return; }

  const tipo      = document.getElementById('cf-tipo').value;
  const area      = document.getElementById('cf-area').value;
  const asesor    = document.getElementById('cf-asesor').value;
  const autonomia = document.getElementById('cf-autonomia').value;
  const nota      = document.getElementById('cf-nota').value.trim();
  const wtRaw     = ((document.getElementById('cf-whaticket') || {}).value || '').trim();

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

  const iniciales = (nombre.replace(/[^A-Za-z0-9]/g, '').substring(0, 2) || 'XX').toUpperCase();

  const row = {
    nombre, tipo, area, asesor, autonomia, iniciales,
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

    // Si el cliente es de implementacion, sembrar las 23 tareas estandar
    if (area === 'impl') {
      try {
        await sb().rpc('crear_implementacion_para_cliente', { p_cliente_id: inserted.id });
      } catch (errImpl) {
        console.warn('No se pudieron crear tareas de implementacion automaticamente', errImpl);
      }
    }

    // Reset form
    document.getElementById('cf-nombre').value = '';
    document.getElementById('cf-nota').value = '';
    if (document.getElementById('cf-whaticket')) document.getElementById('cf-whaticket').value = '';
    document.getElementById('cliente-form').style.display = 'none';
    toast('Cliente agregado correctamente');
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
  document.querySelectorAll('#client-cards .card').forEach(c => {
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
      // Re-render pendientes en caso de que el cliente haya cambiado de Whaticket URL
      if (typeof renderPendientes === 'function') renderPendientes();
    }
  } else if (eventType === 'DELETE') {
    const c = clientes.find(c => c.id === oldRow.id);
    if (c) delete CLIENTES_LOOKUP[c.nombre];
    clientes = clientes.filter(c => c.id !== oldRow.id);
    refrescarSelectsCliente(clientes.map(c => c.nombre));
    renderClientes();
  }
}

window.addEventListener('app-ready', initClientes);
