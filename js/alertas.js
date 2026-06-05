// ALERTAS DINÁMICAS
// Genera alertas reales a partir de los arrays globales: clientes, consultas, pendientes.
// refreshAlertas() se llama desde charts.js (refreshPanelMetrics / refreshClientMetrics)
// y desde pendientes.js (handlePendienteChange / initPendientes).

// ────────── Helpers locales ──────────

function _alEscHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _alDiasDesde(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ────────── Función principal ──────────

function refreshAlertas() {
  const ahora       = new Date();
  const allConsultas  = (typeof consultas  !== 'undefined') ? consultas  : [];
  const allClientes   = (typeof clientes   !== 'undefined') ? clientes   : [];
  const allPendientes = (typeof pendientes !== 'undefined') ? pendientes : [];

  const alertas = []; // [{ tipo, titulo, texto, accion?, onClick? }]

  // Consultas de este mes
  const mesActual = allConsultas.filter(c => {
    const d = new Date(c.timestamp);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });

  // ── 1. REPETICIÓN ELEVADA por cliente (>= 40% repetidas, mínimo 3 consultas) ──
  const statsMes = {};
  mesActual.forEach(c => {
    if (!c.cliente) return;
    if (!statsMes[c.cliente]) statsMes[c.cliente] = { total: 0, rep: 0 };
    statsMes[c.cliente].total++;
    if (c.repetida === 'si') statsMes[c.cliente].rep++;
  });
  Object.entries(statsMes).forEach(([nombre, s]) => {
    if (s.total < 3) return;
    const pct = Math.round((s.rep / s.total) * 100);
    if (pct < 40) return;
    const cli = allClientes.find(c => c.nombre === nombre);
    alertas.push({
      tipo:    'red',
      titulo:  nombre + ' — repetición elevada',
      texto:   `${pct}% de consultas repetidas este mes (${s.rep} de ${s.total}). Algo no se está resolviendo de raíz.`,
      accion:  'Ver cliente',
      onClick: cli ? `goClienteDetail('${cli.id}')` : null
    });
  });

  // ── 2. SCORE BAJO (> 0 y < 4) ──
  const bajosScore = allClientes.filter(c => c.score > 0 && c.score < 4);
  if (bajosScore.length === 1) {
    const c = bajosScore[0];
    alertas.push({
      tipo:    'red',
      titulo:  c.nombre + ' — score de riesgo bajo',
      texto:   `Score ${c.score}/10. Autonomía ${c.autonomia || '—'} y adopción del ${c.adopcion || 0}%. Requiere atención.`,
      accion:  'Ver cliente',
      onClick: `goClienteDetail('${c.id}')`
    });
  } else if (bajosScore.length > 1) {
    alertas.push({
      tipo:    'red',
      titulo:  bajosScore.length + ' clientes con score bajo',
      texto:   bajosScore.map(c => `${c.nombre} (${c.score}/10)`).join(', ') + '. Revisá su situación.',
      accion:  'Ver clientes',
      onClick: `goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes')`
    });
  }

  // ── 3. ADOPCIÓN ESTANCADA (soporte, < 50%) ──
  const bajaAdopcion = allClientes.filter(c => c.area === 'soporte' && (c.adopcion || 0) < 50);
  if (bajaAdopcion.length === 1) {
    const c = bajaAdopcion[0];
    alertas.push({
      tipo:    'amber',
      titulo:  c.nombre + ' — adopción baja',
      texto:   `Solo el ${c.adopcion || 0}% de adopción de herramientas. No están aprovechando el sistema al máximo.`,
      accion:  'Ver cliente',
      onClick: `goClienteDetail('${c.id}')`
    });
  } else if (bajaAdopcion.length > 1) {
    alertas.push({
      tipo:    'amber',
      titulo:  bajaAdopcion.length + ' clientes con adopción baja',
      texto:   bajaAdopcion.map(c => `${c.nombre} (${c.adopcion || 0}%)`).join(', ') + '.',
      accion:  'Ver clientes',
      onClick: `goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes')`
    });
  }

  // ── 4. SIN ACTIVIDAD RECIENTE (soporte, autonomía baja/media, sin consulta en 60+ días) ──
  const sinActividad = allClientes.filter(c => {
    if (c.area !== 'soporte' || c.autonomia === 'alta') return false;
    const consultasCli = allConsultas
      .filter(q => q.cliente === c.nombre)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (consultasCli.length === 0) return false; // nunca llamaron → cliente nuevo, no alertar
    return _alDiasDesde(consultasCli[0].timestamp) > 60;
  });
  if (sinActividad.length === 1) {
    const c = sinActividad[0];
    const ultima = allConsultas
      .filter(q => q.cliente === c.nombre)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    alertas.push({
      tipo:    'amber',
      titulo:  c.nombre + ' — sin actividad reciente',
      texto:   `Última consulta hace ${_alDiasDesde(ultima.timestamp)} días. Autonomía ${c.autonomia}. Puede ser señal de desconexión.`,
      accion:  'Ver cliente',
      onClick: `goClienteDetail('${c.id}')`
    });
  } else if (sinActividad.length > 1) {
    alertas.push({
      tipo:    'amber',
      titulo:  sinActividad.length + ' clientes sin actividad en 60+ días',
      texto:   sinActividad.map(c => c.nombre).join(', ') + '. Revisá si siguen activos.',
      accion:  'Ver clientes',
      onClick: `goTo(document.querySelector('.nav-item[onclick*=clientes]'), 'clientes')`
    });
  }

  // ── 5. PENDIENTES VENCIDOS (abiertos > 5 días) ──
  const pendVencidos = allPendientes
    .filter(p => !p.resuelto && _alDiasDesde(p.createdAt) > 5)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (pendVencidos.length > 0) {
    const masViejo  = pendVencidos[0];
    const diasViejo = _alDiasDesde(masViejo.createdAt);
    const sufijo    = pendVencidos.length > 1 ? ` y ${pendVencidos.length - 1} más.` : '.';
    alertas.push({
      tipo:    'red',
      titulo:  pendVencidos.length + ' pendiente' + (pendVencidos.length !== 1 ? 's' : '') + ' vencido' + (pendVencidos.length !== 1 ? 's' : ''),
      texto:   `El más antiguo es de ${masViejo.cliente || '—'} (${masViejo.asesor || 'sin asesor'}), abierto hace ${diasViejo} días${sufijo}`,
      accion:  'Ver pendientes',
      onClick: `goTo(document.querySelector('.nav-item[onclick*=pendientes]'), 'pendientes')`
    });
  }

  // ── 6. PENDIENTES PRÓXIMOS A VENCER (abiertos 3–5 días) ──
  const pendPorVencer = allPendientes.filter(p => {
    const d = _alDiasDesde(p.createdAt);
    return !p.resuelto && d >= 3 && d <= 5;
  });
  if (pendPorVencer.length > 0) {
    const clientesAfectados = [...new Set(pendPorVencer.map(p => p.cliente).filter(Boolean))];
    const listaClientes = clientesAfectados.slice(0, 3).join(', ') + (clientesAfectados.length > 3 ? ' y más' : '');
    alertas.push({
      tipo:    'amber',
      titulo:  pendPorVencer.length + ' pendiente' + (pendPorVencer.length !== 1 ? 's' : '') + ' próximo' + (pendPorVencer.length !== 1 ? 's' : '') + ' a vencer',
      texto:   `Llevan entre 3 y 5 días sin cerrarse: ${listaClientes}.`,
      accion:  'Ver pendientes',
      onClick: `goTo(document.querySelector('.nav-item[onclick*=pendientes]'), 'pendientes')`
    });
  }

  // ── 7. ASESOR SOBRECARGADO (>= 2x el promedio del equipo, mínimo 5 consultas) ──
  const ASESORES_BASE = ['Ignacio Talon', 'Matias Ferro', 'Daniel Colomer', 'Renzo Moretti'];
  const contAsesor = {};
  ASESORES_BASE.forEach(a => { contAsesor[a] = 0; });
  mesActual.forEach(c => { if (c.asesor && contAsesor.hasOwnProperty(c.asesor)) contAsesor[c.asesor]++; });
  const totalesConDatos = Object.values(contAsesor).filter(v => v > 0);
  if (totalesConDatos.length > 1) {
    const promedio = totalesConDatos.reduce((s, v) => s + v, 0) / totalesConDatos.length;
    Object.entries(contAsesor).forEach(([nombre, count]) => {
      if (count >= 2 * promedio && count >= 5) {
        alertas.push({
          tipo:    'blue',
          titulo:  'Sobrecarga detectada — ' + nombre,
          texto:   `${count} consultas este mes vs promedio del equipo de ${Math.round(promedio)}. Revisá la distribución de clientes.`,
          accion:  'Ver equipo',
          onClick: `goTo(document.querySelector('.nav-item[onclick*=equipo]'), 'equipo')`
        });
      }
    });
  }

  // ── ALERTAS DE IMPLEMENTACIÓN ──
  const allImplTareas = (typeof implTareas !== 'undefined') ? implTareas : [];

  if (allImplTareas.length > 0) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // ── A. TAREAS VENCIDAS (fecha_estimada < hoy, no completadas) ──
    const tareasVencidas = allImplTareas.filter(t => {
      if (t.estado === 'completada') return false;
      if (!t.fecha_estimada) return false;
      return new Date(t.fecha_estimada) < hoy;
    });
    if (tareasVencidas.length > 0) {
      // Agrupar por cliente
      const porCliente = {};
      tareasVencidas.forEach(t => {
        const cli = allClientes.find(c => c.id === t.cliente_id);
        const nombre = cli ? cli.nombre : 'cliente desconocido';
        if (!porCliente[nombre]) porCliente[nombre] = { count: 0, id: cli?.id };
        porCliente[nombre].count++;
      });
      const clientesAfectados = Object.entries(porCliente);
      if (clientesAfectados.length === 1) {
        const [nombre, info] = clientesAfectados[0];
        alertas.push({
          tipo:    'red',
          titulo:  nombre + ' — ' + info.count + ' tarea' + (info.count !== 1 ? 's' : '') + ' de impl. vencida' + (info.count !== 1 ? 's' : ''),
          texto:   `La${info.count !== 1 ? 's' : ''} fecha${info.count !== 1 ? 's' : ''} estimada${info.count !== 1 ? 's' : ''} ya pasaron y la${info.count !== 1 ? 's' : ''} tarea${info.count !== 1 ? 's' : ''} sigue${info.count === 1 ? '' : 'n'} sin completarse.`,
          accion:  'Ver implementación',
          onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
        });
      } else {
        const resumen = clientesAfectados.map(([n, i]) => `${n} (${i.count})`).join(', ');
        alertas.push({
          tipo:    'red',
          titulo:  tareasVencidas.length + ' tareas de implementación vencidas',
          texto:   `En ${clientesAfectados.length} clientes: ${resumen}.`,
          accion:  'Ver implementación',
          onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
        });
      }
    }

    // ── B. IMPLEMENTACIONES CERCA DEL DEADLINE (fecha_fin_objetivo en ≤14 días) ──
    const clientesCercaDeadline = allClientes.filter(c => {
      if (c.area !== 'impl' || !c.fecha_fin_objetivo) return false;
      const diff = (new Date(c.fecha_fin_objetivo) - hoy) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 14;
    });
    clientesCercaDeadline.forEach(c => {
      const diasRestantes = Math.round((new Date(c.fecha_fin_objetivo) - hoy) / (1000 * 60 * 60 * 24));
      const tareasInc = allImplTareas.filter(t => t.cliente_id === c.id && t.estado !== 'completada').length;
      alertas.push({
        tipo:    'amber',
        titulo:  c.nombre + ' — deadline en ' + diasRestantes + ' día' + (diasRestantes !== 1 ? 's' : ''),
        texto:   `La implementación vence el ${new Date(c.fecha_fin_objetivo).toLocaleDateString('es-AR')} y quedan ${tareasInc} tarea${tareasInc !== 1 ? 's' : ''} sin completar.`,
        accion:  'Ver implementación',
        onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
      });
    });

    // ── C. TAREAS MARCADAS COMO DEMORADAS ──
    const tareasDemoradas = allImplTareas.filter(t => t.estado === 'demorada');
    if (tareasDemoradas.length > 0) {
      const porClienteDem = {};
      tareasDemoradas.forEach(t => {
        const cli = allClientes.find(c => c.id === t.cliente_id);
        const nombre = cli ? cli.nombre : 'desconocido';
        if (!porClienteDem[nombre]) porClienteDem[nombre] = 0;
        porClienteDem[nombre]++;
      });
      const resumenDem = Object.entries(porClienteDem).map(([n, c]) => `${n} (${c})`).join(', ');
      alertas.push({
        tipo:    'amber',
        titulo:  tareasDemoradas.length + ' tarea' + (tareasDemoradas.length !== 1 ? 's' : '') + ' de implementación demorada' + (tareasDemoradas.length !== 1 ? 's' : ''),
        texto:   resumenDem + '.',
        accion:  'Ver implementación',
        onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
      });
    }

    // ── D. TAREAS DEL EQUIPO SIN ASESOR ASIGNADO ──
    const sinAsesor = allImplTareas.filter(t =>
      t.responsable_tipo === 'equipo' && !t.asesor && t.estado === 'pendiente'
    );
    if (sinAsesor.length > 0) {
      const clientesSinAsesor = [...new Set(sinAsesor.map(t => {
        const cli = allClientes.find(c => c.id === t.cliente_id);
        return cli ? cli.nombre : null;
      }).filter(Boolean))];
      alertas.push({
        tipo:    'blue',
        titulo:  sinAsesor.length + ' tarea' + (sinAsesor.length !== 1 ? 's' : '') + ' de impl. sin asesor asignado',
        texto:   `En ${clientesSinAsesor.join(', ')}. Asigná un responsable para que avancen.`,
        accion:  'Ver implementación',
        onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
      });
    }

    // ── E. HITOS DE PROGRESO Y COMPLETADO ──
    // Incluye clientes en 'impl' y también los de 'soporte' que aún tienen tareas de impl
    const idsConTareasImpl = new Set(allImplTareas.map(t => t.cliente_id));
    const clientesImpl = allClientes.filter(c =>
      c.area === 'impl' || (c.area === 'soporte' && idsConTareasImpl.has(c.id))
    );
    clientesImpl.forEach(c => {
      const tareasCli = allImplTareas.filter(t => t.cliente_id === c.id);
      if (tareasCli.length === 0) return;
      const total = tareasCli.length;
      const completas = tareasCli.filter(t => t.estado === 'completada').length;
      const pct = Math.round((completas / total) * 100);

      if (tareasCli.every(t => t.estado === 'completada')) {
        // 100% — implementación completa
        alertas.push({
          tipo:    'green',
          titulo:  c.nombre + ' — implementación completa 🎉',
          texto:   `Las ${total} etapas están completadas. ¡Listo para pasar a soporte!`,
          accion:  null,
          onClick: null
        });
      } else if ((completas / total) >= 0.30) {
        // 30% — hito de avance
        alertas.push({
          tipo:    'green',
          titulo:  c.nombre + ' — superó el 30% de implementación 🚀',
          texto:   `${completas} de ${total} tareas completadas (${pct}%). ¡Buen ritmo, el equipo está avanzando!`,
          accion:  'Ver implementación',
          onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
        });
      }

      // ── Hito de fase: alerta cuando el cliente está en una fase nueva ──
      // La "fase activa" es la primera fase con tareas incompletas.
      const IMPL_FASES_KEYS = ['relevamiento', 'configuracion', 'analisis', 'pruebas', 'golive'];
      const IMPL_FASES_NOMBRES = ['Relevamiento', 'Configuración', 'Análisis', 'Pruebas', 'Go-live'];
      const faseActivaIdx = IMPL_FASES_KEYS.findIndex(fk => {
        const tf = tareasCli.filter(t => (t.fase || 'relevamiento') === fk);
        return tf.length > 0 && tf.some(t => t.estado !== 'completada');
      });

      if (faseActivaIdx > 0) {
        // Solo mostrar alerta si el cliente avanzó más allá de la fase 1
        const faseNombre = IMPL_FASES_NOMBRES[faseActivaIdx];
        const numFase    = faseActivaIdx + 1;
        const esGoLive   = faseActivaIdx === 4;
        const tareasFase = tareasCli.filter(t => (t.fase || 'relevamiento') === IMPL_FASES_KEYS[faseActivaIdx]);
        const pendFase   = tareasFase.filter(t => t.estado !== 'completada').length;

        alertas.push({
          tipo:    esGoLive ? 'green' : 'blue',
          titulo:  esGoLive
            ? `${c.nombre} — ¡Entró en Go-live! 🎯`
            : `${c.nombre} — Fase ${numFase}: ${faseNombre}`,
          texto:   esGoLive
            ? `¡Las 4 fases anteriores están completas! Quedan ${pendFase} tarea${pendFase !== 1 ? 's' : ''} para terminar la implementación.`
            : `Avanzó a la Fase ${numFase} (${faseNombre}). Quedan ${pendFase} tarea${pendFase !== 1 ? 's' : ''} en esta fase.`,
          accion:  'Ver implementación',
          onClick: `goTo(document.querySelector('.nav-item[onclick*=implementacion]'), 'implementacion')`
        });
      }
    });
  }

  // ── 8. CLIENTES MODELO (score >= 7, autonomía alta, < 15% repetición histórica, mínimo 3 consultas) ──
  const clientesModelo = allClientes.filter(c => {
    if (c.score < 7 || c.autonomia !== 'alta') return false;
    const hist = allConsultas.filter(q => q.cliente === c.nombre);
    if (hist.length < 3) return false;
    const pctRep = hist.filter(q => q.repetida === 'si').length / hist.length;
    return pctRep < 0.15;
  });
  if (clientesModelo.length > 0) {
    alertas.push({
      tipo:   'green',
      titulo: clientesModelo.length === 1
        ? clientesModelo[0].nombre + ' — cliente modelo'
        : clientesModelo.length + ' clientes modelo',
      texto:  clientesModelo.map(c => `${c.nombre} (score ${c.score}/10)`).join(', ') +
              '. Alta autonomía y baja repetición. Usalos como benchmark para clientes nuevos.',
      accion:  null,
      onClick: null
    });
  }

  // ── Alertas de facturación (solo para Daniel Ferro) ──
  const me = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : null;
  if (me === 'Daniel Ferro') {
    const allFacturas = (typeof adminFacturas !== 'undefined') ? adminFacturas : [];
    const hoy         = new Date(); hoy.setHours(0,0,0,0);
    const mesActual   = hoy.getMonth() + 1;
    const anioActual  = hoy.getFullYear();
    const MESES       = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    // ── F1. Sin pago del mes actual ──
    const sinPagoMes = allClientes.filter(c => {
      const factura = allFacturas.find(f =>
        f.cliente_id === c.id && f.mes === mesActual && f.anio === anioActual
      );
      return !factura || factura.estado !== 'pagada';
    });

    if (sinPagoMes.length > 0) {
      const cuantos = sinPagoMes.length;
      const lista   = sinPagoMes.slice(0, 4).map(c => c.nombre).join(', ');
      const mas     = cuantos > 4 ? ` y ${cuantos - 4} más` : '';
      alertas.push({
        tipo:    'red',
        titulo:  `${cuantos} cliente${cuantos !== 1 ? 's' : ''} sin pago en ${MESES[mesActual]}`,
        texto:   lista + mas + '. Sin factura cargada para este mes.',
        accion:  'Ver facturación',
        onClick: `goTo(document.querySelector('.nav-item[onclick*=administracion]'),'administracion')`
      });
    }

    // ── F2. Próxima facturación vencida (fecha_proxima < hoy) ──
    const facturasPorCliente = {};
    allFacturas.forEach(f => {
      if (!facturasPorCliente[f.cliente_id] ||
          f.anio > facturasPorCliente[f.cliente_id].anio ||
          (f.anio === facturasPorCliente[f.cliente_id].anio && f.mes > facturasPorCliente[f.cliente_id].mes)) {
        facturasPorCliente[f.cliente_id] = f;
      }
    });

    const vencidas = Object.values(facturasPorCliente).filter(f => {
      if (!f.fecha_proxima) return false;
      const prox = new Date(f.fecha_proxima); prox.setHours(0,0,0,0);
      return prox < hoy && f.estado === 'pagada';
    });

    if (vencidas.length > 0) {
      const nombres = vencidas.slice(0, 3).map(f => {
        const cli = allClientes.find(c => c.id === f.cliente_id);
        return cli ? cli.nombre : '—';
      }).join(', ');
      const mas = vencidas.length > 3 ? ` y ${vencidas.length - 3} más` : '';
      alertas.push({
        tipo:    'amber',
        titulo:  `${vencidas.length} cliente${vencidas.length !== 1 ? 's' : ''} con fecha de facturación vencida`,
        texto:   `${nombres}${mas}. Ya pasó la fecha de próxima facturación.`,
        accion:  'Ver facturación',
        onClick: `goTo(document.querySelector('.nav-item[onclick*=administracion]'),'administracion')`
      });
    }
  }

  // ── Render ──
  _renderAlertas(alertas);
}

// ────────── Render ──────────

function _renderAlertas(alertas) {
  const cont  = document.getElementById('alertas-container');
  const sub   = document.getElementById('alertas-page-sub');
  const badge = document.getElementById('alert-nav-badge');
  if (!cont) return;

  // Contar solo las no-verdes para el badge
  const criticas = alertas.filter(a => a.tipo !== 'green').length;

  if (badge) {
    badge.textContent = criticas > 0 ? criticas : '';
    badge.style.display = criticas > 0 ? '' : 'none';
  }
  if (sub) {
    sub.textContent = criticas > 0
      ? criticas + ' alerta' + (criticas !== 1 ? 's' : '') + ' activa' + (criticas !== 1 ? 's' : '') + ' — revisá estas situaciones'
      : 'Sin alertas críticas activas';
  }

  if (alertas.length === 0) {
    cont.innerHTML = `
      <div class="alert alert-green">
        <div style="flex:1">
          <strong>Todo en orden.</strong>&nbsp;No hay situaciones que requieran atención en este momento.
        </div>
      </div>`;
    return;
  }

  // Ordenar: red → amber → blue → green
  const ORDEN = { red: 0, amber: 1, blue: 2, green: 3 };
  alertas.sort((a, b) => (ORDEN[a.tipo] ?? 9) - (ORDEN[b.tipo] ?? 9));

  cont.innerHTML = alertas.map(a => {
    const boton = a.accion && a.onClick
      ? `<button class="btn-sm" onclick="${_alEscHtml(a.onClick)}">${_alEscHtml(a.accion)}</button>`
      : '';
    return `
      <div class="alert alert-${a.tipo}">
        <div style="flex:1">
          <strong>${_alEscHtml(a.titulo)}</strong>&nbsp;${_alEscHtml(a.texto)}
        </div>
        ${boton}
      </div>`;
  }).join('');
}

// ────────── Top 5 soluciones + soluciones para revisar ──────────

function refreshSolucionesAlertas() {
  const allSoluciones = (typeof soluciones !== 'undefined') ? soluciones : [];
  _renderTopSoluciones(allSoluciones);
  _renderRevisarSoluciones(allSoluciones);
}

function _renderTopSoluciones(allSoluciones) {
  const cont = document.getElementById('alertas-top-soluciones');
  if (!cont) return;

  const top5 = allSoluciones
    .slice()
    .sort((a, b) => (b.usos || 0) - (a.usos || 0))
    .slice(0, 5);

  if (top5.length === 0) {
    cont.innerHTML = `<div style="text-align:center;color:var(--text3);padding:24px;font-size:13px">Sin soluciones cargadas todavía.</div>`;
    return;
  }

  const maxUsos = top5[0].usos || 1;

  cont.innerHTML = top5.map((s, i) => {
    const cat  = (typeof CATS !== 'undefined' && CATS[s.cat]) || { label: s.cat || '—', bg: '#eee', text: '#444' };
    const pct  = Math.round(((s.usos || 0) / maxUsos) * 100);
    const medal = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
    return `
      <div style="padding:12px 20px;${i < top5.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:16px;flex-shrink:0">${medal}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                 title="${_alEscHtml(s.titulo)}">${_alEscHtml(s.titulo)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;display:flex;gap:6px;align-items:center">
              <span class="badge" style="background:${cat.bg};color:${cat.text};font-size:10px">${cat.label}</span>
              <span>${s.usos} uso${s.usos !== 1 ? 's' : ''}</span>
              <span>· ${_alEscHtml(s.autor || '—')}</span>
            </div>
          </div>
        </div>
        <div style="background:var(--surface2);border-radius:4px;height:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width 0.4s"></div>
        </div>
      </div>`;
  }).join('');
}

function _renderRevisarSoluciones(allSoluciones) {
  const cont = document.getElementById('alertas-revisar-soluciones');
  if (!cont) return;

  const ahora = new Date();
  // Soluciones con más de 90 días sin actualizar Y con al menos 1 uso
  const paraRevisar = allSoluciones
    .filter(s => {
      if (!s.updatedAt && !s.createdAt) return false;
      const fecha = new Date(s.updatedAt || s.createdAt);
      const dias  = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));
      return dias > 60 && (s.usos || 0) >= 1;
    })
    .sort((a, b) => {
      const da = new Date(a.updatedAt || a.createdAt);
      const db = new Date(b.updatedAt || b.createdAt);
      return da - db; // más antigua primero
    })
    .slice(0, 5);

  if (paraRevisar.length === 0) {
    cont.innerHTML = `
      <div style="text-align:center;color:var(--text3);padding:24px;font-size:13px">
        Todo en orden — ninguna solución tiene más de 60 días sin actualizar.
      </div>`;
    return;
  }

  cont.innerHTML = paraRevisar.map((s, i) => {
    const cat  = (typeof CATS !== 'undefined' && CATS[s.cat]) || { label: s.cat || '—', bg: '#eee', text: '#444' };
    const fecha = new Date(s.updatedAt || s.createdAt);
    const dias  = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));
    const meses = Math.floor(dias / 30);
    const tiempoTexto = meses >= 2 ? `hace ${meses} meses` : `hace ${dias} días`;
    const urgente = dias > 120;
    return `
      <div style="padding:12px 20px;${i < paraRevisar.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                 title="${_alEscHtml(s.titulo)}">${_alEscHtml(s.titulo)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px;display:flex;gap:6px;align-items:center">
              <span class="badge" style="background:${cat.bg};color:${cat.text};font-size:10px">${cat.label}</span>
              <span>Actualizada ${tiempoTexto} · ${_alEscHtml(s.autor || '—')}</span>
            </div>
          </div>
          <span class="badge ${urgente ? 'b-red' : 'b-amber'}" style="flex-shrink:0">
            ${urgente ? 'Desactualizada' : 'Revisar'}
          </span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-sm" onclick="marcarSolucionVigente('${s.id}')">✓ Sigue vigente</button>
          <button class="btn-sm" onclick="goTo(document.querySelector('.nav-item[onclick*=biblioteca]'),'biblioteca');setTimeout(()=>verSolucion('${s.id}'),200)">Ver</button>
        </div>
      </div>`;
  }).join('');
}

// Marca una solución como revisada hoy (actualiza updated_at)
async function marcarSolucionVigente(id) {
  try {
    await dbUpdate('soluciones', id, { updated_at: new Date().toISOString() });
    // Actualizar en memoria
    const s = (typeof soluciones !== 'undefined') ? soluciones.find(x => x.id === id) : null;
    if (s) s.updatedAt = new Date().toISOString();
    refreshSolucionesAlertas();
    toast('Solución marcada como vigente');
  } catch (e) {
    console.error('Error marcando solución vigente', e);
    alert('No se pudo actualizar: ' + e.message);
  }
}

window.addEventListener('app-ready', () => {
  refreshAlertas();
  // Las soluciones se cargan en kb.js — esperamos un tick para que estén listas
  setTimeout(refreshSolucionesAlertas, 1500);
});
