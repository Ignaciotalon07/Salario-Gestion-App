// saludo.js — Panel General: saludo personalizado + "Tu día"
// Texto liviano debajo del header (saludo + frase + actividad de hoy) y,
// si hay algo urgente, una fila de tiles clickeables con el mismo estilo
// que las metric-card del dashboard.

window.addEventListener('app-ready', () => {
  // Pequeño delay: dejamos que los demás módulos (pendientes, implementación,
  // consultas, clientes, repositorio) terminen de cargar sus datos antes del
  // primer render, para no mostrar todo en cero.
  setTimeout(() => { if (typeof renderSaludoPanel === 'function') renderSaludoPanel(); }, 900);
});

// Varias formas de saludar según el momento del día — para que no suene
// siempre igual, cada entrada elige una al azar entre las que le calzan.
function _saludoOpcionesSaludo(h) {
  if (h < 6 || h >= 20) {
    return [
      (n) => `Buenas noches, ${n}`,
      (n) => `¡Hola, ${n}!`,
      (n) => `¡Bienvenido de nuevo, ${n}!`,
    ];
  }
  if (h < 13) {
    return [
      (n) => `Buenos días, ${n}`,
      (n) => `¡Buen día, ${n}!`,
      (n) => `¡Hola, ${n}!`,
      (n) => `¡Bienvenido de nuevo, ${n}!`,
    ];
  }
  return [
    (n) => `Buenas tardes, ${n}`,
    (n) => `¡Hola, ${n}!`,
    (n) => `¡Bienvenido de nuevo, ${n}!`,
  ];
}

// El saludo se re-renderiza seguido (cada evento de realtime, cada vez que
// entrás al Panel general), así que si eligiéramos una frase al azar en
// cada llamada, cambiaría cada pocos segundos. Para que dure un buen rato
// (horas, no segundos), la elegimos UNA sola vez por franja horaria y la
// cacheamos — solo se vuelve a sortear cuando cambia la franja (mañana,
// tarde, noche) o el nombre del usuario logueado.
let _saludoCacheFranja = null;
let _saludoCacheNombre = null;
let _saludoCacheTexto  = null;

// Mismo criterio para el mensaje del tile de "muchos pendientes vencidos":
// se elige entre un par de variantes al azar, pero se cachea por día (no
// por render) para que no cambie cada vez que llega una actualización por
// realtime — solo se vuelve a sortear si cambia el día o la cantidad.
let _saludoCacheVencidosKey = null;
let _saludoCacheVencidosTexto = null;

// Estado del resumen colapsado de "Tu día" en mobile (persiste entre
// re-renders — si el usuario lo desplegó, no queremos que se vuelva a
// cerrar solo porque llegó un cambio por realtime).
let _saludoTilesExpanded = false;

function toggleSaludoTiles() {
  _saludoTilesExpanded = !_saludoTilesExpanded;
  const list = document.getElementById('saludo-tiles-list');
  const chev = document.getElementById('saludo-tiles-chev');
  if (list) list.classList.toggle('saludo-tiles--open', _saludoTilesExpanded);
  if (chev) chev.textContent = _saludoTilesExpanded ? '▲' : '▼';
}

function _saludoFranja(h) {
  if (h < 6)  return 'noche1';
  if (h < 13) return 'manana';
  if (h < 20) return 'tarde';
  return 'noche2';
}

function _saludoTextoSaludo(h, nombre) {
  const franja = _saludoFranja(h);
  if (_saludoCacheFranja !== franja || _saludoCacheNombre !== nombre) {
    const opciones = _saludoOpcionesSaludo(h);
    _saludoCacheTexto  = opciones[Math.floor(Math.random() * opciones.length)](nombre);
    _saludoCacheFranja = franja;
    _saludoCacheNombre = nombre;
  }
  return _saludoCacheTexto;
}

function _saludoTextoVencidosMuchos(n) {
  const diaKey = new Date().toDateString();
  const cacheKey = diaKey + '|' + n;
  if (_saludoCacheVencidosKey !== cacheKey) {
    const opciones = [
      `Se te acumularon <strong>${n}</strong> pendientes vencidos. Vamos de a poco, arrancá por el más viejo.`,
      `Se te acumularon <strong>${n}</strong> pendientes vencidos. Revisá que no te haya quedado alguno resuelto sin cerrar.`,
    ];
    _saludoCacheVencidosTexto = opciones[Math.floor(Math.random() * opciones.length)];
    _saludoCacheVencidosKey = cacheKey;
  }
  return _saludoCacheVencidosTexto;
}

function _saludoEsHoy(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

function _saludoEsAyer(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return d.getFullYear() === ayer.getFullYear() && d.getMonth() === ayer.getMonth() && d.getDate() === ayer.getDate();
}

function _saludoEsEstaSemana(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const hoy = new Date();
  const diaSemana = (hoy.getDay() + 6) % 7; // lunes=0 ... domingo=6
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - diaSemana);
  inicioSemana.setHours(0, 0, 0, 0);
  return d >= inicioSemana && d <= hoy;
}

function _saludoDiasRestantesMes() {
  const hoy = new Date();
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return ultimoDia - hoy.getDate();
}

// Días que faltan hasta la próxima vez que el mes tenga el día `diaObjetivo`
// (si ya pasó este mes, salta al que viene).
function _saludoDiasHastaDiaDelMes(diaObjetivo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let candidato = new Date(hoy.getFullYear(), hoy.getMonth(), diaObjetivo);
  if (candidato < hoy) {
    candidato = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaObjetivo);
  }
  return Math.round((candidato - hoy) / 86400000);
}

// Fechas de pago quincenal: 1 y 15 de cada mes — devuelve los días hasta
// la más próxima de las dos.
function _saludoDiasHastaProximaQuincena() {
  return Math.min(_saludoDiasHastaDiaDelMes(1), _saludoDiasHastaDiaDelMes(15));
}

// Racha: cantidad de días seguidos (terminando hoy si ya cargó, si no
// terminando ayer) en los que cargó al menos una consulta de soporte.
function _saludoRacha(consultasArr, me) {
  const tieneCargaEseDia = (fecha) => consultasArr.some(c =>
    c.asesor === me && c.tipoConsulta === 'soporte' && new Date(c.timestamp).toDateString() === fecha.toDateString()
  );
  let streak = 0;
  const cursor = new Date();
  if (!tieneCargaEseDia(cursor)) cursor.setDate(cursor.getDate() - 1);
  while (tieneCargaEseDia(cursor)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const SALUDO_HORA_INICIO = 9;  // arranca el turno
const SALUDO_HORA_FIN    = 17; // termina el turno

// Mensaje "vivo": elige UN mensaje entre varios disparadores posibles,
// de más urgente/accionable a más genérico. El primero que aplica gana.
// Los recordatorios/acciones (cargar soporte, tareas por vencer, etc.)
// solo aparecen dentro del horario laboral (09 a 17hs) — fuera de ese
// rango se muestra solo un resumen informativo, sin presionar a hacer
// nada porque todavía no arrancó o ya terminó el turno.
function _saludoElegirMensaje(ctx) {
  const {
    me, h, dia, soporteHoy, clientesHoy, soporteAyer, clientesAyer,
    consultasHoyCount, misPendVencidos, misImplVencidas,
    implArr, pendArr, consultasArr,
  } = ctx;

  const enHorario = h >= SALUDO_HORA_INICIO && h < SALUDO_HORA_FIN;

  // ── Fuera de horario laboral: solo resumen informativo, sin recordatorios ──
  if (!enHorario) {
    if (h < SALUDO_HORA_INICIO) {
      return {
        tono: 'amber',
        texto: `📋 Ayer atendiste a <strong>${clientesAyer}</strong> cliente${clientesAyer !== 1 ? 's' : ''} y cargaste <strong>${soporteAyer}</strong> consulta${soporteAyer !== 1 ? 's' : ''} de soporte.`,
      };
    }
    return {
      tono: 'amber',
      texto: `✅ Hoy atendiste a <strong>${clientesHoy}</strong> cliente${clientesHoy !== 1 ? 's' : ''} y cargaste <strong>${soporteHoy}</strong> consulta${soporteHoy !== 1 ? 's' : ''} de soporte.`,
    };
  }

  // ── Dentro de horario laboral (09 a 17hs): recordatorios y avisos ──

  // 1) Última hora del turno (16 a 17hs) y todavía no cargó ninguna consulta hoy.
  if (h >= SALUDO_HORA_FIN - 1 && consultasHoyCount === 0) {
    return { tono: 'amber', texto: `🔔 Se acerca el fin del turno y todavía no cargaste ninguna consulta hoy. ¿Te olvidaste de alguna?` };
  }

  // 1b) Última hora del turno y sí cargó algo hoy — recordatorio de dejar
  // pendiente lo que haya quedado sin terminar, o algo para hacerle
  // seguimiento en los próximos días (mismo horario que el de arriba,
  // pero la condición contraria: uno u otro se muestra, no los dos).
  if (h >= SALUDO_HORA_FIN - 1 && consultasHoyCount > 0) {
    return {
      tono: 'amber',
      texto: `📌 Antes de cerrar el día: si algo quedó sin terminar, o tenés algo para seguir los próximos días, cargalo como pendiente para no perderlo de vista.`,
      cta: { label: 'Cargar pendiente →', accion: '_saludoIrACargarPendiente()' },
    };
  }

  // 2) Tareas de implementación propias que vencen en las próximas 48hs (preventivo, aún no vencidas).
  const porVencer = implArr.filter(t => {
    if (t.asesor !== me || t.estado === 'completada' || !t.fecha_estimada) return false;
    if (typeof isTareaVencida === 'function' && isTareaVencida(t)) return false;
    const dias = Math.ceil((new Date(t.fecha_estimada) - Date.now()) / 86400000);
    return dias >= 0 && dias <= 2;
  });
  if (porVencer.length === 1) {
    return {
      tono: 'amber',
      texto: `⏳ Tenés 1 tarea de implementación que vence en las próximas 48hs — <strong>${escapeHtmlSaludo(_saludoNombreCliente(porVencer[0].cliente_id))}</strong>.`,
    };
  }
  if (porVencer.length > 1) {
    return {
      tono: 'amber',
      texto: `⏳ Tenés <strong>${porVencer.length}</strong> tareas de implementación que vencen en las próximas 48hs.`,
    };
  }

  // 3) Se acerca el arranque de una liquidación: quincenales pagan el 1 y
  // el 15 (aviso hasta 5 días antes), mensuales pagan cerca del 5 (aviso
  // hasta una semana antes). Solo mientras falta para el arranque — el
  // día de pago en sí ya debería estar liquidado, no "por arrancar". Si
  // las dos aplican al mismo tiempo, gana la más próxima.
  const diasQuincena = _saludoDiasHastaProximaQuincena();
  const diasMensual  = _saludoDiasHastaDiaDelMes(5);
  const avisosLiq = [];
  if (diasQuincena >= 1 && diasQuincena <= 5) {
    avisosLiq.push({
      dias: diasQuincena,
      texto: `🧾 En <strong>${diasQuincena}</strong> día${diasQuincena !== 1 ? 's' : ''} debería arrancar la liquidación de quincenales.`,
    });
  }
  if (diasMensual >= 1 && diasMensual <= 7) {
    avisosLiq.push({
      dias: diasMensual,
      texto: diasMensual >= 6
        ? `🧾 La semana que viene arranca la liquidación de los mensuales.`
        : `🧾 En <strong>${diasMensual}</strong> día${diasMensual !== 1 ? 's' : ''} debería arrancar la liquidación de los mensuales.`,
    });
  }
  if (avisosLiq.length > 0) {
    avisosLiq.sort((a, b) => a.dias - b.dias);
    return { tono: 'blue', texto: avisosLiq[0].texto };
  }

  // 4) Alguien del equipo subió algo nuevo al Repositorio desde tu última
  // visita (no cuenta lo que subiste vos mismo).
  const repoArr   = (typeof repoItems !== 'undefined') ? repoItems : [];
  const repoVisto = (typeof _repoUltimoVisto !== 'undefined') ? _repoUltimoVisto : null;
  const nuevosRepoOtros = repoArr.filter(i => {
    if (!i.created_at || i.subido_por === me) return false;
    return !repoVisto || new Date(i.created_at) > new Date(repoVisto);
  });
  if (nuevosRepoOtros.length > 0) {
    const autores = [...new Set(nuevosRepoOtros.map(i => i.subido_por).filter(Boolean))];
    let texto;
    if (nuevosRepoOtros.length === 1) {
      texto = `🆕 <strong>${escapeHtmlSaludo(autores[0] || 'Alguien del equipo')}</strong> subió algo nuevo al Repositorio: "${escapeHtmlSaludo(nuevosRepoOtros[0].titulo || 'sin título')}".`;
    } else if (autores.length === 1) {
      texto = `🆕 <strong>${escapeHtmlSaludo(autores[0])}</strong> subió <strong>${nuevosRepoOtros.length}</strong> items nuevos al Repositorio.`;
    } else {
      texto = `🆕 Hay <strong>${nuevosRepoOtros.length}</strong> items nuevos en el Repositorio (${autores.map(a => escapeHtmlSaludo(a)).join(', ')}).`;
    }
    return { tono: 'blue', texto, cta: { label: 'Revisar →', accion: '_saludoIrARepositorio()' } };
  }

  // 4b) Viernes desde las 16hs, solo para Ignacio y Matías: recordatorio de
  // cierre de semana de Implementación — las dos cosas juntas (actualizar el
  // módulo con el avance de la semana y enviar el informe a los clientes),
  // no una u otra. Tiene prioridad sobre el aviso genérico de "cerrando la
  // semana" (siguiente punto) para que no se lo tape.
  if (dia === 5 && h >= 16 && (me === 'Ignacio Talon' || me === 'Matias Ferro')) {
    return {
      tono: 'blue',
      texto: `📄 Antes de cerrar la semana: actualizá el módulo de Implementación con el avance de la semana y enviá el informe semanal a los clientes correspondientes, si aún no lo hiciste.`,
      cta: { label: 'Ir a Implementación →', accion: '_saludoIrAImplMias()' },
    };
  }

  // 5) Viernes desde media tarde: cierre de semana.
  if (dia === 5 && h >= 15) {
    const consultasSemana = consultasArr.filter(c => c.asesor === me && _saludoEsEstaSemana(c.timestamp));
    const soporteSemana = consultasSemana.filter(c => c.tipoConsulta === 'soporte').length;
    const clientesSemana = new Set(consultasSemana.map(c => c.cliente).filter(Boolean)).size;
    return {
      tono: 'green',
      texto: `🎉 Cerrando la semana: atendiste a <strong>${clientesSemana}</strong> cliente${clientesSemana !== 1 ? 's' : ''} y cargaste <strong>${soporteSemana}</strong> consulta${soporteSemana !== 1 ? 's' : ''} de soporte. ¡Buen finde!`,
    };
  }

  // 6) Quedan 2 días o menos para el cierre del mes.
  const diasCierre = _saludoDiasRestantesMes();
  if (diasCierre <= 2) {
    return {
      tono: 'blue',
      texto: diasCierre === 0
        ? `📆 Hoy cierra el mes — revisá que tus consultas estén todas cargadas.`
        : `📆 Quedan <strong>${diasCierre}</strong> día${diasCierre !== 1 ? 's' : ''} para el cierre del mes, revisá que tus consultas estén cargadas.`,
    };
  }

  // 7) Racha de 3+ días seguidos cargando soporte.
  const racha = _saludoRacha(consultasArr, me);
  if (racha >= 3) {
    return { tono: 'green', texto: `🔥 Llevás <strong>${racha}</strong> días seguidos cargando el soporte del día. ¡No cortes la racha!` };
  }

  // 8) A la mañana: pendiente(s) propio(s) que quedaron abiertos desde
  // ayer (no es lo mismo que "vencido" — es simplemente un recordatorio
  // suave de lo que dejaste colgado el día anterior).
  if (h < 12) {
    const deAyer = pendArr.filter(p => p.asesor === me && _saludoEsAyer(p.createdAt));
    if (deAyer.length === 1) {
      const p = deAyer[0];
      return {
        tono: 'blue',
        texto: `🗒️ Te cuento: tenés este pendiente que te quedó de ayer — <strong>${escapeHtmlSaludo(p.cliente || '')}</strong>${p.descripcion ? ': ' + escapeHtmlSaludo(p.descripcion) : ''}.`,
        cta: { label: 'Ver pendientes →', accion: '_saludoIrAPendientes()' },
      };
    }
    if (deAyer.length > 1) {
      return {
        tono: 'blue',
        texto: `🗒️ Te quedaron <strong>${deAyer.length}</strong> pendientes de ayer sin resolver.`,
        cta: { label: 'Ver pendientes →', accion: '_saludoIrAPendientes()' },
      };
    }
  }

  // 9) A la mañana: pendientes con prioridad media/alta que dejaste
  // abiertos esta semana (sin contar hoy/ayer, ya cubiertos arriba, ni
  // los ya vencidos, que tienen su propio aviso más fuerte).
  if (h < 12) {
    const prioritarios = pendArr.filter(p => {
      if (p.asesor !== me) return false;
      if (p.prioridad !== 'alta' && p.prioridad !== 'media') return false;
      if (_saludoEsHoy(p.createdAt) || _saludoEsAyer(p.createdAt)) return false;
      if (!_saludoEsEstaSemana(p.createdAt)) return false;
      const v = (typeof vencimientoInfo === 'function') ? vencimientoInfo(p.createdAt) : null;
      return !(v && v.urgente);
    });
    if (prioritarios.length === 1) {
      const p = prioritarios[0];
      const prioLabel = p.prioridad === 'alta' ? 'alta' : 'media';
      return {
        tono: 'blue',
        texto: `📌 Dejaste un pendiente con ${prioLabel} prioridad para esta semana — <strong>${escapeHtmlSaludo(p.cliente || '')}</strong>.`,
        cta: { label: 'Ver pendientes →', accion: '_saludoIrAPendientes()' },
      };
    }
    if (prioritarios.length > 1) {
      return {
        tono: 'blue',
        texto: `📌 Tenés <strong>${prioritarios.length}</strong> pendientes con prioridad media/alta para esta semana.`,
        cta: { label: 'Ver pendientes →', accion: '_saludoIrAPendientes()' },
      };
    }
  }

  // 10) Lunes a la mañana con pendientes propios.
  if (dia === 1 && h < 12) {
    const misPend = pendArr.filter(p => p.asesor === me).length;
    if (misPend > 0) {
      return { tono: 'amber', texto: `📅 Arrancás la semana con <strong>${misPend}</strong> pendiente${misPend !== 1 ? 's' : ''}. Vamos con todo.` };
    }
  }

  // 11) Sin nada urgente pendiente. Antes del mediodía alcanza con no tener
  // nada urgente para saludar bien; de 12hs en adelante además pedimos que
  // ya haya cargado algo hoy, si no priorizamos el recordatorio de carga.
  if (misPendVencidos === 0 && misImplVencidas === 0) {
    if (h < 12) {
      return { tono: 'green', texto: `🌤️ Arrancás el día sin nada urgente pendiente. ¡Buen día!` };
    }
    if (consultasHoyCount > 0) {
      return { tono: 'green', texto: `🙌 Por ahora no tenés nada urgente pendiente. Seguís bien encaminado.` };
    }
  }

  // 12) Fallback dentro de horario: recordatorio de carga.
  if (h < 12) {
    return {
      tono: 'amber',
      texto: `📋 Ayer atendiste a <strong>${clientesAyer}</strong> cliente${clientesAyer !== 1 ? 's' : ''} y cargaste <strong>${soporteAyer}</strong> consulta${soporteAyer !== 1 ? 's' : ''} de soporte.`,
    };
  }
  return { tono: 'amber', texto: _saludoTextoFallbackFinal(me, h) };
}

// Mensaje "de cierre" (fallback final del horario laboral, h >= 12). Para
// Ignacio y Matías, a partir de las 15hs alterna con un recordatorio para
// actualizar el módulo de Implementación — cacheado por día para que no
// cambie en cada re-render (mismo criterio que el resto de las variantes).
let _saludoCacheImplKey   = null;
let _saludoCacheImplTexto = null;

function _saludoTextoFallbackFinal(me, h) {
  const textoSoporte = '🔔 No te olvides de cargar el soporte que atendiste hoy.';

  const esEquipoImpl = me === 'Ignacio Talon' || me === 'Matias Ferro';
  if (!esEquipoImpl || h < 15) return textoSoporte;

  const cacheKey = new Date().toDateString() + '|' + me;
  if (_saludoCacheImplKey !== cacheKey) {
    const opciones = [
      textoSoporte,
      '🛠️ No te olvides de actualizar el módulo de Implementación con el avance de hoy.',
    ];
    _saludoCacheImplTexto = opciones[Math.floor(Math.random() * opciones.length)];
    _saludoCacheImplKey = cacheKey;
  }
  return _saludoCacheImplTexto;
}

function renderSaludoPanel() {
  const cont = document.getElementById('panel-saludo');
  if (!cont) return;

  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  if (!me) { cont.innerHTML = ''; return; }

  const primerNombre = me.split(' ')[0];
  const horaActual = new Date().getHours();
  const saludoCompleto = _saludoTextoSaludo(horaActual, escapeHtmlSaludo(primerNombre));

  // ── Actividad: consultas cargadas + clientes atendidos, hoy y ayer ──
  const consultasArr = (typeof consultas !== 'undefined') ? consultas : [];
  const consultasHoy = consultasArr.filter(c => c.asesor === me && _saludoEsHoy(c.timestamp));
  const soporteHoy   = consultasHoy.filter(c => c.tipoConsulta === 'soporte').length;
  const clientesHoy  = new Set(consultasHoy.map(c => c.cliente).filter(Boolean)).size;

  const consultasAyer = consultasArr.filter(c => c.asesor === me && _saludoEsAyer(c.timestamp));
  const soporteAyer    = consultasAyer.filter(c => c.tipoConsulta === 'soporte').length;
  const clientesAyer   = new Set(consultasAyer.map(c => c.cliente).filter(Boolean)).size;

  // ── Tiles de "Tu día" ──
  const pendArr = (typeof pendientes !== 'undefined') ? pendientes : [];
  const misPendVencidos = pendArr.filter(p => {
    if (p.asesor !== me) return false;
    const v = (typeof vencimientoInfo === 'function') ? vencimientoInfo(p.createdAt) : null;
    return v && v.urgente;
  }).length;

  const implArr = (typeof implTareas !== 'undefined') ? implTareas : [];
  const misImplVencidasArr = implArr.filter(t =>
    t.asesor === me && (typeof isTareaVencida === 'function' ? isTareaVencida(t) : false)
  );
  const misImplVencidas = misImplVencidasArr.length;
  const misImplEnProgreso = implArr.filter(t => t.asesor === me && t.estado === 'en_progreso').length;

  const repoNuevos = (typeof _repoNuevosCount === 'function') ? _repoNuevosCount() : 0;

  const kbArr = (typeof soluciones !== 'undefined') ? soluciones : [];
  const kbParaRevisar = kbArr.filter(s => {
    const dias = s.updatedAt || s.createdAt
      ? Math.floor((Date.now() - new Date(s.updatedAt || s.createdAt)) / (1000 * 60 * 60 * 24))
      : 0;
    return dias > 60 && dias <= 120 && (s.usos || 0) > 0;
  }).length;

  // Con mucho acumulado, el tono cambia de "informativo" a "contenedor" —
  // no es lo mismo tener 1 vencido que 8, no tiene sentido sonar igual de
  // neutro en los dos casos.
  const PEND_VENCIDOS_MUCHOS = 5;
  const IMPL_VENCIDAS_MUCHAS = 3;

  const tiles = [
    {
      count: misPendVencidos, color: '#c0392b', icon: '🔴',
      msg: misPendVencidos >= PEND_VENCIDOS_MUCHOS
        ? _saludoTextoVencidosMuchos(misPendVencidos)
        : `Tenés <strong>${misPendVencidos}</strong> pendiente${misPendVencidos !== 1 ? 's' : ''} vencido${misPendVencidos !== 1 ? 's' : ''}.`,
      cta: 'Ver pendientes →', accion: '_saludoIrAPendientesVencidos()',
    },
    {
      count: misImplVencidas, color: '#b45309', icon: '⏰',
      msg: misImplVencidas >= IMPL_VENCIDAS_MUCHAS
        ? `Se te acumularon <strong>${misImplVencidas}</strong> tareas de implementación vencidas. Vamos ordenando de a una.`
        : misImplVencidas === 1
          ? `Tenés 1 tarea de implementación vencida — <strong>${escapeHtmlSaludo(_saludoNombreCliente(misImplVencidasArr[0].cliente_id))}</strong>.`
          : `Hay <strong>${misImplVencidas}</strong> tareas de implementación vencidas.`,
      cta: 'Ver implementación →', accion: '_saludoIrAImplMias()',
    },
    {
      count: misImplEnProgreso, color: '#1a5fa5', icon: '▶',
      msg: `Tenés <strong>${misImplEnProgreso}</strong> tarea${misImplEnProgreso !== 1 ? 's' : ''} de implementación en progreso.`,
      cta: 'Ver implementación →', accion: '_saludoIrAImplMias()',
    },
    {
      count: repoNuevos, color: '#2d6a2d', icon: '📁',
      msg: `Hay <strong>${repoNuevos}</strong> item${repoNuevos !== 1 ? 's' : ''} nuevo${repoNuevos !== 1 ? 's' : ''} en el Repositorio.`,
      cta: 'Ver repositorio →', accion: '_saludoIrARepositorio()',
    },
    {
      count: kbParaRevisar, color: '#7c3aed', icon: '📚',
      msg: `Hay <strong>${kbParaRevisar}</strong> solución${kbParaRevisar !== 1 ? 'es' : ''} para revisar en la base de soluciones.`,
      cta: 'Ver base de soluciones →', accion: '_saludoIrABiblioteca()',
    },
  ].filter(t => t.count > 0);

  // Nota: si no hay tiles urgentes no se agrega texto extra acá — el
  // cartelito de arriba (_saludoElegirMensaje) ya cubre ese caso con un
  // mensaje positivo propio (ver disparador 8, "Día liviano"), así
  // evitamos mostrar dos carteles verdes diciendo básicamente lo mismo.
  //
  // En mobile las 4 tarjetas apiladas se sentían "grandes" y desconectadas
  // del resto — se reemplazan por un resumen colapsado ("⚠️ Tenés N cosas
  // para revisar hoy") que se puede desplegar. En desktop este botón queda
  // oculto por CSS y las tiles se ven expandidas como siempre.
  const tilesHTML = tiles.length > 0
    ? `
      <button class="saludo-tiles-toggle" onclick="toggleSaludoTiles()">
        <span class="saludo-tiles-toggle__icon">⚠️</span>
        <span class="saludo-tiles-toggle__text">Tenés <strong>${tiles.length}</strong> cosa${tiles.length !== 1 ? 's' : ''} para revisar hoy</span>
        <span class="saludo-tiles-toggle__chev" id="saludo-tiles-chev">${_saludoTilesExpanded ? '▲' : '▼'}</span>
      </button>
      <div class="saludo-tiles${_saludoTilesExpanded ? ' saludo-tiles--open' : ''}" id="saludo-tiles-list">${tiles.map(t => `
        <button class="saludo-tile" style="--tile-color:${t.color}" onclick="${t.accion}">
          <span class="saludo-tile__icon">${t.icon}</span>
          <div class="saludo-tile__msg">${t.msg}</div>
          <div class="saludo-tile__cta">${t.cta}</div>
        </button>`).join('')}</div>`
    : '';

  const ahora = new Date();
  const mensaje = _saludoElegirMensaje({
    me, h: ahora.getHours(), dia: ahora.getDay(),
    soporteHoy, clientesHoy, soporteAyer, clientesAyer,
    consultasHoyCount: consultasHoy.length, misPendVencidos, misImplVencidas,
    implArr, pendArr, consultasArr,
  });

  cont.innerHTML = `
    <div class="saludo-greet">
      <div class="saludo-greet__titulo">
        <span class="saludo-greet__texto">${saludoCompleto}</span>
      </div>
    </div>
    <div class="alert alert-${mensaje.tono} saludo-cartelito">
      <span class="saludo-cartelito__texto">${mensaje.texto}</span>
      ${mensaje.cta ? `<button class="saludo-cartelito__cta" onclick="${mensaje.cta.accion}">${mensaje.cta.label}</button>` : ''}
    </div>
    ${tilesHTML}`;
}

// ── Navegación desde los tiles ──
function _saludoNavBtn(seccion) {
  return document.querySelector(`.nav-item[onclick*="${seccion}"]`);
}

function _saludoIrAPendientesVencidos() {
  goTo(_saludoNavBtn('pendientes'), 'pendientes');
  setTimeout(() => {
    if (typeof setViewMode === 'function') setViewMode('mis');
    const btn = document.getElementById('pend-vencido-btn');
    if (btn && typeof toggleVencidoFilter === 'function' && !btn.classList.contains('active')) {
      toggleVencidoFilter(btn);
    }
  }, 50);
}

// Como la de arriba, pero sin forzar el filtro de "vencidos" — para
// recordatorios que no son necesariamente vencidos (pendiente de ayer,
// prioridad de la semana, etc.).
function _saludoIrAPendientes() {
  goTo(_saludoNavBtn('pendientes'), 'pendientes');
  setTimeout(() => {
    if (typeof setViewMode === 'function') setViewMode('mis');
  }, 50);
}

// Va a Pendientes y abre directo el formulario de "Nuevo pendiente"
// (recordatorio de fin de turno para cargar lo que quedó sin terminar).
function _saludoIrACargarPendiente() {
  goTo(_saludoNavBtn('pendientes'), 'pendientes');
  setTimeout(() => {
    if (typeof setViewMode === 'function') setViewMode('mis');
    if (typeof showPendForm === 'function') showPendForm();
  }, 50);
}

function _saludoIrAImplMias() {
  goTo(_saludoNavBtn('implementacion'), 'implementacion');
  setTimeout(() => {
    const btn = document.querySelector('[data-impl-filter="asesor"][data-value="mis"]');
    if (btn && typeof setImplFiltroAsesor === 'function') setImplFiltroAsesor(btn, 'mis');
  }, 50);
}

function _saludoIrARepositorio() {
  goTo(_saludoNavBtn('repositorio'), 'repositorio');
}

function _saludoIrABiblioteca() {
  goTo(_saludoNavBtn('biblioteca'), 'biblioteca');
}

// Nombre de cliente a partir de un cliente_id — usado para nombrar al
// cliente cuando solo hay 1 tarea de implementación vencida/por vencer,
// en vez de dejarlo como un número pelado.
function _saludoNombreCliente(clienteId) {
  const arr = (typeof clientes !== 'undefined') ? clientes : [];
  const c = arr.find(c => c.id === clienteId);
  return c ? c.nombre : 'un cliente';
}

function escapeHtmlSaludo(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
