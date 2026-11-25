// ════════════════════════════════════════════════════════════════════
// REPORTE PDF DE DISPONIBILIDAD (Implementación → Disponibilidad)
// Informe prolijo que responde: ¿dónde puedo meter un cliente nuevo, dónde no y por qué?
// Usa los mismos cálculos que el Gantt (_dispDatos, _dispCargaDia, _dispCapDia,
// _dispSugerirFecha), así el PDF y la pantalla siempre coinciden.
// Requiere jsPDF + jspdf-autotable (CDN en index.html).
// ════════════════════════════════════════════════════════════════════

// Fecha completa dd/mm/aaaa
function _drpFecha(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function _drpDiasTxt(n) { return `${n} día${n !== 1 ? 's' : ''}`; }
// Duración legible: "2 meses y 1 semana" aproximado en días para claridad
function _drpDurTxt(n) {
  if (n < 45) return _drpDiasTxt(n);
  return `${_drpDiasTxt(n)} (~${Math.round(n / 30)} meses)`;
}

// Recorre los próximos `horizonte` días y arma tramos seguidos "con lugar" / "completo".
function _drpTramos(items, cap, horizonte) {
  const hoy = _dispHoy();
  const dias = [];
  for (let i = 0; i < horizonte; i++) {
    const d = _addDays(hoy, i);
    const carga = _dispCargaDia(items, d);
    const capD = _dispCapDia(cap, d);
    dias.push({ d, carga, capD, libres: capD - carga });
  }
  const tramos = [];
  dias.forEach(x => {
    const libre = x.libres >= 1;
    const ult = tramos[tramos.length - 1];
    if (ult && ult.libre === libre) { ult.fin = x.d; ult.dias.push(x); }
    else tramos.push({ libre, ini: x.d, fin: x.d, dias: [x] });
  });
  return tramos;
}

// Motivo por el que un tramo está completo: quién ocupa los lugares, estructuración y ausencias
function _drpMotivoTramo(t, items, cap) {
  const ocupan = items.filter(it => it.inicio && it.fin && it.inicio <= t.fin && it.fin >= t.ini && !it.finalizado);
  const nombres = ocupan.map(it => String(it.c.nombre).replace(/^🧩\s*/, 'Proyecto: '));
  const partes = [];
  if (nombres.length) partes.push('En curso: ' + nombres.slice(0, 5).join(', ') + (nombres.length > 5 ? ` y ${nombres.length - 5} más` : ''));
  const estruct = t.dias.some(x => _dispEstructActiva(x.d));
  if (estruct) partes.push('Estructuración interna ocupa 1 lugar');
  // Ausencias
  const faltan = new Set(), cubren = new Set();
  t.dias.forEach(x => {
    if (x.capD < cap && typeof ausCoberturaDia === 'function') {
      const c = ausCoberturaDia(_toISODate(x.d));
      c.implFalta.forEach(n => faltan.add(n.split(' ')[0]));
      c.cubren.forEach(n => cubren.add(n.split(' ')[0]));
    }
  });
  if (faltan.size || cubren.size) {
    const a = [];
    if (faltan.size) a.push('falta ' + [...faltan].join(' y '));
    if (cubren.size) a.push([...cubren].join(' y ') + ' cubre Soporte');
    partes.push('Capacidad reducida por ausencias (' + a.join(', ') + ')');
  }
  // Cuál termina justo cuando se libera el lugar
  const liberan = items.filter(it => it.fin && !it.finalizado && +it.fin === +t.fin).map(it => String(it.c.nombre).replace(/^🧩\s*/, ''));
  return { texto: partes.join('. ') + '.', liberan };
}

async function dispGenerarReportePDF() {
  if (typeof window.jspdf === 'undefined') { alert('No se pudo cargar la librería de PDF. Revisá tu conexión e intentá de nuevo.'); return; }

  try {
    const { jsPDF } = window.jspdf;
    const logo = (typeof _repCargarLogo === 'function') ? await _repCargarLogo() : null;
    const NARANJA = [245, 158, 11], NARANJA_OSC = [217, 119, 6], CARBON = [48, 48, 52];
    const VERDE = [22, 163, 74], ROJO = [200, 50, 45], GRIS = [90, 90, 85];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 44;
    const anchoUtil = pageW - margin * 2;
    let y = margin;
    const nuevaHoja = () => { doc.addPage('a4', 'landscape'); y = margin; };
    const checkPageBreak = (alto) => { if (y + alto > pageH - margin) nuevaHoja(); };

    // ── Datos (mismos que el Gantt) ──
    const hoy = _dispHoy();
    const cap = _dispCapacidadManual() || DISP_CAPACIDAD_DEFAULT;
    const todos = _dispDatos();
    const conFechas = todos.filter(i => !i.sinFechas);
    const enCurso = conFechas.filter(i => !i.finalizado && i.estado !== 'porArrancar');
    const porArrancar = conFechas.filter(i => i.estado === 'porArrancar');
    const atrasados = enCurso.filter(i => i.estado === 'atrasado');
    const proyectosAct = conFechas.filter(i => i.esProyecto && !i.finalizado);
    const terminadas = conFechas.filter(i => i.finalizado && i.inicio && i.fin);
    const durProm = terminadas.length
      ? Math.round(terminadas.reduce((s, i) => s + Math.max(1, _dispDias(i.inicio, i.fin)), 0) / terminadas.length) : 60;
    const estructActiva = estructTareas.filter(t => t.estado !== 'hecha').length;

    const cargaHoy = _dispCargaDia(conFechas, hoy);
    const capHoy = _dispCapDia(cap, hoy);
    const libresHoy = capHoy - cargaHoy;

    const HORIZ = 365;
    const tramos = _drpTramos(conFechas, cap, HORIZ);
    const tramosLibres = tramos.filter(t => t.libre);
    const tramosCompletos = tramos.filter(t => !t.libre);
    const hastaHorizonte = t => +t.fin === +_addDays(hoy, HORIZ - 1);

    // Cuándo puede arrancar un cliente según su duración
    const duraciones = [...new Set([30, 60, 90, durProm])].sort((a, b) => a - b);
    const arranques = duraciones.map(dur => ({ dur, fecha: _dispSugerirFecha(conFechas, dur, cap), esProm: dur === durProm }));
    const arranqueProm = arranques.find(a => a.esProm).fecha;

    // Primer lugar que se libera (si hoy está completo)
    const primerCompleto = tramos[0] && !tramos[0].libre ? tramos[0] : null;
    const liberacion = primerCompleto ? _drpMotivoTramo(primerCompleto, conFechas, cap) : null;

    // ── Encabezado ──
    if (logo && logo.img.naturalWidth) {
      const logoH = 95, logoX = -8, logoY = -6;
      const logoW = logoH * (logo.img.naturalWidth / logo.img.naturalHeight);
      doc.addImage(logo.img, logo.formato, logoX, logoY, logoW, logoH);
    }
    doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(...CARBON);
    doc.text('Informe de Disponibilidad', pageW - margin, 44, { align: 'right' });
    doc.setFont('times', 'italic'); doc.setFontSize(12); doc.setTextColor(110);
    doc.text('Implementación — ¿dónde entra un cliente nuevo?', pageW - margin, 62, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    const etiqueta = 'Datos al ' + _drpFecha(hoy);
    const etW = doc.getTextWidth(etiqueta) + 26;
    doc.setFillColor(...NARANJA); doc.roundedRect(pageW - margin - etW, 74, etW, 22, 11, 11, 'F');
    doc.setTextColor(255, 255, 255); doc.text(etiqueta, pageW - margin - etW / 2, 88.5, { align: 'center' });
    y = 118;
    doc.setDrawColor(...NARANJA); doc.setLineWidth(1.4); doc.line(margin, y, pageW - margin, y);
    y += 24;

    // ── Helpers de dibujo ──
    const parrafo = (texto, size = 10) => {
      const w = doc.splitTextToSize(texto, anchoUtil);
      checkPageBreak(w.length * 14 + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(70);
      doc.text(w, margin, y); y += w.length * 14 + 8;
    };
    const tituloSeccion = (num, texto) => {
      checkPageBreak(60);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NARANJA);
      doc.text(num, margin, y);
      doc.setFontSize(11); doc.setTextColor(...CARBON);
      doc.text(texto.toUpperCase(), margin + 30, y, { charSpace: 0.7 });
      doc.setDrawColor(228, 225, 218); doc.setLineWidth(0.8); doc.line(margin, y + 8, margin + anchoUtil, y + 8);
      y += 24;
    };
    const tabla = (head, body, colorHead, cols, opts = {}) => {
      doc.autoTable({
        startY: y, head: [head], body,
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [235, 231, 222], lineWidth: 0.5, textColor: [60, 60, 60], valign: 'middle' },
        headStyles: { fillColor: colorHead, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 247, 241] },
        margin: { left: margin, right: margin, bottom: margin + 10 },
        columnStyles: cols,
        didParseCell: opts.didParseCell,
      });
      y = doc.lastAutoTable.finalY + 22;
    };
    const tarjetaHero = (x, w, h, color, label, grande, detalle, nota) => {
      doc.setFillColor(255, 251, 242); doc.setDrawColor(238, 228, 208); doc.setLineWidth(0.8);
      doc.rect(x, y, w, h, 'FD');
      doc.setFillColor(...color); doc.rect(x, y, w, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(130);
      doc.text(label, x + 16, y + 26, { charSpace: 0.6 });
      doc.setFontSize(30); doc.setTextColor(...color);
      doc.text(grande, x + 16, y + 68);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
      doc.text(doc.splitTextToSize(detalle, w - 32).slice(0, 2), x + 16, y + 86);
      if (nota) { doc.setFontSize(8); doc.setTextColor(150); doc.text(doc.splitTextToSize(nota, w - 32)[0], x + 16, y + h - 10); }
    };
    const tile = (x, w, h, valor, label) => {
      doc.setDrawColor(232, 228, 218); doc.setLineWidth(0.8); doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NARANJA);
      doc.text(valor, x + 12, y + 26);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
      doc.text(label, x + 12, y + 41, { charSpace: 0.4 });
    };

    // ══════════ PÁGINA 1 — Resumen ══════════
    // Veredicto en una frase
    let veredicto, colorVer;
    if (libresHoy >= 1) {
      const t0 = tramos[0];
      const finT = hastaHorizonte(t0) ? 'durante los próximos 12 meses' : `hasta el ${_drpFecha(t0.fin)}`;
      veredicto = `Hoy hay ${libresHoy} lugar${libresHoy !== 1 ? 'es' : ''} libre${libresHoy !== 1 ? 's' : ''} de ${capHoy}: se puede arrancar un cliente nuevo ahora mismo. La ventana actual se mantiene ${finT}.`;
      colorVer = VERDE;
    } else {
      veredicto = `Hoy el equipo está completo (${cargaHoy > capHoy ? `${cargaHoy} clientes para ${capHoy} lugares` : `${cargaHoy} de ${capHoy} lugares ocupados`}). El próximo lugar se libera el ${_drpFecha(_addDays(primerCompleto ? primerCompleto.fin : hoy, 1))}`
        + (liberacion && liberacion.liberan.length ? `, cuando termina ${liberacion.liberan.join(' y ')}` : '')
        + (arranqueProm ? `. Un cliente de ${_drpDiasTxt(durProm)} podría arrancar desde el ${_drpFecha(arranqueProm)}.` : '. No se encontró una fecha con lugar en los próximos 2 años.');
      colorVer = ROJO;
    }
    // Banner del veredicto
    {
      // Primero se fija la fuente: si no, el texto se parte con otro tamaño y se sale del recuadro
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const lineas = doc.splitTextToSize(veredicto, anchoUtil - 48);
      const h = lineas.length * 14 + 20;
      doc.setFillColor(...colorVer.map(c => Math.round(c + (255 - c) * 0.9)));
      doc.setDrawColor(...colorVer); doc.setLineWidth(0.8);
      doc.rect(margin, y, anchoUtil, h, 'FD');
      doc.setFillColor(...colorVer); doc.rect(margin, y, 6, h, 'F');
      doc.setTextColor(...CARBON);
      doc.text(lineas, margin + 20, y + 18);
      y += h + 18;
    }

    // Tarjetas destacadas
    const gap = 16, cw = (anchoUtil - gap * 2) / 3, ch = 118;
    tarjetaHero(margin, cw, ch, libresHoy >= 1 ? VERDE : ROJO, 'LUGARES LIBRES HOY',
      `${Math.max(0, libresHoy)} de ${capHoy}`,
      libresHoy >= 1 ? 'Se puede arrancar un cliente nuevo ya.' : 'No hay lugar hoy para un cliente nuevo.',
      capHoy < cap ? `Capacidad reducida hoy (máx. ${cap}) por ausencias` : `Capacidad máxima: ${cap} implementaciones simultáneas`);
    tarjetaHero(margin + cw + gap, cw, ch, NARANJA, 'PRIMER INICIO POSIBLE',
      arranqueProm ? (+arranqueProm === +hoy ? 'Hoy' : _drpFecha(arranqueProm)) : 'Sin fecha',
      `Para un cliente de ${_drpDiasTxt(durProm)} (duración promedio${terminadas.length ? ' de las terminadas' : ' estándar'}).`,
      'Que entre completo, sin pasar la capacidad');
    tarjetaHero(margin + (cw + gap) * 2, cw, ch, CARBON, 'EN CURSO AHORA',
      String(enCurso.length),
      `${porArrancar.length} por arrancar · ${proyectosAct.length} proyecto${proyectosAct.length !== 1 ? 's' : ''} · estructuración interna ${estructActiva ? 'activa' : 'sin tareas'}`,
      atrasados.length ? `${atrasados.length} atrasado${atrasados.length !== 1 ? 's' : ''}` : 'Ninguno atrasado');
    y += ch + 30;

    // Cuándo puede arrancar según la duración
    tituloSeccion('01', 'Cuándo puede arrancar un cliente nuevo');
    parrafo('Primera fecha en la que entra una implementación completa, sin pasar la capacidad en ningún día de su duración. Cuanto más larga la implementación, más difícil que encuentre una ventana libre.');
    tabla(['Duración de la implementación', 'Primer inicio posible', 'Termina aprox.', 'Observación'],
      arranques.map(a => [
        _drpDurTxt(a.dur) + (a.esProm ? '  (promedio)' : ''),
        a.fecha ? (+a.fecha === +hoy ? 'Hoy' : _drpFecha(a.fecha)) : 'Sin lugar en 2 años',
        a.fecha ? _drpFecha(_addDays(a.fecha, a.dur - 1)) : '—',
        !a.fecha ? 'No hay ventana libre suficiente.'
          : (+a.fecha === +hoy ? 'Se puede arrancar ya.' : `Hay que esperar ${_drpDiasTxt(_dispDias(hoy, a.fecha))}.`),
      ]), NARANJA, { 0: { cellWidth: 190 }, 1: { cellWidth: 130 }, 2: { cellWidth: 110 } });

    // ══════════ PÁGINA 2 — Dónde sí / dónde no ══════════
    nuevaHoja();
    tituloSeccion('02', 'Dónde sí entra un cliente nuevo');
    const libresFut = tramosLibres.slice(0, 8);
    if (!libresFut.length) {
      parrafo('En los próximos 12 meses no hay ningún período con lugar libre.');
    } else {
      tabla(['Desde', 'Hasta', 'Duración', 'Lugares libres', 'Qué entra'],
        libresFut.map(t => {
          const largo = t.dias.length, min = Math.min(...t.dias.map(x => x.libres));
          const sinFin = hastaHorizonte(t);
          const ultimoInicio = _addDays(t.fin, -(durProm - 1));
          return [
            +t.ini === +hoy ? 'Hoy' : _drpFecha(t.ini),
            sinFin ? 'Más allá de 12 meses' : _drpFecha(t.fin),
            _drpDiasTxt(largo),
            String(min),
            sinFin || largo >= durProm
              ? `Entra una implementación de ${_drpDiasTxt(durProm)}${sinFin ? '' : ` si arranca hasta el ${_drpFecha(ultimoInicio)}`}.`
              : `Solo ${_drpDiasTxt(largo)}: no alcanza para una implementación completa (${_drpDiasTxt(durProm)}).`,
          ];
        }), VERDE, { 0: { cellWidth: 80 }, 1: { cellWidth: 110 }, 2: { cellWidth: 70 }, 3: { cellWidth: 80, halign: 'center' } });
    }

    tituloSeccion('03', 'Dónde no entra y por qué');
    const compFut = tramosCompletos.slice(0, 8);
    if (!compFut.length) {
      parrafo('No hay períodos completos en los próximos 12 meses: siempre queda al menos un lugar libre.');
    } else {
      tabla(['Desde', 'Hasta', 'Se libera', 'Por qué está completo'],
        compFut.map(t => {
          const m = _drpMotivoTramo(t, conFechas, cap);
          const sinFin = hastaHorizonte(t);
          return [
            +t.ini === +hoy ? 'Hoy' : _drpFecha(t.ini),
            sinFin ? 'Más allá de 12 meses' : _drpFecha(t.fin),
            sinFin ? '—' : _drpFecha(_addDays(t.fin, 1)) + (m.liberan.length ? `\nTermina: ${m.liberan.join(', ')}` : ''),
            m.texto,
          ];
        }), ROJO, { 0: { cellWidth: 80 }, 1: { cellWidth: 110 }, 2: { cellWidth: 150 } });
    }

    tituloSeccion('04', 'Clientes y proyectos que ocupan lugar');
    const ocupan = conFechas.filter(i => !i.finalizado).sort((a, b) => a.fin - b.fin);
    const ETQ = { atrasado: 'Atrasado', tiempo: 'En tiempo', adelantado: 'Adelantado', porArrancar: 'Por arrancar' };
    if (!ocupan.length) parrafo('No hay clientes ni proyectos en curso.');
    else {
      tabla(['Cliente / proyecto', 'Inicio', 'Fin estimado', 'Libera lugar', 'Avance', 'Estado'],
        ocupan.map(i => [
          String(i.c.nombre).replace(/^🧩\s*/, 'Proyecto: '),
          _drpFecha(i.inicio), _drpFecha(i.fin), _drpFecha(_addDays(i.fin, 1)),
          i.progreso + '%', ETQ[i.estado] || i.estado,
        ]), NARANJA_OSC,
        { 4: { halign: 'center', cellWidth: 60 }, 5: { cellWidth: 80, fontStyle: 'bold' } },
        { didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = d.cell.raw === 'Atrasado' ? ROJO : d.cell.raw === 'Por arrancar' ? GRIS : VERDE;
        } });
    }


    // ══════════ PÁGINA 3 — Panorama mensual ══════════
    nuevaHoja();
    tituloSeccion('05', 'Panorama mensual (próximos 12 meses)');
    const filasMes = [];
    for (let m = 0; m < 12; m++) {
      const ini = _dispSumarMeses(_dispPrimeroDeMes(hoy), m);
      const info = _dispMesInfo(conFechas, ini, null, cap);
      const estado = info.libres >= 1 ? 'Con lugar' : (info.libres === 0 ? 'Completo' : 'Sobrecargado');
      let obs = '';
      if (info.reducida) obs = 'Capacidad baja a ' + info.capMin + ': ' + (_dispMotivoReduccion(ini, cap) || 'ausencias');
      else if (info.libres < 0) obs = 'Hay más clientes que capacidad.';
      filasMes.push([`${DISP_MESES[ini.getMonth()]} ${ini.getFullYear()}`, String(info.pico), String(info.cap), String(Math.max(0, info.libres)), estado, obs]);
    }
    tabla(['Mes', 'Carga pico', 'Capacidad', 'Lugares libres', 'Estado', 'Observación'], filasMes, GRIS,
      { 1: { halign: 'center', cellWidth: 70 }, 2: { halign: 'center', cellWidth: 70 }, 3: { halign: 'center', cellWidth: 80 }, 4: { cellWidth: 90, fontStyle: 'bold' } },
      { didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 4) {
          d.cell.styles.textColor = d.cell.raw === 'Con lugar' ? VERDE : ROJO;
        }
      } });
    parrafo('Carga pico = día con más clientes simultáneos del mes. "Lugares libres" se mide en el día más ajustado del mes: un mes "Con lugar" puede tener días completos; usá las ventanas de la sección 02 para fechas exactas.', 8.5);

    // Notas metodológicas
    checkPageBreak(70);
    parrafo(`Cómo se calcula: la capacidad máxima es de ${cap} implementaciones simultáneas${capHoy < cap ? ' (hoy reducida por ausencias)' : ''}, y baja en proporción cuando falta un implementador (cargado en Equipo > Ausencias). Cada cliente, cada proyecto y la estructuración interna (mientras tenga tareas activas) ocupan 1 lugar. El fin de cada cliente es la fecha estimada de su última tarea pendiente, proyectada desde hoy si ya venció.`, 8.5);

    // ── Pie de página ──
    const totalPaginas = doc.getNumberOfPages();
    const autor = (typeof getCurrentUserName === 'function' && getCurrentUserName()) || '';
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(225, 225, 220); doc.setLineWidth(0.6); doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Generado el ${_drpFecha(new Date())}${autor ? ' por ' + autor : ''} — Salario Gestión`, margin, pageH - 16);
      doc.text(`Página ${p} de ${totalPaginas}`, pageW - margin, pageH - 16, { align: 'right' });
    }

    doc.save(`Informe_Disponibilidad_${_toISODate(hoy)}.pdf`);
  } catch (e) {
    console.error('Error generando el informe de disponibilidad', e);
    alert('No se pudo generar el PDF: ' + (e.message || e));
  }
}
