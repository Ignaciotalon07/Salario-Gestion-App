// REPORTE SEMANAL DE IMPLEMENTACIÓN (PDF para enviar al cliente)
//
// Genera un PDF estandarizado por cliente con:
//   1) Texto automático: resumen de avance, qué se completó esta semana
//      (marcando si se terminó antes/después de lo planeado), qué sigue
//      (marcando si es tarea del cliente o nuestra), y atrasos (si hay).
//   2) El diagrama de Gantt tal como se ve en pantalla (capturado con
//      html2canvas, leyenda de colores incluida), paginado si no entra en
//      una sola hoja.
//   3) Notas adicionales opcionales que carga el asesor, debajo del Gantt.
//
// Todas las hojas del PDF son horizontales (landscape), para que el Gantt
// entre cómodo y no haya que rotar el documento a mitad de lectura.
//
// El texto se arma solo a partir de datos que la app ya calcula
// (calcularSemaforo, calcularETACliente, isTareaVencida, etc. en
// implementacion.js) — no requiere carga manual, así que queda parejo
// entre clientes.

let _rimplClienteId = null;

const RIMPL_RESP_LABELS = { cliente: 'Cliente', equipo: 'Equipo Salario', ambos: 'Equipo Salario y Cliente' };
function _rimplRespLabel(t) {
  return RIMPL_RESP_LABELS[t.responsable_tipo] || 'Equipo Salario';
}

// ────────── Modal ──────────

function abrirModalReporteImpl(clienteId, event) {
  if (event) event.stopPropagation();
  const cliente = (typeof clientes !== 'undefined') ? clientes.find(c => c.id === clienteId) : null;
  if (!cliente) return;

  _rimplClienteId = clienteId;

  const nombreEl = document.getElementById('rimpl-cliente-nombre');
  if (nombreEl) nombreEl.textContent = cliente.nombre;
  const notasEl = document.getElementById('rimpl-notas');
  if (notasEl) notasEl.value = '';

  const modal = document.getElementById('modal-reporte-impl');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function cerrarModalReporteImpl() {
  const modal = document.getElementById('modal-reporte-impl');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  _rimplClienteId = null;
}

// ────────── Texto automático ──────────

// Frases según el label que devuelve calcularSemaforo() (implementacion.js).
const _RIMPL_FRASES_SEMAFORO = {
  'Completado':  'La implementación fue completada en su totalidad.',
  'En tiempo':   'El proyecto viene avanzando en buen ritmo, dentro de los tiempos planeados.',
  'Buen ritmo':  'El proyecto viene avanzando en buen ritmo.',
  'Justo':       'Estamos un poco justos de tiempo respecto al objetivo, pero seguimos avanzando semana a semana.',
  'Ritmo lento': 'El ritmo de avance es un poco más lento de lo planeado.',
  'En riesgo':   'El proyecto está con atraso respecto a la fecha objetivo planteada.',
  'Atrasado':    'El proyecto viene atrasado respecto al ritmo esperado.',
  'Sin datos':   'Todavía no tenemos una fecha objetivo configurada para poder estimar el ritmo del proyecto.',
  'Sin fechas':  'Todavía no configuramos la fecha de inicio del proyecto.',
};

function _rimplTextoResumen(cliente, tareasCliente, progreso, semaforo, eta) {
  const lineas = [];
  lineas.push(`La implementación de ${cliente.nombre} lleva un ${progreso}% de avance.`);

  const frase = _RIMPL_FRASES_SEMAFORO[semaforo.label];
  if (frase) lineas.push(frase);

  if (progreso < 100 && eta && eta.fechaFin) {
    lineas.push(`Estimamos finalizar la implementación el ${formatFechaImpl(eta.fechaFin)}.`);
  }

  return lineas;
}

// Para una tarea completada, compara duración planeada vs real (misma lógica
// que usa el propio Gantt para pintar la barra verde con o sin extensión
// naranja) y devuelve una frase corta para sumar al ítem del reporte, o ''
// si no hay diferencia / no hay datos suficientes para calcularla.
function _rimplNotaTiempoCompletada(t) {
  if (!t.fecha_inicio_calc || !t.fecha_completada) return '';
  const durPlaneada = Math.max(1, t.duracion_dias || 1);
  const inicio = startOfDay(_parseDate(t.fecha_inicio_calc));
  const fc     = startOfDay(_parseDate(t.fecha_completada));
  const diasReal = Math.max(1, diasEntre(inicio, fc) + 1);

  if (diasReal < durPlaneada) {
    const diff = durPlaneada - diasReal;
    return ` (terminada ${diff} día${diff !== 1 ? 's' : ''} antes de lo esperado)`;
  }
  if (diasReal > durPlaneada) {
    const diff = diasReal - durPlaneada;
    return ` (con ${diff} día${diff !== 1 ? 's' : ''} de atraso respecto a lo planeado)`;
  }
  return ' (completada justo en el tiempo planeado)';
}

// ────────── Captura del Gantt (html2canvas) ──────────

async function _rimplCapturarGantt(clienteId) {
  if (typeof html2canvas === 'undefined') return null;

  const vistaOriginal = getVistaCliente(clienteId);
  const cambioVista = vistaOriginal !== 'gantt';
  if (cambioVista) setVistaCliente(clienteId, 'gantt');

  // Esperar a que el DOM termine de re-renderizarse
  await new Promise(r => setTimeout(r, 80));

  const cardEl = document.querySelector(`.impl-cliente-card[data-cliente-id="${clienteId}"]`);
  // Capturamos el .gantt-container completo (no solo .gantt-scroll) para
  // que la leyenda de colores que ya dibuja la app quede incluida.
  const ganttEl  = cardEl ? cardEl.querySelector('.gantt-container') : null;
  const scrollEl = ganttEl ? ganttEl.querySelector('.gantt-scroll') : null;

  let canvas = null;
  if (ganttEl && scrollEl) {
    // .gantt-scroll recorta el cronograma con scroll horizontal (solo se ve
    // lo que entra en el ancho de la card) y .gantt-container recorta bordes
    // redondeados con overflow:hidden. Si capturamos tal cual, html2canvas
    // solo saca la parte visible en pantalla, no el diagrama completo. Para
    // que salga entero, mostramos todo el contenido sin recorte justo antes
    // de sacar la foto, y lo dejamos como estaba apenas termina.
    const prevContainerOverflow = ganttEl.style.overflow;
    const prevScrollOverflowX   = scrollEl.style.overflowX;
    const prevScrollWidth       = scrollEl.style.width;

    ganttEl.style.overflow    = 'visible';
    scrollEl.style.overflowX  = 'visible';
    scrollEl.style.width      = scrollEl.scrollWidth + 'px';

    try {
      const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
      canvas = await html2canvas(ganttEl, {
        backgroundColor: bg,
        scale: 1.5,
        width: ganttEl.scrollWidth,
        windowWidth: ganttEl.scrollWidth,
      });
    } catch (e) {
      console.warn('No se pudo capturar el Gantt', e);
    } finally {
      ganttEl.style.overflow   = prevContainerOverflow;
      scrollEl.style.overflowX = prevScrollOverflowX;
      scrollEl.style.width     = prevScrollWidth;
    }
  }

  if (cambioVista) setVistaCliente(clienteId, vistaOriginal);

  return canvas;
}

// Dibuja un canvas (potencialmente más alto que una página) paginado dentro
// del doc, escalado al ancho útil de la página. Todas las páginas que agrega
// son horizontales (landscape), igual que el resto del documento.
function _rimplAgregarCanvasPaginado(doc, canvas, margin) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const scale = usableW / canvas.width;
  const pageHeightInCanvasPx = Math.max(1, Math.floor(usableH / scale));

  let renderedHeight = 0;
  let first = true;
  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageHeightInCanvasPx, canvas.height - renderedHeight);

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width  = canvas.width;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const imgData = sliceCanvas.toDataURL('image/png');
    if (!first) doc.addPage('a4', 'landscape');
    doc.addImage(imgData, 'PNG', margin, margin, usableW, sliceHeight * scale);
    first = false;
    renderedHeight += sliceHeight;
  }
}

// ────────── Generación del PDF ──────────

async function generarReporteImplPDF() {
  const clienteId = _rimplClienteId;
  const cliente = (typeof clientes !== 'undefined') ? clientes.find(c => c.id === clienteId) : null;
  if (!cliente) return;

  if (typeof window.jspdf === 'undefined') {
    alert('No se pudo cargar la librería de exportación a PDF. Revisá tu conexión e intentá de nuevo.');
    return;
  }

  const btn = document.getElementById('rimpl-btn-generar');
  const textoOriginalBtn = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  try {
    const notas = ((document.getElementById('rimpl-notas') || {}).value || '').trim();
    const tareasCliente = (typeof implTareas !== 'undefined') ? implTareas.filter(t => t.cliente_id === clienteId) : [];

    // Capturar el Gantt ANTES de armar el PDF (implica forzar la vista a
    // 'gantt' momentáneamente si el cliente estaba en vista de Lista).
    const ganttCanvas = await _rimplCapturarGantt(clienteId);

    const { jsPDF } = window.jspdf;
    // Todo el documento en horizontal.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 44;
    let y = margin;

    // Si estamos por escribir cerca del borde inferior, salta a una página nueva.
    const checkPageBreak = (alturaNecesaria) => {
      if (y + alturaNecesaria > pageH - margin) {
        doc.addPage('a4', 'landscape');
        y = margin;
      }
    };

    // ── Encabezado ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(20);
    doc.text('Reporte Semanal de Implementación', pageW / 2, y, { align: 'center' }); y += 24;

    doc.setFontSize(12);
    doc.setTextColor(60);
    doc.text(`Cliente: ${cliente.nombre}`, margin, y); y += 18;

    const hoy = new Date();
    // Semana laboral lunes → viernes: el reporte siempre arranca en el
    // lunes de la semana actual, sea cual sea el día en que se genere
    // (getDay(): 0=domingo...6=sábado).
    const diaSemana = hoy.getDay();
    const offsetDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - offsetDesdeLunes);
    inicioSemana.setHours(0, 0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Semana del ${formatFechaImpl(inicioSemana)} al ${formatFechaImpl(hoy)}`, margin, y);
    y += 26;

    // ── Datos calculados (mismas fórmulas que usa la app) ──
    const total = tareasCliente.length;
    const completadas = tareasCliente.filter(t => t.estado === 'completada').length;
    const progreso = total > 0 ? Math.round((completadas / total) * 100) : 0;
    const semaforo = calcularSemaforo(cliente, tareasCliente, progreso);
    const eta = calcularETACliente(tareasCliente);

    const seccion = (titulo, colorTitulo) => {
      checkPageBreak(30);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(colorTitulo ? colorTitulo[0] : 20, colorTitulo ? colorTitulo[1] : 20, colorTitulo ? colorTitulo[2] : 20);
      doc.text(titulo, margin, y);
      y += 17;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(70);
    };

    const parrafo = (texto, ancho) => {
      const wrapped = doc.splitTextToSize(texto, ancho || (pageW - margin * 2));
      checkPageBreak(wrapped.length * 13 + 5);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 13 + 5;
    };

    const item = (texto, ancho) => {
      const wrapped = doc.splitTextToSize('•  ' + texto, ancho || (pageW - margin * 2));
      checkPageBreak(wrapped.length * 13 + 3);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 13 + 3;
    };

    // Resumen
    seccion('Resumen');
    _rimplTextoResumen(cliente, tareasCliente, progreso, semaforo, eta).forEach(t => parrafo(t));

    // Esta semana completamos — marcando si terminó antes/después de lo planeado
    seccion('Esta semana completamos');
    const completadasSemana = tareasCliente.filter(t =>
      t.estado === 'completada' && t.fecha_completada && new Date(t.fecha_completada) >= inicioSemana
    );
    if (completadasSemana.length === 0) {
      parrafo('No se marcaron tareas como completadas esta semana.');
    } else {
      completadasSemana.forEach(t => {
        item(`${t.tarea}  [${_rimplRespLabel(t)}]${_rimplNotaTiempoCompletada(t)}`);
      });
    }

    // Lo que sigue — marcando si es tarea del cliente, de nuestro equipo, o de ambos
    seccion('Lo que sigue');
    const pendientesOrdenadas = tareasCliente
      .filter(t => t.estado !== 'completada' && t.fecha_estimada)
      .sort((a, b) => new Date(a.fecha_estimada) - new Date(b.fecha_estimada))
      .slice(0, 5);
    if (pendientesOrdenadas.length === 0) {
      parrafo('No hay próximas tareas con fecha definida todavía.');
    } else {
      pendientesOrdenadas.forEach(t => {
        item(`${t.tarea}  [${_rimplRespLabel(t)}] — ${formatFechaImpl(t.fecha_estimada)}`);
      });
    }

    // Atención (atrasos) — solo si hay, para no meter ruido negativo si no corresponde
    const vencidas = tareasCliente.filter(t => isTareaVencida(t));
    if (vencidas.length > 0) {
      seccion('Atención', [180, 55, 45]);
      vencidas.forEach(t => {
        const dias = diasDesdeVencimiento(t);
        item(`${t.tarea}  [${_rimplRespLabel(t)}] — ${dias} día${dias !== 1 ? 's' : ''} de atraso`);
      });
    }

    // ── Gantt ──
    if (ganttCanvas) {
      doc.addPage('a4', 'landscape');
      _rimplAgregarCanvasPaginado(doc, ganttCanvas, margin);
    }

    // ── Notas opcionales (debajo del Gantt) ──
    // La explicación de colores/líneas ya va incluida en la imagen del Gantt:
    // es la leyenda que dibuja la propia app debajo del diagrama.
    if (notas) {
      doc.addPage('a4', 'landscape');
      y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text('Notas', margin, y); y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(60);
      parrafo(notas);
    }

    const nombreArchivo = `reporte_${cliente.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${hoy.toISOString().slice(0, 10)}.pdf`;
    doc.save(nombreArchivo);
    cerrarModalReporteImpl();
  } catch (e) {
    console.error('Error generando el reporte de implementación', e);
    alert('No se pudo generar el PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn || 'Descargar PDF'; }
  }
}
