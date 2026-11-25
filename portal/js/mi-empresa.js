// ───────────── Mi empresa: datos, empresas, usuarios de Salario y archivos ─────────────
const CAMPOS_DATOS = [
  ['razon_social', 'Razón social', true], ['cuit', 'CUIT'], ['cant_legajos', 'Cant. de legajos'],
  ['domicilio', 'Domicilio', true], ['tipo_empleador', 'Tipo de empleador'], ['obra_social', 'Obra social'], ['art', 'ART'],
  ['actividad_principal', 'Actividad principal', true], ['convenios', 'Convenios', true]
];
const vacioDato = v => v === null || v === undefined || String(v).trim() === '';
const empresaCompleta = e => CAMPOS_DATOS.every(([k]) => !vacioDato(e[k]));

let _empSel = null;   // empresa elegida en la lista (se conserva al redibujar)
function renderMiEmpresa() {
  if (!P.cliente) return;
  const p = P.principal;

  // Datos
  $('e-datos').innerHTML = p
    ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div class="card-title" style="margin:0">Mis datos</div><button class="btn sec sm" type="button" data-emp="editar" data-id="${esc(p.id)}">✏️ Editar</button></div>
       <div class="datos" style="margin-top:14px">${CAMPOS_DATOS.map(([k, l, ancho]) => `<div${ancho ? ' style="grid-column:1/-1"' : ''}><span>${l}</span>${vacioDato(p[k]) ? '<i class="chip-vacio">Sin completar</i>' : esc(p[k])}</div>`).join('')}</div>`
    : '<div class="vacio">Todavía no cargaste los datos de tu empresa.</div>';

  // Empresas (pestaña de Implementación): se pueden cargar en cualquier momento
  const declaradas = P.prep && P.prep.empresas_declaradas;
  const otras = P.empresas.filter(e => !e.es_principal);
  const falta = declaradas ? Math.max(0, declaradas - P.empresas.length) : 0;
  // Maestro-detalle: a la izquierda la lista de empresas, a la derecha el detalle de la elegida
  if (!P.empresas.some(e => e.id === _empSel)) _empSel = (p || P.empresas[0] || {}).id || null;
  const titulo = e => e.nombre || e.razon_social || 'Empresa';
  const items = P.empresas.map(e => `<button type="button" class="md-i${e.id === _empSel ? ' on' : ''}" data-emp-sel="${esc(e.id)}"><span class="av">${esc(iniciales(titulo(e)))}</span><span class="md-t"><b>${esc(titulo(e))}</b><small>${e.es_principal ? 'Empresa del cliente' : 'Empresa'}</small></span><i class="md-e ${empresaCompleta(e) ? 'ok' : 'wa'}" title="${empresaCompleta(e) ? 'Datos completos' : 'Faltan datos'}"></i></button>`).join('')
    + (falta ? `<button type="button" class="md-i md-falta" data-emp="nueva"><span class="av">+</span><span class="md-t"><b>Falta cargar ${falta} ${falta === 1 ? 'empresa' : 'empresas'}</b><small>Indicaste ${declaradas} en total</small></span></button>` : '');
  const sel = P.empresas.find(e => e.id === _empSel);
  let det;
  if (!sel) det = '<div class="vacio">Todavía no cargaste ninguna empresa.</div>';
  else {
    const archivos = (P.docs || []).filter(d => d.empresa_id === sel.id);
    const cargados = CAMPOS_DATOS.filter(([k]) => !vacioDato(sel[k])).length;
    det = `<div class="md-dh"><div><h2>${esc(titulo(sel))}</h2><p>${sel.nombre && sel.nombre !== sel.razon_social ? 'Razón social: ' + esc(sel.razon_social) : (sel.es_principal ? 'Empresa del cliente' : 'Empresa')}${sel.cuit ? ' · CUIT ' + esc(sel.cuit) : ''}</p></div>
      <div class="md-ac"><span class="chip ${empresaCompleta(sel) ? 'c-ok' : 'c-wa'}">${empresaCompleta(sel) ? 'Datos completos' : 'Faltan datos'}</span>
      <button class="btn sec sm" type="button" data-emp="editar" data-id="${esc(sel.id)}">${empresaCompleta(sel) ? 'Editar' : 'Completar'}</button>
      ${!sel.es_principal ? `<button class="btn sec sm" type="button" data-emp="borrar" data-id="${esc(sel.id)}">Quitar</button>` : ''}</div></div>
      <div class="md-pr"><i><b style="width:${Math.round(cargados / CAMPOS_DATOS.length * 100)}%"></b></i><span>${cargados} de ${CAMPOS_DATOS.length} datos</span></div>
      <div class="md-datos">${CAMPOS_DATOS.map(([k, l, ancho]) => `<div${ancho ? ' class="w"' : ''}><span>${l}</span>${vacioDato(sel[k]) ? '<i class="chip-vacio">Sin completar</i>' : esc(sel[k])}</div>`).join('')}</div>
      <div class="md-ar"><h3>Archivos de esta empresa · ${archivos.length}</h3>${archivos.length ? archivos.map(d => `<div class="up"><div class="up-i"><b>${esc(d.nombre)}</b><small>${esc(NOMBRE_CAT[d.categoria] || 'Archivo')} · ${fmtFecha(d.created_at)}</small></div><div class="up-f"><button class="btn sec sm" type="button" data-arch="ver" data-doc="${esc(d.id)}">Ver</button></div></div>`).join('') : '<p class="muted sm">Todavía no subiste archivos para esta empresa.</p>'}</div>`;
  }
  $('e-empresas').innerHTML = `<aside class="md-l">${items}</aside><section class="md-d">${det}</section>`;

  // Usuarios de Salario
  $('e-usuarios').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap"><div class="card-title" style="margin:0">Personas con acceso a Salario · ${P.usuarios.length}</div><button class="btn sm" type="button" id="u-mas">+ Pedir un usuario nuevo</button></div>
    ${P.usuarios.map(u => `<div class="emp"><div class="av">${esc(iniciales(u.nombre))}</div><div class="t"><b>${esc(u.nombre)}</b><small>Usuario de Salario</small></div><span class="chip ${u.creado ? 'c-ok' : 'c-wa'}">${u.creado ? 'Acceso creado' : '⏳ Acceso pendiente'}</span></div>`).join('') || '<div class="vacio">Todavía no indicaste quiénes van a usar Salario.</div>'}
    <div class="ep" id="u-nuevo" style="margin-top:10px;padding:12px;border:1px solid var(--orline);background:var(--orb);border-radius:var(--radius)">
      <label style="margin-top:0">Nombre y apellido</label><input id="u-nom" maxlength="120" placeholder="Nombre y apellido" />
      <button class="btn sm" type="button" id="u-enviar" style="margin-top:10px">Enviar pedido</button></div>`;

  // Archivos
  const grupo = (titulo, lista, cliente) => `<details class="up-emp" ${cliente ? 'open' : ''}><summary><span class="nm">${esc(titulo)}</span><span class="cnt">${lista.length} ${lista.length === 1 ? 'archivo' : 'archivos'}</span></summary>
    ${lista.map(d => `<div class="up"><div class="up-i"><b>${esc(d.nombre)}</b><small>${esc(NOMBRE_CAT[d.categoria] || (cliente ? 'Archivo' : 'Compartido por tu equipo'))}</small></div>
      <div class="up-f">${cliente ? htmlArchivoCargado(d) : `<button class="btn sec sm" type="button" data-arch="ver" data-doc="${esc(d.id)}">Descargar</button>`}</div></div>`).join('') || '<div class="up"><div class="up-i"><small>Todavía no hay archivos.</small></div></div>'}</details>`;
  $('e-archivos').innerHTML = `<div class="card-title">Archivos que subiste · ${P.docs.length}</div>` +
    grupo(p ? p.razon_social : 'Tus archivos', P.docs, true) + grupo('Documentos de Salario para vos', P.docsEquipo, false);
}
const NOMBRE_CAT = { logo: 'Logo', firma: 'Firma', liquidacion: 'Liquidación', control: 'Excel de control' };
RENDERS.push(renderMiEmpresa);
ALENTRAR.empresa = renderMiEmpresa;

// Pestañas y acciones
// Acciones de la pestaña Empresas (dentro de Implementación)
$('itp-empresas').addEventListener('click', ev => {
  const b = ev.target.closest('[data-emp]');
  if (!b) {
    // Tocar una empresa de la lista muestra su detalle
    const s = ev.target.closest('[data-emp-sel]'); if (s) { _empSel = s.dataset.empSel; renderMiEmpresa(); }
    return;
  }
  const e = P.empresas.find(x => x.id === b.dataset.id);
  if (b.dataset.emp === 'editar' && e) abrirFormulario(e, !!e.es_principal);
  else if (b.dataset.emp === 'nueva') abrirFormulario(null, false);
  else if (b.dataset.emp === 'borrar' && e) borrarEmpresa(e);
});
$('v-empresa').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-emp]');
  if (b) {
    const e = P.empresas.find(x => x.id === b.dataset.id);
    if (b.dataset.emp === 'editar' && e) abrirFormulario(e, !!e.es_principal);
    else if (b.dataset.emp === 'nueva') abrirFormulario(null, false);
    else if (b.dataset.emp === 'borrar' && e) borrarEmpresa(e);
    return;
  }
  if (ev.target.id === 'u-mas') { $('u-nuevo').classList.toggle('on'); return; }
  if (ev.target.id === 'u-enviar') {
    const nom = $('u-nom').value.trim();
    if (nom.length < 2) { toast('Escribí el nombre y apellido.'); return; }
    // La función reemplaza la lista completa: se manda la actual más la persona nueva
    const { error } = await sb.rpc('portal_guardar_usuarios', { p_nombres: [...P.usuarios.map(u => u.nombre), nom] });
    if (error) { toast(error.message || 'No se pudo enviar el pedido.'); return; }
    toast('Listo. Avisamos a nuestro equipo de programación para que cree el usuario y la clave.');
    await cargarTodo(false);
  }
});
