// CLIENTE → pestaña "Relevamiento" (detalle de Implementación)
// El equipo ve lo que el cliente respondió en el relevamiento inicial (tablas relevamiento_*),
// quién y cuándo lo respondió, qué omitió y por qué, y puede dejar NOTAS INTERNAS por pregunta
// (relevamiento_notas_equipo: el cliente nunca las ve). Se baja a Excel (con notas) y a PDF (sin notas).

const _relev = {};            // clienteId -> { preg, resp, notas, aprob, principal }
const _relevCargando = {};
let _relevFiltro = 'todas';   // 'todas' | 'omitidas' | 'sinresp'
const _rlEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function relevCargar(cid, rerender) {
  if (_relevCargando[cid]) return;
  _relevCargando[cid] = true;
  try {
    const [p, r, n, a, e] = await Promise.all([
      sb().from('relevamiento_preguntas').select('*').eq('activa', true).order('seccion').order('orden'),
      sb().from('relevamiento_respuestas').select('*').eq('cliente_id', cid),
      sb().from('relevamiento_notas_equipo').select('*').eq('cliente_id', cid),
      sb().from('relevamiento_aprobacion').select('*').eq('cliente_id', cid).maybeSingle(),
      sb().from('cliente_empresas').select('*').eq('cliente_id', cid).eq('es_principal', true).maybeSingle()
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    _relev[cid] = { preg: p.data || [], resp: r.data || [], notas: n.error ? [] : (n.data || []), aprob: a.error ? null : a.data, principal: e.error ? null : e.data };
  } catch (err) {
    console.warn('No se pudo cargar el relevamiento', err);
    _relev[cid] = _relev[cid] || { preg: [], resp: [], notas: [], aprob: null, principal: null };
    if (typeof toast === 'function') toast('No se pudo cargar el relevamiento (¿corriste la migración 080?)');
  } finally { delete _relevCargando[cid]; }
  if (rerender !== false && window._implTab === 'relev' && window._implClienteAbierto === cid && typeof renderImplementacion === 'function') renderImplementacion();
}

// ── Estado de cada pregunta (mismas reglas que usa el portal del cliente) ──
const _rlResp = (d, p, col) => d.resp.find(r => r.pregunta_id === p.id && r.columna === col) || null;
const _rlVacio = t => !t || !String(t).trim();
function _rlOmision(d, p) { return d.resp.find(r => r.pregunta_id === p.id && r.omitida) || null; }
function _rlEstado(d, p) {
  if (_rlOmision(d, p)) return 'omitida';
  let ok;
  if (p.tipo === 'texto') { const r = _rlResp(d, p, 'unica'); ok = !!r && !_rlVacio(r.texto); }
  else if (p.tipo === 'sino') { const r = _rlResp(d, p, 'unica'); ok = !!r && !!r.sino; }
  else if (p.tipo === 'dual_texto') ok = ['mensuales', 'jornales'].every(c => { const r = _rlResp(d, p, c); return r && !_rlVacio(r.texto); });
  else if (p.tipo === 'dual_sino') ok = ['mensuales', 'jornales'].every(c => { const r = _rlResp(d, p, c); return r && !!r.sino; });
  else { const r = _rlResp(d, p, 'unica'); ok = !!r && r.confirmado; }
  return ok ? 'ok' : 'sinresp';
}
const _rlSN = v => v === 'si' ? 'Sí' : v === 'no' ? 'No' : '';
// Respuesta en texto plano (para Excel y PDF) y en partes (para la pantalla)
function _rlPartes(d, p) {
  const om = _rlOmision(d, p);
  if (om) return [{ t: 'Omitida: ' + (om.motivo || ''), omitida: true }];
  const una = c => { const r = _rlResp(d, p, c); if (!r) return ''; return [_rlSN(r.sino), r.texto].filter(Boolean).join(' — '); };
  if (p.tipo === 'texto' || p.tipo === 'sino') return [{ t: una('unica') }];
  if (p.clave === 's3_personal_mensual_y_quincenal' && p.tipo === 'dual_texto') return [{ et: 'Por mes', t: una('mensuales') ? una('mensuales') + '%' : '' }, { et: 'Por quincena', t: una('jornales') ? una('jornales') + '%' : '' }];
  if (p.tipo === 'dual_texto' || p.tipo === 'dual_sino') return [{ et: 'Mensuales', t: una('mensuales') }, { et: 'Jornales', t: una('jornales') }];
  const r = _rlResp(d, p, 'unica');
  return [{ t: r && r.confirmado ? 'Entendido / confirmado' : '' }];
}
const _rlPlano = (d, p) => _rlPartes(d, p).map(x => (x.et ? x.et + ': ' : '') + (x.t || '—')).join('  |  ');
function _rlMeta(d, p) {
  const f = d.resp.filter(r => r.pregunta_id === p.id).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
  if (!f) return '';
  const q = f.actualizado_por === 'Cliente (portal)' ? 'el cliente' : (f.actualizado_por || '');
  return `${q ? q + ' · ' : ''}${typeof _infoFecha === 'function' ? _infoFecha(f.updated_at) : new Date(f.updated_at).toLocaleString('es-AR')}`;
}
const _rlNota = (d, p) => (d.notas.find(n => n.pregunta_id === p.id) || {}).nota || '';

// ── Pantalla ──
function relevHayAvisoSinVer() { return false; }
function getCantRelevCliente(cid) { const d = _relev[cid]; if (!d) return 0; return d.preg.filter(p => _rlEstado(d, p) === 'omitida').length; }

function renderRelevCliente(c) {
  const cid = c.id;
  if (!_relev[cid]) { relevCargar(cid); return '<div class="info-cargando">Cargando relevamiento…</div>'; }
  const d = _relev[cid];
  if (!d.preg.length) return '<div class="info-vacio">El relevamiento todavía no está disponible (falta correr la migración 080 en Supabase).</div>';
  const ests = d.preg.map(p => ({ p, e: _rlEstado(d, p) }));
  const nOk = ests.filter(x => x.e === 'ok').length, nOm = ests.filter(x => x.e === 'omitida').length, nSin = ests.filter(x => x.e === 'sinresp').length;
  const nSeg = k => ests.filter(x => x.e === k).length;
  const chip = (k, txt) => `<button class="rlq-chip ${_relevFiltro === k ? 'on' : ''}" onclick="relevFiltrar('${k}')">${txt}</button>`;

  const aprob = d.aprob
    ? `<span class="rlq-ap rlq-ap--ok">✓ Aprobado por <b>${_rlEsc(d.aprob.aprobado_por)}</b> el ${_rlEsc(typeof _infoFecha === 'function' ? _infoFecha(d.aprob.aprobado_at) : d.aprob.aprobado_at)}</span>`
    : '<span class="rlq-ap">Sin aprobar todavía</span>';

  const secs = [...new Set(d.preg.map(p => p.seccion))].sort((a, b) => a - b);
  const html = secs.map(n => {
    const items = ests.filter(x => x.p.seccion === n);
    const vis = items.filter(x => _relevFiltro === 'todas' || (_relevFiltro === 'omitidas' && x.e === 'omitida') || (_relevFiltro === 'sinresp' && x.e === 'sinresp'));
    if (!vis.length) return '';
    const filas = vis.map(({ p, e }) => {
      const partes = _rlPartes(d, p);
      const resp = partes.map(x => `<div class="rlq-r ${x.omitida ? 'rlq-r--om' : ''} ${x.t ? '' : 'rlq-r--vacia'}">${x.et ? `<span class="rlq-et">${x.et}</span>` : ''}${x.t ? _rlEsc(x.t) : 'Sin responder'}</div>`).join('');
      const badge = e === 'omitida' ? '<span class="rlq-b rlq-b--om">Omitida</span>' : e === 'sinresp' ? '<span class="rlq-b rlq-b--sin">Sin responder</span>' : '';
      const meta = _rlMeta(d, p);
      return `<div class="rlq-row rlq-row--${e}"><div class="rlq-t">${_rlEsc(p.tema)}${badge}</div>
        <div class="rlq-q">${String(p.consulta).split(/\n\s*\n|\n/).filter(Boolean).map(x => `<p>${_rlEsc(x)}</p>`).join('')}</div>
        <div class="rlq-a">${resp}${meta ? `<div class="rlq-meta">${_rlEsc(meta)}</div>` : ''}</div>
        <div class="rlq-n"><textarea rows="2" placeholder="Nota interna (para el equipo Salario)…" onchange="relevGuardarNota('${cid}','${p.id}',this)">${_rlEsc(_rlNota(d, p))}</textarea></div></div>`;
    }).join('');
    const emp = n === 3 && d.principal ? `<div class="rlq-emp"><b>Detalle de la empresa:</b> ${d.principal.cant_legajos ?? '—'} empleados · cobra ${({ mensual: 'todo el personal por mes', quincenal: 'todo el personal por quincena', mixto: 'mixto (' + (d.principal.pct_quincenal ?? '?') + '% quincenal)' })[d.principal.modalidad_pago] || '—'}</div>` : '';
    return `<div class="rlq-sec"><div class="rlq-sec-h">${n}. ${_rlEsc(items[0].p.seccion_titulo)}<span>${items.filter(x => x.e === 'ok').length}/${items.length}</span></div>
      <div class="rlq-cols"><span>Tema</span><span>Consulta</span><span>Respuesta del cliente</span><span>Nota interna</span></div>${filas}${emp}</div>`;
  }).join('');

  return `<div class="rlq">
    <div class="rlq-top">
      <div class="rlq-sum"><b>${nOk}</b> respondidas · <b class="rlq-om">${nOm}</b> omitidas · <b class="rlq-sin">${nSin}</b> sin responder · de ${ests.length}</div>
      ${aprob}
      <div class="rlq-acc"><button class="btn-secondary" onclick="relevExcel('${cid}')">⬇ Excel</button><button class="btn-secondary" onclick="relevPDF('${cid}')">⬇ PDF</button></div>
    </div>
    <div class="rlq-filtros">${chip('todas', 'Todas · ' + ests.length)}${chip('omitidas', 'Omitidas · ' + nSeg('omitida'))}${chip('sinresp', 'Sin responder · ' + nSeg('sinresp'))}</div>
    ${html || '<div class="info-vacio">No hay preguntas con ese filtro.</div>'}
  </div>`;
}

function relevFiltrar(k) { _relevFiltro = k; if (typeof renderImplementacion === 'function') renderImplementacion(); }

async function relevGuardarNota(cid, pid, el) {
  const nota = el.value.trim();
  const d = _relev[cid];
  try {
    if (!nota) {
      const { error } = await sb().from('relevamiento_notas_equipo').delete().eq('cliente_id', cid).eq('pregunta_id', pid);
      if (error) throw error;
      if (d) d.notas = d.notas.filter(n => n.pregunta_id !== pid);
    } else {
      const fila = { cliente_id: cid, pregunta_id: pid, nota, autor: (typeof getCurrentUserName === 'function' ? getCurrentUserName() : null), updated_at: new Date().toISOString() };
      const { error } = await sb().from('relevamiento_notas_equipo').upsert(fila, { onConflict: 'cliente_id,pregunta_id' });
      if (error) throw error;
      if (d) { d.notas = d.notas.filter(n => n.pregunta_id !== pid); d.notas.push(fila); }
    }
    el.style.borderColor = 'var(--green, #2e7d32)'; setTimeout(() => { el.style.borderColor = ''; }, 900);
  } catch (e) { console.error(e); if (typeof toast === 'function') toast('No se pudo guardar la nota'); }
}

// ── Descargas ──
function _rlNombreCliente(cid) { const c = (typeof clientes !== 'undefined' ? clientes : []).find(x => x.id === cid); return c ? c.nombre : 'cliente'; }
const _rlArchivo = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_');

function relevExcel(cid) {
  const d = _relev[cid]; if (!d) return;
  if (typeof XLSX === 'undefined') { if (typeof toast === 'function') toast('No se cargó la librería de Excel'); return; }
  const filas = [['Parte', 'Tema', 'Consulta', 'Respuesta del cliente', 'Estado', 'Última modificación', 'Nota interna del equipo']];
  d.preg.forEach(p => filas.push([p.seccion + '. ' + p.seccion_titulo, p.tema, p.consulta, _rlPlano(d, p),
    ({ ok: 'Respondida', omitida: 'Omitida', sinresp: 'Sin responder' })[_rlEstado(d, p)], _rlMeta(d, p), _rlNota(d, p)]));
  if (d.principal) filas.push(['3. Empresas', 'Detalle de la empresa', '', `${d.principal.cant_legajos ?? ''} empleados · ${d.principal.modalidad_pago || ''}${d.principal.pct_quincenal != null ? ' (' + d.principal.pct_quincenal + '% quincenal)' : ''}`, '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 60 }, { wch: 60 }, { wch: 14 }, { wch: 26 }, { wch: 40 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Relevamiento');
  XLSX.writeFile(wb, `Relevamiento_${_rlArchivo(_rlNombreCliente(cid))}.xlsx`);
}

function relevPDF(cid) {
  const d = _relev[cid]; if (!d) return;
  if (!window.jspdf) { if (typeof toast === 'function') toast('No se cargó la librería de PDF'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const nombre = _rlNombreCliente(cid);
  doc.setFontSize(16); doc.text('Relevamiento inicial', 40, 44);
  doc.setFontSize(10); doc.setTextColor(100);
  doc.text(`${nombre}${d.aprob ? ' · Aprobado por ' + d.aprob.aprobado_por : ' · Sin aprobar'}`, 40, 62);
  doc.setTextColor(0);
  let y = 78;
  [...new Set(d.preg.map(p => p.seccion))].sort((a, b) => a - b).forEach(n => {
    const items = d.preg.filter(p => p.seccion === n);
    doc.autoTable({
      startY: y, head: [[`${n}. ${items[0].seccion_titulo}`, 'Consulta', 'Respuesta']],
      body: items.map(p => [p.tema, p.consulta, _rlPlano(d, p)]),
      styles: { fontSize: 8, cellPadding: 4, valign: 'top' }, headStyles: { fillColor: [45, 45, 142] },
      columnStyles: { 0: { cellWidth: 100, fontStyle: 'bold' }, 1: { cellWidth: 200 }, 2: { cellWidth: 'auto' } },
      margin: { left: 40, right: 40 }
    });
    y = doc.lastAutoTable.finalY + 14;
  });
  doc.save(`Relevamiento_${_rlArchivo(nombre)}.pdf`);
}

// Si el cliente responde mientras el equipo mira la pestaña, se actualiza (salvo que esté escribiendo una nota)
window.addEventListener('app-ready', () => {
  try {
    sb().channel('cliente-relevamiento')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relevamiento_respuestas' }, pl => {
        const cid = (pl.new && pl.new.cliente_id) || (pl.old && pl.old.cliente_id);
        if (!cid || !_relev[cid]) return;
        const escribiendo = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rlq');
        relevCargar(cid, !escribiendo);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relevamiento_aprobacion' }, pl => {
        const cid = (pl.new && pl.new.cliente_id) || (pl.old && pl.old.cliente_id);
        if (cid && _relev[cid]) relevCargar(cid);
      })
      .subscribe();
  } catch (e) { console.warn('Sin realtime de relevamiento', e); }
});
