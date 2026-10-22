// ═══════════════════════════════════════════════════════════════
// Ausencias del equipo (sección Equipo) — paso 2: calendario + formulario
// Todos ven el mismo calendario; cada uno carga / edita / borra SOLO las suyas.
// Tabla: equipo_ausencias (migración 050).
// ═══════════════════════════════════════════════════════════════

const AUS_TIPOS = {
  vacaciones: { label: 'Vacaciones',  ico: '🏖️', color: '#4a8fd1' },
  licencia:   { label: 'Licencia',    ico: '🩺', color: '#c9792b' },
  dia_suelto: { label: 'Día suelto',  ico: '📅', color: '#6a9f6a' },
  puente:     { label: 'Puente',      ico: '🌉', color: '#9a7fc4' }
};
// Personas que siempre aparecen en el calendario (los nombres deben coincidir con team_members)
const AUS_BASE = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Renzo Moretti', 'Alfredo Cesar', 'Daniel Ferro'];
const AUS_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Feriados de Argentina. t: 'f' = feriado, 'p' = puente turístico / día no laborable.
// 2026: calendario oficial. 2027: los de ley (los puentes turísticos 2027 los decreta el Gobierno
// antes del 11/11/2026; cuando salgan hay que sumarlos acá, con t:'p'). Para otro año, agregar sus fechas.
const AUS_FERIADOS = {
  // ── 2026 ──
  '2026-01-01': { n: 'Año Nuevo', t: 'f' },
  '2026-02-16': { n: 'Carnaval', t: 'f' },
  '2026-02-17': { n: 'Carnaval', t: 'f' },
  '2026-03-23': { n: 'Puente turístico (no laborable)', t: 'p' },
  '2026-03-24': { n: 'Día de la Memoria por la Verdad y la Justicia', t: 'f' },
  '2026-04-02': { n: 'Día del Veterano y Caídos en Malvinas', t: 'f' },
  '2026-04-03': { n: 'Viernes Santo', t: 'f' },
  '2026-05-01': { n: 'Día del Trabajador', t: 'f' },
  '2026-05-25': { n: 'Revolución de Mayo', t: 'f' },
  '2026-06-15': { n: 'Paso a la Inmortalidad de Güemes (trasladado)', t: 'f' },
  '2026-06-20': { n: 'Paso a la Inmortalidad de Belgrano', t: 'f' },
  '2026-07-09': { n: 'Día de la Independencia', t: 'f' },
  '2026-07-10': { n: 'Puente turístico (no laborable)', t: 'p' },
  '2026-08-17': { n: 'Paso a la Inmortalidad de San Martín', t: 'f' },
  '2026-09-21': { n: 'Día del Perdón - Yom Kipur (no laborable)', t: 'p' },
  '2026-10-12': { n: 'Día del Respeto a la Diversidad Cultural', t: 'f' },
  '2026-11-23': { n: 'Día de la Soberanía Nacional (trasladado)', t: 'f' },
  '2026-12-07': { n: 'Puente turístico (no laborable)', t: 'p' },
  '2026-12-08': { n: 'Inmaculada Concepción de María', t: 'f' },
  '2026-12-25': { n: 'Navidad', t: 'f' },
  // ── 2027 ──
  '2027-01-01': { n: 'Año Nuevo', t: 'f' },
  '2027-02-08': { n: 'Carnaval', t: 'f' },
  '2027-02-09': { n: 'Carnaval', t: 'f' },
  '2027-03-24': { n: 'Día de la Memoria por la Verdad y la Justicia', t: 'f' },
  '2027-03-25': { n: 'Jueves Santo (no laborable)', t: 'p' },
  '2027-03-26': { n: 'Viernes Santo', t: 'f' },
  '2027-04-02': { n: 'Día del Veterano y Caídos en Malvinas', t: 'f' },
  '2027-05-01': { n: 'Día del Trabajador', t: 'f' },
  '2027-05-25': { n: 'Revolución de Mayo', t: 'f' },
  '2027-06-20': { n: 'Paso a la Inmortalidad de Belgrano', t: 'f' },
  '2027-06-21': { n: 'Paso a la Inmortalidad de Güemes (trasladado)', t: 'f' },
  '2027-07-09': { n: 'Día de la Independencia', t: 'f' },
  '2027-08-16': { n: 'Paso a la Inmortalidad de San Martín (trasladado)', t: 'f' },
  '2027-10-11': { n: 'Día del Respeto a la Diversidad Cultural (trasladado)', t: 'f' },
  '2027-11-20': { n: 'Día de la Soberanía Nacional', t: 'f' },
  '2027-12-08': { n: 'Inmaculada Concepción de María', t: 'f' },
  '2027-12-25': { n: 'Navidad', t: 'f' }
};

let ausencias = [];
let _ausError = false;
let _ausMes = null; // Date (día 1 del mes que se muestra)

function _ausISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _ausEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _ausFmt(iso) { // 2026-10-16 -> 16/10
  const [, m, d] = iso.split('-');
  return d + '/' + m;
}
function _ausEmailPropio() {
  return (window._currentAuthEmail || (typeof currentMember !== 'undefined' && currentMember ? currentMember.email : '') || '').toLowerCase();
}
function _ausEsMia(a) { return (a.miembro_email || '').toLowerCase() === _ausEmailPropio(); }

async function cargarAusencias() {
  try {
    ausencias = await dbList('equipo_ausencias', { orderBy: 'fecha_desde' });
    _ausError = false;
  } catch (e) {
    console.warn('Ausencias: no se pudo cargar (¿falta correr la migración 050?)', e);
    _ausError = true;
  }
  renderAusencias();
}

window.addEventListener('app-ready', () => {
  const h = new Date();
  _ausMes = new Date(h.getFullYear(), h.getMonth(), 1);
  cargarAusencias();
  try {
    sb().channel('equipo-ausencias-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipo_ausencias' }, () => cargarAusencias())
      .subscribe();
  } catch (e) { /* sin tiempo real, igual se carga al abrir */ }
});

function ausNavMes(delta) { // ahora navega de a años
  _ausMes = new Date(_ausMes.getFullYear() + delta, 0, 1);
  renderAusencias();
}

// Un color fijo por asesor (mismo orden/colores que el resto de la sección Equipo)
const AUS_COLORES = {
  'Ignacio Talon': '#c0392b', 'Matias Ferro': '#2d6a2d', 'Daniel Colomer': '#b45309',
  'Renzo Moretti': '#1a5fa5', 'Alfredo Cesar': '#2d2d8e', 'Daniel Ferro': '#5f5e5a'
};
const AUS_COLORES_EXTRA = ['#8e44ad', '#16a085', '#d35400', '#7f8c8d'];
function _ausColor(nombre) {
  if (AUS_COLORES[nombre]) return AUS_COLORES[nombre];
  const extras = Object.keys(AUS_COLORES).length;
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AUS_COLORES_EXTRA[h % AUS_COLORES_EXTRA.length];
}

// ── Alertas "de la diaria" (badge de la pestaña y Panel general) ──
const AUS_HORIZONTE_AREAS = 540; // días hacia adelante que miran el número y los puntitos de la pestaña Áreas
const AUS_VENTANA_AREAS = 15;  // días de anticipación para avisar que hay que atender un área
const AUS_VENTANA_SALIDAS = 14; // días de anticipación para avisar que alguien se va

// "Avisos vistos": al abrir una alerta del Panel general deja de mostrarse (por navegador)
function _ausVistos() { try { return JSON.parse(localStorage.getItem('aus_avisos_vistos') || '{}'); } catch (e) { return {}; } }
function ausAvisoVisto(key) { return !!_ausVistos()[key]; }
function ausAvisoMarcarVisto(key) {
  const v = _ausVistos();
  v[key] = Date.now();
  // limpieza: se descartan los que tienen más de 90 días
  Object.keys(v).forEach(k => { if (Date.now() - v[k] > 90 * 86400000) delete v[k]; });
  try { localStorage.setItem('aus_avisos_vistos', JSON.stringify(v)); } catch (e) { /* sin storage, se vuelve a mostrar */ }
}

// Qué pasa en un área un día dado, en palabras: "Queda con 1/2 asesores. Falta Ignacio."
function _areasDetalle(iso, clave) {
  const c = ausCoberturaDia(iso);
  if (clave === 'sop') {
    const n = AUS_SOPORTE.length - c.sopFalta.length;
    let t = `Queda con ${n}/2 asesores. Falta ${_ausLista(c.sopFalta)}`;
    if (c.cubren.length) t += `; ${_ausLista(c.cubren)} baja${c.cubren.length > 1 ? 'n' : ''} a cubrir`;
    if (c.descubiertos > 0) t += c.refSopLibre ? `. Sugerencia: sumar a ${AUS_REFUERZO_SOP}` : `. ${AUS_REFUERZO_SOP} tampoco está disponible`;
    return t + '.';
  }
  if (clave === 'prog' || clave === 'com') {
    const falta = clave === 'prog' ? c.progFalta : c.comFalta;
    return `Queda con 0/1 asesores. Falta ${_ausLista(falta)}. Nadie lo cubre.`;
  }
  const motivos = [];
  if (c.implFalta.length) motivos.push(`Falta ${_ausLista(c.implFalta)}`);
  if (c.cubren.length) motivos.push(`${_ausLista(c.cubren)} ${c.cubren.length > 1 ? 'cubren' : 'cubre'} Soporte`);
  return `Queda con ${c.implDisp}/2 asesores. ${motivos.join('; ')}.`;
}

// Tramos con algo para atender que arrancan dentro de la ventana (o que ya están en curso).
// Lo que está más lejos que la ventana NO se avisa todavía, para no correrlo y olvidarlo.
function areasProximosAvisos(ventana) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyISO = _ausISO(hoy);
  const out = [];
  // Solo Soporte e Implementación se "atienden" (se puede reorganizar el equipo). Programación y Comercial
  // quedan en rojo en las tarjetas, pero no generan alerta de atención: alcanza con el aviso de la salida.
  AREAS_DEF.filter(ar => ar.clave === 'sop' || ar.clave === 'imp').map(ar => [ar.clave, ar.nombre]).forEach(([clave, area]) => {
    let u = null;
    // se mira unos días hacia atrás para conocer la fecha real de inicio de lo que ya está en curso
    for (let i = -60; i <= ventana; i++) {
      const d = new Date(hoy); d.setDate(hoy.getDate() + i);
      const iso = _ausISO(d);
      if (!ausEsHabil(iso)) continue;
      const e = _areasDia(iso)[clave];
      if (e.lv === 0) { u = null; continue; }
      if (u && u.frase === e.frase && u.lv === e.lv) u.fin = iso;
      else { u = { area, clave, ini: iso, fin: iso, lv: e.lv, frase: e.frase, detalle: _areasDetalle(iso, clave) }; out.push(u); }
    }
  });
  return out.filter(t => t.fin >= hoyISO).map(t => {
    const dias = Math.max(0, Math.round((new Date(t.ini + 'T00:00:00') - hoy) / 86400000));
    return { ...t, dias, key: `area:${t.area}:${t.ini}` };
  }).sort((x, y) => x.ini.localeCompare(y.ini));
}
// Meses con algo para atender (Soporte/Implementación), sin límite cercano → badge de la pestaña y puntitos.
// El Panel general, en cambio, avisa recién dentro de AUS_VENTANA_AREAS días.
function areasMesesConAviso() {
  const hoy = new Date();
  const set = new Set();
  areasProximosAvisos(AUS_HORIZONTE_AREAS).forEach(t => { // en la pestaña Áreas se ve todo lo que viene, aunque falte mucho
    const ref = t.ini < _ausISO(hoy) ? _ausISO(hoy) : t.ini;
    set.add(ref.slice(0, 7)); // AAAA-MM
  });
  return set;
}
function areasPendientesCount() { return areasMesesConAviso().size; }
function areasActualizarBadge() {
  const btn = document.querySelector('#eq-tabs .eq-tab[data-tab="areas"]');
  if (!btn) return;
  let b = btn.querySelector('.eq-tab__badge');
  const n = _ausError ? 0 : areasPendientesCount();
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'eq-tab__badge'; btn.appendChild(b); }
  b.textContent = n;
}

// Cartelito motivacional para quien cargó sus vacaciones: una frase distinta cada día
function ausFraseVacaciones(a) {
  const n = a.faltan;
  const hoyF = [
    '¡Hoy arrancan tus vacaciones! Cerrá la compu y desconectate. 🌴',
    '¡Llegó el día! Que lo disfrutes un montón, te lo ganaste. 🏖️',
    'Hoy es tu último día de laburo antes de descansar. ¡A disfrutar! ☀️'
  ];
  const mananaF = [
    '¡Mañana arrancan tus vacaciones! Dejá todo prolijo y listo para soltar. 🧳',
    'Un día más y te vas. Ya podés ir armando la valija. 🧳',
    'Mañana empieza el descanso. Hoy, cerrá lo pendiente y andá tranquilo/a. 🌴'
  ];
  const variasF = [
    `En ${n} días te vas de vacaciones. ¡Ya falta poco! 🏖️`,
    `Faltan ${n} días para tus vacaciones. Se viene el descanso que te merecés. 🌴`,
    `En ${n} días: sol, mate y cero notificaciones. ¡Aguantá un poquito más! ☀️`,
    `${n} días para desconectar. Andá viendo qué te llevás en la valija. 🧳`,
    `Cuenta regresiva: ${n} días para tus vacaciones. ¡Vos podés con lo que queda! 💪`,
    `En ${n} días te toca descansar. Ir dejando todo ordenado para volver con la cabeza fresca. 🌊`,
    `Faltan ${n} días y ya se huele el descanso. ¡Qué ganas! 🍉`,
    `${n} días para tus vacaciones: dormir sin alarma, ahí vamos. 😴`
  ];
  const pool = n === 0 ? hoyF : (n === 1 ? mananaF : variasF);
  const hoy = new Date();
  const diaDelAnio = Math.floor((hoy - new Date(hoy.getFullYear(), 0, 0)) / 86400000);
  let h = 0; for (const c of String(a.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(diaDelAnio + h) % pool.length];
}

// Salidas que arrancan hoy o en los próximos días ("X sale de vacaciones")
function ausSalidasProximas(diasAdelante) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const lim = new Date(hoy); lim.setDate(hoy.getDate() + diasAdelante);
  const hoyISO = _ausISO(hoy), limISO = _ausISO(lim);
  return ausencias
    .filter(a => a.fecha_desde >= hoyISO && a.fecha_desde <= limISO)
    .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde))
    .map(a => ({
      ...a, key: `sal:${a.id}`, mia: _ausEsMia(a),
      dias: ausDiasEntre(a.fecha_desde, a.fecha_hasta),
      faltan: Math.round((new Date(a.fecha_desde + 'T00:00:00') - hoy) / 86400000)
    }));
}

// ── Pestañas de la sección Equipo ───────────────────────────────
function eqTab(nombre) {
  window._eqTab = nombre;
  ['asesores', 'ausencias', 'areas'].forEach(n => {
    const pane = document.getElementById('eq-pane-' + n);
    if (pane) pane.style.display = n === nombre ? '' : 'none';
  });
  document.querySelectorAll('#eq-tabs .eq-tab').forEach(b =>
    b.classList.toggle('eq-tab--on', b.dataset.tab === nombre));
  // Los gráficos de Chart.js necesitan recalcular tamaño al volver a mostrarse
  if (nombre === 'asesores') window.dispatchEvent(new Event('resize'));
}

// ── Pestaña "Áreas": carga de cada área según las ausencias ─────
function renderAreas() {
  const host = document.getElementById('equipo-areas');
  if (!host) return;
  if (_ausError) {
    host.innerHTML = `<div class="card-title">Áreas</div>
      <div style="font-size:13px;color:var(--text3)">No se pudo cargar. Corré la migración <b>050_equipo_ausencias.sql</b> en Supabase.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="estruct-head">
      <div>
        <div class="card-title" style="margin:0">Carga de cada área</div>
        <div class="estruct-sub">Soporte necesita 2 personas: si falta una, baja un implementador a cubrir. Implementación atiende 2 clientes por implementador disponible.</div>
      </div>
    </div>
    ${ausCoberturaHtml()}`;
}

// ── Render principal: 12 meses tipo calendario ──────────────────
function renderAusencias() {
  renderAreas();
  areasActualizarBadge();
  if (window._implDispAbierta && typeof renderImplementacion === 'function') renderImplementacion(); // capacidad de Disponibilidad
  if (typeof renderSaludoPanel === 'function') { try { renderSaludoPanel(); } catch (e) { /* el panel se rearma solo */ } }
  const host = document.getElementById('equipo-ausencias');
  if (!host || !_ausMes) return;

  if (_ausError) {
    host.innerHTML = `<div class="card-title">Ausencias del equipo</div>
      <div style="font-size:13px;color:var(--text3)">No se pudo cargar. Corré la migración <b>050_equipo_ausencias.sql</b> en Supabase.</div>`;
    return;
  }

  const anio = _ausMes.getFullYear();
  const iniAnio = anio + '-01-01', finAnio = anio + '-12-31';
  const hoyISO = _ausISO(new Date());
  const delAnio = ausencias.filter(a => a.fecha_desde <= finAnio && a.fecha_hasta >= iniAnio);

  // Mapa día -> lista de colores de quienes faltan ese día
  const porDia = {};
  delAnio.forEach(a => {
    const c = _ausColor(a.miembro_nombre);
    let d = new Date(Math.max(new Date(a.fecha_desde + 'T00:00:00'), new Date(iniAnio + 'T00:00:00')));
    const fin = new Date(Math.min(new Date(a.fecha_hasta + 'T00:00:00'), new Date(finAnio + 'T00:00:00')));
    while (d <= fin) {
      const k = _ausISO(d);
      (porDia[k] = porDia[k] || []).push({ c, n: a.miembro_nombre });
      d.setDate(d.getDate() + 1);
    }
  });

  // 12 mini calendarios (semana lunes a domingo)
  let meses = '';
  for (let m = 0; m < 12; m++) {
    const primero = new Date(anio, m, 1);
    const diasMes = new Date(anio, m + 1, 0).getDate();
    const offset = (primero.getDay() + 6) % 7; // lunes = 0
    let celdas = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<div class="aus-cal-dow">${x}</div>`).join('');
    for (let i = 0; i < offset; i++) celdas += '<div></div>';
    for (let d = 1; d <= diasMes; d++) {
      const iso = _ausISO(new Date(anio, m, d));
      const gente = porDia[iso];
      const dow = new Date(anio, m, d).getDay();
      let estilo = '', cls = 'aus-cal-dia', tipos = [];
      const fer = AUS_FERIADOS[iso];
      if (gente) {
        cls += ' aus-cal-dia--ocupado';
        if (gente.length === 1) estilo = `background:${gente[0].c}`;
        else { // varias personas el mismo día: franjas de cada color
          const w = 100 / gente.length;
          estilo = 'background:linear-gradient(90deg,' + gente.map((g, i) => `${g.c} ${i * w}% ${(i + 1) * w}%`).join(',') + ')';
        }
        tipos.push(gente.map(g => g.n).join(', '));
      } else if (dow === 0 || dow === 6) cls += ' aus-cal-dia--finde';
      if (fer) {
        cls += fer.t === 'f' ? ' aus-cal-dia--feriado' : ' aus-cal-dia--puente';
        tipos.unshift((fer.t === 'f' ? 'Feriado: ' : 'No laborable: ') + fer.n);
      }
      if (iso === hoyISO) cls += ' aus-cal-dia--hoy';
      const tip = tipos.length ? ` data-tip="${_ausEsc(tipos.join(' · '))}"` : '';
      celdas += `<div class="${cls}" style="${estilo}"${tip}>${d}</div>`;
    }
    meses += `<div class="aus-cal-mes"><div class="aus-cal-titulo">${AUS_MESES[m]}</div><div class="aus-cal-grid">${celdas}</div></div>`;
  }

  // Leyenda: color de cada asesor
  const nombres = [...AUS_BASE];
  delAnio.forEach(a => { if (!nombres.includes(a.miembro_nombre)) nombres.push(a.miembro_nombre); });
  const leyenda = nombres.map(n => `<span class="aus-ley"><i style="background:${_ausColor(n)}"></i>${_ausEsc(n)}</span>`).join('');

  const leyFer = `<span class="aus-ley"><i class="aus-ley-fer"></i>Feriado</span><span class="aus-ley"><i class="aus-ley-puente"></i>Puente / día no laborable</span>`;
  // Detalle de lo que cargó cada uno (el año visible), editar/borrar solo en las propias
  const orden = [...ausencias].sort((x, y) => x.fecha_desde.localeCompare(y.fecha_desde));
  const lista = orden.length
    ? orden.map(a => {
        const t = AUS_TIPOS[a.tipo] || AUS_TIPOS.vacaciones;
        const mia = _ausEsMia(a);
        const dias = ausDiasEntre(a.fecha_desde, a.fecha_hasta);
        const rango = a.fecha_hasta !== a.fecha_desde ? `${_ausFmt(a.fecha_desde)} al ${_ausFmt(a.fecha_hasta)}` : _ausFmt(a.fecha_desde);
        const col = _ausColor(a.miembro_nombre);
        const nuevo = a.created_at && (Date.now() - +new Date(a.created_at)) < 3 * 86400000;
        const ini = a.miembro_nombre.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
        return `<div class="aus-card${nuevo ? ' aus-card--nueva' : ''}" style="--c:${col}"${nuevo ? ' title="Cargada recientemente"' : ''}>
          <div class="aus-card__av" style="background:${col}">${_ausEsc(ini)}</div>
          <div class="aus-card__main">
            <div class="aus-card__quien">${_ausEsc(a.miembro_nombre)}</div>
            <div class="aus-card__tipo">${t.ico} ${t.label}${a.nota ? ' · ' + _ausEsc(a.nota) : ''}</div>
          </div>
          <div class="aus-card__fechas">📅 ${rango}</div>
          <div class="aus-card__dias"><b>${dias}</b> ${dias === 1 ? 'día' : 'días'}</div>
          ${mia ? `<span class="aus-item__acc">
            <button onclick="ausAbrirForm('${a.id}')" title="Editar">✏️</button>
            <button onclick="ausEliminar('${a.id}')" title="Eliminar">🗑️</button></span>` : '<span></span>'}
        </div>`;
      }).join('')
    : `<div style="font-size:13px;color:var(--text3);padding:6px 0">Todavía nadie cargó ausencias.</div>`;

  host.innerHTML = `
    <div class="estruct-head">
      <div>
        <div class="card-title" style="margin:0">Ausencias del equipo</div>
        <div class="estruct-sub">Cada asesor tiene su color. Los días que carga se pintan en el calendario. Todos ven lo mismo; cada uno edita solo lo suyo.</div>
      </div>
      <button class="btn-primary" onclick="ausAbrirForm()">+ Cargar mi ausencia</button>
    </div>
    <div class="panel-mes-nav" style="margin:0 0 12px">
      <button class="panel-mes-nav__btn" onclick="ausNavMes(-1)" title="Año anterior">◀</button>
      <span class="panel-mes-nav__label">${anio}</span>
      <button class="panel-mes-nav__btn" onclick="ausNavMes(1)" title="Año siguiente">▶</button>
    </div>
    <div class="aus-cal-anio">${meses}</div>
    <div class="aus-leyendas">
      <div class="aus-leyenda">${leyenda}</div>
      <div class="aus-leyenda aus-leyenda--fer">${leyFer}</div>
    </div>
    <div class="aus-detalle">
      <div class="aus-detalle__head">
        <div class="aus-detalle__tit">Detalle de lo cargado</div>
        <span class="aus-detalle__linea"></span>
        <span class="aus-detalle__cant">${orden.length} cargada${orden.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="aus-lista">${lista}</div>
    </div>`;
}

// ── Cobertura (paso 3) ──────────────────────────────────────────
// Reglas: Soporte necesita 2 personas; si falta una, baja UN implementador a cubrir.
// Si falta alguien de Implementación el área queda tocada (de Soporte NO suben).
// Capacidad de Implementación = 2 clientes por implementador disponible.
// Refuerzos excepcionales (no se cuentan solos, solo se sugieren): Alfredo → Impl, Daniel Ferro → Soporte.
const AUS_SOPORTE = ['Daniel Colomer', 'Renzo Moretti'];
const AUS_IMPL = ['Ignacio Talon', 'Matias Ferro'];
// Áreas de una sola persona: si falta, nadie las cubre (quedan en rojo)
const AUS_PROGRAMACION = ['Alfredo Cesar'];
const AUS_COMERCIAL = ['Daniel Ferro'];
const AUS_REFUERZO_SOP = 'Daniel Ferro';
const AUS_REFUERZO_IMPL = 'Alfredo Cesar';
const AUS_CLIENTES_POR_IMPL = 2;

function ausEsHabil(iso) {
  const dow = new Date(iso + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) return false;
  const f = AUS_FERIADOS[iso];
  return !(f && f.t === 'f'); // los "no laborables" cuentan como día de trabajo
}
function ausAusente(nombre, iso) {
  return ausencias.some(a => a.miembro_nombre === nombre && a.fecha_desde <= iso && iso <= a.fecha_hasta);
}
// Estado de cobertura de UN día (también lo va a usar la capacidad de Disponibilidad, paso 4)
function ausCoberturaDia(iso) {
  const sopFalta = AUS_SOPORTE.filter(n => ausAusente(n, iso));
  const implFalta = AUS_IMPL.filter(n => ausAusente(n, iso));
  const implLibres = AUS_IMPL.filter(n => !ausAusente(n, iso));
  const cubren = implLibres.slice(0, sopFalta.length); // bajan a cubrir Soporte
  const descubiertos = sopFalta.length - cubren.length; // puestos de Soporte sin cubrir
  const implDisp = implLibres.length - cubren.length;
  return {
    iso, sopFalta, implFalta, cubren, descubiertos, implDisp,
    sopPersonas: AUS_SOPORTE.length - sopFalta.length + cubren.length,
    capacidad: implDisp * AUS_CLIENTES_POR_IMPL,
    progFalta: AUS_PROGRAMACION.filter(n => ausAusente(n, iso)),
    comFalta: AUS_COMERCIAL.filter(n => ausAusente(n, iso)),
    refSopLibre: !ausAusente(AUS_REFUERZO_SOP, iso),
    refImplLibre: !ausAusente(AUS_REFUERZO_IMPL, iso)
  };
}
function _ausNivel(c) { // 0 ok · 1 atención · 2 crítico
  if (c.descubiertos > 0 || c.implDisp === 0) return 2;
  if (c.sopFalta.length > 0 || c.implDisp < AUS_IMPL.length) return 1;
  return 0;
}
function _ausCorto(n) { return n.split(' ')[0]; }

// ── Pestaña Áreas: mes a mes, en frases ─────────────────────────
let _areasAnio = null;
function areasNavAnio(d) { _areasAnio += d; renderAreas(); }

function _ausLista(nombres) { // "Ignacio", "Ignacio y Matias"
  const n = nombres.map(_ausCorto);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : (n[0] || '');
}

// Estado de UN día: nivel (0 normal · 1 atención · 2 crítico) y frase para cada área
function _areasDia(iso) {
  const c = ausCoberturaDia(iso);
  // Soporte
  let sLv = 0, sFrase = 'Normal';
  if (c.descubiertos > 0) {
    sLv = 2;
    sFrase = `queda con ${c.sopPersonas}/2 personas. ` + (c.refSopLibre ? `Sugerencia: sumar a ${AUS_REFUERZO_SOP}` : `${AUS_REFUERZO_SOP} tampoco está disponible`);
  } else if (c.sopFalta.length) {
    sLv = 1;
    sFrase = `${_ausLista(c.cubren)} ${c.cubren.length > 1 ? 'cubren' : 'cubre'} a ${_ausLista(c.sopFalta)}`;
  }
  // Implementación
  let iLv = 0, iFrase = 'Normal';
  if (c.implDisp < AUS_IMPL.length) {
    iLv = c.implDisp === 0 ? 2 : 1;
    const motivos = [];
    if (c.implFalta.length) motivos.push(`falta ${_ausLista(c.implFalta)}`);
    if (c.cubren.length) motivos.push(`${_ausLista(c.cubren)} ${c.cubren.length > 1 ? 'cubren' : 'cubre'} Soporte`);
    iFrase = `queda con ${c.implDisp}/2 personas (${c.capacidad} ${c.capacidad === 1 ? 'cliente' : 'clientes'}): ${motivos.join(' y ')}`;
  }
  // Programación Salario y Comercial: una sola persona cada una; si falta, nadie cubre
  const unica = (falta, nombre) => falta.length
    ? { lv: 2, frase: `queda sin cubrir: ${_ausLista(falta)} no está y nadie lo reemplaza` }
    : { lv: 0, frase: 'Normal' };
  return { sop: { lv: sLv, frase: sFrase }, imp: { lv: iLv, frase: iFrase },
           prog: unica(c.progFalta), com: unica(c.comFalta) };
}

// Tramos del mes con problema (solo días hábiles; los fines de semana no cortan el tramo)
function _areasTramosMes(anio, mes, clave) {
  const ult = new Date(anio, mes + 1, 0).getDate();
  const tramos = [];
  for (let d = 1; d <= ult; d++) {
    const iso = _ausISO(new Date(anio, mes, d));
    if (!ausEsHabil(iso)) continue;
    const e = _areasDia(iso)[clave];
    if (e.lv === 0) { tramos.push(null); continue; } // marca de "día normal" para cortar
    const u = tramos[tramos.length - 1];
    if (u && u.frase === e.frase && u.lv === e.lv) u.fin = iso;
    else tramos.push({ ini: iso, fin: iso, lv: e.lv, frase: e.frase });
  }
  return tramos.filter(Boolean);
}

// Estado general del mes para un área: peor nivel y personas propias disponibles ese día
function _areasResumenMes(anio, mes, clave) {
  const ult = new Date(anio, mes + 1, 0).getDate();
  const tot = (clave === 'sop' || clave === 'imp') ? 2 : 1;
  let lv = 0, cnt = tot;
  for (let d = 1; d <= ult; d++) {
    const iso = _ausISO(new Date(anio, mes, d));
    if (!ausEsHabil(iso)) continue;
    const e = _areasDia(iso)[clave];
    const c = ausCoberturaDia(iso);
    const n = clave === 'sop' ? AUS_SOPORTE.length - c.sopFalta.length
      : clave === 'imp' ? c.implDisp
      : clave === 'prog' ? AUS_PROGRAMACION.length - c.progFalta.length
      : AUS_COMERCIAL.length - c.comFalta.length;
    if (e.lv > lv || (e.lv === lv && n < cnt)) { lv = e.lv; cnt = n; }
  }
  return { lv, cnt, tot };
}

const AREAS_DEF = [
  { clave: 'sop', nombre: 'Soporte' },
  { clave: 'imp', nombre: 'Implementación' },
  { clave: 'prog', nombre: 'Programación Salario' },
  { clave: 'com', nombre: 'Comercial' }
];

function ausCoberturaHtml() {
  if (_areasAnio == null) _areasAnio = new Date().getFullYear();
  const hoy = new Date();
  const fr = t => t.ini === t.fin ? `El ${_ausFmt(t.ini)}` : `Del ${_ausFmt(t.ini)} al ${_ausFmt(t.fin)}`;
  const linea = (nombre, tramos, res) => {
    const cls = ['normal', 'regular', 'critico'][res.lv];
    const etq = ['Normal', 'Regular', 'Crítico'][res.lv];
    return `<div class="am-linea am-linea--${cls}">
      <div class="am-estado"><span class="am-area">${nombre}</span><span class="am-badge am-badge--${cls}">${etq} ${res.cnt}/${res.tot}</span></div>
      ${tramos.length ? `<span class="am-frases">` + tramos.map(t => `<span class="am-frase">${fr(t)}: ${_ausEsc(t.frase)}</span>`).join('') + `</span>` : ''}
    </div>`;
  };
  let tarjetas = '';
  const mesesVentana = areasMesesConAviso();
  const mesesConAviso = []; // meses con algo para atender dentro de la ventana de aviso
  for (let m = 0; m < 12; m++) {
    const hay = AREAS_DEF.some(ar => _areasTramosMes(_areasAnio, m, ar.clave).length);
    const actual = _areasAnio === hoy.getFullYear() && m === hoy.getMonth();
    const pasado = _areasAnio < hoy.getFullYear() || (_areasAnio === hoy.getFullYear() && m < hoy.getMonth());
    if (hay && mesesVentana.has(`${_areasAnio}-${String(m + 1).padStart(2, '0')}`)) mesesConAviso.push(AUS_MESES[m]); // solo lo cercano genera alerta
    tarjetas += `<div class="am-card${actual ? ' am-card--actual' : ''}${pasado ? ' am-card--pasado' : ''}${hay ? ' am-card--aviso' : ''}">
      <div class="am-mes">${AUS_MESES[m]}${actual ? ' <em>este mes</em>' : ''}${pasado ? ' <em class="am-mes__cerrado">cerrado</em>' : ''}</div>
      ${AREAS_DEF.map(ar => linea(ar.nombre, _areasTramosMes(_areasAnio, m, ar.clave), _areasResumenMes(_areasAnio, m, ar.clave))).join('')}
    </div>`;
  }
  return `
    <div class="panel-mes-nav" style="margin:0 0 14px">
      <button class="panel-mes-nav__btn" onclick="areasNavAnio(-1)" title="Año anterior">◀</button>
      <span class="panel-mes-nav__label">${_areasAnio}</span>
      <button class="panel-mes-nav__btn" onclick="areasNavAnio(1)" title="Año siguiente">▶</button>
    </div>
    <div class="am-grid">${tarjetas}</div>
    <div class="am-resumen">${
      mesesConAviso.map(n => `<div class="am-resumen__item"><i class="am-punto"></i>${n} tiene algo para atender</div>`).join('')
      || '<div class="am-resumen__item am-resumen__item--ok">Todos los meses están cubiertos.</div>'}</div>`;
}

// ── Formulario (modal) ──────────────────────────────────────────
function ausAbrirForm(id) {
  ausCerrarForm();
  const a = id ? ausencias.find(x => x.id === id) : null;
  if (a && !_ausEsMia(a)) return;
  const hoyISO = _ausISO(new Date());
  const ov = document.createElement('div');
  ov.id = 'aus-overlay';
  ov.className = 'kb-modal-overlay kb-modal--open';
  ov.innerHTML = `
    <div class="kb-modal-sheet" onclick="event.stopPropagation()" style="max-width:440px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0">${a ? 'Editar ausencia' : 'Cargar mi ausencia'}</div>
        <button onclick="ausCerrarForm()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1">✕</button>
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Tipo</label>
      <select id="aus-tipo" style="width:100%;margin:4px 0 12px">
        ${Object.entries(AUS_TIPOS).map(([k, v]) => `<option value="${k}" ${(a ? a.tipo : 'vacaciones') === k ? 'selected' : ''}>${v.ico} ${v.label}</option>`).join('')}
      </select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:var(--text2)">Fecha de inicio</label>
          <input type="date" id="aus-desde" value="${a ? a.fecha_desde : hoyISO}" oninput="ausActualizarFin()" style="width:100%;margin-top:4px"></div>
        <div><label style="font-size:12px;font-weight:600;color:var(--text2)">Cantidad de días</label>
          <input type="number" id="aus-dias" min="1" max="365" value="${a ? ausDiasEntre(a.fecha_desde, a.fecha_hasta) : 1}" oninput="ausActualizarFin()" style="width:100%;margin-top:4px"></div>
      </div>
      <div id="aus-fin-info" style="font-size:12px;color:var(--text3);margin:-4px 0 12px"></div>
      <label style="font-size:12px;font-weight:600;color:var(--text2)">Nota <span style="font-weight:400;color:var(--text3)">(opcional)</span></label>
      <input type="text" id="aus-nota" maxlength="120" placeholder="Ej: viaje familiar" value="${a ? _ausEsc(a.nota || '') : ''}" style="width:100%;margin:4px 0 16px">
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-secondary" onclick="ausCerrarForm()">Cancelar</button>
        <button class="btn-primary" onclick="ausGuardar('${a ? a.id : ''}')">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ausActualizarFin();
}

// Días corridos entre dos fechas ISO (ambas inclusive)
function ausDiasEntre(desde, hasta) {
  const a = new Date(desde + 'T00:00:00'), b = new Date(hasta + 'T00:00:00');
  return Math.round((b - a) / 86400000) + 1;
}
// Fecha final (inclusive) a partir del inicio y la cantidad de días corridos
function ausFinDesde(desde, dias) {
  const d = new Date(desde + 'T00:00:00');
  d.setDate(d.getDate() + dias - 1);
  return _ausISO(d);
}
function ausActualizarFin() {
  const info = document.getElementById('aus-fin-info');
  if (!info) return;
  const desde = document.getElementById('aus-desde').value;
  const dias = parseInt(document.getElementById('aus-dias').value, 10);
  if (!desde || !(dias >= 1)) { info.textContent = ''; return; }
  const fin = ausFinDesde(desde, dias);
  info.textContent = dias === 1 ? 'Es un solo día.' : `Hasta el ${_ausFmt(fin)} inclusive (días corridos).`;
}

function ausCerrarForm() {
  const ov = document.getElementById('aus-overlay');
  if (ov) ov.remove();
}

async function ausGuardar(id) {
  const tipo  = document.getElementById('aus-tipo').value;
  const desde = document.getElementById('aus-desde').value;
  const dias  = parseInt(document.getElementById('aus-dias').value, 10);
  const nota  = document.getElementById('aus-nota').value.trim();
  if (!desde) { toast('Completá la fecha de inicio'); return; }
  if (!(dias >= 1)) { toast('La cantidad de días debe ser al menos 1'); return; }
  const hasta = ausFinDesde(desde, dias);
  if (typeof currentMember === 'undefined' || !currentMember) { toast('No se pudo identificar tu sesión. Recargá la página.'); return; }
  try {
    if (id) {
      await dbUpdate('equipo_ausencias', id, { tipo, fecha_desde: desde, fecha_hasta: hasta, nota: nota || null, updated_at: new Date().toISOString() });
    } else {
      await dbInsert('equipo_ausencias', {
        miembro_email: _ausEmailPropio() || currentMember.email,
        miembro_nombre: currentMember.nombre,
        tipo, fecha_desde: desde, fecha_hasta: hasta, nota: nota || null
      });
    }
    ausCerrarForm();
    // Mostrar el mes de la ausencia recién cargada
    const [y, m] = desde.split('-').map(Number);
    _ausMes = new Date(y, m - 1, 1);
    await cargarAusencias();
    toast('Ausencia guardada');
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar la ausencia');
  }
}

async function ausEliminar(id) {
  const a = ausencias.find(x => x.id === id);
  if (!a || !_ausEsMia(a)) return;
  if (!confirm('¿Eliminar esta ausencia?')) return;
  try {
    await dbDelete('equipo_ausencias', id);
    await cargarAusencias();
    toast('Ausencia eliminada');
  } catch (e) {
    console.error(e);
    toast('No se pudo eliminar');
  }
}
