// CLIENTE → pestaña "Información" (detalle de Implementación)
// Muestra lo que el cliente cargó en el portal: sus empresas (tabla cliente_empresas) y las
// novedades del portal (tabla portal_novedades). El equipo puede corregir/agregar/borrar
// empresas (RLS lo permite; lo que edita el equipo NO genera novedades).
// Al abrir la pestaña se da por vistas las novedades de ese cliente (avisos del Panel general).

const _infoEmp = {};        // clienteId -> [empresas]
const _infoNov = {};        // clienteId -> [novedades]
const _infoCargando = {};   // clienteId -> true mientras se pide
let _infoModalEmpresa = null;   // empresa que se edita en el modal (null = alta)
let _infoModalCliente = null;

const _INFO_TIPOS_EMPLEADOR = [
  '1 - Decreto 814/1 Art.2 Inc.B',
  '2 - Serv.Eventuales Art.2 Inc.B',
  '3 - Provincias u Otros',
  '4 - Decreto 814/1 Art.2 Inc.A',
  '5 - Serv.Eventuales Art.2 Inc.A',
  '6 - Ley N° 22.016',
  '7 - Enseñanza Privada',
  '8 - Domesticos'
];

const _infoEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Campos de datos (además de la razón social) en el orden en que se muestran
const _INFO_CAMPOS = [
  ['cuit', 'CUIT'],
  ['cant_legajos', 'Cant. de legajos'],
  ['domicilio', 'Domicilio'],
  ['tipo_empleador', 'Tipo de empleador'],
  ['obra_social', 'Obra social'],
  ['art', 'ART'],
  ['actividad_principal', 'Actividad principal'],
  ['convenios', 'Convenios']
];

// Esta función existe para que el aviso del Panel general sepa que la pestaña está disponible
function implTabInfoDisponible() { return true; }

// Cantidad de empresas cargadas (para el numerito de la solapa)
function getCantEmpresasCliente(clienteId) {
  return (_infoEmp[clienteId] || []).length;
}

// ¿Hay novedades del portal sin ver de este cliente? (punto naranja en la solapa)
function infoHayNovedadesSinVer(clienteId) {
  return (window._portalNovedades || []).some(g => g.clienteId === clienteId);
}

async function infoCargar(clienteId, rerender) {
  if (_infoCargando[clienteId]) return;
  _infoCargando[clienteId] = true;
  try {
    const [emp, nov] = await Promise.all([
      sb().from('cliente_empresas').select('*').eq('cliente_id', clienteId)
        .order('es_principal', { ascending: false }).order('created_at'),
      sb().from('portal_novedades').select('id, tipo, detalle, created_at').eq('cliente_id', clienteId)
        .order('created_at', { ascending: false }).limit(30)
    ]);
    if (emp.error) throw emp.error;
    if (nov.error) throw nov.error;
    _infoEmp[clienteId] = emp.data || [];
    _infoNov[clienteId] = nov.data || [];
  } catch (e) {
    console.warn('No se pudo cargar la información del portal', e);
    _infoEmp[clienteId] = _infoEmp[clienteId] || [];
    _infoNov[clienteId] = _infoNov[clienteId] || [];
    if (typeof toast === 'function') toast('No se pudo cargar la información del cliente');
  } finally {
    delete _infoCargando[clienteId];
  }
  if (rerender !== false) _infoRerender(clienteId);
}

// Redibuja solo si el usuario está mirando la pestaña Información de ese cliente
function _infoRerender(clienteId) {
  if (window._implTab === 'info' && window._implClienteAbierto === clienteId
      && typeof renderImplementacion === 'function') {
    renderImplementacion();
  }
}

function _infoFecha(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function _infoQuien(email) {
  if (!email) return '—';
  if (email === 'Cliente (portal)') return 'el cliente (portal)';
  const m = (typeof teamMembers !== 'undefined' && Array.isArray(teamMembers))
    ? teamMembers.find(x => x.email === email) : null;
  return m ? m.nombre : email;
}

function _infoNovTitulo(n) {
  const d = _infoEsc(n.detalle || '');
  switch (n.tipo) {
    case 'etapa_completada': return `Completó la etapa «${d}»`;
    case 'empresa_cargada':  return `Cargó la empresa «${d}»`;
    case 'empresa_editada':  return `Actualizó la empresa «${d}»`;
    case 'archivo_subido':   return `Subió el archivo «${d}»`;
    default: return 'Hizo cambios en el portal';
  }
}

function _infoTarjetaEmpresa(e, cid) {
  const faltan = _INFO_CAMPOS.filter(([k]) => k !== 'convenios' && (e[k] === null || e[k] === undefined || e[k] === '')).length;
  const filas = _INFO_CAMPOS.map(([k, label]) => {
    const v = e[k];
    const vacio = (v === null || v === undefined || v === '');
    return `<div class="info-dato${k === 'convenios' || k === 'domicilio' || k === 'actividad_principal' ? ' info-dato--ancho' : ''}">
      <span class="info-dato__l">${label}</span>
      <span class="info-dato__v${vacio ? ' info-dato__v--vacio' : ''}">${vacio ? 'Sin completar' : _infoEsc(v)}</span>
    </div>`;
  }).join('');
  return `
    <div class="info-emp">
      <div class="info-emp__head">
        <div class="info-emp__tit">
          <span class="info-emp__nombre">${_infoEsc(e.razon_social)}</span>
          ${e.es_principal ? '<span class="info-chip info-chip--princ">Empresa del cliente</span>' : '<span class="info-chip">Otra empresa</span>'}
          ${faltan ? `<span class="info-chip info-chip--falta">Faltan ${faltan} datos</span>` : '<span class="info-chip info-chip--ok">Completa</span>'}
        </div>
        <div class="info-emp__acc">
          <button class="btn-sm" onclick="infoAbrirForm('${cid}', '${e.id}')">✏️ Editar</button>
          <button class="btn-sm info-btn-borrar" onclick="infoBorrarEmpresa('${cid}', '${e.id}')" title="Eliminar empresa">🗑</button>
        </div>
      </div>
      <div class="info-datos">${filas}</div>
      <div class="info-emp__pie">Última modificación: ${_infoEsc(_infoQuien(e.actualizado_por))} · ${_infoFecha(e.updated_at)}</div>
    </div>`;
}

function renderInfoCliente(c) {
  const cid = c.id;
  if (!_infoEmp[cid]) {
    infoCargar(cid);
    return '<div class="info-vacio">Cargando información…</div>';
  }
  const emp = _infoEmp[cid];
  const nov = _infoNov[cid] || [];
  const principal = emp.filter(e => e.es_principal);
  const otras = emp.filter(e => !e.es_principal);

  const novHtml = nov.length
    ? nov.map(n => `<div class="info-nov"><span class="info-nov__t">${_infoNovTitulo(n)}</span><span class="info-nov__f">${_infoFecha(n.created_at)} · ${typeof tiempoRelativoImpl === 'function' ? tiempoRelativoImpl(n.created_at) : ''}</span></div>`).join('')
    : '<div class="info-vacio">El cliente todavía no hizo nada en el portal.</div>';

  return `
    <div class="info-wrap">
      <div class="info-seccion">
        <div class="info-seccion__head">
          <h3>Empresa del cliente</h3>
          ${principal.length ? '' : `<button class="btn-primary btn-primary--sm" onclick="infoAbrirForm('${cid}', null, true)">+ Cargar datos</button>`}
        </div>
        ${principal.length ? principal.map(e => _infoTarjetaEmpresa(e, cid)).join('')
          : '<div class="info-vacio">Todavía no se cargaron los datos de la empresa.</div>'}
      </div>

      <div class="info-seccion">
        <div class="info-seccion__head">
          <h3>Otras empresas <span class="info-n">${otras.length}</span></h3>
          <button class="btn-sm" onclick="infoAbrirForm('${cid}', null, false)">+ Agregar empresa</button>
        </div>
        ${otras.length ? otras.map(e => _infoTarjetaEmpresa(e, cid)).join('')
          : '<div class="info-vacio">No hay otras empresas cargadas.</div>'}
      </div>

      <div class="info-seccion">
        <div class="info-seccion__head"><h3>Movimientos del portal</h3></div>
        <div class="info-novs">${novHtml}</div>
      </div>
    </div>`;
}

// Se llama después de dibujar la pestaña: da por vistas las novedades de este cliente
function infoPostRender() {
  const cid = window._implClienteAbierto;
  if (!cid) return;
  if (typeof portalNovedadesMarcarVistas === 'function') portalNovedadesMarcarVistas(cid);
}

// ── Formulario (modal) ───────────────────────────────────────────────
function _infoListaOpciones(id, lista) {
  return `<datalist id="${id}">${lista.map(([cod, desc]) => `<option value="${_infoEsc(cod + ' - ' + desc)}"></option>`).join('')}</datalist>`;
}

function infoAbrirForm(clienteId, empresaId, esPrincipal) {
  const e = empresaId ? (_infoEmp[clienteId] || []).find(x => x.id === empresaId) : null;
  _infoModalEmpresa = e || null;
  _infoModalCliente = clienteId;
  const principal = e ? e.es_principal : !!esPrincipal;
  const v = k => _infoEsc(e ? (e[k] ?? '') : '');
  const L = (typeof PORTAL_LISTAS !== 'undefined') ? PORTAL_LISTAS : { obrasSociales: [], art: [], clae: [] };
  const tipos = _INFO_TIPOS_EMPLEADOR.map(t => `<option value="${_infoEsc(t)}"${e && e.tipo_empleador === t ? ' selected' : ''}>${_infoEsc(t)}</option>`).join('');

  let ov = document.getElementById('info-modal');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'info-modal';
    ov.className = 'kb-modal-overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="kb-modal-sheet">
      <div class="info-form__head">
        <h3>${e ? 'Editar empresa' : (principal ? 'Datos de la empresa del cliente' : 'Agregar empresa')}</h3>
        <button class="kb-modal-close" onclick="infoCerrarForm()" aria-label="Cerrar">✕</button>
      </div>
      <div class="info-form">
        <label>Razón social *<input id="info-f-razon_social" class="info-input" value="${v('razon_social')}"></label>
        <div class="info-form__fila">
          <label>CUIT<input id="info-f-cuit" class="info-input" inputmode="numeric" placeholder="11 dígitos" value="${v('cuit')}"></label>
          <label>Cant. de legajos<input id="info-f-cant_legajos" class="info-input" type="number" min="0" value="${v('cant_legajos')}"></label>
        </div>
        <label>Domicilio<input id="info-f-domicilio" class="info-input" value="${v('domicilio')}"></label>
        <label>Tipo de empleador
          <select id="info-f-tipo_empleador" class="info-input"><option value="">Sin completar</option>${tipos}</select>
        </label>
        <label>Obra social<input id="info-f-obra_social" class="info-input" list="info-dl-os" placeholder="Escribí código o nombre" value="${v('obra_social')}"></label>
        <label>ART<input id="info-f-art" class="info-input" list="info-dl-art" placeholder="Escribí código o nombre" value="${v('art')}"></label>
        <label>Actividad principal<input id="info-f-actividad_principal" class="info-input" list="info-dl-clae" placeholder="Escribí código o descripción" value="${v('actividad_principal')}"></label>
        <label>Convenios<textarea id="info-f-convenios" class="info-input" rows="3">${v('convenios')}</textarea></label>
        ${_infoListaOpciones('info-dl-os', L.obrasSociales || [])}
        ${_infoListaOpciones('info-dl-art', L.art || [])}
        ${_infoListaOpciones('info-dl-clae', L.clae || [])}
      </div>
      <div class="info-form__pie">
        <button class="btn-sm" onclick="infoCerrarForm()">Cancelar</button>
        <button class="btn-primary btn-primary--sm" id="info-guardar" onclick="infoGuardar(${principal ? 'true' : 'false'})">Guardar</button>
      </div>
    </div>`;
  ov.classList.add('kb-modal--open');
  setTimeout(() => { const f = document.getElementById('info-f-razon_social'); if (f) f.focus(); }, 50);
}

function infoCerrarForm() {
  const ov = document.getElementById('info-modal');
  if (ov) ov.classList.remove('kb-modal--open');
  _infoModalEmpresa = null;
  _infoModalCliente = null;
}

async function infoGuardar(esPrincipal) {
  const cid = _infoModalCliente;
  if (!cid) return;
  const val = k => { const el = document.getElementById('info-f-' + k); return el ? el.value.trim() : ''; };
  const razon = val('razon_social');
  if (!razon) { toast('La razón social es obligatoria'); return; }

  const cuit = val('cuit').replace(/\D/g, '');
  if (cuit && cuit.length !== 11) { toast('El CUIT tiene que tener 11 dígitos'); return; }
  const legajos = val('cant_legajos');

  const datos = {
    razon_social: razon,
    cuit: cuit || null,
    cant_legajos: legajos === '' ? null : parseInt(legajos, 10),
    domicilio: val('domicilio') || null,
    tipo_empleador: val('tipo_empleador') || null,
    obra_social: val('obra_social') || null,
    art: val('art') || null,
    actividad_principal: val('actividad_principal') || null,
    convenios: val('convenios') || null
  };

  const btn = document.getElementById('info-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    if (_infoModalEmpresa) {
      await dbUpdate('cliente_empresas', _infoModalEmpresa.id, datos);
    } else {
      await dbInsert('cliente_empresas', { ...datos, cliente_id: cid, es_principal: !!esPrincipal });
    }
    infoCerrarForm();
    toast('Guardado');
    await infoCargar(cid);
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar: ' + (e.message || 'error'));
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

async function infoBorrarEmpresa(clienteId, empresaId) {
  const e = (_infoEmp[clienteId] || []).find(x => x.id === empresaId);
  if (!e) return;
  if (!confirm(`¿Eliminar la empresa «${e.razon_social}»? Esta acción no se puede deshacer.`)) return;
  try {
    await dbDelete('cliente_empresas', empresaId);
    toast('Empresa eliminada');
    await infoCargar(clienteId);
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar: ' + (err.message || 'error'));
  }
}

// ── Tiempo real: si el cliente carga algo mientras miro, se actualiza solo ──
window.addEventListener('app-ready', () => {
  try {
    const refrescar = () => {
      const cid = window._implClienteAbierto;
      // Los clientes que no estoy mirando se descartan: se vuelven a pedir al abrirlos
      Object.keys(_infoEmp).forEach(k => { if (k !== cid) { delete _infoEmp[k]; delete _infoNov[k]; } });
      if (cid && _infoEmp[cid]) infoCargar(cid);
    };
    sb().channel('cliente-info')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_empresas' }, () => setTimeout(refrescar, 500))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_novedades' }, () => setTimeout(refrescar, 800))
      .subscribe();
  } catch (e) { console.warn('No se pudo suscribir a la información del cliente', e); }
});
