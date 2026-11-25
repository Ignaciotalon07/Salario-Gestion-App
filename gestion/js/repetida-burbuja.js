// ═══════════════════════════════════════════════════════════════
// Globito "Ya consultó algo parecido": cuando la consulta que se registra es
// repetida, muestra la consulta anterior para que el asesor la vea sin salir del formulario.
//  - Solo aparece cuando el sistema detectó la repetida (desde "Por registrar", window._repConsultaId).
//  - Si el asesor elige "Sí" a mano, o la consulta es nueva, no se muestra nada.
// ═══════════════════════════════════════════════════════════════

const _repNorm = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Solo la consulta que el sistema detectó como repetida (viene de "Por registrar"); nunca se busca a mano
function _repBuscarPrevia() {
  if (!window._repConsultaId) return null;
  const lista = (typeof consultas !== 'undefined' && Array.isArray(consultas)) ? consultas : [];
  return lista.find(x => String(x.id) === String(window._repConsultaId)) || null;
}

function repBurbujaActualizar() {
  const box = document.getElementById('r-rep-burbuja');
  if (!box) return;
  const rep = (document.getElementById('r-rep') || {}).value;
  const c = rep === 'si' ? _repBuscarPrevia() : null;
  if (!c) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const fecha = new Date(c.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const CATS = { liquidacion: 'Liquidación', errores: 'Errores', configuracion: 'Configuración', actualizaciones: 'Actualizaciones', fuera: 'Fuera del sistema' };
  const tema = [CATS[c.categoria] || c.categoria, c.subtema].filter(Boolean).join(' · ');
  const desc = (c.descripcion || '').trim();
  box.style.display = '';
  box.innerHTML = `
    <div class="rep-bur">
      <div class="rep-bur__h"><span>💡 Ya consultó algo parecido</span><b>${fecha}</b></div>
      ${tema ? `<div class="rep-bur__t">${_escHtml(tema)}${c.asesor ? ` · atendió ${_escHtml(c.asesor)}` : ''}</div>` : ''}
      <div class="rep-bur__d" id="rep-bur-d">${desc ? _escHtml(desc) : '<i>Sin detalle cargado.</i>'}</div>
      ${desc.length > 180 ? '<button type="button" class="rep-bur__m" onclick="document.getElementById(\'rep-bur-d\').classList.toggle(\'rep-bur__d--abierto\'); this.textContent = this.textContent === \'Ver más\' ? \'Ver menos\' : \'Ver más\'">Ver más</button>' : ''}
    </div>`;
}

// Se actualiza solo cuando cambia el desplegable de repetida, la categoría, el subtema o el cliente
document.addEventListener('change', e => {
  if (e.target && ['r-rep', 'r-cat', 'r-sub', 'r-cliente'].includes(e.target.id)) repBurbujaActualizar();
});
