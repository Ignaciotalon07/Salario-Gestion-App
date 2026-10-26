// salario-sync.js — Datos que manda el sistema Salario (VFP) por cliente
// Los escribe la Edge Function `salario-api` en la tabla `salario_sync`
// (legajos, convenios, empresas). Acá solo se LEEN y se mantienen al día por realtime.
// El detalle del cliente los consume vía _datosSalarioCliente() en cliente-detalle.js.

// Mapa { cliente_id: [filas de salario_sync] } — una fila por base (un cliente puede tener varias)
window.salarioSync = {};
// Envíos que la API rechazó por no tener un id_api válido (migración 063). Se muestran en Alertas.
window.salarioRechazos = [];

window.addEventListener('app-ready', () => { initSalarioSync(); });

async function initSalarioSync() {
  try {
    const { data, error } = await sb().from('salario_sync').select('*');
    if (error) throw error;
    window.salarioSync = {};
    (data || []).forEach(_salarioSyncPoner);
  } catch (e) {
    // La tabla puede no existir todavía (falta correr la migración 059)
    console.warn('No se pudieron cargar los datos de Salario', e);
    window.salarioSync = {};
  }
  // Envíos rechazados (si falta la migración 063, simplemente no hay alertas de este tipo)
  try {
    const { data: rech, error: errR } = await sb().from('salario_envios_rechazados').select('*').order('ultimo_at', { ascending: false });
    if (errR) throw errR;
    window.salarioRechazos = rech || [];
    sb().channel('salario-rechazos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salario_envios_rechazados' }, (payload) => {
        const { eventType, new: n, old: o } = payload;
        if (eventType === 'DELETE') window.salarioRechazos = window.salarioRechazos.filter(r => r.id !== (o && o.id));
        else if (n) {
          const i = window.salarioRechazos.findIndex(r => r.id === n.id);
          if (i === -1) window.salarioRechazos.unshift(n); else window.salarioRechazos[i] = n;
        }
        if (typeof refreshAlertas === 'function') { try { refreshAlertas(); } catch (e) { /* se recalcula luego */ } }
        if (typeof renderSaludoPanel === 'function') { try { renderSaludoPanel(); } catch (e) { /* se recalcula luego */ } }
      }).subscribe();
  } catch (e) {
    console.warn('No se pudieron cargar los envíos rechazados de Salario (¿falta la migración 063?)', e);
    window.salarioRechazos = [];
  }
  _salarioSyncRefrescarVista();

  sb().channel('salario-sync-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salario_sync' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'DELETE') {
        // Con REPLICA IDENTITY por defecto "old" trae solo el id: se busca por id
        for (const k of Object.keys(window.salarioSync)) {
          window.salarioSync[k] = window.salarioSync[k].filter(f => f.id !== (o && o.id));
          if (!window.salarioSync[k].length) delete window.salarioSync[k];
        }
      } else if (n) {
        _salarioSyncPoner(n);
      }
      _salarioSyncRefrescarVista();
    }).subscribe();
}

// Agrega o reemplaza la fila de una base
function _salarioSyncPoner(r) {
  const l = window.salarioSync[r.cliente_id] || (window.salarioSync[r.cliente_id] = []);
  const i = l.findIndex(f => f.id === r.id);
  if (i === -1) l.push(r); else l[i] = r;
}

// Si el detalle de un cliente está abierto, se redibuja para mostrar el dato nuevo
function _salarioSyncRefrescarVista() {
  if (typeof refreshAlertas === 'function') { try { refreshAlertas(); } catch (e) { /* se recalcula luego */ } }
  const page = document.getElementById('cliente-detalle');
  if (page && page.classList.contains('active') && typeof _detalleClienteId !== 'undefined' && _detalleClienteId
      && typeof renderDetalleCliente === 'function') {
    renderDetalleCliente(_detalleClienteId);
  }
}

// "17/10 14:32" a partir de una fecha ISO (con año si no es el actual)
function salarioFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}${d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : ''} ${hh}:${mi}`;
}

// Días enteros desde la última actualización (null si nunca llegó nada)
function salarioDiasSinDatos(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// "hace 5 min / 2 h / 3 días" a partir de una fecha ISO
function salarioHaceTiempo(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1)  return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d !== 1 ? 's' : ''}`;
}

// Las alertas de la API de Salario (sin datos hace días, envíos rechazados, clientes sin id_api)
// las ve solamente Ignacio, que es quien coordina con el programador.
const SALARIO_API_ADMINS = ['Ignacio Talon', 'Alfredo Cesar'];
function esAdminApiSalario() {
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  return !!me && SALARIO_API_ADMINS.includes(me);
}

// Marca como resuelto un envío rechazado (se borra de la lista de Alertas)
async function salarioRechazoResolver(id) {
  try {
    await dbDelete('salario_envios_rechazados', id);
    window.salarioRechazos = (window.salarioRechazos || []).filter(r => r.id !== id);
    if (typeof refreshAlertas === 'function') refreshAlertas();
    if (typeof toast === 'function') toast('Marcado como resuelto ✓');
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('No se pudo marcar como resuelto.');
  }
}
