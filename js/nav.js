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
  // Refrescar la página de consultas al navegar a ella
  if (id === 'consultas-page' && typeof refreshConsultasPage === 'function') {
    refreshConsultasPage();
  }
}

// goClienteDetail es re-definida por cliente-detalle.js para navegar a la vista de historial.
// Esta es solo la versión de fallback por si el módulo no cargó.
function goClienteDetail(id) {
  goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes');
}

// ── Navegación mobile (bottom nav) ──
function mobileGoTo(pageId, btn) {
  // Navegar a la página
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
  window.scrollTo(0, 0);

  // Marcar el item activo en el bottom nav
  document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// Abre/cierra el menú "Más" del bottom nav
function toggleMobileMore() {
  const menu = document.getElementById('mobile-more-menu');
  if (!menu) return;
  const visible = menu.style.display !== 'none';
  menu.style.display = visible ? 'none' : 'block';
  // Cerrar al tocar fuera — delay generoso para que el tap actual no lo dispare
  if (!visible) {
    setTimeout(() => {
      function closeMobileMore(e) {
        const btn = document.querySelector('.mobile-nav-item:last-child');
        if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMobileMore);
          document.removeEventListener('touchend', closeMobileMore);
        }
      }
      document.addEventListener('click', closeMobileMore);
      document.addEventListener('touchend', closeMobileMore);
    }, 300);
  }
}

// Sincronizar badge de pendientes en el bottom nav
function syncMobilePendBadge() {
  const badge = document.getElementById('mobile-pend-badge');
  if (!badge) return;
  const count = (typeof pendientes !== 'undefined')
    ? pendientes.filter(p => {
        const me = typeof getCurrentUserName === 'function' ? getCurrentUserName() : null;
        return me && p.asesor === me;
      }).length
    : 0;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'block' : 'none';
}
