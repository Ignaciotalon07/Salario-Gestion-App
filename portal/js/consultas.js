// ───────────── Mis consultas: todo lo que el cliente consultó por soporte ─────────────
// Sale de la vista segura portal_mis_consultas (solo SUS consultas de soporte, sin métricas internas).
const _abiertasCons = new Set();   // consultas desplegadas (se conservan al redibujar)
const ESTADO_CONS = { si: ['Resuelta', 'c-ok'], parcial: ['Parcialmente', 'c-wa'], no: ['Sin resolver', 'c-ko'] };

// Los clientes de soporte de siempre no tienen Implementación: se oculta de la barra
function renderNavCliente() {
  if (!P.cliente) return;
  const imp = tieneImpl();
  $('sn-impl').style.display = imp ? '' : 'none';
  $('snav-sub').style.display = imp ? '' : 'none';
}
RENDERS.push(renderNavCliente);

function consultasFiltradas() {
  const q = ($('cons-q').value || '').trim().toLowerCase(), cat = $('cons-cat').value, res = $('cons-res').value;
  return (P.consultas || []).filter(c =>
    (!cat || c.categoria === cat) && (!res || c.resuelto === res) &&
    (!q || [c.categoria, c.subtema, c.descripcion, c.solucion, c.contacto, c.asesor].some(x => String(x || '').toLowerCase().includes(q))));
}

function renderConsultas() {
  if (!P.cliente || !$('cons-lista')) return;
  const todas = P.consultas || [];
  // Categorías para el filtro (se conserva la elegida)
  const sel = $('cons-cat'), actual = sel.value;
  const cats = [...new Set(todas.map(c => c.categoria).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  sel.value = cats.includes(actual) ? actual : '';

  // Resumen
  const mes = new Date().toISOString().slice(0, 7);
  const delMes = todas.filter(c => String(c.created_at).slice(0, 7) === mes).length;
  const res = todas.filter(c => c.resuelto === 'si').length;
  const cuenta = {}; todas.forEach(c => { if (c.categoria) cuenta[c.categoria] = (cuenta[c.categoria] || 0) + 1; });
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  $('cons-kpi').innerHTML = [
    ['Consultas en total', todas.length, ''], ['Este mes', delMes, ''],
    ['Resueltas', todas.length ? Math.round(res / todas.length * 100) + '%' : '—', ''], ['Lo que más consultás', top ? top[0] : '—', 'txt']
  ].map(([t, v, c]) => `<div class="metric"><small>${t}</small><strong class="${c}">${esc(String(v))}</strong></div>`).join('');
  pintarConsultas();
}

function pintarConsultas() {
  const lista = consultasFiltradas();
  const todas = P.consultas || [];
  if (!todas.length) { $('cons-lista').innerHTML = '<div class="card vacio" style="padding:34px">Todavía no hay consultas registradas. Cuando nos escribas por soporte, vas a ver acá cada consulta con su respuesta.</div>'; return; }
  if (!lista.length) { $('cons-lista').innerHTML = '<div class="vacio">No encontramos consultas con esos filtros.</div>'; return; }
  let mesAct = '', html = '';
  lista.forEach(c => {
    const d = new Date(c.created_at);
    const mes = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    if (mes !== mesAct) { mesAct = mes; html += `<div class="cons-mes">${esc(mes.replace(/^./, x => x.toUpperCase()))}</div>`; }
    const [et, cl] = ESTADO_CONS[c.resuelto] || [null, ''];
    const abierta = _abiertasCons.has(c.id);
    const extra = [c.contacto ? 'Consultó: <b>' + esc(c.contacto) + '</b>' : '', c.asesor ? 'Te atendió: <b>' + esc(c.asesor) + '</b>' : '',
      c.conexion_remota && c.conexion_remota !== 'no' ? 'Con conexión remota' : '', c.material && c.material !== 'ninguno' && c.material !== 'no' ? 'Material: ' + esc(c.material) : ''].filter(Boolean);
    html += `<div class="cn${abierta ? ' open' : ''}" data-cons="${esc(c.id)}">
      <div class="cn-h"><div class="cn-d"><b>${d.getDate()}</b><small>${d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</small></div>
        <div class="cn-t"><b>${esc(c.categoria || 'Consulta')}${c.subtema ? ' · ' + esc(c.subtema) : ''}</b>${c.descripcion ? '<small>' + esc(c.descripcion.length > 110 ? c.descripcion.slice(0, 110) + '…' : c.descripcion) + '</small>' : ''}</div>
        ${et ? `<span class="chip ${cl}">${et}</span>` : ''}<span class="cn-c">▾</span></div>
      <div class="cn-b">
        ${c.descripcion ? `<div class="cn-s"><small>Qué consultaste</small><p>${esc(c.descripcion)}</p></div>` : ''}
        ${c.solucion ? `<div class="cn-s cn-sol"><small>Cómo se resolvió</small><p>${esc(c.solucion)}</p></div>` : ''}
        ${extra.length ? `<div class="cn-x">${extra.map(x => '<span>' + x + '</span>').join('')}</div>` : ''}
      </div></div>`;
  });
  $('cons-lista').innerHTML = html;
}
RENDERS.push(renderConsultas);
ALENTRAR.consultas = renderConsultas;

$('cons-q').addEventListener('input', pintarConsultas);
$('cons-cat').addEventListener('change', pintarConsultas);
$('cons-res').addEventListener('change', pintarConsultas);
$('cons-lista').addEventListener('click', ev => {
  const h = ev.target.closest('.cn-h'); if (!h) return;
  const n = h.parentElement, id = n.dataset.cons;
  _abiertasCons.has(id) ? _abiertasCons.delete(id) : _abiertasCons.add(id);
  n.classList.toggle('open');
});
