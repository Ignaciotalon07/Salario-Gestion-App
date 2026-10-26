// ════════════════════════════════════════════════════════════════════
// REPORTE PDF DE LA SECCIÓN CONSULTAS
// Informe del período con: resumen general (con comparación contra el período
// anterior), evolución en el tiempo, quiénes más consultan, qué consultan,
// quiénes consumen más tiempo y uso de material / conexión remota.
//
// Usa las mismas consultas que la sección Consultas (_cpTodas: solo soporte; sin
// programación interna ni implementación) y reutiliza helpers de reportes.js
// (_repRangoAnterior, _repCatLabel, _repCargarLogo) y charts.js (minutos).
// Los gráficos se dibujan directo en el PDF (barras), sin imágenes.
// No requiere migraciones.
// ════════════════════════════════════════════════════════════════════

// ────────── Modal ──────────

function abrirModalReporteCp() {
  const ahora = new Date();
  const selAnio = document.getElementById('crp-anio');
  if (selAnio && selAnio.options.length === 0) {
    const y0 = ahora.getFullYear();
    let h = '';
    for (let y = y0; y >= y0 - 4; y--) h += `<option value="${y}">${y}</option>`;
    selAnio.innerHTML = h;
  }
  const selTrim = document.getElementById('crp-trim');
  if (selTrim && !selTrim.dataset.init) { selTrim.value = String(Math.floor(ahora.getMonth() / 3) + 1); selTrim.dataset.init = '1'; }
  const inMes = document.getElementById('crp-mes');
  if (inMes && !inMes.value) inMes.value = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0');
  crpCambioPeriodo();
  const m = document.getElementById('modal-reporte-cp');
  if (m) m.style.display = 'flex';
}
function cerrarModalReporteCp() {
  const m = document.getElementById('modal-reporte-cp');
  if (m) m.style.display = 'none';
}
// Botones segmentados de período (actualizan el input oculto)
function crpElegirPeriodo(p) {
  document.getElementById('crp-periodo').value = p;
  crpCambioPeriodo();
}
function crpCambioPeriodo() {
  const p = document.getElementById('crp-periodo').value;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.style.display = v ? 'flex' : 'none'; };
  set('crp-mes-wrap', p === 'mes_cerrado');
  set('crp-anio-wrap', p === 'anio' || p === 'trimestre');
  set('crp-trim-wrap', p === 'trimestre');
  document.querySelectorAll('#crp-seg button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
}

// { desde, hasta, finNatural, label, labelNarr? } según lo elegido en el modal (null si falta algo)
function _crpRango() {
  const periodo = document.getElementById('crp-periodo').value;
  const mayus = t => t.charAt(0).toUpperCase() + t.slice(1);
  if (periodo === 'mes_cerrado') {
    const val = document.getElementById('crp-mes').value;
    if (!val) return null;
    const [y, m] = val.split('-').map(Number);
    const desde = new Date(y, m - 1, 1, 0, 0, 0), hasta = new Date(y, m, 0, 23, 59, 59);
    return { periodo, desde, hasta, finNatural: hasta, label: mayus(desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })) };
  }
  if (periodo === 'trimestre') {
    const y = parseInt(document.getElementById('crp-anio').value, 10);
    const q = parseInt(document.getElementById('crp-trim').value, 10);
    if (!y || !q) return null;
    const mesIni = (q - 1) * 3;
    const desde = new Date(y, mesIni, 1, 0, 0, 0);
    let hasta = new Date(y, mesIni + 3, 0, 23, 59, 59);
    const finNatural = new Date(hasta);
    const N = ['1.er', '2.º', '3.er', '4.º'];
    const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const rangoTxt = `${M[mesIni]} a ${M[mesIni + 2]}`;
    const ahora = new Date();
    let enCurso = false;
    if (ahora >= desde && ahora < hasta) { hasta = ahora; enCurso = true; }
    return { periodo, desde, hasta, finNatural, label: `${N[q - 1]} trimestre ${y} (${rangoTxt})${enCurso ? ' — hasta hoy' : ''}`, labelNarr: `el ${N[q - 1]} trimestre de ${y} (${rangoTxt})` };
  }
  if (periodo === 'anio') {
    const y = parseInt(document.getElementById('crp-anio').value, 10);
    if (!y) return null;
    const desde = new Date(y, 0, 1, 0, 0, 0), hasta = new Date(y, 11, 31, 23, 59, 59);
    return { periodo, desde, hasta, finNatural: hasta, label: 'Año ' + y, labelNarr: `el año ${y}` };
  }
  // mes_actual
  const ahora = new Date();
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
  const finNatural = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
  return { periodo, desde, hasta: ahora, finNatural, label: mayus(desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })) + ' (hasta hoy)' };
}

// ────────── Datos ──────────

function _crpConsultasEn(desde, hasta) {
  return _cpTodas().filter(c => { const t = new Date(c.timestamp); return t >= desde && t <= hasta; });
}

// [[clave, { count, minutos }]] ordenado por cantidad (o por minutos si porTiempo)
function _crpAgrupar(arr, fnClave, porTiempo) {
  const m = {};
  arr.forEach(c => {
    const k = fnClave(c);
    if (!k) return;
    if (!m[k]) m[k] = { count: 0, minutos: 0 };
    m[k].count++;
    m[k].minutos += hhmmAMinutos(c.tiempo || 0);
  });
  return Object.entries(m).sort((a, b) => porTiempo ? (b[1].minutos - a[1].minutos) : (b[1].count - a[1].count));
}

// Serie temporal según el período: por día (mes), por semana (trimestre) o por mes (año)
function _crpSerie(consultasArr, rango) {
  const out = [];
  const hasta = rango.hasta;
  if (rango.periodo === 'anio') {
    const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const ultimo = hasta < rango.finNatural ? hasta.getMonth() : 11;
    for (let m = 0; m <= ultimo; m++) {
      const n = consultasArr.filter(c => new Date(c.timestamp).getMonth() === m).length;
      out.push({ label: M[m], value: n });
    }
    return { titulo: 'Consultas por mes', items: out };
  }
  if (rango.periodo === 'trimestre') {
    // Semanas (de lunes a domingo) que cubren el trimestre
    const ini = new Date(rango.desde); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); ini.setHours(0, 0, 0, 0);
    for (let d = new Date(ini); d <= hasta; d.setDate(d.getDate() + 7)) {
      const fin = new Date(d); fin.setDate(fin.getDate() + 6); fin.setHours(23, 59, 59, 999);
      const n = consultasArr.filter(c => { const t = new Date(c.timestamp); return t >= d && t <= fin; }).length;
      out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: n });
    }
    return { titulo: 'Consultas por semana (semana que empieza el…)', items: out };
  }
  // mes: por día
  const dias = (hasta < rango.finNatural ? hasta : rango.finNatural).getDate();
  for (let d = 1; d <= dias; d++) {
    const n = consultasArr.filter(c => new Date(c.timestamp).getDate() === d).length;
    out.push({ label: String(d), value: n });
  }
  return { titulo: 'Consultas por día', items: out };
}

// ────────── Generación del PDF ──────────

async function generarReporteCpPDF() {
  const rango = _crpRango();
  if (!rango) { alert('Elegí el mes, el trimestre o el año del reporte.'); return; }
  if (typeof window.jspdf === 'undefined') { alert('No se pudo cargar la librería de PDF. Revisá tu conexión e intentá de nuevo.'); return; }

  const datos = _crpConsultasEn(rango.desde, rango.hasta);
  if (datos.length === 0) { alert('No hay consultas registradas en ese período.'); return; }

  const btn = document.getElementById('crp-btn-generar');
  const txtBtn = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  try {
    const { jsPDF } = window.jspdf;
    const logo = (typeof _repCargarLogo === 'function') ? await _repCargarLogo() : null;
    const NARANJA = [245, 158, 11];
    const GRIS = [90, 90, 85];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 44;
    const anchoUtil = pageW - margin * 2;
    let y = margin;

    const nuevaHoja = () => { doc.addPage('a4', 'landscape'); y = margin; };
    const checkPageBreak = (alto) => { if (y + alto > pageH - margin) nuevaHoja(); };

    // ── Datos calculados ──
    const total = datos.length;
    const minTotal = sumaMinutos(datos);
    const conTiempo = datos.filter(c => hhmmAMinutos(c.tiempo || 0) > 0).length;
    const promMin = conTiempo ? minTotal / conTiempo : 0;
    const porCliente = _crpAgrupar(datos, c => c.cliente || 'Sin cliente');
    const porClienteTiempo = _crpAgrupar(datos, c => c.cliente || 'Sin cliente', true).filter(([, d]) => d.minutos > 0);
    const clientesDistintos = porCliente.length;
    const repetidas = datos.filter(c => c.repetida === 'si').length;
    const remotas = datos.filter(c => c.remota).length;
    const catLabel = c => (typeof _repCatLabel === 'function' ? _repCatLabel(c.categoria) : c.categoria) || null;
    const porCat = _crpAgrupar(datos, catLabel);
    const porCatTiempo = _crpAgrupar(datos, catLabel, true).filter(([, d]) => d.minutos > 0);
    const porSubtema = _crpAgrupar(datos, c => { const cat = catLabel(c); return cat ? (c.subtema ? `${cat} › ${c.subtema}` : cat) : null; });
    const pct = (n, t) => t ? `${Math.round((n / t) * 100)}%` : '—';

    // Período anterior del mismo tipo
    const ant = (typeof _repRangoAnterior === 'function') ? _repRangoAnterior(rango, rango.periodo) : null;
    const datosAnt = ant ? _crpConsultasEn(ant.desde, ant.hasta) : [];
    const minAnt = sumaMinutos(datosAnt);

    // ── Colores del informe ──
    const NARANJA_OSC = [217, 119, 6];
    const CARBON = [48, 48, 52];
    const VERDE = [22, 163, 74];

    // ── Encabezado (portada del informe) ──
    if (logo && logo.img.naturalWidth) {
      const logoH = 95, logoX = -8, logoY = -6;
      const logoW = logoH * (logo.img.naturalWidth / logo.img.naturalHeight);
      doc.addImage(logo.img, logo.formato, logoX, logoY, logoW, logoH);
    }
    // Título a la derecha del logo, alineado a la derecha
    doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(...CARBON);
    doc.text('Informe de Consultas', pageW - margin, 44, { align: 'right' });
    doc.setFont('times', 'italic'); doc.setFontSize(12); doc.setTextColor(110);
    doc.text('Salario Gestión — Equipo de soporte', pageW - margin, 62, { align: 'right' });
    // Etiqueta del período: pastilla naranja
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    const etiqueta = rango.label;
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
    const parrafoL = (label, texto) => {
      const w = doc.splitTextToSize(texto, anchoUtil);
      checkPageBreak(w.length * 14 + 28);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NARANJA_OSC);
      doc.text(label.replace('.', '').toUpperCase(), margin, y, { charSpace: 0.6 });
      y += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70);
      doc.text(w, margin, y);
      y += w.length * 14 + 8;
    };
    // Título de sección con número: "02  EVOLUCIÓN" + línea fina. x/w permiten usarlo en media hoja.
    const tituloSeccion = (num, texto, x = margin, w = anchoUtil) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NARANJA);
      doc.text(num, x, y);
      doc.setFontSize(11); doc.setTextColor(...CARBON);
      doc.text(texto.toUpperCase(), x + 30, y, { charSpace: 0.7 });
      doc.setDrawColor(228, 225, 218); doc.setLineWidth(0.8); doc.line(x, y + 8, x + w, y + 8);
    };
    const tablaCol = (x, w, head, body, colorHead, cols) => {
      doc.autoTable({
        startY: y, head: [head], body,
        styles: { fontSize: 8.5, cellPadding: 4.5, lineColor: [235, 231, 222], lineWidth: 0.5, textColor: [60, 60, 60] },
        headStyles: { fillColor: colorHead, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 247, 241] },
        margin: { left: x, right: pageW - x - w },
        tableWidth: w,
        columnStyles: cols,
      });
      return doc.lastAutoTable.finalY;
    };
    // Párrafo dentro de una columna; devuelve la nueva y
    const pCol = (texto, x, w, y0) => {
      const l = doc.splitTextToSize(texto, w);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text(l, x, y0); return y0 + l.length * 12 + 8;
    };
    const lista = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
    const veces = n => `${n} consulta${n !== 1 ? 's' : ''}`;
    const rank = (arr, fila) => arr.map((it, i) => [String(i + 1), ...fila(it)]);

    // Tarjeta destacada: etiqueta, nombre, número grande y "le siguen"
    const tarjetaHero = (x, w, h, color, label, nombre, grande, detalle, siguen) => {
      doc.setFillColor(255, 251, 242); doc.setDrawColor(238, 228, 208); doc.setLineWidth(0.8);
      doc.rect(x, y, w, h, 'FD');
      doc.setFillColor(...color); doc.rect(x, y, w, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(130);
      doc.text(label, x + 16, y + 25, { charSpace: 0.6 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...CARBON);
      const nombreLineas = doc.splitTextToSize(nombre || '—', w - 32).slice(0, 2);
      doc.text(nombreLineas, x + 16, y + 46);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(...color);
      doc.text(grande, x + 16, y + 98);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
      doc.text(detalle, x + 16, y + 114);
      if (siguen) {
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(doc.splitTextToSize(siguen, w - 32)[0], x + 16, y + h - 10);
      }
    };
    // Tile de dato: número + etiqueta
    const tile = (x, w, h, valor, label, color) => {
      doc.setDrawColor(232, 228, 218); doc.setLineWidth(0.8); doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...(color || NARANJA));
      doc.text(valor, x + 12, y + 26);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
      doc.text(label, x + 12, y + 41, { charSpace: 0.4 });
    };
    // Barras verticales (único gráfico del informe): [{ label, value }]
    const barrasV = (items, alto) => {
      const max = Math.max(...items.map(i => i.value), 1);
      checkPageBreak(alto + 36);
      const base = y + alto, areaW = anchoUtil, paso = areaW / items.length, bw = Math.min(26, paso * 0.62);
      doc.setDrawColor(228, 225, 218); doc.setLineWidth(0.5);
      [0, 0.5, 1].forEach(f => doc.line(margin, base - alto * f, margin + areaW, base - alto * f));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(String(max), margin - 4, y + 3, { align: 'right' });
      doc.text(String(Math.round(max / 2)), margin - 4, y + alto / 2 + 2, { align: 'right' });
      items.forEach((it, i) => {
        const cx = margin + paso * i + paso / 2;
        const h = alto * (it.value / max);
        if (it.value > 0) {
          doc.setFillColor(...NARANJA); doc.rect(cx - bw / 2, base - h, bw, h, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(60);
          doc.text(String(it.value), cx, base - h - 3, { align: 'center' });
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110);
        doc.text(it.label, cx, base + 11, { align: 'center' });
      });
      y = base + 26;
    };

    // ══════════ PÁGINA 1 — Resumen ejecutivo ══════════
    const nombrePeriodo = rango.labelNarr || ('el período ' + rango.label.charAt(0).toLowerCase() + rango.label.slice(1));
    parrafo(`Durante ${nombrePeriodo}, el equipo de soporte atendió ${total} consulta${total !== 1 ? 's' : ''} de ${clientesDistintos} cliente${clientesDistintos !== 1 ? 's' : ''}, con un tiempo total de ${fmtMinutos(minTotal)}${promMin ? ` (promedio de ${fmtMinutos(promMin)} por consulta)` : ''}.`, 10.5);
    y += 6;

    // Tres tarjetas destacadas
    const gap = 16, cw = (anchoUtil - gap * 2) / 3, ch = 138;
    const topCli = porCliente[0], topCliT = porClienteTiempo[0], topCat = porCat[0];
    const siguen = (arr, fmt) => arr.length > 1 ? 'Le siguen: ' + arr.slice(1, 3).map(fmt).join(' · ') : '';
    tarjetaHero(margin, cw, ch, NARANJA, 'CLIENTE QUE MÁS CONSULTÓ',
      topCli ? topCli[0] : '—', topCli ? String(topCli[1].count) : '—',
      topCli ? `consultas · ${pct(topCli[1].count, total)} del total` : '',
      siguen(porCliente, ([n, d]) => `${_repTruncar(n, 16)} (${d.count})`));
    tarjetaHero(margin + cw + gap, cw, ch, NARANJA_OSC, 'CLIENTE QUE MÁS TIEMPO CONSUMIÓ',
      topCliT ? topCliT[0] : '—', topCliT ? fmtMinutos(topCliT[1].minutos) : '—',
      topCliT ? `en ${topCliT[1].count} consulta${topCliT[1].count !== 1 ? 's' : ''} · ${pct(topCliT[1].minutos, minTotal)} del tiempo` : '',
      siguen(porClienteTiempo, ([n, d]) => `${_repTruncar(n, 16)} (${fmtMinutos(d.minutos)})`));
    tarjetaHero(margin + (cw + gap) * 2, cw, ch, CARBON, 'TEMA MÁS CONSULTADO',
      topCat ? topCat[0] : '—', topCat ? String(topCat[1].count) : '—',
      topCat ? `consultas · ${pct(topCat[1].count, total)} del total` : '',
      siguen(porCat, ([n, d]) => `${_repTruncar(n, 16)} (${d.count})`));
    y += ch + 18;

    // Tiles de números clave
    const nT = 6, tg = 10, tw = (anchoUtil - tg * (nT - 1)) / nT;
    [
      [String(total), 'CONSULTAS'],
      [fmtMinutos(minTotal), 'TIEMPO TOTAL'],
      [promMin ? fmtMinutos(promMin) : '—', 'PROMEDIO / CONSULTA'],
      [String(clientesDistintos), 'CLIENTES'],
      [`${repetidas} (${pct(repetidas, total)})`, 'REPETIDAS'],
      [`${remotas} (${pct(remotas, total)})`, 'CONEXIÓN REMOTA'],
    ].forEach(([v, l], i) => tile(margin + i * (tw + tg), tw, 52, v, l));
    y += 52 + 18;

    // Texto de lectura del período (evolución y comparación)
    const serie = _crpSerie(datos, rango);
    if (serie.items.length > 1) {
      const it = serie.items, tot = it.reduce((a, b) => a + b.value, 0);
      const pico = it.reduce((m, x) => x.value > m.value ? x : m, it[0]);
      const valle = it.reduce((m, x) => x.value < m.value ? x : m, it[0]);
      const unidad = rango.periodo === 'anio' ? 'mes' : rango.periodo === 'trimestre' ? 'semana' : 'día';
      const ref = rango.periodo === 'trimestre' ? `la semana del ${pico.label}` : rango.periodo === 'anio' ? `${pico.label}` : `el día ${pico.label}`;
      parrafoL('Evolución.', `En promedio hubo ${(tot / it.length).toFixed(1).replace('.', ',')} consultas por ${unidad}. El pico de demanda fue ${ref}, con ${veces(pico.value)}; el momento más tranquilo registró ${valle.value}.`);
    }
    if (ant && datosAnt.length) {
      const d = total - datosAnt.length, dt = minTotal - minAnt;
      parrafoL('Comparación.', `Frente a ${ant.ref}, las consultas ${d > 0 ? 'aumentaron' : d < 0 ? 'disminuyeron' : 'se mantuvieron'}${d ? ` en ${Math.abs(d)} (${Math.round(Math.abs(d) / datosAnt.length * 100)}%)` : ''}${minAnt ? ` y el tiempo dedicado ${dt > 0 ? 'creció' : dt < 0 ? 'bajó' : 'se mantuvo'}${dt ? ` ${Math.round(Math.abs(dt) / minAnt * 100)}%` : ''}` : ''}.`);
    }
    if (repetidas) parrafoL('Consultas repetidas.', `${repetidas} consultas (${pct(repetidas, total)}) fueron sobre un tema ya consultado antes, lo que marca oportunidades de capacitación o de mejorar el material de ayuda.`);

    // ══════════ PÁGINA 2 — quiénes consultan y qué consultan ══════════
    nuevaHoja();
    const colW = (anchoUtil - 24) / 2, xDer = margin + colW + 24;
    checkPageBreak(250);
    const yTit = y;
    tituloSeccion('02', 'Quiénes más consultan', margin, colW);
    y = yTit; tituloSeccion('03', 'Qué consultan', xDer, colW);
    y = yTit + 20;
    const t5 = porCliente.slice(0, 5), c5 = t5.reduce((a, [, d]) => a + d.count, 0);
    const yA = pCol(`${lista(t5.map(([n, d]) => `${n} (${d.count})`))} concentran ${pct(c5, total)} de todas las consultas. En total consultaron ${clientesDistintos} clientes distintos.`, margin, colW, y);
    const sub5 = porSubtema.slice(0, 3), cat3 = porCat.slice(0, 3);
    const yB = pCol(`Los temas más frecuentes fueron ${lista(sub5.map(([n, d]) => `${n} (${d.count})`))}. Por categoría, ${lista(cat3.map(([n, d]) => `${n} (${pct(d.count, total)})`))}.`, xDer, colW, y);
    y = Math.max(yA, yB) + 4;
    const yTabs = y;
    const fL = tablaCol(margin, colW, ['#', 'Cliente', 'Consultas', '% total'],
      rank(porCliente.slice(0, 8), ([n, d]) => [n, String(d.count), pct(d.count, total)]), NARANJA,
      { 0: { cellWidth: 22 }, 2: { cellWidth: 58, halign: 'right' }, 3: { cellWidth: 48, halign: 'right' } });
    y = yTabs;
    const fR = tablaCol(xDer, colW, ['#', 'Tema', 'Consultas', '% total'],
      rank(porSubtema.slice(0, 8), ([n, d]) => [n, String(d.count), pct(d.count, total)]), NARANJA,
      { 0: { cellWidth: 22 }, 2: { cellWidth: 58, halign: 'right' }, 3: { cellWidth: 48, halign: 'right' } });
    y = Math.max(fL, fR) + 22;

    // Personas que consultan / consultas repetidas (dos columnas chicas)
    const porPersona = _crpAgrupar(datos, c => c.contacto ? `${c.contacto}||${c.cliente || 'Sin cliente'}` : null);
    const repGrupos = _crpAgrupar(datos.filter(c => c.repetida === 'si'), c => {
      const cat = catLabel(c); return cat ? (c.subtema ? `${cat} › ${c.subtema}` : cat) : 'Sin categoría';
    });
    if (porPersona.length || repGrupos.length) {
      checkPageBreak(110);
      const yT2 = y;
      if (porPersona.length) { tituloSeccion('04', 'Personas que más consultan', margin, colW); }
      y = yT2; if (repGrupos.length) { tituloSeccion(porPersona.length ? '05' : '04', `Consultas repetidas (${repetidas})`, xDer, colW); }
      y = yT2 + 20;
      const yT3 = y;
      let f1 = y, f2 = y;
      if (porPersona.length) {
        f1 = tablaCol(margin, colW, ['Persona', 'Cliente', 'Consultas'],
          porPersona.slice(0, 5).map(([k, d]) => { const [pe, c] = k.split('||'); return [pe, c, String(d.count)]; }), GRIS,
          { 2: { cellWidth: 58, halign: 'right' } });
      }
      y = yT3;
      if (repGrupos.length) {
        f2 = tablaCol(xDer, colW, ['Tema', 'Veces repetida'],
          repGrupos.slice(0, 5).map(([n, d]) => [n, String(d.count)]), GRIS,
          { 1: { cellWidth: 78, halign: 'right' } });
      }
      y = Math.max(f1, f2) + 20;
    }

    // ══════════ PÁGINA 3 — Tiempo + material y remota ══════════
    checkPageBreak(300);
    const yTit3 = y;
    tituloSeccion('06', 'Quiénes consumen más tiempo', margin, colW);
    y = yTit3; tituloSeccion('07', 'Categorías que más tiempo consumen', xDer, colW);
    y = yTit3 + 20;
    let yC = y, yD = y;
    if (porClienteTiempo.length) {
      const [n1, d1] = porClienteTiempo[0];
      yC = pCol(`${n1} fue quien más tiempo demandó: ${fmtMinutos(d1.minutos)} (${pct(d1.minutos, minTotal)} del total) en ${veces(d1.count)}. Los cinco primeros suman ${pct(porClienteTiempo.slice(0, 5).reduce((a, [, d]) => a + d.minutos, 0), minTotal)} del tiempo.`, margin, colW, y);
    }
    if (porCatTiempo.length) {
      const [n2, d2] = porCatTiempo[0];
      yD = pCol(`La categoría que más tiempo consumió fue ${n2}: ${fmtMinutos(d2.minutos)} (${pct(d2.minutos, minTotal)}), con un promedio de ${fmtMinutos(d2.minutos / d2.count)} por consulta.`, xDer, colW, y);
    }
    y = Math.max(yC, yD) + 4;
    const yTabs3 = y;
    let fT1 = y, fT2 = y;
    if (porClienteTiempo.length) {
      fT1 = tablaCol(margin, colW, ['#', 'Cliente', 'Tiempo', '% tiempo', 'Prom.'],
        rank(porClienteTiempo.slice(0, 8), ([n, d]) => [n, fmtMinutos(d.minutos), pct(d.minutos, minTotal), fmtMinutos(d.minutos / d.count)]), NARANJA_OSC,
        { 0: { cellWidth: 22 }, 2: { cellWidth: 56, halign: 'right' }, 3: { cellWidth: 46, halign: 'right' }, 4: { cellWidth: 52, halign: 'right' } });
    }
    y = yTabs3;
    if (porCatTiempo.length) {
      fT2 = tablaCol(xDer, colW, ['#', 'Categoría', 'Tiempo', '% tiempo', 'Prom.'],
        rank(porCatTiempo.slice(0, 8), ([n, d]) => [n, fmtMinutos(d.minutos), pct(d.minutos, minTotal), fmtMinutos(d.minutos / d.count)]), NARANJA_OSC,
        { 0: { cellWidth: 22 }, 2: { cellWidth: 56, halign: 'right' }, 3: { cellWidth: 46, halign: 'right' }, 4: { cellWidth: 52, halign: 'right' } });
    }
    if (!porClienteTiempo.length) { y = yTabs3; parrafo('Las consultas de este período no tienen tiempo cargado.'); fT1 = y; }
    y = Math.max(fT1, fT2) + 26;

    // Material enviado y conexión remota: tiles
    checkPageBreak(120);
    tituloSeccion('08', 'Material enviado y conexión remota');
    y += 22;
    const conMat = datos.filter(c => c.material && c.material !== 'ninguno');
    const cuenta = k => datos.filter(c => c.material === k).length;
    const partes = [];
    if (cuenta('video')) partes.push(`${cuenta('video')} con video`);
    if (cuenta('pdf')) partes.push(`${cuenta('pdf')} con PDF o imagen`);
    if (cuenta('varios')) partes.push(`${cuenta('varios')} con varios materiales`);
    parrafo(`En ${conMat.length} consultas (${pct(conMat.length, total)}) se envió material de apoyo${partes.length ? ': ' + lista(partes) : ''}. ${remotas ? `Además, ${remotas} (${pct(remotas, total)}) requirieron conexión remota, lo que indica casos que no pudieron resolverse solo por chat.` : 'Ninguna consulta requirió conexión remota.'}`, 10);
    y += 10;

    // ── Cierre ──
    checkPageBreak(40);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text('Informe generado automáticamente a partir de las consultas registradas en Salario Gestión.', margin, y);

    // ── Pie de página ──
    const totalPaginas = doc.getNumberOfPages();
    const fechaGen = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const autor = (typeof getCurrentUserName === 'function' && getCurrentUserName()) || '';
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(225, 225, 220); doc.setLineWidth(0.6); doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Generado el ${fechaGen}${autor ? ' por ' + autor : ''} — Salario Gestión`, margin, pageH - 16);
      doc.text(`Página ${p} de ${totalPaginas}`, pageW - margin, pageH - 16, { align: 'right' });
    }

    doc.save('Informe_Consultas_' + rango.label.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf');
    cerrarModalReporteCp();
  } catch (e) {
    console.error('Error generando el PDF de Consultas', e);
    alert('No se pudo generar el PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = txtBtn; }
  }
}
