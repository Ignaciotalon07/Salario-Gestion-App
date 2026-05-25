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
}

function goClienteDetail(id) {
  goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes');
  setTimeout(() => {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}
