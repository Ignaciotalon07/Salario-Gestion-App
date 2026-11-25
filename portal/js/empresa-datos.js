// ───────────── Datos de la empresa: formularios y validaciones ─────────────
// Se usa en la Bienvenida (paso inicial), en el paso 2 de Preparación y en "Mi empresa".

// Tipos de empleador (el número es el código que usa Salario). Se guarda "N - Descripción".
const TIPOS_EMPLEADOR = [
  '1 - Decreto 814/1 Art.2 Inc.B',
  '2 - Serv.Eventuales Art.2 Inc.B',
  '3 - Provincias u Otros',
  '4 - Decreto 814/1 Art.2 Inc.A',
  '5 - Serv.Eventuales Art.2 Inc.A',
  '6 - Ley N° 22.016',
  '7 - Enseñanza Privada',
  '8 - Domesticos'
];
function opcionesTipo(selId, valorActual) {
  const sel = $(selId);
  sel.innerHTML = '<option value="" disabled hidden>Seleccioná una opción</option>' +
    TIPOS_EMPLEADOR.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  sel.value = TIPOS_EMPLEADOR.includes(valorActual) ? valorActual : '';
}

// CUIT: 11 dígitos y dígito verificador (módulo 11). Se guarda como XX-XXXXXXXX-X.
function cuitDigitosOk(d) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0);
  let v = 11 - (suma % 11);
  if (v === 11) v = 0;
  return v === Number(d[10]) || v === 10;   // 10 = caso especial (prefijo 23), no se rechaza
}
// Devuelve { cuit } formateado, o { error }. Vacío es válido (se completa después).
function validarCuit(texto) {
  const t = String(texto || '').trim();
  if (!t) return { cuit: null };
  const d = t.replace(/\D/g, '');
  if (d.length !== 11) return { error: 'El CUIT tiene que tener 11 números.' };
  if (!cuitDigitosOk(d) && !confirm('El CUIT parece tener un dígito verificador incorrecto. ¿Querés guardarlo igual?')) return { error: 'Revisá el CUIT.' };
  return { cuit: d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) };
}

// ── Buscador con lista: se busca por código o por texto; si no está, se puede agregar ──
// Lo elegido se guarda como "código - descripción". Sin tildes ni puntos: "O.S. UTHGRA" se encuentra con "uthgra".
const _norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '');

function crearBuscador(contId, lista, etiqueta) {
  const cont = $(contId), input = cont.querySelector('input');
  const items = lista.map(([cod, desc]) => ({ cod, desc, texto: cod + ' - ' + desc, n: _norm(cod + ' ' + desc) }));
  const caja = document.createElement('div');
  caja.className = 'cb-lista'; caja.hidden = true; cont.appendChild(caja);
  let valor = '', filtrados = [], activo = -1;

  function fijar(v) { valor = v || ''; input.value = valor; }
  function cerrar() { caja.hidden = true; activo = -1; }
  function buscar() {
    const palabras = _norm(input.value).split(/\s+/).filter(Boolean);
    filtrados = items.filter(it => palabras.every(p => it.n.includes(p))).slice(0, 60);
    activo = filtrados.length ? 0 : -1;
    dibujar();
  }
  function dibujar() {
    const op = filtrados.map((it, i) => `<div class="cb-op${i === activo ? ' sel' : ''}" data-i="${i}"><b>${esc(it.cod)}</b> ${esc(it.desc)}</div>`).join('');
    caja.innerHTML = (op || '<div class="cb-vacio">No hay coincidencias.</div>') +
      `<div class="cb-op cb-mas" data-mas="1">+ No la encuentro: agregar ${esc(etiqueta)}</div>`;
    caja.hidden = false;
  }
  function elegir(i) { fijar(filtrados[i].texto); cerrar(); }
  function formularioNuevo() {
    caja.innerHTML = `<div class="cb-nuevo">
      <p>Cargá el código y la descripción tal como figuran en ARCA.</p>
      <input data-n="cod" inputmode="numeric" maxlength="10" placeholder="Código (solo números)" />
      <input data-n="desc" maxlength="250" placeholder="Descripción" />
      <div class="cb-nuevo-bot"><button type="button" class="btn sec sm" data-n="cancelar">Cancelar</button><button type="button" class="btn sm" data-n="usar">Usar</button></div>
    </div>`;
    caja.hidden = false;
    caja.querySelector('[data-n=cod]').focus();
  }
  // mousedown (no click) para elegir antes de que el campo pierda el foco
  caja.addEventListener('mousedown', ev => {
    const op = ev.target.closest('.cb-op');
    if (op && op.dataset.mas) { ev.preventDefault(); formularioNuevo(); return; }
    if (op) { ev.preventDefault(); elegir(Number(op.dataset.i)); return; }
    const b = ev.target.closest('[data-n]');
    if (!b || b.tagName !== 'BUTTON') return;
    ev.preventDefault();
    if (b.dataset.n === 'cancelar') { cerrar(); return; }
    const cod = caja.querySelector('[data-n=cod]').value.trim().replace(/\D/g, '');
    const desc = caja.querySelector('[data-n=desc]').value.trim();
    if (!cod || !desc) { toast('Completá el código (solo números) y la descripción.'); return; }
    fijar(cod + ' - ' + desc); cerrar();
  });
  input.addEventListener('focus', () => { input.select(); buscar(); });
  input.addEventListener('input', buscar);
  input.addEventListener('keydown', ev => {
    if (caja.hidden) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (filtrados.length) { activo = (activo + 1) % filtrados.length; dibujar(); } }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (filtrados.length) { activo = (activo - 1 + filtrados.length) % filtrados.length; dibujar(); } }
    else if (ev.key === 'Enter') { if (activo >= 0 && filtrados[activo]) { ev.preventDefault(); elegir(activo); } }
    else if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); input.value = valor; }
  });
  // Al salir del campo, si el texto no es una opción elegida se vuelve al último valor válido
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (caja.contains(document.activeElement)) return;
      cerrar(); input.value = valor;
    }, 120);
  });
  return { set: fijar, get: () => valor };
}
// Dos juegos: el del modal de "Mi empresa" y el del paso 2 de Preparación
const CB = {
  os: crearBuscador('cb-os', PORTAL_LISTAS.obrasSociales, 'obra social'),
  art: crearBuscador('cb-art', PORTAL_LISTAS.art, 'ART'),
  act: crearBuscador('cb-act', PORTAL_LISTAS.clae, 'actividad')
};
const CB2 = {
  os: crearBuscador('cb-os2', PORTAL_LISTAS.obrasSociales, 'obra social'),
  art: crearBuscador('cb-art2', PORTAL_LISTAS.art, 'ART'),
  act: crearBuscador('cb-act2', PORTAL_LISTAS.clae, 'actividad')
};

// ── Guardar la empresa principal / una empresa (la base valida que sea de su cliente) ──
async function guardarEmpresa(fila, id, esPrincipal) {
  const { error } = id
    ? await sb.from('cliente_empresas').update(fila).eq('id', id)
    : await sb.from('cliente_empresas').insert({ ...fila, cliente_id: P.cliente.id, es_principal: !!esPrincipal });
  if (!error && typeof renderPrep !== 'undefined') renderPrep._p2 = false; renderPrep._p1 = false;   // que los pasos 1 y 2 vuelvan a leer lo guardado
  return error;
}

// ───────────── Bienvenida (primera vez): saludo + botón Comenzar ─────────────
const _BV_PASOS = {
  1: ['Tu empresa', 'Razón social y CUIT'], 2: ['Información adicional', 'Domicilio, obra social, ART y convenios'],
  3: ['Usuarios de Salario', 'Quiénes van a usar el sistema'], 4: ['Logo y firma', 'Para que tus recibos salgan con tu marca'],
  5: ['Liquidaciones', 'Dos PDF y tu Excel de control'], 6: ['Cantidad de empresas', 'Cuántas empresas vas a liquidar'],
  7: ['Relevamiento inicial', 'Cómo querés que funcione tu Salario'], 8: ['Reunión de inicio', 'Coordinamos el arranque por Meet']
};
const _BV_COLORES = ['#14b8c4', '#f97316', '#f59e0b', '#e11d48', '#0e8a94', '#8b5cf6', '#ec4899', '#22c55e'];
ALENTRAR.bienvenida = () => {
  const aplican = pasosAplican();
  $('bv-n8').textContent = aplican.length;
  $('bv-nombre').textContent = P.cliente ? 'Hola, ' + P.cliente.nombre + '' : '';
  $('bv-nota').textContent = 'Apenas completes todo, nuestro equipo arma tu cronograma y te avisamos acá cuando comience.';
  $('bv-pasos').innerHTML = aplican.map((n, i) => `<div class="bv3-p${i === 0 ? ' bv3-p--prim' : ''}" style="--c:${_BV_COLORES[i % 8]};animation-delay:${0.2 + i * 0.12}s"><span class="bv3-p__d">${i + 1}</span><div class="bv3-p__t"><b>${esc(_BV_PASOS[n][0])}</b><small>${esc(_BV_PASOS[n][1])}</small></div></div>`).join('');
};
$('bv-comenzar').addEventListener('click', () => {
  const bv = document.querySelector('#v-bienvenida .bv2'), btn = $('bv-comenzar');
  btn.disabled = true;
  if (bv) bv.classList.add('bv2-fuera');                       // la bienvenida se desvanece
  setTimeout(() => {
    marcarBienvenidaVista();
    irA('prep');
    if (bv) bv.classList.remove('bv2-fuera');
    btn.disabled = false;
    // Los puntos se arman de a uno (animación en CSS); al terminar se saca la clase para que no se repita
    const h = $('hstep'), v = $('v-prep');
    [h, v].forEach(x => x.classList.remove('intro')); void h.offsetWidth; [h, v].forEach(x => x.classList.add('intro'));
    setTimeout(() => [h, v].forEach(x => x.classList.remove('intro')), 400 * pasosAplican().length + 2800);
  }, 380);
});

// ───────────── Ventana para editar una empresa (principal u otras) ─────────────
const F = { nombre: 'f-nombre', razon: 'f-razon', cuit: 'f-cuit', legajos: 'f-legajos', domicilio: 'f-domicilio', tipo: 'f-tipo', conv: 'f-conv' };
let empresaEditando = null, editandoPrincipal = false;

// basico = true: solo razón social y CUIT (paso 1 de Preparación). El resto va en "Información adicional" (paso 2).
let _formBasico = false;
const _TIPO_CLI = { empresa: 'Empresa', estudio: 'Estudio contable', colegio: 'Colegio', municipalidad: 'Municipalidad' };
function abrirFormulario(e, principal, basico) {
  empresaEditando = e; editandoPrincipal = !!principal; _formBasico = !!basico;
  $('m-extra').hidden = _formBasico;
  $('m-nombre-w').hidden = _formBasico || !!principal;   // la principal usa el nombre comercial del cliente
  $(F.nombre).value = (e && e.nombre) || '';
  const ro = $('m-ro'); ro.hidden = !_formBasico;
  if (_formBasico && P.cliente) ro.innerHTML = 'Nombre comercial: <b>' + esc(P.cliente.nombre) + '</b>' + (P.cliente.tipo ? ' · Tipo: <b>' + esc(_TIPO_CLI[P.cliente.tipo] || P.cliente.tipo) + '</b>' : '');
  const base = e || {};
  $('m-titulo').textContent = principal ? 'Datos de tu empresa' : (e ? 'Editar empresa' : 'Agregar empresa');
  $('m-sub').textContent = principal ? 'Estos datos se usan para configurar tu sistema.' : 'Datos de la empresa para la que liquidás sueldos.';
  $(F.razon).value = base.razon_social || '';
  $(F.cuit).value = base.cuit || '';
  $(F.legajos).value = base.cant_legajos ?? '';
  $(F.domicilio).value = base.domicilio || '';
  opcionesTipo(F.tipo, base.tipo_empleador || '');
  CB.os.set(base.obra_social || ''); CB.art.set(base.art || ''); CB.act.set(base.actividad_principal || '');
  $(F.conv).value = base.convenios || '';
  formError('');
  $('m-fondo').hidden = false;
  (_formBasico || principal ? $(F.razon) : $(F.nombre)).focus();
}
function cerrarFormulario() { $('m-fondo').hidden = true; empresaEditando = null; }
function formError(t) { const x = $('m-error'); x.textContent = t || ''; x.hidden = !t; }
$('m-cancelar').addEventListener('click', cerrarFormulario);
$('m-fondo').addEventListener('mousedown', ev => { if (ev.target === $('m-fondo')) cerrarFormulario(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('m-fondo').hidden) cerrarFormulario(); });

$('m-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  formError('');
  const razon = $(F.razon).value.trim();
  if (!razon) { formError('Escribí la razón social.'); $(F.razon).focus(); return; }
  const c = validarCuit($(F.cuit).value);
  if (c.error) { formError(c.error); $(F.cuit).focus(); return; }
  const leg = $(F.legajos).value.trim();
  if (!_formBasico && leg && !/^\d+$/.test(leg)) { formError('La cantidad de legajos tiene que ser un número entero.'); return; }
  const fila = _formBasico ? { razon_social: razon, cuit: c.cuit } : {
    ...(editandoPrincipal ? {} : { nombre: $(F.nombre).value.trim() || null }),
    razon_social: razon, cuit: c.cuit, domicilio: $(F.domicilio).value.trim() || null,
    tipo_empleador: $(F.tipo).value.trim() || null, obra_social: CB.os.get() || null, art: CB.art.get() || null,
    actividad_principal: CB.act.get() || null, convenios: $(F.conv).value.trim() || null,
    cant_legajos: leg ? parseInt(leg, 10) : null
  };
  const btn = $('m-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
  const error = await guardarEmpresa(fila, empresaEditando ? empresaEditando.id : null, editandoPrincipal);
  btn.disabled = false; btn.textContent = 'Guardar';
  if (error) {
    formError(/uq_cliente_empresa_principal|duplicate/i.test(error.message)
      ? 'Ya hay una empresa principal cargada. Recargá la página.' : 'No se pudo guardar. Probá de nuevo en unos segundos.');
    return;
  }
  cerrarFormulario();
  toast('Datos guardados.');
  await cargarTodo(false);
});

async function borrarEmpresa(e) {
  if (!confirm('¿Querés quitar esta empresa?\n\n' + e.razon_social + '\n\nLos archivos que hayas subido quedan guardados.')) return;
  const { error } = await sb.from('cliente_empresas').delete().eq('id', e.id);
  if (error) { toast('No se pudo quitar la empresa.'); return; }
  toast('Empresa quitada.');
  await cargarTodo(false);
}
