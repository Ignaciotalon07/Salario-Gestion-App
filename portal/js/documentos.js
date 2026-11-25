// ───────────── Documentos: lo que nos compartió Salario y lo que subió el cliente ─────────────
// "Compartidos por Salario": archivos del equipo que marcaron como visibles para el cliente
// (la base ya filtra: el cliente nunca ve los que el equipo no compartió).
// "Tus archivos": lo que subió él mismo, agrupado por tipo. Puede ver y quitar solo lo suyo.
const TIPOS_DOC = [
  ['logo', 'Logos'], ['firma', 'Firmas'], ['sello', 'Sellos'], ['liquidacion', 'PDF de liquidaciones'], ['control', 'Excel de control'],
  ['formulas', 'Excel de fórmulas'], ['empleados', 'Planilla de empleados'], ['explicativo', 'Documentos explicativos'], ['pdf', 'PDF'], ['excel', 'Excel'], ['word', 'Word'],
  ['imagen', 'Imágenes'], ['link', 'Links'], ['otro', 'Otros']
];
function tipoDoc(d) {
  if (d.url) return 'link';
  if (['logo', 'firma', 'sello', 'liquidacion', 'control', 'formulas', 'empleados', 'explicativo'].includes(d.categoria)) return d.categoria;
  const ext = String(d.nombre || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) return 'excel';
  if (['doc', 'docx', 'rtf'].includes(ext)) return 'word';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'imagen';
  return 'otro';
}
function gruposDoc(lista, propios) {
  return TIPOS_DOC.map(([k, titulo]) => {
    const items = lista.filter(d => tipoDoc(d) === k);
    if (!items.length) return '';
    return `<details class="up-emp" open><summary><span class="nm">${titulo}</span><span class="cnt">${items.length} ${items.length === 1 ? 'archivo' : 'archivos'}</span></summary>
      ${items.map(d => `<div class="up"><div class="up-i"><b>${esc(d.nombre)}</b><small>${fmtFecha(d.created_at)}${d.tamano_bytes ? ' · ' + kb(d.tamano_bytes) : ''}${propios && d.empresa ? ' · ' + esc(d.empresa) : ''}</small></div>
        <div class="up-f">${propios && !d.url ? htmlArchivoCargado(d) : `<button class="btn sec sm" type="button" data-arch="ver" data-doc="${esc(d.id)}">${d.url ? 'Abrir link' : 'Descargar'}</button>`}</div></div>`).join('')}</details>`;
  }).join('');
}
// Lo que el equipo necesita del cliente. Un estudio contable no sube logo/firma ni liquidaciones (pasos que no le aplican).
function requeridosDoc() {
  const r = [];
  if (pasoAplica(4)) r.push({ cat: 'logo', nombre: 'Logo', ayuda: 'Imagen PNG o JPG, sin fondo', n: 1 }, { cat: 'firma', nombre: 'Firma del empleador', ayuda: 'Imagen PNG o JPG, sin fondo', n: 1 });
  if (pasoAplica(5)) r.push({ cat: 'liquidacion', nombre: 'PDF de liquidaciones', ayuda: 'Dos liquidaciones de meses distintos', n: 2 }, { cat: 'control', nombre: 'Excel de control', ayuda: 'Si lo tenés, con sus fórmulas', n: 1, opcional: true });
  return r;
}
function renderDocumentos() {
  if (!P.cliente || !$('d-equipo')) return;
  const req = requeridosDoc();
  const cats = req.map(x => x.cat);
  const filas = req.map(x => {
    const lista = P.docs.filter(d => d.categoria === x.cat);
    const listo = lista.length >= x.n;
    return `<div class="ck-i ${listo ? 'ok' : ''}"><span class="ck-m">${listo ? '✓' : ''}</span>
      <div class="ck-t"><b>${esc(x.nombre)}${x.opcional ? ' <em>opcional</em>' : ''}</b><small>${lista.length ? lista.length + (lista.length === 1 ? ' archivo subido' : ' archivos subidos') + (x.n > 1 ? ' de ' + x.n : '') : esc(x.ayuda)}</small>
        ${lista.map(d => htmlArchivoCargado(d)).join('')}</div>
      <button class="btn ${listo ? 'sec' : ''} sm" type="button" data-subir-tipo="${x.cat}">${listo ? 'Agregar otro' : 'Subir'}</button></div>`;
  }).join('');
  const oblig = req.filter(x => !x.opcional), hechos = oblig.filter(x => P.docs.filter(d => d.categoria === x.cat).length >= x.n).length;
  $('d-check').innerHTML = req.length
    ? `<div class="ck-h"><div><h2>Lo que necesitamos de vos</h2><p>Subí cada archivo en su lugar y lo tenemos listo para configurar tu sistema.</p></div><span class="ck-n">${hechos} de ${oblig.length} listos</span></div>
       <div class="ck-b"><i style="width:${oblig.length ? Math.round(hechos / oblig.length * 100) : 100}%"></i></div>${filas}`
    : `<div class="ck-h"><div><h2>Lo que necesitamos de vos</h2><p>Para tu tipo de cliente no hace falta subir archivos obligatorios. Si querés compartirnos algo, usá “Subir archivos”.</p></div></div>`;
  const otros = P.docs.filter(x => !cats.includes(x.categoria));
  $('d-propios').innerHTML = `<div class="pg-t"><b>Otros archivos que subiste</b><span>${otros.length}</span></div>` + (otros.length
    ? gruposDoc(otros, true)
    : '<div class="vacio">Todavía no subiste otros archivos.</div>');
  $('d-equipo').innerHTML = `<div class="pg-t"><b>Compartidos por Salario</b><span>${P.docsEquipo.length}</span></div>` + (P.docsEquipo.length
    ? gruposDoc(P.docsEquipo, false)
    : '<div class="vacio">Todavía no te compartimos documentos. Cuando haya algo para vos (guías, plantillas, material), lo vas a ver acá.</div>');
}
RENDERS.push(renderDocumentos);
ALENTRAR.docs = renderDocumentos;

// ───────────── Subir archivos desde Documentos, con selector de tipo ─────────────
const BLOQUEADAS = ['.exe', '.bat', '.cmd', '.msi', '.com', '.scr', '.vbs', '.js', '.ps1', '.jar'];
const TIPOS_SUBIDA = {
  logo:        { ico: '🏷️', nombre: 'Logo', accept: '.png,.jpg,.jpeg', ayuda: 'Imagen PNG o JPG, sin fondo y con buena resolución.' },
  firma:       { ico: '✍️', nombre: 'Firma', accept: '.png,.jpg,.jpeg', ayuda: 'Imagen PNG o JPG de la firma del empleador, sin fondo.' },
  sello:       { ico: '🔖', nombre: 'Sello', accept: '.png,.jpg,.jpeg', ayuda: 'Imagen PNG o JPG del sello, sin fondo.' },
  liquidacion: { ico: '📄', nombre: 'PDF de liquidación', accept: '.pdf', ayuda: 'PDF de una liquidación de sueldos reciente.' },
  control:     { ico: '📊', nombre: 'Excel de control', accept: '.xlsx,.xls,.xlsm', ayuda: 'El Excel con fórmulas que usan hoy para controlar la liquidación.' },
  formulas:    { ico: '🧮', nombre: 'Excel de fórmulas', accept: '.xlsx,.xls,.xlsm', ayuda: 'Excel con las fórmulas (planilla de conceptos): subilo con las fórmulas, no pegado como valores.' },
  empleados:   { ico: '👥', nombre: 'Planilla de empleados', accept: '.xlsx,.xls,.xlsm,.csv', ayuda: 'La planilla de alta de empleados completa.' },
  explicativo: { ico: '📝', nombre: 'Word explicativo', accept: '.doc,.docx,.pdf', ayuda: 'Documento que nos explique algo de tu liquidación.' },
  otro:        { ico: '📁', nombre: 'Otro documento', accept: '', ayuda: 'Cualquier otro archivo que quieras compartirnos (hasta 50 MB).' }
};
let tipoSubida = 'otro';

function subirError(t) { const e = $('s-error'); e.textContent = t || ''; e.hidden = !t; }
function pintarTiposSubida() {
  $('s-tipos').innerHTML = Object.entries(TIPOS_SUBIDA).map(([k, t]) =>
    `<button type="button" class="tipo-op ${k === tipoSubida ? 'sel' : ''}" data-tipo="${k}"><span class="ic">${t.ico}</span>${t.nombre}</button>`).join('');
  const t = TIPOS_SUBIDA[tipoSubida];
  $('s-ayuda').innerHTML = `<b>${t.nombre}</b>${t.ayuda}`;
  $('s-file').accept = t.accept;
}
function abrirSubida(tipo) {
  tipoSubida = TIPOS_SUBIDA[tipo] ? tipo : 'otro'; subirError(''); $('s-file').value = '';
  $('s-emp-w').hidden = P.empresas.length < 2;
  $('s-emp').innerHTML = P.empresas.map(e => `<option value="${esc(e.id)}" ${P.principal && e.id === P.principal.id ? 'selected' : ''}>${esc(e.nombre || e.razon_social || 'Empresa')}</option>`).join('');
  pintarTiposSubida();
  $('s-fondo').hidden = false;
}
function cerrarSubida() { $('s-fondo').hidden = true; }
$('d-subir').addEventListener('click', () => abrirSubida());
$('d-check').addEventListener('click', ev => { const b = ev.target.closest('[data-subir-tipo]'); if (b) abrirSubida(b.dataset.subirTipo); });
$('s-cancelar').addEventListener('click', cerrarSubida);
$('s-fondo').addEventListener('mousedown', ev => { if (ev.target === $('s-fondo')) cerrarSubida(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('s-fondo').hidden) cerrarSubida(); });
$('s-tipos').addEventListener('click', ev => { const b = ev.target.closest('[data-tipo]'); if (b) { tipoSubida = b.dataset.tipo; pintarTiposSubida(); } });

$('s-subir').addEventListener('click', async () => {
  subirError('');
  const files = [...$('s-file').files];
  if (!files.length) { subirError('Elegí al menos un archivo.'); return; }
  const t = TIPOS_SUBIDA[tipoSubida];
  const permitidas = t.accept ? t.accept.split(',') : null;
  for (const f of files) {
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    if (permitidas && !permitidas.includes(ext)) { subirError(`“${f.name}” no corresponde a ${t.nombre}. Formatos: ${t.accept.replace(/,/g, ' ')}`); return; }
    if (!permitidas && BLOQUEADAS.includes(ext)) { subirError(`“${f.name}”: ese tipo de archivo no se puede subir.`); return; }
    if (f.size > MAX_ARCHIVO) { subirError(`“${f.name}” pesa más de 50 MB. Comprimilo (por ejemplo con WinRAR) y volvé a subirlo.`); return; }
  }
  const emp = P.empresas.find(e => e.id === $('s-emp').value) || P.principal;
  if (!emp) { subirError('Primero completá los datos de tu empresa.'); return; }
  const { data: u } = await sb.auth.getUser();
  if (!u || !u.user) { subirError('Tu sesión venció. Volvé a ingresar.'); return; }
  const btn = $('s-subir'); btn.disabled = true;
  let ok = 0;
  for (const [i, f] of files.entries()) {
    btn.textContent = `Subiendo ${i + 1} de ${files.length}…`;
    const seguro = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ruta = `${P.cliente.id}/${Date.now()}_${seguro}`;
    const { error: e1 } = await sb.storage.from('cliente-documentos').upload(ruta, f);
    if (e1) { toast(`No se pudo subir “${f.name}”.`); continue; }
    const { error: e2 } = await sb.from('cliente_documentos').insert({
      cliente_id: P.cliente.id, nombre: f.name, categoria: tipoSubida, empresa_id: emp.id, empresa: emp.razon_social,
      storage_path: ruta, tipo_mime: f.type || null, tamano_bytes: f.size || null,
      origen: 'cliente', subido_por_user: u.user.id, subido_por: 'Cliente (portal)'
    });
    if (e2) { await sb.storage.from('cliente-documentos').remove([ruta]); toast(`No se pudo registrar “${f.name}”.`); continue; }
    ok++;
  }
  btn.disabled = false; btn.textContent = 'Subir';
  if (ok) { cerrarSubida(); toast(ok === 1 ? 'Archivo subido.' : ok + ' archivos subidos.'); await cargarTodo(false); }
});

