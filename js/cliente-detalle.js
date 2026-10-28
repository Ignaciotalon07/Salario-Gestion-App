// ════════════════════════════════════
// DETALLE DE CLIENTE
// Vista con historial de consultas, stats y mini chart para un cliente específico.
// Se accede desde la card del cliente (botón "Ver historial").
// ════════════════════════════════════

// ID del cliente actualmente en vista de detalle
let _detalleClienteId = null;

// Instancia del mini chart (para destruir antes de recrear)
let _detalleChartInstance = null;
let _detalleOrigen = 'clientes'; // página desde la que se navegó al detalle

// Filtros activos en la tabla de historial
let _detalleMesFiltro    = null;
let _detalleTipoFiltro   = null;
let _detalleLiqFiltro    = null; // clave normalizada del liquidador, o '__sin__' para consultas sin nombre
let _detalleHistorialLimit = 5; // cuántas consultas mostrar inicialmente

// ────────── Entrada principal ──────────

function goClienteDetail(clienteId) {
  _detalleClienteId      = clienteId;
  _detalleMesFiltro      = null;
  _detalleTipoFiltro     = null;
  _detalleLiqFiltro      = null;
  _detalleHistorialLimit = 5;

  // Guardar la página actual antes de navegar
  const paginaActiva = document.querySelector('.page.active');
  _detalleOrigen = paginaActiva ? paginaActiva.id : 'clientes';

  // Navegar a la página de detalle (sin marcar ningún nav-item activo)
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('cliente-detalle').classList.add('active');
  window.scrollTo(0, 0);

  renderDetalleCliente(clienteId);
}

// ────────── Render principal ──────────

function renderDetalleCliente(clienteId) {
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.id === clienteId)
    : null;

  if (!cliente) {
    document.getElementById('cliente-detalle').innerHTML =
      '<div class="card" style="text-align:center;padding:40px;color:var(--text3)">Cliente no encontrado.</div>';
    return;
  }

  // Excluir entradas temporales (_temp_) que aún no fueron confirmadas por realtime
  const consultasDelCliente = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === cliente.nombre && !String(c.id).startsWith('_temp_'))
    : [];

  // Armar el HTML de la página
  const page = document.getElementById('cliente-detalle');
  page.innerHTML = `
    ${_renderDetalleHeader(cliente, consultasDelCliente)}
    ${_renderDetalleStats(cliente, consultasDelCliente)}
    ${_renderDetalleTipoStats(consultasDelCliente)}
    ${_renderDetalleMiniChart(cliente, consultasDelCliente)}
    ${_renderDetalleFiltroYTabla(cliente, consultasDelCliente)}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid var(--border);text-align:right">
      <button class="btn" style="background:#9b2215;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;cursor:pointer"
        onclick="eliminarCliente('${cliente.id}')">
        🗑 Eliminar cliente
      </button>
    </div>
  `;

  // Inicializar el mini chart después de que el DOM existe
  _initDetalleMiniChart(consultasDelCliente);
}

// ────────── Header ──────────

// Clave para comparar nombres sin distinguir mayúsculas, tildes ni espacios de más
function _liqKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Liquidadores del cliente: personas que consultaron según el campo "¿Quién consultó?"
// de las consultas registradas. Se agrupan sin distinguir mayúsculas/tildes y se ordenan
// de más a menos frecuentes, así se actualiza solo a medida que se cargan registros.
function _liquidadoresDelCliente(consultasDelCliente) {
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const grupos = {};
  (consultasDelCliente || []).forEach(c => {
    const n = String(c.contacto || '').replace(/\s+/g, ' ').trim();
    if (!n) return;
    const k = norm(n);
    if (!grupos[k]) grupos[k] = { cant: 0, variantes: {} };
    grupos[k].cant++;
    grupos[k].variantes[n] = (grupos[k].variantes[n] || 0) + 1;
  });
  return Object.values(grupos)
    .sort((a, b) => b.cant - a.cant)
    .map(g => Object.entries(g.variantes).sort((a, b) => b[1] - a[1])[0][0]);
}

function _renderDetalleHeader(cliente, consultasDelCliente) {
  const liquidadores = _liquidadoresDelCliente(consultasDelCliente);
  const liqLabel = liquidadores.length > 1 ? 'Liquidadores' : 'Liquidador';
  const liqTexto = liquidadores.map(_escHtml).join(', ');
  const iniciales = cliente.nombre.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
  const colores = ['#e8f0fe', '#e6f4ea', '#fef3e2', '#fce8e6', '#f3e8fd'];
  const textColores = ['#1a56db', '#1e7e34', '#b45309', '#c5221f', '#7c3aed'];
  const idx = cliente.nombre.charCodeAt(0) % colores.length;

  const areaBadge = cliente.area === 'impl'
    ? '<span class="badge b-blue">Implementación</span>'
    : '<span class="badge b-green">Soporte</span>';

  const autBadge = {
    baja:  '<span class="badge b-red">Autonomía baja</span>',
    media: '<span class="badge b-amber">Autonomía media</span>',
    alta:  '<span class="badge b-green">Autonomía alta</span>',
  }[cliente.autonomia] || '';

  const scoreClase = cliente.score >= 7 ? 'b-green' : cliente.score >= 4 ? 'b-amber' : 'b-red';
  const scoreBadge = `<span class="badge ${scoreClase}">Score ${cliente.score ?? 0}/10</span>`;

  // Razón social y CUIT
  // Las 3 líneas de abajo (clase "dh-dato") son la versión de mobile; en
  // desktop se ocultan y los mismos datos se muestran en el panel
  // "detalle-datos" de la derecha (ver CSS, media query de escritorio).
  const razonLine = cliente.razon_social
    ? `<div class="dh-dato" style="font-size:12px;color:var(--text3);margin-top:2px">📋 ${_escHtml(cliente.razon_social)}</div>`
    : '';
  const cuitLine = cliente.cuit
    ? `<div class="dh-dato" style="font-size:12px;color:var(--text3);margin-top:1px">CUIT: ${_escHtml(cliente.cuit)}</div>`
    : '';
  const idApiLine = cliente.idApi
    ? `<div class="dh-dato" style="font-size:12px;color:var(--text3);margin-top:1px"><strong style="color:var(--text2)">ID CLIENTE: ${cliente.idApi}</strong></div>`
    : '';

  // Panel de datos (solo desktop): lista etiqueta/valor, solo con los datos que existan.
  const datosFilas = [
    cliente.razon_social ? ['Razón social', _escHtml(cliente.razon_social)] : null,
    cliente.cuit         ? ['CUIT',         _escHtml(cliente.cuit)]         : null,
    cliente.idApi        ? ['ID cliente',   _escHtml(String(cliente.idApi))] : null,
    ['Tipo',             _escHtml(cliente.tipo || 'empresa')],
    liquidadores.length ? [liqLabel, liqTexto] : null,
  ].filter(Boolean);
  const datosPanel = `
    <div class="detalle-datos">
      ${datosFilas.map(([k, v]) => `
        <div class="detalle-datos__item${k === liqLabel ? ' detalle-datos__item--liq' : ''}">
          <div class="detalle-datos__k">${k}</div>
          <div class="detalle-datos__v">${v}</div>
        </div>`).join('')}
      __VIVO__
    </div>`;

  // Bloque "En vivo desde Salario" (solo desktop): legajos, convenios y, si es
  // estudio contable, empresas. Hoy no hay datos (—); cuando se conecte la API
  // solo hay que completar _datosSalarioCliente() y la UI se actualiza sola.
  const vivo = _datosSalarioCliente(cliente);
  const cantTxt = n => (n === null || n === undefined) ? '—' : n;
  const vivoTarjeta = (icono, label, valor, onclick) => `
    <${onclick ? 'button' : 'div'} class="detalle-vivo__item${onclick ? ' detalle-vivo__item--btn' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
      <div class="detalle-vivo__k"><span class="detalle-vivo__ico">${icono}</span> <span class="detalle-vivo__lbl">${label}</span></div>
      <div class="detalle-vivo__v">${valor}</div>
      ${onclick ? '<div class="detalle-vivo__ver">Ver detalle →</div>' : ''}
    </${onclick ? 'button' : 'div'}>`;
  const vivoPanel = `
    <div class="detalle-vivo">
      ${vivoTarjeta('👥', 'Legajos', cantTxt(vivo.legajos) + (vivo.bases.length > 1 ? `<small style="display:block;font-size:11px;font-weight:600;color:var(--text3);margin-top:2px">${vivo.bases.map(b => _escHtml(b.nombre) + ': ' + (b.legajos ?? '—')).join(' · ')}</small>` : ''))}
      ${typeof renderTarjetaConexiones === 'function' ? renderTarjetaConexiones(cliente.id) : ''}
      ${vivoTarjeta('📑', 'Convenios', cantTxt(vivo.convenios ? vivo.convenios.length : null), `abrirSalarioModal('convenios','${_escHtml(cliente.id)}')`)}
      ${vivoTarjeta('🏢', 'Empresas', cantTxt(vivo.empresas ? vivo.empresas.length : null), `abrirSalarioModal('empresas','${_escHtml(cliente.id)}')`)}
    </div>`;

  const btnWhaticket = cliente.whaticket_url ? `
      <a href="${_escHtml(cliente.whaticket_url)}" target="_blank" class="btn-sm">
        💬 Whaticket
      </a>` : `
      <button type="button" class="btn-sm btn-wa-off" onclick="vincularWhaticket('${_escHtml(cliente.id)}')"
        title="Sin URL de Whaticket. Click para agregarla">
        💬 Whaticket
      </button>`;
  // Mobile: botón Conexiones + Whaticket. Desktop: Conexiones va en el bloque
  // destacado, así que arriba a la derecha queda solo Whaticket.
  const botonesAcciones = `
    ${typeof renderBtnConexiones === 'function' ? renderBtnConexiones(cliente.id) : ''}
    ${btnWhaticket}`;

  return `
    <div class="detalle-header">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:14px">
        <button class="btn-secondary detalle-back" onclick="volverAClientes()">← Volver</button>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end">
          ${_chipSalarioActualizado(vivo, cliente)}
          <button class="btn-primary" onclick="irARegistrarConsulta('${_escHtml(cliente.nombre)}')">+ Consulta</button>
        </div>
      </div>
      <div class="detalle-header__body" style="width:100%;--cli-color:${textColores[idx]}">
        <div class="av-lg" style="background:${colores[idx]};color:${textColores[idx]};border-radius:14px;width:52px;height:52px;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${_escHtml(iniciales)}
        </div>
        <div class="detalle-header__info">
          <div class="detalle-header__nombre">${_escHtml(cliente.nombre)}</div>
          ${razonLine}
          ${cuitLine}
          ${idApiLine}
          ${liquidadores.length ? `<div class="dh-dato" style="font-size:12px;color:var(--text3);margin-top:1px">👤 ${liqLabel}: <strong style="color:var(--text2)">${liqTexto}</strong></div>` : ''}
          <div class="detalle-header__badges" style="margin-top:8px">
            ${areaBadge}
            ${autBadge}
            ${scoreBadge}
            <span class="badge" style="background:var(--surface2);color:var(--text2)">${_escHtml(cliente.tipo || 'empresa')}</span>
          </div>
        </div>
        <div class="dh-acciones-mobile" style="margin-left:auto;flex-shrink:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${botonesAcciones}
        </div>
        ${datosPanel.replace('__VIVO__', vivoPanel + (btnWhaticket ? `<div class="detalle-datos__wa">${btnWhaticket}</div>` : ''))}
        <div class="detalle-acciones-fila">
          ${btnWhaticket}
        </div>
      </div>
    </div>
  `;
}

// Indicador arriba a la derecha: cuándo llegaron por última vez datos de Salario para este cliente.
// Verde: hoy o ayer · Ámbar: 2 días · Rojo: 3 días o más · Gris: nunca llegó nada.
// El tooltip muestra la fecha y hora exacta de cada base.
function _chipSalarioActualizado(vivo, cliente) {
  const hace = typeof salarioHaceTiempo === 'function' ? salarioHaceTiempo : () => '';
  const dias = typeof salarioDiasSinDatos === 'function' ? salarioDiasSinDatos(vivo.actualizado) : null;
  let cls = 'sin', txt = 'Datos de Salario: todavía no llegaron';
  let tip = 'Salario aún no envió datos de este cliente.';
  if (vivo.actualizado) {
    cls = dias >= 3 ? 'rojo' : dias === 2 ? 'ambar' : 'verde';
    const fh = typeof salarioFechaHora === 'function' ? salarioFechaHora(vivo.actualizado) : '';
    txt = `Datos de Salario actualizados ${hace(vivo.actualizado)}` + (dias >= 1 ? ` (${fh})` : '');
    tip = 'Última actualización: ' + fh + (vivo.bases.length > 1
      ? '\n' + vivo.bases.map(b => `${b.nombre}: ${typeof salarioFechaHora === 'function' ? salarioFechaHora(b.actualizado) : ''}`).join('\n') : '');
  }
  // Cliente sin id_api: Salario no puede enviarle nada, hay que cargárselo
  if (!vivo.actualizado && cliente && !cliente.idApi) {
    cls = 'rojo'; txt = 'Sin ID de Salario';
    tip = 'Este cliente no tiene id_api cargado, por eso Salario no puede enviarle datos.';
  }
  return `<span class="salario-chip salario-chip--${cls}" title="${_escHtml(tip)}"><i></i>${_escHtml(txt)}</span>`;
}

// ────────── Datos en vivo de Salario (API, pendiente) ──────────

// Punto único de conexión con la API de Salario. Devuelve null en cada campo
// mientras no haya datos. Cuando la API esté lista, completar acá:
//   legajos:   número
//   convenios: [{ nombre, ... }]
//   empresas:  [{ nombre, cuit, ... }]  (todos los clientes)
// Los datos vienen de la tabla `salario_sync` (js/salario-sync.js). Si Salario todavía
// no mandó nada para este cliente, quedan en null y la UI muestra "—".
function _datosSalarioCliente(cliente) {
  const filas = (window.salarioSync || {})[cliente.id] || [];
  if (!filas.length) return { legajos: null, convenios: null, empresas: null, actualizado: null, bases: [] };
  const nom = f => (f.base && f.base !== 'principal') ? f.base : 'Principal';
  const bases = filas.map(f => ({
    nombre: nom(f),
    legajos: f.legajos != null ? f.legajos : null,
    convenios: Array.isArray(f.convenios) ? f.convenios : null,
    empresas: Array.isArray(f.empresas) ? f.empresas : null,
    actualizado: f.updated_at,
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  // Totales: legajos sumados; convenios sin repetir; empresas juntas (sin repetir por CUIT/nombre)
  const conLeg = bases.filter(b => b.legajos !== null);
  const conv = [], vistosC = new Set();
  bases.forEach(b => (b.convenios || []).forEach(x => {
    const t = (typeof x === 'string' ? x : (x.nombre || '')).trim(); const k = t.toLowerCase();
    if (t && !vistosC.has(k)) { vistosC.add(k); conv.push(x); }
  }));
  const emp = [], vistosE = new Set();
  bases.forEach(b => (b.empresas || []).forEach(x => {
    const k = ((x && x.cuit) || '') + '|' + ((x && (x.nombre || x.razon_social)) || x || '').toString().toLowerCase();
    if (!vistosE.has(k)) { vistosE.add(k); emp.push(x); }
  }));
  return {
    legajos:     conLeg.length ? conLeg.reduce((s, b) => s + b.legajos, 0) : null,
    convenios:   bases.some(b => b.convenios) ? conv : null,
    empresas:    bases.some(b => b.empresas)  ? emp  : null,
    actualizado: bases.map(b => b.actualizado).filter(Boolean).sort().pop() || null,
    bases,
  };
}

// Modal de convenios / empresas
function abrirSalarioModal(tipo, clienteId) {
  const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => String(x.id) === String(clienteId));
  if (!c) return;
  const vivo = _datosSalarioCliente(c);
  const esConv = tipo === 'convenios';
  const lista = esConv ? vivo.convenios : vivo.empresas;
  document.getElementById('salario-modal-titulo').textContent =
    `${esConv ? '📑 Convenios' : '🏢 Empresas'} — ${c.nombre}`;
  const itemTxt = it => typeof it === 'string' ? it : (it.nombre || it.razon_social || '—');
  const itemSub = it => (typeof it === 'object' && it.cuit) ? `<span style="color:var(--text3);font-size:12px">CUIT ${_escHtml(it.cuit)}</span>` : '';
  document.getElementById('salario-modal-body').innerHTML = lista === null || lista === undefined
    ? `<div style="text-align:center;padding:28px 10px;color:var(--text3);font-size:14px">Sin datos todavía.<br>Salario aún no envió ${esConv ? 'los convenios' : 'las empresas'} de este cliente.</div>`
    : `<div class="detalle-vivo__tag" style="margin-bottom:12px"><span class="detalle-vivo__dot"></span>${lista.length} ${esConv ? 'convenio(s)' : 'empresa(s)'}${vivo.bases.length > 1 ? ` · ${vivo.bases.length} bases` : ''}${vivo.actualizado && typeof salarioHaceTiempo === 'function' ? ` · actualizado ${salarioHaceTiempo(vivo.actualizado)}` : ''}</div>
       ${(() => {
         const fila = it => `
         <div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--border);font-size:14px">
           <span>${_escHtml(itemTxt(it))}</span>${itemSub(it)}
         </div>`;
         if (vivo.bases.length > 1) {
           // Varias bases: se agrupa por base para ver de dónde viene cada dato
           return vivo.bases.map(b => {
             const l = (esConv ? b.convenios : b.empresas) || [];
             return `<div style="margin-top:14px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#f97316">${_escHtml(b.nombre)} <span style="color:var(--text3);font-weight:600">(${l.length})</span></div>`
               + (l.length ? l.map(fila).join('') : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos en esta base.</div>');
           }).join('');
         }
         return lista.length ? lista.map(fila).join('') : '<div style="color:var(--text3);font-size:14px">No hay registros.</div>';
       })()}`;
  document.getElementById('salario-overlay').classList.add('kb-modal--open');
}
function cerrarSalarioModal() {
  document.getElementById('salario-overlay').classList.remove('kb-modal--open');
}

// ────────── Stats ──────────

function _renderDetalleStats(cliente, consultasDelCliente) {
  const ahora      = new Date();
  const mesActual  = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const total     = consultasDelCliente.length;
  const esMes     = consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });
  const repetidas = consultasDelCliente.filter(c => c.repetida === 'si').length;
  const pctRep    = total > 0 ? Math.round((repetidas / total) * 100) : 0;

  // Top categoría
  const catCount = {};
  consultasDelCliente.forEach(c => { if (c.categoria) catCount[c.categoria] = (catCount[c.categoria] || 0) + 1; });
  const topCat   = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
  const CATS_LABELS = {
    liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración',
    actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema'
  };
  const topCatLabel = topCat ? (CATS_LABELS[topCat[0]] || topCat[0]) : '—';

  // Horas consumidas
  const fmtHs = h => h % 1 === 0 ? h + ' hs' : h.toFixed(1) + ' hs';
  const hsMes   = esMes.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0);
  const hsTotal = consultasDelCliente.reduce((s, c) => s + (parseFloat(c.tiempo) || 0), 0);
  const hsMesTexto   = hsMes   > 0 ? fmtHs(hsMes)   : '—';
  const hsTotalTexto = hsTotal > 0 ? fmtHs(hsTotal)  : '—';
  const hsMesColor   = hsMes >= 5 ? 'var(--red)' : hsMes >= 2 ? 'var(--amber)' : 'var(--accent)';

  // Nombre del mes actual
  const nombreMes = ahora.toLocaleString('es-AR', { month: 'long' });

  return `
    <div class="detalle-stats">
      <div class="detalle-stat">
        <div class="detalle-stat__val">${total}</div>
        <div class="detalle-stat__label">Consultas históricas</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val">${esMes.length}</div>
        <div class="detalle-stat__label">En ${nombreMes}</div>
      </div>
      <div class="detalle-stat" style="${pctRep > 30 ? 'color:var(--red)' : ''}">
        <div class="detalle-stat__val">${pctRep}%</div>
        <div class="detalle-stat__label">% repetidas</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val" style="color:${hsMesColor};font-size:22px">${hsMesTexto}</div>
        <div class="detalle-stat__label">hs este mes</div>
      </div>
      <div class="detalle-stat">
        <div class="detalle-stat__val" style="font-size:22px">${hsTotalTexto}</div>
        <div class="detalle-stat__label">hs total histórico</div>
      </div>
    </div>
  `;
}

// ────────── Panel de tipos de consulta ──────────

function _renderDetalleTipoStats(consultasDelCliente) {
  const soporte        = consultasDelCliente.filter(c => !c.tipoConsulta || c.tipoConsulta === 'soporte').length;
  const programacion   = consultasDelCliente.filter(c => c.tipoConsulta === 'programacion').length;
  const implementacion = consultasDelCliente.filter(c => c.tipoConsulta === 'implementacion').length;

  const item = (tipo, emoji, label, count, color) => `
    <div onclick="filtrarDetalleTipo('${tipo}')" title="Filtrar por ${label}"
      style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;
             cursor:pointer;border-radius:8px;transition:background .15s;min-width:0"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-size:22px;font-weight:700;color:${color}">${count}</div>
      <div class="detalle-tipo-label">
        ${emoji}
        <span class="detalle-tipo-label__full">${label}</span>
        <span class="detalle-tipo-label__short">${label.length > 10 ? label.substring(0, 7) + '.' : label}</span>
      </div>
    </div>`;

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="padding:10px 20px 6px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">
        Consultas por tipo
      </div>
      <div style="display:flex;gap:0">
        ${item('soporte',        '🎧', 'Soporte',         soporte,        'var(--accent)')}
        <div style="width:1px;background:var(--border);margin:8px 0"></div>
        ${item('programacion',   '🐛', 'Programación',    programacion,   'var(--red)')}
        <div style="width:1px;background:var(--border);margin:8px 0"></div>
        ${item('implementacion', '🚀', 'Implementación',  implementacion, 'var(--purple,#a78bfa)')}
      </div>
    </div>
  `;
}

// ────────── Mini Chart ──────────

function _renderDetalleMiniChart(cliente, consultasDelCliente) {
  return `
    <div class="card" style="padding: 20px 24px 16px">
      <div class="card-title" style="margin-bottom:12px">Consultas por mes — últimos 6 meses</div>
      <div style="position:relative;height:160px">
        <canvas id="detalle-chart" role="img" aria-label="Consultas del cliente por mes"></canvas>
      </div>
    </div>
  `;
}

function _initDetalleMiniChart(consultasDelCliente) {
  const canvas = document.getElementById('detalle-chart');
  if (!canvas) return;

  // Destruir instancia previa si existe
  if (_detalleChartInstance) {
    _detalleChartInstance.destroy();
    _detalleChartInstance = null;
  }

  // Armar datos de los últimos 6 meses
  const ahora = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleString('es-AR', { month: 'short' }) });
  }

  const totales   = meses.map(m => consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio;
  }).length);

  const repetidas = meses.map(m => consultasDelCliente.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === m.mes && d.getFullYear() === m.anio && c.repetida === 'si';
  }).length);

  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  _detalleChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [
        {
          label: 'Total',
          data: totales,
          backgroundColor: 'rgba(99,102,241,0.75)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Repetidas',
          data: repetidas,
          backgroundColor: 'rgba(239,68,68,0.65)',
          borderRadius: 5,
          borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: textColor, font: { size: 11 }, boxWidth: 10, padding: 12 } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

// ────────── Filtro + Tabla ──────────

function _renderDetalleFiltroYTabla(cliente, consultasDelCliente) {
  // Armar opciones del filtro: todos los meses que tienen al menos 1 consulta
  const mesesConDatos = {};
  consultasDelCliente.forEach(c => {
    const d   = new Date(c.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!mesesConDatos[key]) {
      mesesConDatos[key] = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
    }
  });

  const opcionesMeses = Object.entries(mesesConDatos)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join('');

  const filas = _buildFilasTabla(cliente, consultasDelCliente, _detalleMesFiltro, _detalleTipoFiltro);

  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 16px 12px;border-bottom:1px solid var(--border)">
        <div class="card-title" style="margin:0 0 10px">Historial de consultas</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="detalle-tipo-filtro" style="margin-bottom:0;font-size:11px;padding:4px 8px;height:28px;border-radius:6px" onchange="filtrarDetalleTipo(this.value)">
            <option value="">Todos los tipos</option>
            <option value="soporte">🎧 Soporte</option>
            <option value="programacion">🐛 Programación</option>
            <option value="implementacion">🚀 Implementación</option>
          </select>
          <select id="detalle-mes-filtro" style="margin-bottom:0;font-size:11px;padding:4px 8px;height:28px;border-radius:6px" onchange="filtrarDetalleMes(this.value)">
            <option value="">Todos los meses</option>
            ${opcionesMeses}
          </select>
          ${_selectLiquidadoresHtml(consultasDelCliente)}
        </div>
      </div>
      <div id="detalle-tabla-body" style="padding:8px 0">
        ${filas}
      </div>
    </div>
  `;
}

// Desplegable "Todos los liquidadores" (solo si hay al menos un nombre cargado)
function _selectLiquidadoresHtml(consultasDelCliente) {
  const nombres = _liquidadoresDelCliente(consultasDelCliente);
  if (!nombres.length) return '';
  const cant = {};
  let sinDato = 0;
  consultasDelCliente.forEach(c => {
    if (!c.contacto) { sinDato++; return; }
    const k = _liqKey(c.contacto);
    cant[k] = (cant[k] || 0) + 1;
  });
  const sel = v => (_detalleLiqFiltro === v ? ' selected' : '');
  const opts = nombres.map(n => {
    const k = _liqKey(n);
    return `<option value="${_escHtml(k)}"${sel(k)}>👤 ${_escHtml(n)} (${cant[k] || 0})</option>`;
  }).join('');
  return `
          <select id="detalle-liq-filtro" style="margin-bottom:0;font-size:11px;padding:4px 8px;height:28px;border-radius:6px" onchange="filtrarDetalleLiq(this.value)">
            <option value="">Todos los liquidadores</option>
            ${opts}
            ${sinDato ? `<option value="__sin__"${sel('__sin__')}>Sin dato (${sinDato})</option>` : ''}
          </select>`;
}

function _buildFilasTabla(cliente, consultasDelCliente, mesFiltro, tipoFiltro) {
  const CATS_LABELS = {
    liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración',
    actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema'
  };
  const TIPO_BADGES = {
    soporte:              '<span class="badge b-blue"   style="font-size:10px">🎧 Soporte</span>',
    programacion:         '<span class="badge b-red"    style="font-size:10px">🐛 Program.</span>',
    comercial:            '<span class="badge b-green"  style="font-size:10px">💼 Comercial</span>',
    programacion_interna: '<span class="badge b-amber"  style="font-size:10px">💻 Program.</span>',
    implementacion:       '<span class="badge b-purple" style="font-size:10px">🚀 Implem.</span>',
  };

  let lista = consultasDelCliente;

  if (mesFiltro) {
    const [anioF, mesF] = mesFiltro.split('-').map(Number);
    lista = lista.filter(c => {
      const d = new Date(c.timestamp);
      return d.getFullYear() === anioF && d.getMonth() + 1 === mesF;
    });
  }

  if (tipoFiltro) {
    lista = lista.filter(c => (c.tipoConsulta || 'soporte') === tipoFiltro);
  }

  if (_detalleLiqFiltro) {
    lista = lista.filter(c => _detalleLiqFiltro === '__sin__' ? !c.contacto : _liqKey(c.contacto) === _detalleLiqFiltro);
  }

  // Ordenar de más reciente a más antigua
  lista = [...lista].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (lista.length === 0) {
    return `<div style="text-align:center;color:var(--text3);padding:28px;font-size:13px">
      Sin consultas para los filtros seleccionados.
    </div>`;
  }

  const total    = lista.length;
  const visible  = lista.slice(0, _detalleHistorialLimit);
  const restante = total - visible.length;

  return visible.map((c, i) => {
    const fecha = new Date(c.timestamp).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });
    const cat       = CATS_LABELS[c.categoria] || (c.categoria || '—');
    const subtema   = c.subtema || '—';
    const asesor    = c.asesor  || '—';
    const esRepetida = c.repetida === 'si';
    const tipoBadge = TIPO_BADGES[c.tipoConsulta || 'soporte'] || TIPO_BADGES.soporte;
    const desc      = c.descripcion ? c.descripcion.substring(0, 60) + (c.descripcion.length > 60 ? '…' : '') : '—';

    // Datos para el modal (JSON escapado)
    // Buscar texto de la solución en el array global 'soluciones'
    const solObj = c.solucionId && typeof soluciones !== 'undefined'
      ? soluciones.find(s => s.id === c.solucionId)
      : null;
    const solucionTitulo = solObj ? solObj.titulo : null;
    const solucionPasos  = solObj && Array.isArray(solObj.pasos) ? solObj.pasos : [];

    const modalData = _escHtml(JSON.stringify({
      id: c.id,
      fecha, cat, subtema, asesor, repetida: c.repetida,
      contacto: c.contacto || '',
      descripcion: c.descripcion || '',
      solucionTitulo,
      solucionPasos,
      solucionId: c.solucionId || null,
      tiempo: c.tiempo ?? null,
      tipo: c.tipoConsulta || 'soporte'
    }));

    return `
      <button onclick="abrirDetalleConsulta(this)" data-consulta="${modalData}"
        style="display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--border);padding:12px 16px;cursor:pointer;font-family:inherit;transition:background 0.1s"
        onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='none'">
        <div style="flex-shrink:0;margin-top:2px">
          ${tipoBadge}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(cat)} · ${_escHtml(subtema)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.contacto ? '👤 ' + _escHtml(c.contacto) + ' · ' : ''}${_escHtml(desc)}</div>
        </div>
        <div style="flex-shrink:0;text-align:right">
          <div style="font-size:11px;color:var(--text3)">${fecha}</div>
          ${esRepetida ? '<span class="badge b-red" style="font-size:9px;margin-top:4px;display:inline-block">Repetida</span>' : ''}
        </div>
      </button>
    `;
  }).join('') + (restante > 0 ? `
    <div style="padding:12px 16px;border-top:1px solid var(--border);text-align:center">
      <button onclick="verMasDetalleHistorial()"
        style="background:none;border:1px solid var(--border2);color:var(--text2);font-size:12px;font-family:inherit;padding:6px 20px;border-radius:8px;cursor:pointer;transition:background .13s"
        onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">
        Ver ${Math.min(restante, 5)} más (${restante} restantes)
      </button>
    </div>` : '');
}

function verMasDetalleHistorial() {
  _detalleHistorialLimit += 5;
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

// ────────── Filtros interactivos ──────────

function _getConsultasDelClienteActual() {
  const cliente = (typeof clientes !== 'undefined')
    ? clientes.find(c => c.id === _detalleClienteId)
    : null;
  if (!cliente) return null;
  const lista = (typeof consultas !== 'undefined')
    ? consultas.filter(c => c.cliente === cliente.nombre)
    : [];
  return { cliente, lista };
}

function filtrarDetalleMes(valor) {
  _detalleMesFiltro      = valor || null;
  _detalleHistorialLimit = 5;
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

function filtrarDetalleLiq(valor) {
  _detalleLiqFiltro      = valor || null;
  _detalleHistorialLimit = 5;
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

function filtrarDetalleTipo(valor) {
  _detalleTipoFiltro     = valor || null;
  _detalleHistorialLimit = 5;
  // Sincronizar el select si se llamó desde el panel de contadores (click en número)
  const sel = document.getElementById('detalle-tipo-filtro');
  if (sel) sel.value = valor || '';
  const res = _getConsultasDelClienteActual();
  if (!res) return;
  const tbody = document.getElementById('detalle-tabla-body');
  if (tbody) tbody.innerHTML = _buildFilasTabla(res.cliente, res.lista, _detalleMesFiltro, _detalleTipoFiltro);
}

// ────────── Modal detalle de consulta ──────────

function abrirDetalleConsulta(btn) {
  try {
    const data = JSON.parse(btn.dataset.consulta);
    const TIPO_LABELS = { soporte: '🎧 Soporte', programacion: '🐛 Programación', comercial: '💼 Comercial', implementacion: '🚀 Implementación' };

    const html = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-blue" style="font-size:11px">${TIPO_LABELS[data.tipo] || data.tipo}</span>
          ${data.repetida === 'si' ? '<span class="badge b-red" style="font-size:11px">Repetida</span>' : '<span class="badge b-green" style="font-size:11px">Nueva</span>'}
          <span style="font-size:12px;color:var(--text3);margin-left:auto">${data.fecha}</span>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Categoría</div>
          <div style="font-size:14px;font-weight:600">${data.cat}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Subtema</div>
          <div style="font-size:14px">${data.subtema}</div>
        </div>
        ${data.descripcion ? `
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Descripción</div>
          <div style="font-size:13px;line-height:1.5;color:var(--text2)">${data.descripcion}</div>
        </div>` : ''}
        <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid var(--border)">
          <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Consultó</div><div style="font-size:13px;font-weight:500">${data.contacto ? _escHtml(data.contacto) : '—'}</div></div>
          <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Asesor</div><div style="font-size:13px;font-weight:500">${data.asesor}</div></div>
          <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Tiempo</div><div style="font-size:13px;font-weight:500">${data.tiempo != null ? data.tiempo + ' hs' : '—'}</div></div>
        </div>
        ${data.solucionTitulo ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Solución aplicada</div>
          ${data.solucionPasos && data.solucionPasos.length > 0 ? `
          <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--text2)">
            ${data.solucionPasos.map(p => `<li>${p}</li>`).join('')}
          </ol>` : ''}
        </div>` : (data.tipo === 'implementacion' ? '' : `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text3)">
          Sin solución registrada en la base.
        </div>`)}
        ${data.solucionId && typeof _renderKbArchivosDetalle === 'function'
          ? _renderKbArchivosDetalle(data.solucionId)
          : ''}
        <div id="dc-archivos-pend"></div>
      </div>`;

    // Reusar el modal de consulta o crear uno temporal
    let modal = document.getElementById('modal-detalle-consulta');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-detalle-consulta';
      modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px';
      modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;max-width:480px;width:100%;padding:22px;box-shadow:0 16px 48px rgba(0,0,0,0.25);max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:15px;font-weight:700">Detalle de consulta</div>
          <button onclick="document.getElementById('modal-detalle-consulta').style.display='none'" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text3)">✕</button>
        </div>
        ${html}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
          <button onclick="eliminarConsultaDesdeModal('${data.id}')"
            style="background:none;border:1px solid var(--danger,#e53e3e);color:var(--danger,#e53e3e);border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;transition:background 0.15s"
            onmouseover="this.style.background='rgba(229,62,62,0.08)'" onmouseout="this.style.background='none'">
            🗑 Eliminar consulta
          </button>
        </div>
      </div>`;
    modal.style.display = 'flex';
    // Archivos que tenía el pendiente que originó esta consulta
    if (typeof pendArchivosMostrarDeConsulta === 'function') pendArchivosMostrarDeConsulta(data.id, 'dc-archivos-pend');
  } catch(e) {
    console.error('Error abriendo detalle consulta', e);
  }
}

// ────────── Eliminar consulta ──────────

async function eliminarConsultaDesdeModal(id) {
  if (!id) return;

  if (!confirm('¿Seguro que querés eliminar esta consulta? Esta acción no se puede deshacer.')) return;

  // Si es un ID temporal (no guardado aún en DB), solo lo quitamos del array
  if (!String(id).startsWith('_temp_')) {
    try {
      await eliminarConsultaDB(id); // borra y descuenta el uso de la solución asociada
    } catch (e) {
      console.error('Error eliminando consulta', e);
      toast('No se pudo eliminar la consulta: ' + (e.message || e));
      return;
    }
  }

  // Quitar del array en memoria
  if (typeof consultas !== 'undefined') {
    consultas = consultas.filter(c => String(c.id) !== String(id));
  }

  // Cerrar modal
  const modal = document.getElementById('modal-detalle-consulta');
  if (modal) modal.style.display = 'none';

  // Refrescar la vista del cliente
  const clienteActual = typeof clientes !== 'undefined'
    ? clientes.find(c => c.id === _detalleClienteId)
    : null;
  if (clienteActual) goClienteDetail(clienteActual.id);

  // Refrescar métricas generales
  if (typeof refreshPanelMetrics === 'function') refreshPanelMetrics();
  if (typeof refreshConsultasPage === 'function') refreshConsultasPage();
  if (typeof renderClientes === 'function') renderClientes();

  toast('Consulta eliminada.');
}

// ────────── Volver ──────────

function volverAClientes() {
  _detalleClienteId  = null;
  _detalleMesFiltro  = null;
  _detalleTipoFiltro = null;
  _detalleLiqFiltro  = null;
  if (_detalleChartInstance) {
    _detalleChartInstance.destroy();
    _detalleChartInstance = null;
  }
  const origen = _detalleOrigen || 'clientes';
  _detalleOrigen = 'clientes'; // reset para la próxima vez

  // Navegar a la página origen
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const paginaDestino = document.getElementById(origen);
  if (paginaDestino) paginaDestino.classList.add('active');

  // Marcar nav item del sidebar si existe
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[onclick*="${origen}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Marcar mobile nav si existe
  document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
  const mobileBtn = document.querySelector(`.mobile-nav-item[onclick*="${origen}"]`);
  if (mobileBtn) mobileBtn.classList.add('active');

  window.scrollTo(0, 0);
}

// ────────── Helper: escape HTML ──────────

function _escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
