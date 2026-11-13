// ====================================================================
// cliente-ia — Edge Function (Supabase, Deno)
// Responde preguntas sobre UN cliente (consultas, pendientes y datos de Salario).
//
// Seguridad: se despliega CON "Verify JWT" activado (el valor por defecto).
//   Además usa el token del usuario para leer (así rigen las políticas RLS) y
//   comprueba is_team_member(). Nunca lee datos de otros clientes.
// Los números (totales por mes, repetidas, horas) se calculan acá, en código;
// la IA solo los redacta y explica. Así no se equivoca al contar.
//
// Secretos: ANTHROPIC_API_KEY (ya existe). Opcional: IA_MODELO_CLIENTE.
// (SUPABASE_URL y SUPABASE_ANON_KEY vienen solos)
// ====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODELO = Deno.env.get("IA_MODELO_CLIENTE") ?? Deno.env.get("IA_MODELO") ?? "claude-haiku-5-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// tiempo_resolucion se guarda como HORAS.MINUTOS (0.13 = 13 min, 2.45 = 2 h 45 min)
function aMinutos(v: unknown): number {
  const n = Number(v);
  if (!n || n <= 0) return 0;
  const h = Math.floor(n);
  return h * 60 + Math.round((n - h) * 100);
}
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const etiquetaMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
// Fecha en hora argentina → "YYYY-MM-DD"
function fechaAR(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
function top(mapa: Record<string, number>, n = 5): string {
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`).join(", ") || "-";
}
const inc = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
const nombreItem = (x: any) => (typeof x === "string" ? x : x?.nombre ?? x?.name ?? JSON.stringify(x));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "Falta el secreto ANTHROPIC_API_KEY" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });

  // 1) Solo integrantes del equipo
  const { data: esEquipo } = await sb.rpc("is_team_member");
  if (esEquipo !== true) return json({ error: "No autorizado" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const clienteId = String(body?.cliente_id ?? "");
  const pregunta = String(body?.pregunta ?? "").trim().slice(0, 1000);
  if (!clienteId || !pregunta) return json({ error: "Falta cliente o pregunta" }, 400);
  // Memoria de la charla (solo vive en el panel abierto); últimos 10 mensajes
  const historial: { role: string; content: string }[] = (Array.isArray(body?.historial) ? body.historial : [])
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .slice(-10).map((m: any) => ({ role: m.role, content: m.content.slice(0, 3000) }));

  // 2) Datos de ESE cliente (con el token del usuario → RLS)
  const { data: cli } = await sb.from("clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!cli) return json({ error: "Cliente no encontrado" }, 404);

  const hoy = new Date();
  const desde = new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1).toISOString();
  const [cons, pend, sync, hist, impl, conex] = await Promise.all([
    sb.from("consultas")
      .select("id,created_at,asesor,categoria,subtema,repetida,descripcion,tiempo_resolucion,tipo_consulta,contacto,material,conexion_remota,solucion_id")
      .eq("cliente_nombre", cli.nombre).gte("created_at", desde).order("created_at", { ascending: false }).limit(1500),
    sb.from("pendientes")
      .select("id,created_at,asesor,prioridad,categoria,descripcion,intento,prox_paso,resuelto,tipo_pendiente,fecha_vencimiento,interno")
      .eq("cliente_nombre", cli.nombre).order("created_at", { ascending: false }).limit(100),
    sb.from("salario_sync").select("base,legajos,cuiles,convenios,empresas,version,motor,anio,mes,updated_at").eq("cliente_id", clienteId),
    sb.from("salario_historial").select("base,anio,mes,legajos,cuiles,convenios,empresas,version,motor")
      .eq("cliente_id", clienteId).order("anio", { ascending: false }).order("mes", { ascending: false }).limit(150),
    sb.from("implementacion_tareas")
      .select("id,orden,tarea,responsable_tipo,estado,asesor,fecha_estimada,fecha_completada,fecha_inicio_calc,duracion_dias,fase,notas")
      .eq("cliente_id", clienteId).order("orden", { ascending: true }).limit(100),
    // Conexiones remotas: solo usuario e "instalado". La clave NUNCA se pide ni se envía a la IA.
    sb.from("cliente_conexiones").select("usuario,instalado").eq("cliente_id", clienteId).limit(20),
  ]);

  // Segunda tanda: todo lo que depende de ids de la primera (notas, soluciones usadas) + proyectos y documentos
  const idsPend = (pend.data ?? []).map((p: any) => p.id);
  const idsTarea = (impl.data ?? []).map((t: any) => t.id);
  const idsSol = [...new Set((cons.data ?? []).map((c: any) => c.solucion_id).filter(Boolean))].slice(0, 300);
  const [notasPend, notasImpl, sols, proys, docs] = await Promise.all([
    idsPend.length ? sb.from("pendiente_notas").select("pendiente_id,autor_nombre,texto,created_at").in("pendiente_id", idsPend).order("created_at").limit(300) : Promise.resolve({ data: [] as any[] }),
    idsTarea.length ? sb.from("implementacion_tarea_notas").select("tarea_id,autor_nombre,texto,created_at").in("tarea_id", idsTarea).order("created_at").limit(300) : Promise.resolve({ data: [] as any[] }),
    idsSol.length ? sb.from("soluciones").select("id,titulo").in("id", idsSol) : Promise.resolve({ data: [] as any[] }),
    sb.from("proyectos").select("id,nombre,detalle,estado,fecha_inicio,fecha_fin_objetivo,finalizado_at,creado_por").eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(30),
    sb.from("cliente_documentos").select("nombre,categoria,empresa,url,subido_por,created_at").eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(200),
  ]);
  const idsProy = (proys.data ?? []).map((x: any) => x.id);
  const proyTareas = idsProy.length
    ? (await sb.from("proyecto_tareas").select("proyecto_id,orden,tarea,asesor,estado,duracion_dias,fecha_inicio,fecha_fin,fecha_completada").in("proyecto_id", idsProy).order("orden").limit(500)).data ?? []
    : [];
  const un = (v: unknown, n = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const agrupar = (arr: any[], k: string) => { const m: Record<string, any[]> = {}; for (const x of arr) (m[x[k]] ??= []).push(x); return m; };
  const notasDePend = agrupar(notasPend.data ?? [], "pendiente_id");
  const notasDeTarea = agrupar(notasImpl.data ?? [], "tarea_id");
  const tituloSol: Record<string, string> = {};
  for (const x of sols.data ?? []) tituloSol[x.id] = un(x.titulo, 120);
  const fmtNotas = (arr: any[] | undefined) => (arr ?? []).map((n) => `${n.autor_nombre ?? "?"}: ${un(n.texto, 250)}`).join(" // ");

  // ── Implementación: avance, vencidas y qué falta (calculado en código) ──
  const hoyISO = fechaAR(hoy.toISOString());
  const dia = (v: unknown) => (v ? String(v).slice(0, 10) : null);
  const tareas = impl.data ?? [];
  let implTxt = "";
  if (tareas.length) {
    const completas = tareas.filter((t: any) => t.estado === "completada");
    const abiertas = tareas.filter((t: any) => t.estado !== "completada");
    // Vencida = no completada y con fecha estimada de fin anterior a hoy
    const vencidas = abiertas.filter((t: any) => dia(t.fecha_estimada) && dia(t.fecha_estimada)! < hoyISO);
    const diasAtraso = (t: any) => Math.round((Date.parse(hoyISO) - Date.parse(dia(t.fecha_estimada)!)) / 86400000);
    const finEstimado = tareas.map((t: any) => dia(t.fecha_estimada)).filter(Boolean).sort().pop() ?? null;
    const resp: Record<string, string> = { cliente: "cliente", equipo: "equipo", ambos: "ambos" };
    const linea = (t: any) =>
      `#${t.orden} ${t.tarea} | fase: ${t.fase ?? "-"} | estado: ${t.estado}${vencidas.includes(t) ? ` (VENCIDA hace ${diasAtraso(t)} días)` : ""} | responsable: ${resp[t.responsable_tipo] ?? "-"}${t.asesor ? ` (${t.asesor})` : ""} | inicio: ${dia(t.fecha_inicio_calc) ?? "-"} | fin estimado: ${dia(t.fecha_estimada) ?? "-"}${t.fecha_completada ? ` | completada: ${dia(t.fecha_completada)}` : ""}${t.notas ? ` | nota: ${un(t.notas, 250)}` : ""}${notasDeTarea[t.id]?.length ? ` | notas del equipo: ${fmtNotas(notasDeTarea[t.id])}` : ""}`;
    const porFase: Record<string, { tot: number; ok: number }> = {};
    for (const t of tareas) { const f = t.fase ?? "-"; (porFase[f] ??= { tot: 0, ok: 0 }).tot++; if (t.estado === "completada") porFase[f].ok++; }
    implTxt = `
== IMPLEMENTACIÓN (cronograma de ${tareas.length} etapas) ==
Inicio del proyecto: ${dia(cli.fecha_inicio_implementacion) ?? "sin definir"} | Objetivo de fin: ${dia(cli.fecha_fin_objetivo) ?? "sin definir"} | Fin estimado según el cronograma: ${finEstimado ?? "-"}${dia(cli.fecha_fin_objetivo) && finEstimado && finEstimado > dia(cli.fecha_fin_objetivo)! ? " (SUPERA el objetivo)" : ""}
Avance: ${completas.length} de ${tareas.length} etapas completadas (${Math.round((completas.length / tareas.length) * 100)}%). En progreso: ${tareas.filter((t: any) => t.estado === "en_progreso").length}. Pendientes: ${tareas.filter((t: any) => t.estado === "pendiente").length}. Vencidas: ${vencidas.length}. Marcadas demoradas: ${tareas.filter((t: any) => t.estado === "demorada").length}.
Avance por fase: ${Object.entries(porFase).map(([f, v]) => `${f} ${v.ok}/${v.tot}`).join(" | ")}
Etapas VENCIDAS (las que están demoradas): ${vencidas.map((t: any) => `#${t.orden} ${t.tarea} (${diasAtraso(t)} días, responsable: ${resp[t.responsable_tipo] ?? "-"})`).join("; ") || "ninguna"}
Detalle de todas las etapas (orden | tarea | fase | estado | responsable | fechas):
${tareas.map(linea).join("\n")}
`;
  }

  // Solo soporte cuenta como "consulta" (igual que la sección Consultas de la plataforma)
  const filas = (cons.data ?? []).filter((c: any) => !["programacion_interna", "implementacion"].includes(c.tipo_consulta));

  // 3) Agregados calculados en código
  const porMes: Record<string, { n: number; rep: number; min: number; cat: Record<string, number>; sub: Record<string, number>; ases: Record<string, number>; con: Record<string, number> }> = {};
  const totCat: Record<string, number> = {}, totSub: Record<string, number> = {};
  let totRep = 0, totMin = 0;
  for (const c of filas) {
    const ym = fechaAR(c.created_at).slice(0, 7);
    const m = (porMes[ym] ??= { n: 0, rep: 0, min: 0, cat: {}, sub: {}, ases: {}, con: {} });
    const cat = c.categoria ?? "Sin categoría";
    const sub = `${cat} / ${c.subtema ?? "-"}`;
    m.n++; if (c.repetida) { m.rep++; totRep++; }
    const min = aMinutos(c.tiempo_resolucion); m.min += min; totMin += min;
    inc(m.cat, cat); inc(m.sub, sub); inc(m.ases, c.asesor ?? "-"); if (c.contacto) inc(m.con, c.contacto);
    inc(totCat, cat); inc(totSub, sub);
  }
  const meses = Object.keys(porMes).sort().reverse();
  const resumenMeses = meses.map((ym) => {
    const m = porMes[ym];
    return `${etiquetaMes(ym)} (${ym}): ${m.n} consultas, ${m.rep} repetidas, ${fmtMin(m.min)} en total | categorías: ${top(m.cat)} | temas: ${top(m.sub)} | atendió: ${top(m.ases, 3)} | consultó: ${top(m.con, 3)}`;
  }).join("\n");

  // Temas que se repiten (misma categoría/subtema en varios meses o varias veces marcadas repetidas)
  const repPorTema: Record<string, number> = {};
  for (const c of filas) if (c.repetida) inc(repPorTema, `${c.categoria ?? "Sin categoría"} / ${c.subtema ?? "-"}`);

  // Detalle de las consultas más recientes (compacto)
  const detalle = filas.slice(0, 200).map((c: any) =>
    `${fechaAR(c.created_at)} | ${c.categoria ?? "-"}/${c.subtema ?? "-"} | ${c.repetida ? "REPETIDA" : "-"} | ${fmtMin(aMinutos(c.tiempo_resolucion))} | asesor: ${c.asesor ?? "-"} | consultó: ${c.contacto ?? "-"}${c.material ? ` | material: ${c.material}` : ""}${c.conexion_remota && String(c.conexion_remota).toLowerCase() !== "no" ? " | conexión remota" : ""}${c.solucion_id && tituloSol[c.solucion_id] ? ` | solución aplicada: ${tituloSol[c.solucion_id]}` : ""} | ${un(c.descripcion, 220)}`
  ).join("\n");
  // Registros que no son soporte (implementación y horas internas): se informan aparte
  const otros: Record<string, { n: number; min: number }> = {};
  for (const c of (cons.data ?? []).filter((c: any) => ["programacion_interna", "implementacion"].includes(c.tipo_consulta))) {
    const o = (otros[c.tipo_consulta] ??= { n: 0, min: 0 }); o.n++; o.min += aMinutos(c.tiempo_resolucion);
  }
  const otrosTxt = Object.entries(otros).map(([k, v]) => `${k === "implementacion" ? "Implementación" : "Programación interna"}: ${v.n} registros, ${fmtMin(v.min)}`).join(" | ");

  const pendLista = (pend.data ?? []).map((p: any) =>
    `${fechaAR(p.created_at)} | ${p.resuelto ? "resuelto" : "ABIERTO"} | prioridad: ${p.prioridad ?? "-"} | ${p.tipo_pendiente ?? "-"} | asesor: ${p.asesor ?? "sin asignar"}${p.fecha_vencimiento ? ` | vence: ${dia(p.fecha_vencimiento)}` : ""} | ${un(p.descripcion, 220)}${p.intento ? ` | intento: ${un(p.intento, 200)}` : ""}${p.prox_paso ? ` | próximo paso: ${un(p.prox_paso, 200)}` : ""}${notasDePend[p.id]?.length ? ` | notas: ${fmtNotas(notasDePend[p.id])}` : ""}`
  ).join("\n");
  const pendAbiertos = (pend.data ?? []).filter((p: any) => !p.resuelto).length;

  // Salario: dato actual por base + evolución mensual (suma de bases)
  const actual = (sync.data ?? []).map((s: any) =>
    `Base "${s.base ?? "principal"}": ${s.legajos ?? 0} legajos, ${s.cuiles ?? "?"} personas (CUIL), Salario ${s.version ?? "?"} (${s.motor ?? "?"}), actualizado ${s.updated_at ? fechaAR(s.updated_at) : "?"} | convenios: ${(Array.isArray(s.convenios) ? s.convenios : []).map(nombreItem).slice(0, 40).join(", ") || "-"} | empresas: ${(Array.isArray(s.empresas) ? s.empresas.length : 0)}`
  ).join("\n");
  const evo: Record<string, { leg: number; cuil: number; emp: number; conv: Set<string> }> = {};
  for (const h of hist.data ?? []) {
    const ym = `${h.anio}-${String(h.mes).padStart(2, "0")}`;
    const e = (evo[ym] ??= { leg: 0, cuil: 0, emp: 0, conv: new Set() });
    e.leg += h.legajos ?? 0; e.cuil += h.cuiles ?? 0;
    e.emp += Array.isArray(h.empresas) ? h.empresas.length : 0;
    (Array.isArray(h.convenios) ? h.convenios : []).forEach((x: any) => e.conv.add(nombreItem(x)));
  }
  const evoTxt = Object.keys(evo).sort().reverse().map((ym) =>
    `${etiquetaMes(ym)}: ${evo[ym].leg} legajos, ${evo[ym].cuil} personas (CUIL), ${evo[ym].emp} empresas, ${evo[ym].conv.size} convenios`).join("\n");

  const hoyAR = fechaAR(hoy.toISOString());
  // Liquidadores = personas del cliente que más consultaron (campo "¿Quién consultó?")
  const liqs: Record<string, number> = {};
  for (const c of cons.data ?? []) if (c.contacto) inc(liqs, String(c.contacto).replace(/\s+/g, " ").trim());
  // Todas las columnas de la tarjeta del cliente (no se omite ninguna con valor), salvo ids internos
  const ocultas = new Set(["id", "created_at", "updated_at", "whaticket_url"]);
  const otrosDatos = Object.entries(cli)
    .filter(([k, v]) => !ocultas.has(k) && v !== null && v !== undefined && v !== "" && !["nombre", "razon_social", "cuit", "id_api", "tipo", "area", "telefono"].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" | ");
  const ficha = [
    `Nombre: ${cli.nombre}`,
    `Razón social: ${cli.razon_social ?? "no cargada"}`,
    `CUIT: ${cli.cuit ?? "no cargado"}`,
    `ID cliente (id_api de Salario): ${cli.id_api ?? "no cargado"}`,
    `Tipo: ${cli.tipo ?? "-"} | Área: ${cli.area === "impl" ? "implementación" : "soporte"}`,
    `Teléfono: ${cli.telefono ?? "no cargado"}`,
    `Link de Whaticket: ${cli.whaticket_url ? "cargado" : "no cargado"}`,
    `Cliente desde (alta en la plataforma): ${cli.created_at ? fechaAR(cli.created_at) : "-"}`,
    `Otros datos de la tarjeta: ${otrosDatos || "ninguno"}`,
    `Liquidadores (quiénes consultan, de más a menos): ${top(liqs, 8)}`,
    `Conexiones remotas: ${(conex.data ?? []).map((x: any) => `${x.usuario} (${x.instalado ? "instalado" : "sin instalar"})`).join(", ") || "ninguna cargada"}`,
  ].join("\n");
  const proyTxt = (proys.data ?? []).map((pr: any) => {
    const ts = proyTareas.filter((t: any) => t.proyecto_id === pr.id);
    const ok = ts.filter((t: any) => t.estado === "completada").length;
    return `Proyecto "${pr.nombre}" (${pr.estado}) | inicio: ${dia(pr.fecha_inicio) ?? "-"} | objetivo: ${dia(pr.fecha_fin_objetivo) ?? "-"}${pr.finalizado_at ? ` | finalizado: ${dia(pr.finalizado_at)}` : ""} | avance: ${ok}/${ts.length} tareas${pr.detalle ? ` | detalle: ${un(pr.detalle, 300)}` : ""}\n` +
      ts.map((t: any) => `   - ${t.tarea} | ${t.estado}${t.estado !== "completada" && dia(t.fecha_fin) && dia(t.fecha_fin)! < hoyISO ? " (VENCIDA)" : ""} | ${t.asesor ?? "sin asignar"} | ${dia(t.fecha_inicio) ?? "-"} a ${dia(t.fecha_fin) ?? "-"}`).join("\n");
  }).join("\n");
  const docsTxt = (docs.data ?? []).map((d: any) =>
    `${fechaAR(d.created_at)} | ${d.categoria ?? "documento"} | ${d.nombre}${d.empresa ? ` | empresa: ${d.empresa}` : ""}${d.url ? ` | link: ${d.url}` : ""} | subido por ${d.subido_por ?? "?"}`).join("\n");
  const contexto = `== FICHA DEL CLIENTE (datos de la tarjeta) ==
${ficha}
FECHA DE HOY: ${hoyAR}

== CONSULTAS DE SOPORTE (últimos 24 meses; números ya calculados, son exactos) ==
Total: ${filas.length} consultas, ${totRep} marcadas como repetidas, ${fmtMin(totMin)} en total.
Categorías más frecuentes: ${top(totCat, 8)}
Temas (categoría / subtema) más frecuentes: ${top(totSub, 10)}
Temas con más consultas repetidas: ${top(repPorTema, 8)}

Por mes (más reciente primero):
${resumenMeses || "(sin consultas)"}

${otrosTxt ? `Otros registros (no son consultas de soporte): ${otrosTxt}\n` : ""}
Detalle de las últimas ${Math.min(filas.length, 200)} consultas (fecha | categoría/subtema | repetida | tiempo | asesor | quién consultó | material | solución aplicada | detalle):
${detalle || "(sin consultas)"}

== PENDIENTES (${pendAbiertos} abiertos de ${(pend.data ?? []).length} últimos; con sus notas) ==
${pendLista || "(sin pendientes)"}

== DATOS DE SALARIO (actuales) ==
${actual || "(sin datos de Salario)"}

== EVOLUCIÓN MENSUAL EN SALARIO (suma de todas las bases) ==
${evoTxt || "(sin historial)"}
${implTxt}
== PROYECTOS (cambios puntuales) ==
${proyTxt || "(sin proyectos)"}

== DOCUMENTOS CARGADOS DEL CLIENTE (${(docs.data ?? []).length}) ==
${docsTxt || "(sin documentos)"}`;

  const sistema = `Sos el asistente de datos de "Salario — Gestión de Clientes", la herramienta interna del equipo de soporte e implementación del software de liquidación de sueldos Salario (Argentina). Respondés preguntas sobre UN solo cliente, usando exclusivamente los datos del contexto.

Reglas:
- Respondé SOLO con lo que está en los datos. Si algo no está, decí claramente "no tengo ese dato" y, si ayuda, aclará qué sí tenés. Nunca inventes.
- Los totales y conteos por mes ya vienen calculados: usalos tal cual, no recuentes a mano. Si tenés que comparar o sumar, hacelo con cuidado y mostrá los números.
- Español rioplatense, tono claro y directo, respuestas cortas (la mayoría en 2 a 6 oraciones). Podés usar una lista corta cuando enumeras temas. Sin emojis.
- Cuando menciones un mes, usá el nombre ("septiembre de 2026"). Si la pregunta dice un mes sin año, tomá el más reciente que ya haya pasado o esté en curso.
- Las consultas "repetidas" son las marcadas como repetidas (el cliente volvió a consultar lo mismo). Un tema que aparece en varios meses también es una repetición a destacar.
- Los tiempos están en horas y minutos reales.
- Tenés TODA la información que la plataforma guarda de este cliente: ficha, consultas (con asesor, solución aplicada y detalle), pendientes con sus notas, Salario (actual e histórico), implementación con sus notas, proyectos y documentos cargados. Los datos de la tarjeta del cliente (CUIT, razón social, ID, teléfono, liquidadores, conexiones) están en la FICHA DEL CLIENTE: usalos cuando te los pidan. No tenés las claves de las conexiones remotas; si te las piden, decí que no tenés acceso a las claves.
- Si hay sección IMPLEMENTACIÓN, usala para responder cómo viene el cliente, qué etapas están demoradas (las VENCIDAS), qué falta, qué ya está listo y a quién le toca cada etapa (cliente, equipo o ambos). Indicá siempre el número y nombre de la etapa y, si está vencida, los días de atraso. No inventes fechas: usá las del cronograma.
- No des opiniones sobre personas del equipo ni del cliente; limitate a los datos.

${contexto}`;

  // 4) Llamada a la IA
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        system: sistema,
        messages: [...historial, { role: "user", content: pregunta }],
      }),
    });
    if (!r.ok) {
      console.error("cliente-ia http", r.status, await r.text());
      return json({ error: "La IA no pudo responder ahora. Probá de nuevo en un momento." }, 502);
    }
    const data = await r.json();
    const texto = (Array.isArray(data.content) ? data.content : [])
      .filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("\n").trim();
    return json({ respuesta: texto || "No pude armar una respuesta." });
  } catch (e) {
    console.error("cliente-ia", e);
    return json({ error: "Error al consultar la IA" }, 500);
  }
});
