// REGISTRAR CONSULTA
// Formulario que se completa despues de cada atencion por WhatsApp/Whaticket.
// Por ahora persiste en localStorage; mas adelante se migrara a Supabase.
//
// Cuando el asesor selecciona una solucion de la base, al guardar se le suma
// 1 al contador de usos de esa solucion. Este es el camino "real" para que
// las metricas de la base de conocimiento reflejen el uso efectivo.

let consultaSolucionId = null; // id de la solucion de la base elegida (si la hay)

// El asesor que registra una consulta SIEMPRE es el usuario logueado.
// El campo no se muestra en el form (se quito de index.html). El guardado
// toma el nombre directamente de currentMember (ver guardarConsulta).

function updateRegSubtemas() {
  const cat = document.getElementById('r-cat').value;
  const sel = document.getElementById('r-sub');
  sel.innerHTML = cat
    ? CATS[cat].sub.map(s => `<option>${s}</option>`).join('')
    : '<option>Primero elegi categoria</option>';
}

// Abre el modal de "que solucion usaste" para vincular a la consulta.
// Reutiliza el mismo modal que pendientes.
function elegirSolucionConsulta() {
  const cliente = (document.getElementById('r-cliente') || {}).value || '';
  // Si la app todavia no cargo el array de soluciones, avisar
  if (!Array.isArray(soluciones) || soluciones.length === 0) {
    alert('La base de soluciones todavía está cargando. Esperá unos segundos y volvé a intentarlo.');
    return;
  }
  abrirModalSolucionUsada({
    cliente,
    contextoDescripcion: '', // sin contexto especifico para "documentar nueva"
    mostrarDocumentar: true,
    tituloModal: '¿Qué solución aplicaste?',
    subtituloModal: `Si la solución viene de la base, elegila para sumar 1 al contador. ${cliente ? 'Cliente: <strong>' + escapeHtmlConsulta(cliente) + '</strong>' : ''}`,
    onSeleccionar: (solucionId, accion) => {
      if (accion === 'elegida' && solucionId) {
        consultaSolucionId = solucionId;
        renderSolucionElegida();
      } else if (accion === 'documentar-nueva') {
        // El modal ya se encargo de navegar a la KB; limpiamos la seleccion
        consultaSolucionId = null;
        renderSolucionElegida();
      }
      // Si fue "salto" no hacemos nada, queda como estaba
    }
  });
}

function quitarSolucionConsulta() {
  consultaSolucionId = null;
  renderSolucionElegida();
}

function renderSolucionElegida() {
  const cont = document.getElementById('r-sol-elegida');
  const solGroup = document.getElementById('r-sol-group');
  if (!cont) return;

  if (!consultaSolucionId) {
    cont.innerHTML = '';
    cont.style.display = 'none';
    // Mostrar el campo "Solucion aplicada" porque es obligatorio en este caso
    if (solGroup) solGroup.style.display = '';
    return;
  }

  const s = (soluciones || []).find(x => x.id === consultaSolucionId);
  if (!s) {
    consultaSolucionId = null;
    cont.innerHTML = '';
    cont.style.display = 'none';
    if (solGroup) solGroup.style.display = '';
    return;
  }

  const cat = (CATS[s.cat] || { label: s.cat, bg: '#eee', text: '#444' });
  cont.style.display = 'flex';
  cont.innerHTML = `
    <div class="sol-elegida__info">
      <div class="sol-elegida__title">${escapeHtmlConsulta(s.titulo)}</div>
      <div class="sol-elegida__meta">
        <span class="badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
        <span style="color:var(--text3)">${escapeHtmlConsulta(s.sub || '')} &middot; ${s.usos} uso${s.usos === 1 ? '' : 's'}</span>
      </div>
    </div>
    <button type="button" class="btn-sm" onclick="quitarSolucionConsulta()" title="Quitar la solución vinculada">✕ Quitar</button>
  `;

  // Ocultar el campo "Solucion aplicada" — ya tenemos solucion de la base
  if (solGroup) {
    solGroup.style.display = 'none';
    // Limpiamos el textarea para no mandar datos que no se van a usar
    const ta = document.getElementById('r-sol');
    if (ta) ta.value = '';
  }
}

async function guardarConsulta() {
  const cliente   = (document.getElementById('r-cliente') || {}).value || '';
  const cat       = (document.getElementById('r-cat')     || {}).value || '';
  const subtema   = (document.getElementById('r-sub')     || {}).value || '';
  const repetida  = (document.getElementById('r-rep')     || {}).value || '';
  const desc      = ((document.getElementById('r-desc')   || {}).value || '').trim();
  const solucion  = ((document.getElementById('r-sol')    || {}).value || '').trim();

  // ────────── Validaciones basicas (siempre obligatorias) ──────────
  if (!cliente)               { alert('Elegí un cliente.'); return; }
  if (!cat)                   { alert('Elegí una categoría.');  document.getElementById('r-cat').focus(); return; }
  if (!subtema || subtema.toLowerCase().includes('primero'))
                              { alert('Elegí un subtema.');     document.getElementById('r-sub').focus(); return; }

  // ────────── Logica de solucion ──────────
  // Caso A: vinculada a la base. Sumamos uso, ignoramos textarea.
  // Caso B: no vinculada. Necesitamos descripcion + solucion para crear nueva entry en la base.

  let nuevaSolucionId = null; // si creamos una nueva, su id

  if (consultaSolucionId) {
    // Caso A: ya hay solucion de la base elegida
    if (typeof incrementarUsoSolucion === 'function') {
      try {
        await incrementarUsoSolucion(consultaSolucionId);
      } catch (e) {
        console.warn('No se pudo sumar uso a la solucion', e);
      }
    }
  } else {
    // Caso B: hay que crear nueva solucion en la base
    if (!desc) {
      alert('Como no elegiste solución de la base, escribí la descripción del problema (será el título de la nueva solución).');
      const el = document.getElementById('r-desc'); if (el) el.focus();
      return;
    }
    if (!solucion) {
      alert('Como no elegiste solución de la base, completá el campo "Solución aplicada" — esos pasos se guardan en la base.');
      const el = document.getElementById('r-sol'); if (el) el.focus();
      return;
    }

    const pasos = solucion.split('\n')
      .map(p => p.replace(/^\s*paso\s*\d+\s*[:\.\-]?\s*/i, '').trim())
      .filter(p => p.length > 0);
    if (pasos.length === 0) {
      alert('Escribí al menos un paso de la solución (uno por línea).');
      const el = document.getElementById('r-sol'); if (el) el.focus();
      return;
    }

    const autor = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
    const tituloSolucion = desc.length > 200 ? desc.substring(0, 197) + '...' : desc;

    try {
      const inserted = await dbInsert('soluciones', {
        titulo:   tituloSolucion,
        cat:      cat,
        sub:      subtema,
        pasos:    pasos,
        material: 'Sin material',
        aplica:   'Todos',
        autor:    autor,
        usos:     1   // ya cuenta esta primera aplicacion
      });
      nuevaSolucionId = inserted.id;
      // El realtime de kb.js va a refrescar el array global automaticamente
    } catch (e) {
      console.error('Error creando solucion', e);
      alert('No se pudo guardar la solución en la base: ' + e.message + '\n\nLa consulta tampoco se guardó. Probá de nuevo.');
      return;
    }
  }

  // ────────── Persistencia de la consulta (localStorage por ahora) ──────────
  // El asesor SIEMPRE es el usuario logueado, no se lee del DOM
  const asesor = (typeof currentMember !== 'undefined' && currentMember) ? currentMember.nombre : 'Equipo';
  const consultas = storageLoad(STORAGE_KEYS.CONSULTAS, []);
  consultas.push({
    id:          Date.now(),
    cliente,
    asesor,
    categoria:   cat,
    subtema,
    repetida,
    descripcion: desc,
    solucion:    solucion,
    solucion_id: consultaSolucionId || nuevaSolucionId || null,
    timestamp:   new Date().toISOString()
  });
  storageSave(STORAGE_KEYS.CONSULTAS, consultas);

  // ────────── Reset del form ──────────
  consultaSolucionId = null;
  renderSolucionElegida();
  if (document.getElementById('r-desc')) document.getElementById('r-desc').value = '';
  if (document.getElementById('r-sol'))  document.getElementById('r-sol').value  = '';

  const ok = document.getElementById('reg-ok');
  if (ok) {
    ok.style.display = 'flex';
    if (nuevaSolucionId) {
      ok.innerHTML = '<strong>Consulta guardada.</strong>Se agregó una nueva solución a la base de conocimiento.';
    } else {
      ok.innerHTML = '<strong>Consulta guardada.</strong>Se sumó 1 al contador de la solución vinculada.';
    }
    setTimeout(() => ok.style.display = 'none', 4000);
  }
  toast(nuevaSolucionId ? 'Consulta guardada y nueva solución agregada a la base' : 'Consulta guardada correctamente');
}

function escapeHtmlConsulta(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
