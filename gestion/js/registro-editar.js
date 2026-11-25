// ═══════════════════════════════════════════════════════════════
// Editar un registro del historial (consultas, implementación, programación, horas internas).
// Solo el asesor que lo cargó puede editarlo. Al guardar se actualizan las métricas
// (consultas, horas, % repetidas, score/autonomía del cliente) porque todo se calcula desde la tabla `consultas`.
// ═══════════════════════════════════════════════════════════════

function puedoEditarRegistro(c) {
  return !!(c && c.id && !String(c.id).startsWith('_temp_')
    && typeof currentMember !== 'undefined' && currentMember && currentMember.nombre === c.asesor);
}

const _reEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _reIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Abre el formulario de edición dentro del mismo panel de detalle
function registroEditarAbrir(id) {
  const c = (typeof consultas !== 'undefined' ? consultas : []).find(x => String(x.id) === String(id));
  if (!c) return;
  if (!puedoEditarRegistro(c)) { alert('Solo podés editar tus propios registros.'); return; }
  const overlay = document.getElementById('_asesor-detalle-overlay');
  if (!overlay) return;

  const tipo = c.tipoConsulta || c.tipo_consulta || 'soporte';
  const esInterna = tipo === 'programacion_interna';
  const esSoporte = tipo === 'soporte' || tipo === 'comercial';
  const esProg    = tipo === 'programacion';
  const titulo = esInterna ? '⏱ Hora interna' : (c.cliente || c.cliente_nombre || 'Registro');

  // Categorías de soporte (las fijas + la actual si es una cargada a mano)
  const catKeys = Object.keys(typeof CATS !== 'undefined' ? CATS : {});
  if (esSoporte && c.categoria && !catKeys.includes(c.categoria)) catKeys.push(c.categoria);
  const catOpts = catKeys.map(k => `<option value="${_reEsc(k)}"${k === c.categoria ? ' selected' : ''}>${_reEsc((typeof CATS !== 'undefined' && CATS[k] && CATS[k].label) || k)}</option>`).join('');
  const tiposInt = [['actualizacion', 'Actualización'], ['programacion', 'Programación'], ['revision', 'Revisión'], ['reunion', 'Reunión']];

  const f = new Date(c.timestamp);
  const campo = (lbl, html) => `<div><div class="mh__l">${lbl}</div>${html}</div>`;
  const sel = (id, opts, val) => `<select id="${id}" class="mh__in">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

  let cuerpo = '';
  if (esInterna) {
    cuerpo += campo('Tipo de registro', sel('re-cat', tiposInt, c.categoria));
  } else if (esSoporte) {
    cuerpo += campo('Categoría', `<select id="re-cat" class="mh__in" onchange="registroEditarSubs()">${catOpts}</select>`);
    cuerpo += campo('Subtema', `<input id="re-sub" class="mh__in" list="re-sub-list" value="${_reEsc(c.subtema || '')}" autocomplete="off"/><datalist id="re-sub-list"></datalist>`);
  } else if (esProg) {
    cuerpo += campo('Subtema / módulo', `<input id="re-sub" class="mh__in" value="${_reEsc(c.subtema || '')}"/>`);
  }
  cuerpo += `<div class="mh__row">
    ${campo('Horas', `<input id="re-tiempo" class="mh__in" value="${c.tiempo ? _reEsc(c.tiempo) : ''}" placeholder="Ej: 1.45" inputmode="decimal"/><div class="mh__hint">0.30 = 30 min · 1.45 = 1h 45min</div>`)}
    ${campo('Fecha', `<input id="re-fecha" type="date" class="mh__in" max="${_reIso(new Date())}" value="${_reIso(f)}" style="color-scheme:dark light"/>`)}
  </div>`;
  if (esSoporte) {
    cuerpo += `<div class="mh__row">
      ${campo('¿Repetida?', sel('re-rep', [['no', 'No, es nueva'], ['si', 'Sí, ya lo consultó']], c.repetida === 'si' ? 'si' : 'no'))}
      ${campo('Conexión remota', sel('re-remota', [['no', 'No'], ['si', 'Sí']], (c.remota === true || c.remota === 'si') ? 'si' : 'no'))}
    </div>
    <div class="mh__row">
      ${campo('Material enviado', sel('re-material', [['ninguno', 'Ninguno'], ['video', 'Video'], ['pdf', 'PDF / imagen'], ['varios', 'Varios']], c.material || 'ninguno'))}
      ${campo('Quién consultó', `<input id="re-contacto" class="mh__in" value="${_reEsc(c.contacto || '')}" placeholder="Persona del cliente"/>`)}
    </div>`;
  }
  cuerpo += campo('Detalle', `<textarea id="re-desc" class="mh__in" rows="4">${_reEsc(c.descripcion || '')}</textarea>`);

  const caja = overlay.firstElementChild;
  caja.className = 'mh';
  caja.style.padding = '0';
  caja.innerHTML = `
    <div class="mh__head">
      <div class="mh__titulo">
        <span class="mh__ico">✏️</span>
        <div><div class="mh__title" style="font-size:17px">Editar registro</div><div class="mh__sub">${_reEsc(titulo)}</div></div>
      </div>
      <button onclick="document.getElementById('_asesor-detalle-overlay').remove()" style="background:transparent;border:none;cursor:pointer;color:var(--text3);font-size:20px;padding:0 4px;line-height:1">✕</button>
    </div>
    <div class="mh__body">${cuerpo}</div>
    <div class="mh__foot">
      <div class="mh__aviso">${esSoporte && c.cliente ? 'Los cambios se reflejan en las métricas del cliente' : ''}</div>
      <button class="mh__cancel" onclick="_abrirDetalleRegistroAsesor('${c.id}')">Cancelar</button>
      <button class="btn-primary" id="re-guardar" onclick="registroEditarGuardar('${c.id}')">Guardar cambios</button>
    </div>`;
  if (esSoporte) registroEditarSubs();
}

// Sugerencias de subtema según la categoría elegida
function registroEditarSubs() {
  const cat = (document.getElementById('re-cat') || {}).value;
  const dl = document.getElementById('re-sub-list');
  if (!dl) return;
  const subs = (typeof CATS !== 'undefined' && CATS[cat] && CATS[cat].sub) || [];
  dl.innerHTML = subs.map(s => `<option value="${_reEsc(s)}"></option>`).join('');
}

async function registroEditarGuardar(id) {
  const c = (typeof consultas !== 'undefined' ? consultas : []).find(x => String(x.id) === String(id));
  if (!c) return;
  if (!puedoEditarRegistro(c)) { alert('Solo podés editar tus propios registros.'); return; }
  const tipo = c.tipoConsulta || c.tipo_consulta || 'soporte';
  const esInterna = tipo === 'programacion_interna';
  const esSoporte = tipo === 'soporte' || tipo === 'comercial';
  const esProg    = tipo === 'programacion';
  const v = i => ((document.getElementById(i) || {}).value || '').trim();

  // Horas (formato HH.MM)
  const tRaw = v('re-tiempo');
  let tiempo = null;
  if (tRaw) {
    tiempo = typeof parsearHHMM === 'function' ? parsearHHMM(tRaw) : parseFloat(tRaw);
    if (!tiempo || isNaN(tiempo) || tiempo <= 0) { alert('Las horas no son válidas. Usá el formato 0.30 = 30 min · 1.45 = 1h 45min'); return; }
  } else if (!esSoporte) { alert('Ingresá las horas.'); return; }

  const desc = v('re-desc');
  if (esInterna && !desc) { alert('Completá el detalle de lo realizado.'); return; }

  // Fecha: si no cambió se conserva el momento original; si cambió queda a las 12:00 de ese día
  const fSel = v('re-fecha');
  const fOrig = _reIso(new Date(c.timestamp));
  if (fSel && fSel > _reIso(new Date())) { alert('La fecha no puede ser futura.'); return; }

  const patch = { descripcion: desc || null, tiempo_resolucion: tiempo };
  if (fSel && fSel !== fOrig) patch.created_at = new Date(`${fSel}T12:00:00`).toISOString();
  if (esInterna) patch.categoria = v('re-cat');
  if (esSoporte) {
    patch.categoria = v('re-cat');
    patch.subtema = v('re-sub') || null;
    patch.repetida = v('re-rep') === 'si';
    patch.conexion_remota = v('re-remota') === 'si';
    const mat = v('re-material');
    patch.material = mat && mat !== 'ninguno' ? mat : null;
    patch.contacto = v('re-contacto') || null;
  }
  if (esProg) patch.subtema = v('re-sub') || null;

  const btn = document.getElementById('re-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const data = await dbUpdate('consultas', id, patch);
    registroAplicarCambio(data);
    // El score, la autonomía y la adopción del cliente dependen de sus consultas: se recalculan
    if (c.cliente && esSoporte) {
      try {
        if (typeof recalcularAdopcionCliente === 'function') await recalcularAdopcionCliente(c.cliente);
        if (typeof recalcularAutonomiaCliente === 'function') await recalcularAutonomiaCliente(c.cliente);
        if (typeof recalcularScoreCliente === 'function') await recalcularScoreCliente(c.cliente);
      } catch (e) { console.warn('No se pudo recalcular el cliente', e); }
    }
    document.getElementById('_asesor-detalle-overlay')?.remove();
    if (typeof toast === 'function') toast('Registro actualizado');
  } catch (e) {
    console.error('Error editando registro', e);
    alert('No se pudo guardar: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

// Reemplaza el registro en memoria y refresca todo lo que lo muestra (también lo usa el realtime de otros usuarios)
function registroAplicarCambio(row) {
  if (typeof consultas === 'undefined' || !row) return;
  const nuevo = typeof dbRowToConsulta === 'function' ? dbRowToConsulta(row) : row;
  const i = consultas.findIndex(x => String(x.id) === String(nuevo.id));
  if (i >= 0) consultas[i] = nuevo; else return;
  consultas.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
  if (typeof refreshConsultasPage === 'function') refreshConsultasPage();
  if (typeof renderClientes === 'function') renderClientes();
  if (typeof renderSaludoPanel === 'function') renderSaludoPanel();
  try { if (typeof _renderModalAsesor === 'function') _renderModalAsesor(); } catch (e) { /* modal cerrado */ }
  if (typeof _detalleAsesorNombre !== 'undefined' && _detalleAsesorNombre && typeof renderDetalleAsesor === 'function') {
    try { renderDetalleAsesor(); } catch (e) { console.warn('No se pudo refrescar el detalle del asesor', e); }
  }
  if (typeof _detalleClienteId !== 'undefined' && _detalleClienteId && nuevo.cliente && typeof goClienteDetail === 'function') {
    const cd = typeof clientes !== 'undefined' ? clientes.find(x => x.id === _detalleClienteId) : null;
    if (cd && cd.nombre === nuevo.cliente) goClienteDetail(_detalleClienteId);
  }
}
