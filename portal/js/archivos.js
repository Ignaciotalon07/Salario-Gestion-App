// ───────────── Archivos del cliente (bucket cliente-documentos, carpeta <cliente_id>/) ─────────────
// Se guardan en cliente_documentos con origen 'cliente': el equipo los ve en la pestaña Documentos de Gestión.
// El cliente puede ver y quitar SOLO lo que subió él (lo garantiza la base, no este archivo).
const MAX_ARCHIVO = 50 * 1024 * 1024;
const ACEPTA_IMG = '.png,.jpg,.jpeg';

// Filas de subida de cada paso (paso 4: logo y firma; paso 5: liquidaciones y Excel de control)
const FILAS_ARCHIVO = {
  up4: [
    { cat: 'logo', idx: 0, nombre: 'Logo', ayuda: 'Imagen PNG o JPG', accept: ACEPTA_IMG },
    { cat: 'firma', idx: 0, nombre: 'Firma', ayuda: 'Imagen PNG o JPG de la firma del empleador', accept: ACEPTA_IMG }
  ],
  up5: [
    { cat: 'liquidacion', idx: 0, nombre: 'Liquidación 1', ayuda: 'PDF de una liquidación de sueldos reciente', accept: '.pdf' },
    { cat: 'liquidacion', idx: 1, nombre: 'Liquidación 2', ayuda: 'PDF de otra liquidación, de otro mes', accept: '.pdf' },
    { cat: 'control', idx: 0, nombre: 'Excel de control', ayuda: 'El Excel con fórmulas que usan hoy (si tienen)', accept: '.xlsx,.xls,.xlsm' }
  ]
};
let subiendoA = null;   // { cat, accept } mientras se elige el archivo

const docsDe = (empId, cat) => P.docs.filter(d => d.empresa_id === empId && d.categoria === cat);
function kb(b) { return b ? (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB') : ''; }

function htmlArchivoCargado(d) {
  return `<span class="fl"><i>✓</i><b>${esc(d.nombre)}</b><em>${kb(d.tamano_bytes)}${d.tamano_bytes ? ' · ' : ''}${fmtFecha(d.created_at)}</em>
    <a data-arch="ver" data-doc="${esc(d.id)}">Ver</a><a class="q" data-arch="quitar" data-doc="${esc(d.id)}">Quitar</a></span>`;
}
// Dibuja las filas de un paso. Se llama cada vez que cambian los datos.
function renderFilasArchivo(contId) {
  const cont = $(contId);
  if (!P.principal) { cont.innerHTML = ''; return; }
  cont.innerHTML = FILAS_ARCHIVO[contId].map(f => {
    const lista = docsDe(P.principal.id, f.cat);
    const d = lista[f.idx];
    // La segunda liquidación se habilita cuando ya está la primera
    const habilitada = f.idx === 0 || lista.length >= f.idx;
    return `<div class="up"><div class="up-i"><b>${esc(f.nombre)}</b><small>${esc(f.ayuda)}</small></div>
      <div class="up-f">${d ? htmlArchivoCargado(d) : ''}</div>
      ${d || !habilitada ? '' : `<button type="button" class="btn sec sm" data-arch="subir" data-cat="${f.cat}" data-accept="${esc(f.accept)}">Subir</button>`}</div>`;
  }).join('');
}

async function subirArchivo(file) {
  const ctx = subiendoA; subiendoA = null;
  if (!ctx || !file || !P.principal) return;
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ctx.accept.split(',').includes(ext)) { toast('Ese tipo de archivo no corresponde. Subí uno de estos: ' + ctx.accept.replace(/,/g, ' ')); return; }
  if (file.size > MAX_ARCHIVO) { toast('El archivo pesa más de 50 MB. Comprimilo (por ejemplo con WinRAR) y volvé a subirlo.'); return; }
  const { data: u } = await sb.auth.getUser();
  if (!u || !u.user) { toast('Tu sesión venció. Volvé a ingresar.'); return; }
  toast('Subiendo "' + file.name + '"…');
  // Nombre seguro para Storage: sin tildes ni caracteres raros
  const seguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ruta = `${P.cliente.id}/${Date.now()}_${seguro}`;
  const { error: e1 } = await sb.storage.from('cliente-documentos').upload(ruta, file);
  if (e1) { toast('No se pudo subir el archivo.'); return; }
  const { error: e2 } = await sb.from('cliente_documentos').insert({
    cliente_id: P.cliente.id, nombre: file.name, categoria: ctx.cat, empresa_id: P.principal.id, empresa: P.principal.razon_social,
    storage_path: ruta, tipo_mime: file.type || null, tamano_bytes: file.size || null,
    origen: 'cliente', subido_por_user: u.user.id, subido_por: 'Cliente (portal)'
  });
  if (e2) { await sb.storage.from('cliente-documentos').remove([ruta]); toast('No se pudo registrar el archivo.'); return; }
  toast('Archivo subido.');
  await cargarTodo(false);
}

async function verArchivo(id) {
  const d = P.docs.find(x => x.id === id) || P.docsEquipo.find(x => x.id === id);
  if (!d) return;
  if (d.url) { window.open(d.url, '_blank', 'noopener'); return; }   // link (ej. carpeta de Drive)
  const { data, error } = await sb.storage.from('cliente-documentos').createSignedUrl(d.storage_path, 600);
  if (error || !data) { toast('No se pudo abrir el archivo.'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function quitarArchivo(id) {
  const d = P.docs.find(x => x.id === id);
  if (!d || !confirm('¿Querés quitar este archivo?\n\n' + d.nombre)) return;
  // Primero el archivo y después la fila (la regla de Storage consulta la fila)
  const { error: e1 } = await sb.storage.from('cliente-documentos').remove([d.storage_path]);
  if (e1) { toast('No se pudo quitar el archivo.'); return; }
  const { error: e2 } = await sb.from('cliente_documentos').delete().eq('id', id);
  if (e2) { toast('No se pudo quitar el archivo.'); return; }
  toast('Archivo quitado.');
  await cargarTodo(false);
}

$('i-file').addEventListener('change', ev => { const f = ev.target.files[0]; ev.target.value = ''; subirArchivo(f); });

// Un solo oyente para todas las acciones de archivos del portal (pasos 4 y 5, y "Mi empresa")
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-arch]');
  if (!b) return;
  if (b.dataset.arch === 'subir') { subiendoA = { cat: b.dataset.cat, accept: b.dataset.accept }; $('i-file').accept = b.dataset.accept; $('i-file').click(); }
  else if (b.dataset.arch === 'ver') verArchivo(b.dataset.doc);
  else if (b.dataset.arch === 'quitar') quitarArchivo(b.dataset.doc);
});
