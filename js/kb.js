// ════════════════════════════════════
// BASE DE SOLUCIONES (Knowledge Base) — Supabase + realtime
// Fuente de verdad: tabla 'soluciones' en Supabase.
// Reemplaza la version anterior basada en data.js hardcoded.
// ════════════════════════════════════

let soluciones    = [];
let kbFiltro      = '';
let kbBuscador    = '';
let kbActiva      = null;
let kbEditId      = null;   // si esta seteado, el form de "Nueva solucion" guarda como edicion

// ────────── Mapeo DB <-> UI ──────────

function dbRowToSolucion(row) {
  return {
    id:        row.id,
    titulo:    row.titulo,
    cat:       row.cat,
    sub:       row.sub || '',
    pasos:     Array.isArray(row.pasos) ? row.pasos : [],
    mat:       row.material || 'Sin material',
    aplica:    row.aplica || 'Todos',
    autor:     row.autor || '',
    usos:      row.usos || 0,
    fecha:     formatFechaCorta(row.updated_at || row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function formatFechaCorta(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// ────────── Init ──────────

async function initKB() {
  try {
    const rows = await dbList('soluciones', { orderBy: 'usos', ascending: false });
    soluciones = rows.map(dbRowToSolucion);
    renderKBList();
    actualizarMetricasKB();
    suscribirSoluciones();
    if (typeof refreshSolucionesAlertas === 'function') refreshSolucionesAlertas();
  } catch (e) {
    console.error('Error cargando soluciones', e);
    const body = document.getElementById('kb-body');
    if (body) body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px">No se pudieron cargar las soluciones. ${e.message}</td></tr>`;
  }
}

// ────────── Render ──────────

function getVisibleSoluciones() {
  let lista = soluciones.slice();
  if (kbFiltro)   lista = lista.filter(s => s.cat === kbFiltro);
  if (kbBuscador) {
    const q = kbBuscador.toLowerCase();
    lista = lista.filter(s =>
      (s.titulo || '').toLowerCase().includes(q) ||
      ((CATS[s.cat] || {}).label || '').toLowerCase().includes(q) ||
      (s.sub || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => (t || '').toLowerCase().includes(q))
    );
  }
  return lista;
}

function renderKBList() {
  const body = document.getElementById('kb-body');
  if (!body) return;
  const lista = getVisibleSoluciones();

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px">No hay soluciones que coincidan con la busqueda.</td></tr>`;
    return;
  }

  const ahora = new Date();
  body.innerHTML = lista.map(s => {
    const cat  = CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' };
    const dias = s.updatedAt || s.createdAt
      ? Math.floor((ahora - new Date(s.updatedAt || s.createdAt)) / (1000 * 60 * 60 * 24))
      : 0;
    const vencida    = dias > 120;
    const porRevisar = dias > 60 && !vencida;
    const rowStyle   = vencida    ? 'background:rgba(192,57,43,0.06)'
                     : porRevisar ? 'background:rgba(180,83,9,0.05)'
                     : '';
    const badge = vencida
      ? `<span class="badge b-red" style="font-size:10px;margin-left:6px">Desactualizada</span>`
      : porRevisar
      ? `<span class="badge b-amber" style="font-size:10px;margin-left:6px">Revisar</span>`
      : '';
    return `<tr onclick="verKBDetalle('${s.id}')" style="cursor:pointer;${rowStyle}">
      <td style="padding-left:20px;white-space:normal;line-height:1.4;font-weight:500">
        ${escapeHtmlKB(s.titulo)}${badge}
      </td>
      <td><span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span></td>
      <td style="color:var(--text2);white-space:normal;font-size:12px">${escapeHtmlKB(s.sub)}</td>
      <td style="font-weight:600">${s.usos}</td>
      <td style="color:${vencida ? 'var(--red)' : porRevisar ? 'var(--amber)' : 'var(--text3)'}">${s.fecha}</td>
      <td style="color:var(--text3)">${escapeHtmlKB(s.autor)}</td>
      <td><button class="btn-sm" onclick="event.stopPropagation();verKBDetalle('${s.id}')">Ver</button></td>
    </tr>`;
  }).join('');
}

function actualizarMetricasKB() {
  // Total cargadas
  const total = soluciones.length;
  const cards = document.querySelectorAll('#biblioteca .metric-card .metric-value');
  if (cards[0]) cards[0].textContent = total;

  // Mas consultada (mayor 'usos')
  if (cards[1]) {
    const top = soluciones.slice().sort((a, b) => b.usos - a.usos)[0];
    cards[1].textContent = top ? top.titulo : '—';
  }

  // Para revisar: soluciones con más de 60 días sin actualizar y al menos 1 uso
  if (cards[2]) {
    const ahora2 = new Date();
    const paraRevisar = soluciones.filter(s => {
      if (!s.updatedAt && !s.createdAt) return false;
      const dias = Math.floor((ahora2 - new Date(s.updatedAt || s.createdAt)) / (1000 * 60 * 60 * 24));
      return dias > 60 && (s.usos || 0) >= 1;
    });
    cards[2].textContent = paraRevisar.length;
    cards[2].style.color = paraRevisar.length > 0 ? 'var(--amber)' : 'var(--green)';
  }

  // Agregadas este mes
  if (cards[3]) {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const yearActual = ahora.getFullYear();
    const delMes = soluciones.filter(s => {
      if (!s.createdAt) return false;
      const d = new Date(s.createdAt);
      return d.getMonth() === mesActual && d.getFullYear() === yearActual;
    });
    cards[3].textContent = delMes.length;
  }
}

function escapeHtmlKB(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ────────── Detalle / Acciones ──────────

function verKBDetalle(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  const cat = CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' };
  kbActiva = id;
  const box = document.getElementById('kb-detail');
  box.className = 'detail-panel open';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <span class="badge" style="background:${cat.bg};color:${cat.text};margin-bottom:6px;display:inline-block">${cat.label} &middot; ${escapeHtmlKB(s.sub)}</span>
        <div style="font-size:15px;font-weight:600;line-height:1.4;color:var(--accent-text)">${escapeHtmlKB(s.titulo)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Por ${escapeHtmlKB(s.autor)} &middot; Actualizado ${s.fecha} &middot; Usado ${s.usos} ${s.usos === 1 ? 'vez' : 'veces'} &middot; ${escapeHtmlKB(s.aplica)}</div>
      </div>
      <button class="btn-sm" id="kb-cerrar-btn" onclick="cerrarKB()">Cerrar</button>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Pasos</div>
      <ol class="step-list">${s.pasos.map((p, i) => `<li><div class="step-num">${i + 1}</div><div>${escapeHtmlKB(p)}</div></li>`).join('')}</ol>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${s.mat !== 'Sin material' ? `<span class="tag">Material: ${escapeHtmlKB(s.mat)}</span>` : ''}
      <button class="btn-sm" onclick="copiarPasosWA('${s.id}')" title="Copiar como mensaje de WhatsApp (numerado, sin formato)">📋 Copiar pasos</button>
      <button class="btn-sm" onclick="editarSolucion('${s.id}')">Editar</button>
      <button class="btn-sm" style="margin-left:auto;color:var(--red)" onclick="eliminarSolucion('${s.id}')">Eliminar</button>
    </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cerrarKB() {
  kbActiva = null;
  const box = document.getElementById('kb-detail');
  if (box) box.className = 'detail-panel';
}

// ────────── Buscar / Filtrar ──────────

function buscarKB(v) {
  kbBuscador = (v || '').trim();
  cerrarKB();
  renderKBList();
}

function filtKB(btn, cat) {
  document.querySelectorAll('.filter-chip').forEach(b => {
    if (b.closest('#biblioteca')) b.classList.remove('active');
  });
  btn.classList.add('active');
  kbFiltro = cat;
  cerrarKB();
  renderKBList();
}

// ────────── Form: nueva / editar ──────────

function showKbForm() {
  kbEditId = null;
  const f = document.getElementById('kb-form');
  if (!f) return;
  // Reset visual
  document.getElementById('kb-titulo').value = '';
  document.getElementById('kb-pasos').value = '';
  const okEl = document.getElementById('kb-ok');
  if (okEl) okEl.style.display = 'none';
  const titleEl = f.querySelector('.card-title');
  if (titleEl) titleEl.textContent = 'Nueva solución';
  const submitBtn = document.getElementById('kb-form-submit');
  if (submitBtn) submitBtn.textContent = 'Guardar solución';

  // Toggle: si esta visible, lo cerramos; si no, lo abrimos y hacemos scroll
  const yaVisible = f.style.display !== 'none' && f.style.display !== '';
  if (yaVisible) {
    f.style.display = 'none';
    return;
  }
  f.style.display = 'block';
  // Scroll suave al form y foco en el primer campo
  setTimeout(() => {
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const tituloInput = document.getElementById('kb-titulo');
    if (tituloInput) tituloInput.focus({ preventScroll: true });
  }, 50);
}

function editarSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  kbEditId = id;
  const f = document.getElementById('kb-form');
  if (!f) return;
  // Pre-cargar valores
  document.getElementById('kb-titulo').value = s.titulo;
  document.getElementById('kb-cat').value = s.cat;
  updateKBSubtemas();
  setTimeout(() => {
    const subSel = document.getElementById('kb-sub');
    if (subSel && s.sub) subSel.value = s.sub;
  }, 0);
  document.getElementById('kb-pasos').value = (s.pasos || []).join('\n');
  // Cambiar titulo del form
  const titleEl = f.querySelector('.card-title');
  if (titleEl) titleEl.textContent = `Editar: ${s.titulo}`;
  const submitBtn = document.getElementById('kb-form-submit');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';
  // Mostrar el form
  f.style.display = 'block';
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function guardarKB() {
  const titulo = document.getElementById('kb-titulo').value.trim();
  if (!titulo) { alert('Completá el título de la solución.'); return; }

  const categoria = document.getElementById('kb-cat').value;
  if (!categoria) { alert('Elegí una categoría.'); return; }

  const subtema = (document.getElementById('kb-sub').value || '').trim();
  const pasosRaw = document.getElementById('kb-pasos').value || '';
  const pasos = pasosRaw.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  if (pasos.length === 0) {
    alert('Cargá al menos un paso.');
    return;
  }

  // Material y aplica — campos opcionales sin id en el form, dejamos defaults
  const material = 'Sin material';
  const aplica   = 'Todos';

  const autor = currentMember ? currentMember.nombre : 'Equipo';

  try {
    if (kbEditId) {
      // Edicion: NO sobreescribimos autor para mantener al original
      const patch = {
        titulo,
        cat: categoria,
        sub: subtema,
        pasos,
        material,
        aplica
      };
      await dbUpdate('soluciones', kbEditId, patch);
      toast('Solución actualizada');
    } else {
      // Creacion
      const row = {
        titulo,
        cat: categoria,
        sub: subtema,
        pasos,
        material,
        aplica,
        autor,
        usos: 0
      };
      await dbInsert('soluciones', row);
      toast('Solución agregada a la base');
    }

    // Reset y cerrar
    document.getElementById('kb-titulo').value = '';
    document.getElementById('kb-pasos').value = '';
    document.getElementById('kb-form').style.display = 'none';
    kbEditId = null;

    // Mostrar confirmacion ok-box (compatible con el HTML existente)
    const ok = document.getElementById('kb-ok');
    if (ok) {
      ok.style.display = 'flex';
      setTimeout(() => { ok.style.display = 'none'; }, 3000);
    }
  } catch (e) {
    console.error('Error guardando solucion', e);
    alert('No se pudo guardar la solución: ' + e.message);
  }
}

async function eliminarSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Eliminar la solución "${s.titulo}"?\n\nEsto la borra para todo el equipo. La accion no se puede deshacer.`)) return;
  try {
    await dbDelete('soluciones', id);
    cerrarKB();
    toast('Solución eliminada');
  } catch (e) {
    console.error('Error eliminando solucion', e);
    alert('No se pudo eliminar: ' + e.message);
  }
}

// Incrementa el contador de usos. Llamada desde el detalle ("+1 Use esta")
// y desde pendientes.js cuando se aplica una solucion sugerida.
async function incrementarUsoSolucion(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  try {
    // Increment optimista en local (la realtime confirma despues)
    const nuevoTotal = (s.usos || 0) + 1;
    await dbUpdate('soluciones', id, { usos: nuevoTotal });
    s.usos = nuevoTotal;
    if (kbActiva === id) verKBDetalle(id); // refrescar detalle
    renderKBList();
    actualizarMetricasKB();
    toast(`+1 uso registrado en "${s.titulo}"`);
  } catch (e) {
    console.error('Error incrementando uso', e);
    // No alert: la accion es secundaria, no debe interrumpir al usuario
  }
}

// ────────── Copiar pasos al portapapeles ──────────

async function copiarPasosWA(id) {
  const s = soluciones.find(x => x.id === id);
  if (!s) return;
  // Formato pensado para WhatsApp: numerado, plain text, con encabezado.
  const texto = `*${s.titulo}*\n\n` +
    s.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    toast('Pasos copiados al portapapeles');
  } catch (e) {
    console.error('Clipboard error', e);
    // Fallback: prompt para copiar manual
    prompt('Copia el texto manualmente (Ctrl+C):', texto);
  }
}

// Cuando cambia la categoria, llenar las opciones del subtema
function updateKBSubtemas() {
  const cat = document.getElementById('kb-cat').value;
  const sel = document.getElementById('kb-sub');
  if (!sel) return;
  if (cat && CATS[cat]) {
    sel.innerHTML = CATS[cat].sub.map(s => `<option>${s}</option>`).join('');
  } else {
    sel.innerHTML = '<option>Primero elegí categoría</option>';
  }
}

// ────────── Realtime ──────────

let _solucionesChannel = null;
function suscribirSoluciones() {
  if (_solucionesChannel) return;
  _solucionesChannel = sb()
    .channel('soluciones-realtime')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'soluciones' },
        (payload) => handleSolucionChange(payload))
    .subscribe();
}

function handleSolucionChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    if (!soluciones.find(s => s.id === newRow.id)) {
      soluciones.unshift(dbRowToSolucion(newRow));
      renderKBList();
      actualizarMetricasKB();
    }
  } else if (eventType === 'UPDATE') {
    const idx = soluciones.findIndex(s => s.id === newRow.id);
    if (idx !== -1) {
      soluciones[idx] = dbRowToSolucion(newRow);
      renderKBList();
      actualizarMetricasKB();
      if (kbActiva === newRow.id) verKBDetalle(newRow.id);
    }
  } else if (eventType === 'DELETE') {
    soluciones = soluciones.filter(s => s.id !== oldRow.id);
    if (kbActiva === oldRow.id) cerrarKB();
    renderKBList();
    actualizarMetricasKB();
  }
}

window.addEventListener('app-ready', initKB);
