// salario-sync.js — Datos que manda el sistema Salario (VFP) por cliente
// Los escribe la Edge Function `salario-api` en la tabla `salario_sync`
// (legajos, convenios, empresas). Acá solo se LEEN y se mantienen al día por realtime.
// El detalle del cliente los consume vía _datosSalarioCliente() en cliente-detalle.js.

// Mapa { cliente_id: fila de salario_sync }
window.salarioSync = {};

window.addEventListener('app-ready', () => { initSalarioSync(); });

async function initSalarioSync() {
  try {
    const { data, error } = await sb().from('salario_sync').select('*');
    if (error) throw error;
    window.salarioSync = {};
    (data || []).forEach(r => { window.salarioSync[r.cliente_id] = r; });
  } catch (e) {
    // La tabla puede no existir todavía (falta correr la migración 059)
    console.warn('No se pudieron cargar los datos de Salario', e);
    window.salarioSync = {};
  }
  _salarioSyncRefrescarVista();

  sb().channel('salario-sync-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salario_sync' }, (payload) => {
      const { eventType, new: n, old: o } = payload;
      if (eventType === 'DELETE') {
        // Con REPLICA IDENTITY por defecto "old" trae solo el id: se busca por id
        const k = Object.keys(window.salarioSync).find(c => window.salarioSync[c].id === (o && o.id));
        if (k) delete window.salarioSync[k];
      } else if (n) {
        window.salarioSync[n.cliente_id] = n;
      }
      _salarioSyncRefrescarVista();
    }).subscribe();
}

// Si el detalle de un cliente está abierto, se redibuja para mostrar el dato nuevo
function _salarioSyncRefrescarVista() {
  const page = document.getElementById('cliente-detalle');
  if (page && page.classList.contains('active') && typeof _detalleClienteId !== 'undefined' && _detalleClienteId
      && typeof renderDetalleCliente === 'function') {
    renderDetalleCliente(_detalleClienteId);
  }
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
