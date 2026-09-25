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
  // Marcar repositorio como visto al entrar
  if (id === 'repositorio' && typeof marcarRepositorioVisto === 'function') {
    marcarRepositorioVisto();
  }
  // Refrescar el saludo + "Tu día" cada vez que se entra al Panel general
  if (id === 'dashboard' && typeof renderSaludoPanel === 'function') {
    renderSaludoPanel();
  }
  // Refrescar selectores (clientes, años) cada vez que se entra a Reportes
  if (id === 'reportes' && typeof initReportesFiltros === 'function') {
    initReportesFiltros();
  }
  // Forzar resize de charts de equipo al navegar (se inicializan con display:none)
  if (id === 'equipo') {
    setTimeout(() => {
      if (typeof chartEquipoInstance !== 'undefined' && chartEquipoInstance) chartEquipoInstance.resize();
    }, 30);
  }
}

// goClienteDetail es re-definida por cliente-detalle.js para navegar a la vista de historial.
// Esta es solo la versión de fallback por si el módulo no cargó.
function goClienteDetail(id) {
  goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes');
}

// ── Navegación mobile (bottom nav) ──
// Mismos side-effects que goTo() (desktop) para que las secciones se
// comporten igual sin importar si se entra desde el sidebar o desde el
// bottom nav / hoja "Más" de mobile.
function mobileGoTo(pageId, btn) {
  // Navegar a la página
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
  window.scrollTo(0, 0);

  // Marcar el item activo en el bottom nav (si la página tiene ícono propio
  // ahí; las que solo viven en la hoja "Más" navegan con btn = null)
  document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (pageId === 'consultas-page' && typeof refreshConsultasPage === 'function') refreshConsultasPage();
  if (pageId === 'repositorio' && typeof marcarRepositorioVisto === 'function') marcarRepositorioVisto();
  if (pageId === 'dashboard' && typeof renderSaludoPanel === 'function') renderSaludoPanel();
  if (pageId === 'reportes' && typeof initReportesFiltros === 'function') initReportesFiltros();
  if (pageId === 'equipo') {
    setTimeout(() => {
      if (typeof chartEquipoInstance !== 'undefined' && chartEquipoInstance) chartEquipoInstance.resize();
    }, 30);
  }
}

// Abre/cierra la hoja "Más" del bottom nav (desliza desde abajo, con backdrop).
function toggleMobileMore() {
  const menu = document.getElementById('mobile-more-menu');
  const backdrop = document.getElementById('mobile-more-backdrop');
  if (!menu || !backdrop) return;

  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    menu.classList.remove('show');
    backdrop.classList.remove('show');
    setTimeout(() => {
      menu.classList.remove('open');
      backdrop.classList.remove('open');
    }, 250);
    return;
  }

  menu.classList.add('open');
  backdrop.classList.add('open');
  // Forzamos un frame antes de agregar "show" para que la transición
  // (translateY / opacity) realmente corra en vez de aparecer de golpe.
  requestAnimationFrame(() => {
    menu.classList.add('show');
    backdrop.classList.add('show');
  });
}

// ── Indicadores de la hoja "Más": puntitos en Repositorio/Alertas y el
// numerito en el ícono "Más" del bottom nav — se sincronizan solos
// observando los badges que ya mantiene el sidebar de escritorio
// (alert-nav-badge, repo-nav-badge), sin duplicar ninguna lógica de conteo.
function _mobileSyncMasIndicadores() {
  const alertBadge = document.getElementById('alert-nav-badge');
  const repoBadge  = document.getElementById('repo-nav-badge');
  const alertCount = alertBadge ? (parseInt(alertBadge.textContent, 10) || 0) : 0;
  const repoCount  = (repoBadge && repoBadge.style.display !== 'none') ? (parseInt(repoBadge.textContent, 10) || 0) : 0;

  const alertDot = document.getElementById('mobile-alertas-dot');
  if (alertDot) alertDot.style.display = alertCount > 0 ? 'block' : 'none';
  const repoDot = document.getElementById('mobile-repo-dot');
  if (repoDot) repoDot.style.display = repoCount > 0 ? 'block' : 'none';

  const masBadge = document.getElementById('mobile-mas-badge');
  const total = alertCount + repoCount;
  if (masBadge) {
    masBadge.textContent = total;
    masBadge.style.display = total > 0 ? 'block' : 'none';
  }
}

function _mobileInitMasObservers() {
  const alertBadge = document.getElementById('alert-nav-badge');
  const repoBadge  = document.getElementById('repo-nav-badge');
  const obs = new MutationObserver(_mobileSyncMasIndicadores);
  if (alertBadge) obs.observe(alertBadge, { childList: true, characterData: true, subtree: true });
  if (repoBadge)  obs.observe(repoBadge, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  _mobileSyncMasIndicadores();
}

window.addEventListener('app-ready', () => setTimeout(_mobileInitMasObservers, 1200));

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
