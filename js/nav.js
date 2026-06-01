// ════════════════════════════════════
// NAVEGACIÓN
// Switch entre páginas (sidebar) + scroll a fichas individuales.
// ════════════════════════════════════

function goTo(btn, id) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  // Re-inicializar el selector de tipo de consulta cada vez que se abre la página
  if (id === 'registrar' && typeof initTipoConsulta === 'function') {
    initTipoConsulta();
    if (typeof onTipoConsultaChange === 'function') onTipoConsultaChange();
  }
}

// goClienteDetail es re-definida por cliente-detalle.js para navegar a la vista de historial.
// Esta es solo la versión de fallback por si el módulo no cargó.
function goClienteDetail(id) {
  goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes');
}
