// HITOS DE CONSULTAS — cartel de festejo cuando el equipo llega a un
// múltiplo de 500 consultas registradas en el año (500, 1000, 1500, ...).
// No hay nada hardcodeado al número 1000: cada 500 nuevas consultas
// dispara el próximo festejo, para siempre.
//
// Se muestra una sola vez por persona por hito. El "ya lo vi" se guarda en
// Supabase (tabla hitos_consultas_vistos), no en localStorage, para que no
// dependa del navegador ni del dispositivo — si entrás desde el celu y
// desde la compu, no lo ves duplicado.

const HITO_PASO = 500;

let _hitoUltimoVisto = 0;
let _hitoCargado = false;

async function initHitos() {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await sb()
      .from('hitos_consultas_vistos')
      .select('ultimo_hito')
      .eq('user_id', user.id)
      .maybeSingle();
    _hitoUltimoVisto = data?.ultimo_hito || 0;
    _hitoCargado = true;
    checkHitoConsultas();
  } catch (e) {
    console.warn('No se pudo cargar el hito de consultas visto', e);
  }
}

// Consultas del año actual — mismo conteo que ya muestra la card "Consultas
// este año" del Panel general (getConsultasAnio, en charts.js), para que el
// cartel de festejo siempre coincida con ese número.
function _hitoConsultasEsteAnio() {
  if (typeof getConsultasAnio === 'function') {
    return getConsultasAnio(new Date().getFullYear()).length;
  }
  const arr = (typeof consultas !== 'undefined') ? consultas : [];
  const anio = new Date().getFullYear();
  return arr.filter(c => c.timestamp && new Date(c.timestamp).getFullYear() === anio).length;
}

function checkHitoConsultas() {
  if (!_hitoCargado) return;

  const total = _hitoConsultasEsteAnio();
  const hitoActual = Math.floor(total / HITO_PASO) * HITO_PASO;

  if (hitoActual < HITO_PASO) return;        // todavía no llegamos al primer hito
  if (hitoActual <= _hitoUltimoVisto) return; // ya lo festejamos

  mostrarCartelHito(hitoActual, total);
  _guardarHitoVisto(hitoActual);
}

async function _guardarHitoVisto(hito) {
  // Se marca como visto de entrada (antes de esperar la respuesta del
  // server) para no mostrarlo dos veces si llegan varios eventos de
  // realtime seguidos mientras se guarda.
  _hitoUltimoVisto = hito;
  try {
    const user = await getCurrentUser();
    if (!user) return;
    await sb().from('hitos_consultas_vistos').upsert({
      user_id: user.id,
      ultimo_hito: hito,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('No se pudo guardar el hito de consultas visto', e);
  }
}

function mostrarCartelHito(hito, total) {
  const prev = document.getElementById('hito-celebracion');
  if (prev) prev.remove();

  // Si el total es exactamente el hito, "Llegamos a los X". Si ya lo pasamos
  // (por ej. hito=1000 y total=1001), "Superamos los X".
  const verbo = total > hito ? 'Superamos' : 'Llegamos a';

  const el = document.createElement('div');
  el.id = 'hito-celebracion';
  el.className = 'hito-celebracion-overlay';
  el.onclick = (ev) => { if (ev.target === el) el.remove(); };
  el.innerHTML = `
    <div class="hito-celebracion-card">
      <button class="hito-celebracion-close" onclick="document.getElementById('hito-celebracion').remove()">✕</button>
      <div class="hito-celebracion-emoji">🎉</div>
      <div class="hito-celebracion-titulo">¡${verbo} los ${hito.toLocaleString('es-AR')} registros!</div>
      <div class="hito-celebracion-sub">Entre todo el equipo llevamos <strong>${total.toLocaleString('es-AR')}</strong> registros cargados este año. ¡Excelente laburo! 🙌</div>
    </div>`;
  document.body.appendChild(el);
}

window.addEventListener('app-ready', initHitos);
