// ════════════════════════════════════
// ADMINISTRACIÓN / FACTURACIÓN
// Solo visible para Daniel Ferro.
// Gestiona el estado de cuenta de cada cliente:
// subida de PDF de factura → marca el mes como pagado.
// ════════════════════════════════════

let adminFacturas    = [];   // todas las facturas cargadas
let adminMesFiltro   = '';   // 'YYYY-MM' o '' = todos
let adminTextoFiltro = '';   // búsqueda por nombre
let adminEstadoFiltro= '';   // '' | 'aldia' | 'debe'

// ────────── Inicialización ──────────

async function initAdministracion() {
  // Solo inicializar si es Daniel Ferro
  if (!esDanielFerro()) return;

  // Mostrar sección en sidebar
  const nav = document.getElementById('nav-administracion');
  if (nav) nav.style.display = '';

  // Generar opciones de mes y año sin incluir el futuro
  const ahora     = new Date();
  const mesActual = ahora.getMonth() + 1;   // 1-12
  const anioActual = ahora.getFullYear();
  const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const selMes  = document.getElementById('admin-sel-mes');
  const selAnio = document.getElementById('admin-sel-anio');

  // Años disponibles: desde 2025 hasta el año actual (sin futuros)
  if (selAnio) {
    selAnio.innerHTML = '';
    for (let y = 2025; y <= anioActual; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === anioActual) opt.selected = true;
      selAnio.appendChild(opt);
    }
  }

  // Meses disponibles: si estamos en el año actual, solo hasta el mes actual
  if (selMes) {
    _actualizarOpcionesMes(mesActual, anioActual, anioActual);
  }

  adminMesFiltro = `${anioActual}-${String(mesActual).padStart(2, '0')}`;

  try {
    await cargarFacturas();
  } catch(e) {
    console.error('Error iniciando administración', e);
  }
}

function esDanielFerro() {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  return me === 'Daniel Ferro';
}

// ────────── Carga de datos ──────────

async function cargarFacturas() {
  const { data, error } = await sb()
    .from('facturas')
    .select('*')
    .order('anio', { ascending: false })
    .order('mes',  { ascending: false });

  if (error) throw error;
  adminFacturas = data || [];
  renderAdministracion();
  if (typeof refreshAlertas === 'function') refreshAlertas();
}

// ────────── Helpers de selectores ──────────

const _MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Regenera las opciones del select de mes según el año seleccionado.
// Si es el año actual, corta en el mes actual (no muestra futuros).
function _actualizarOpcionesMes(mesSeleccionado, anioSeleccionado, anioActual) {
  const sel = document.getElementById('admin-sel-mes');
  if (!sel) return;
  const limite = (parseInt(anioSeleccionado) === anioActual)
    ? new Date().getMonth() + 1   // hasta el mes actual inclusive
    : 12;                          // año anterior: todos los meses
  const mesActual = sel.value ? parseInt(sel.value) : mesSeleccionado;
  sel.innerHTML = '';
  for (let m = 1; m <= limite; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = _MESES_NOMBRES[m - 1];
    if (m === Math.min(mesActual, limite)) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ────────── Filtros ──────────

function filtrarAdminMes(val) {
  adminMesFiltro = val || '';
  renderAdministracion();
}

function actualizarFiltroAdminMes() {
  const anio = parseInt(document.getElementById('admin-sel-anio')?.value);
  const anioActual = new Date().getFullYear();
  // Al cambiar el año, recalcular opciones de mes para no mostrar meses futuros
  _actualizarOpcionesMes(null, anio, anioActual);
  const mes = document.getElementById('admin-sel-mes')?.value;
  if (mes && anio) {
    adminMesFiltro = `${anio}-${String(mes).padStart(2, '0')}`;
    renderAdministracion();
  }
}

function filtrarAdminTexto(val) {
  adminTextoFiltro = (val || '').toLowerCase().trim();
  renderAdministracion();
}

function filtrarAdminEstado(estado, btn) {
  adminEstadoFiltro = estado;
  document.querySelectorAll('#administracion .filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAdministracion();
}

// ────────── Render principal ──────────

function renderAdministracion() {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  const todosClientes = (typeof clientes !== 'undefined') ? clientes : [];

  // Parsear mes filtro
  let mesFiltroNum = null, anioFiltroNum = null;
  if (adminMesFiltro) {
    const [y, m] = adminMesFiltro.split('-').map(Number);
    anioFiltroNum = y; mesFiltroNum = m;
  }

  // Para cada cliente, buscar su factura del mes filtrado
  const filas = todosClientes.map(c => {
    // Factura del mes seleccionado
    const facturaMes = mesFiltroNum
      ? adminFacturas.find(f => f.cliente_id === c.id && f.mes === mesFiltroNum && f.anio === anioFiltroNum)
      : adminFacturas.find(f => f.cliente_id === c.id); // la más reciente

    const estado  = facturaMes?.estado || 'pendiente';
    const alDia   = estado === 'pagada';
    return { c, facturaMes, alDia };
  });

  // Filtros
  let visible = filas;
  if (adminTextoFiltro) {
    visible = visible.filter(r => r.c.nombre.toLowerCase().includes(adminTextoFiltro));
  }
  if (adminEstadoFiltro === 'aldia') {
    visible = visible.filter(r => r.alDia);
  } else if (adminEstadoFiltro === 'debe') {
    visible = visible.filter(r => !r.alDia);
  }

  // Ordenar: primero los que deben, luego alfabético
  visible.sort((a, b) => {
    if (a.alDia !== b.alDia) return a.alDia ? 1 : -1;
    return a.c.nombre.localeCompare(b.c.nombre);
  });

  // Métricas
  const totalClientes = todosClientes.length;
  const alDiaCount    = filas.filter(r => r.alDia).length;
  const debenCount    = totalClientes - alDiaCount;
  const montoTotal    = filas
    .filter(r => r.alDia && r.facturaMes?.monto)
    .reduce((s, r) => s + parseFloat(r.facturaMes.monto), 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('admin-m-total', totalClientes);
  set('admin-m-aldia', alDiaCount);
  set('admin-m-deben', debenCount);
  set('admin-m-monto', montoTotal > 0 ? '$' + montoTotal.toLocaleString('es-AR') : '—');

  // Badge sidebar
  const badge = document.getElementById('admin-nav-badge');
  if (badge) {
    badge.textContent = debenCount;
    badge.style.display = debenCount > 0 ? '' : 'none';
  }

  if (visible.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px">Sin clientes que coincidan.</td></tr>`;
    return;
  }

  const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  tbody.innerHTML = visible.map(({ c, facturaMes, alDia }) => {
    const estadoBadge = alDia
      ? `<span class="badge b-green">✅ Al día</span>`
      : `<span class="badge b-red">🔴 Adeuda</span>`;

    const mesLabel      = facturaMes ? `${MESES[facturaMes.mes]} ${facturaMes.anio}` : '—';
    const fechaFactura  = facturaMes?.fecha_facturacion
      ? new Date(facturaMes.fecha_facturacion).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })
      : '—';
    const fechaProxima  = facturaMes?.fecha_proxima
      ? new Date(facturaMes.fecha_proxima).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })
      : '—';
    const monto         = facturaMes?.monto
      ? '$' + parseFloat(facturaMes.monto).toLocaleString('es-AR')
      : '—';

    const pdfBtn = facturaMes?.pdf_url
      ? `<a class="btn-sm" href="${facturaMes.pdf_url}" target="_blank" rel="noopener" style="color:var(--accent)">📄 Ver PDF</a>`
      : '';

    const rowBg = !alDia ? 'background:rgba(192,57,43,0.04)' : '';

    return `<tr style="${rowBg};cursor:pointer" onclick="abrirDrawerCliente('${c.id}','${escapeHtmlAdmin(c.nombre)}')" title="Ver historial">
      <td style="padding-left:20px;font-weight:500">${escapeHtmlAdmin(c.nombre)}</td>
      <td style="color:var(--text3);font-size:12px">${mesLabel}</td>
      <td style="color:var(--text3);font-size:12px">${fechaFactura}</td>
      <td style="color:var(--text3);font-size:12px">${fechaProxima}</td>
      <td style="font-weight:600">${monto}</td>
      <td>${estadoBadge}</td>
      <td style="padding-right:16px;text-align:right" onclick="event.stopPropagation()">
        <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">
          ${pdfBtn}
          <button class="btn-sm btn-primary" style="font-size:11px;white-space:nowrap"
            onclick="abrirModalFactura('${c.id}','${escapeHtmlAdmin(c.nombre)}')">
            ${facturaMes ? '✏️ Editar' : '+ Cargar'}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ────────── Drawer lateral de historial ──────────

function abrirDrawerCliente(clienteId, nombreCliente) {
  // Crear overlay de fondo
  let overlay = document.getElementById('admin-drawer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'admin-drawer-overlay';
    overlay.className = 'admin-drawer-overlay';
    overlay.onclick = cerrarDrawer;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');

  // Crear o reutilizar el drawer
  let drawer = document.getElementById('admin-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'admin-drawer';
    drawer.className = 'admin-drawer';
    document.body.appendChild(drawer);
  }

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const facturasCli = adminFacturas
    .filter(f => f.cliente_id === clienteId)
    .sort((a, b) => b.anio !== a.anio ? b.anio - a.anio : b.mes - a.mes);

  const totalFacturado = facturasCli
    .filter(f => f.estado === 'pagada' && f.monto)
    .reduce((s, f) => s + parseFloat(f.monto), 0);

  const filas = facturasCli.length === 0
    ? `<div style="text-align:center;color:var(--text3);padding:32px 0;font-size:13px">Sin facturas cargadas todavía.</div>`
    : facturasCli.map(f => {
        const fechaFac = f.fecha_facturacion
          ? new Date(f.fecha_facturacion).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })
          : '—';
        const monto  = f.monto ? '$' + parseFloat(f.monto).toLocaleString('es-AR') : '—';
        const estado = f.estado === 'pagada'
          ? `<span class="badge b-green" style="font-size:10px">✅ Pagada</span>`
          : `<span class="badge b-red" style="font-size:10px">🔴 Pendiente</span>`;
        const pdf = f.pdf_url
          ? `<a href="${f.pdf_url}" target="_blank" rel="noopener" class="btn-sm" style="color:var(--accent);font-size:11px">📄 PDF</a>`
          : '';
        return `
          <div class="admin-drawer-item">
            <div class="admin-drawer-item__mes">${MESES[f.mes]} ${f.anio}</div>
            <div class="admin-drawer-item__body">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <div>
                  <span style="font-weight:600;font-size:13px">${monto}</span>
                  <span style="font-size:11px;color:var(--text3);margin-left:8px">${fechaFac}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${estado}
                  ${pdf}
                </div>
              </div>
            </div>
          </div>`;
      }).join('');

  drawer.innerHTML = `
    <div class="admin-drawer__header">
      <div>
        <div class="admin-drawer__nombre">${escapeHtmlAdmin(nombreCliente)}</div>
        <div class="admin-drawer__sub">
          ${facturasCli.length} factura${facturasCli.length !== 1 ? 's' : ''}
          ${totalFacturado > 0 ? ' · Total: $' + totalFacturado.toLocaleString('es-AR') : ''}
        </div>
      </div>
      <button class="btn-sm" onclick="cerrarDrawer()">✕</button>
    </div>
    <div class="admin-drawer__body">
      ${filas}
    </div>
    <div class="admin-drawer__footer">
      <button class="btn-primary" style="width:100%"
        onclick="cerrarDrawer();abrirModalFactura('${clienteId}','${escapeHtmlAdmin(nombreCliente)}')">
        + Cargar nueva factura
      </button>
    </div>`;

  // Animar entrada
  requestAnimationFrame(() => drawer.classList.add('active'));
}

function cerrarDrawer() {
  const drawer  = document.getElementById('admin-drawer');
  const overlay = document.getElementById('admin-drawer-overlay');
  if (drawer)  drawer.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

// ────────── Modal historial de cliente (legacy — reemplazado por drawer) ──────────

function abrirHistorialCliente(clienteId, nombreCliente) {
  const prev = document.getElementById('modal-historial-factura');
  if (prev) prev.remove();

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const facturasCli = adminFacturas
    .filter(f => f.cliente_id === clienteId)
    .sort((a, b) => b.anio !== a.anio ? b.anio - a.anio : b.mes - a.mes);

  const filas = facturasCli.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">Sin facturas cargadas todavía.</td></tr>`
    : facturasCli.map(f => {
        const fechaFac = f.fecha_facturacion
          ? new Date(f.fecha_facturacion).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })
          : '—';
        const fechaPrx = f.fecha_proxima
          ? new Date(f.fecha_proxima).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })
          : '—';
        const monto  = f.monto ? '$' + parseFloat(f.monto).toLocaleString('es-AR') : '—';
        const estado = f.estado === 'pagada'
          ? `<span class="badge b-green">✅ Pagada</span>`
          : `<span class="badge b-red">🔴 Pendiente</span>`;
        const pdf = f.pdf_url
          ? `<a class="btn-sm" href="${f.pdf_url}" target="_blank" rel="noopener" style="color:var(--accent)">📄 PDF</a>`
          : '<span style="color:var(--text3);font-size:11px">Sin PDF</span>';

        return `<tr>
          <td style="font-weight:600">${MESES[f.mes]} ${f.anio}</td>
          <td style="color:var(--text3);font-size:12px">${fechaFac}</td>
          <td style="color:var(--text3);font-size:12px">${fechaPrx}</td>
          <td style="font-weight:600">${monto}</td>
          <td>${estado}</td>
          <td>${pdf}</td>
        </tr>`;
      }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'modal-historial-factura';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:640px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Historial de facturación</div>
          <div class="modal-sub"><strong>${escapeHtmlAdmin(nombreCliente)}</strong> · ${facturasCli.length} factura${facturasCli.length !== 1 ? 's' : ''} cargada${facturasCli.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('modal-historial-factura').remove()">✕</button>
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
        <table class="tbl">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Fecha factura</th>
              <th>Próx. facturación</th>
              <th>Monto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn-primary" onclick="document.getElementById('modal-historial-factura').remove();abrirModalFactura('${clienteId}','${escapeHtmlAdmin(nombreCliente)}')">
          + Cargar nueva factura
        </button>
        <button class="btn-secondary" onclick="document.getElementById('modal-historial-factura').remove()">Cerrar</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ────────── Modal de carga de factura ──────────

function abrirModalFactura(clienteId, nombreCliente) {
  const prev = document.getElementById('modal-factura');
  if (prev) prev.remove();

  // Valores actuales del mes filtrado
  let mesPre = '', anioPre = '';
  if (adminMesFiltro) {
    const [y, m] = adminMesFiltro.split('-');
    anioPre = y; mesPre = m;
  }
  const facturaExistente = adminFacturas.find(f =>
    f.cliente_id === clienteId &&
    f.mes  === parseInt(mesPre) &&
    f.anio === parseInt(anioPre)
  );

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const opsMeses = MESES.slice(1).map((m, i) =>
    `<option value="${i+1}" ${facturaExistente?.mes === i+1 ? 'selected' : mesPre == i+1 ? 'selected' : ''}>${m}</option>`
  ).join('');

  const anioActual = new Date().getFullYear();
  const opsAnios = [anioActual-1, anioActual, anioActual+1].map(a =>
    `<option value="${a}" ${(facturaExistente?.anio || anioPre || anioActual) == a ? 'selected' : ''}>${a}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'modal-factura';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:460px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Cargar factura</div>
          <div class="modal-sub"><strong>${escapeHtmlAdmin(nombreCliente)}</strong></div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('modal-factura').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label class="fl">Mes facturado</label>
            <select id="fac-mes">${opsMeses}</select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="fl">Año</label>
            <select id="fac-anio">${opsAnios}</select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label class="fl">Fecha de facturación</label>
            <input type="date" id="fac-fecha" value="${facturaExistente?.fecha_facturacion || ''}" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="fl">Próxima facturación</label>
            <input type="date" id="fac-proxima" value="${facturaExistente?.fecha_proxima || ''}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label class="fl">Monto ($)</label>
          <input type="number" id="fac-monto" placeholder="Ej: 25000" step="0.01"
            value="${facturaExistente?.monto || ''}" />
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="fl">PDF de la factura</label>
          <input type="file" id="fac-pdf" accept=".pdf" style="font-size:13px" />
          ${facturaExistente?.pdf_url
            ? `<div style="font-size:11px;color:var(--green);margin-top:4px">✅ Ya tiene PDF cargado — subí uno nuevo para reemplazarlo</div>`
            : `<div style="font-size:11px;color:var(--text3);margin-top:4px">Al cargar el PDF el mes queda marcado como <strong>Pagado</strong></div>`}
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border);flex-shrink:0">
        <button class="btn-secondary" onclick="document.getElementById('modal-factura').remove()">Cancelar</button>
        <button class="btn-primary" id="fac-btn-guardar"
          onclick="guardarFactura('${clienteId}', '${escapeHtmlAdmin(nombreCliente)}', ${facturaExistente ? `'${facturaExistente.id}'` : 'null'})">
          💾 Guardar
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ────────── Guardar factura ──────────

async function guardarFactura(clienteId, nombreCliente, facturaId) {
  const btn = document.getElementById('fac-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  const mes     = parseInt(document.getElementById('fac-mes').value);
  const anio    = parseInt(document.getElementById('fac-anio').value);
  const fecha   = document.getElementById('fac-fecha').value || null;
  const proxima = document.getElementById('fac-proxima').value || null;
  const monto   = parseFloat(document.getElementById('fac-monto').value) || null;
  const pdfFile = document.getElementById('fac-pdf').files[0];

  if (!mes || !anio) {
    alert('Elegí mes y año.'); if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; } return;
  }

  let pdf_url  = null;
  let pdf_path = null;

  // Subir PDF si hay uno nuevo
  if (pdfFile) {
    const ext      = pdfFile.name.split('.').pop();
    const path     = `${clienteId}/${anio}-${String(mes).padStart(2,'0')}.${ext}`;
    const { data: upData, error: upErr } = await sb().storage
      .from('facturas')
      .upload(path, pdfFile, { upsert: true });

    if (upErr) {
      alert('No se pudo subir el PDF: ' + upErr.message);
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
      return;
    }

    // Obtener URL pública (signed URL por 1 año)
    const { data: urlData } = await sb().storage
      .from('facturas')
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    pdf_url  = urlData?.signedUrl || null;
    pdf_path = path;
  }

  const row = {
    cliente_id:        clienteId,
    mes,
    anio,
    fecha_facturacion: fecha,
    fecha_proxima:     proxima,
    monto,
    estado:            pdfFile ? 'pagada' : 'pendiente',
    updated_at:        new Date().toISOString(),
    ...(pdf_url  ? { pdf_url  } : {}),
    ...(pdf_path ? { pdf_path } : {}),
  };

  try {
    if (facturaId) {
      await dbUpdate('facturas', facturaId, row);
      const idx = adminFacturas.findIndex(f => f.id === facturaId);
      if (idx !== -1) adminFacturas[idx] = { ...adminFacturas[idx], ...row, id: facturaId };
    } else {
      const inserted = await dbInsert('facturas', row);
      adminFacturas.unshift(inserted);
    }

    document.getElementById('modal-factura')?.remove();
    renderAdministracion();
    toast(pdfFile ? `Factura de ${nombreCliente} marcada como pagada ✅` : 'Factura guardada');
  } catch(e) {
    console.error('Error guardando factura', e);
    alert('No se pudo guardar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
  }
}

// ────────── Helper escape ──────────

function escapeHtmlAdmin(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ────────── Init al cargar la app ──────────

window.addEventListener('app-ready', () => {
  initAdministracion();
});
