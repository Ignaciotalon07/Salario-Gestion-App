// ====================================================================
// whaticket-sync — Edge Function (Supabase, Deno)
// Cada ~2 min: busca chats cerrados en Whaticket y arma borradores
// en `consultas_borradores` ("Por registrar"). Ver docs/integracion-whaticket.md
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   WHATICKET_TOKEN  → token de solo lectura de Whaticket
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen solos)
// ====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.whaticket.com/api/v1";
const TOKEN = Deno.env.get("WHATICKET_TOKEN")!;
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_PAGINAS_MENSAJES = 15; // 300 mensajes por ticket como tope
const MAX_TICKETS_POR_CORRIDA = 15; // para no pasar el tiempo límite

// ── Llamada a la API de Whaticket ───────────────────────────────────
async function wt(path: string, params: Record<string, string> = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Whaticket ${path} → ${r.status}`);
  return r.json();
}

// ── Clasificación de mensajes ───────────────────────────────────────
type Msg = {
  id: string; at: string; de: "cliente" | "asesor" | "bot" | "nota";
  texto: string; tipo: string; media_url: string | null; user_id: string | null;
  _resuelto?: boolean;
};

function clasificar(m: any): Msg | null {
  if (m.isDeleted) return null;
  let de: Msg["de"];
  let texto = (m.body ?? "").toString();
  let resuelto = false;
  if (m.isNote) {
    de = "nota";
    resuelto = /\*resuelto\*/i.test(texto);
  } else if (!m.fromMe) {
    de = "cliente";
  } else if (m.userId) {
    de = "asesor";
    texto = texto.replace(/^\*[^*\n]+:\*\s*\n?/, ""); // quitar firma "*Nombre:*"
  } else {
    de = "bot";
  }
  return {
    id: m.id, at: m.createdAt, de, texto, tipo: m.mediaType ?? "chat",
    media_url: m.mediaUrl ?? null, user_id: m.userId ?? null, _resuelto: resuelto,
  };
}

// Trae mensajes hacia atrás (quedan en orden ascendente). Corta cuando `cortar(todos)` da true,
// cuando no hay más mensajes o al llegar al tope de páginas.
async function traerMensajes(ticketId: string, cortar: (ms: Msg[]) => boolean) {
  let todos: Msg[] = [];
  let cursor: { at: string; id: string } | null = null;
  for (let i = 0; i < MAX_PAGINAS_MENSAJES; i++) {
    const params: Record<string, string> = { direction: "before" };
    if (cursor) { params.cursor = cursor.at; params.cursorId = cursor.id; }
    const res = await wt(`/tickets/${ticketId}/messages`, params);
    const raw: any[] = res.messages ?? [];
    const pagina = raw.map(clasificar).filter(Boolean) as Msg[];
    todos = [...pagina, ...todos];
    if (raw.length) cursor = { at: raw[0].createdAt, id: raw[0].id };
    if (cortar(todos)) break;
    if (!res.hasMoreBefore || !raw.length) break;
  }
  return todos;
}

// ── Sugerencias ─────────────────────────────────────────────────────
const RE_CONEXION = /(conexi[oó]n|anydesk|any desk|te conecto|me conecto|teamviewer)/i;
const RE_ID_ANYDESK = /\b\d{9,10}\b|\b\d{3}\s\d{3}\s\d{3}\b/;
const RE_SALUDO = /^(hola|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|holaa*|buen dia)[\s!.,]*$/i;
const RE_CIERRE = /(listo|solucionado|probalo|probá|funcion[oó]|ya est[aá])/i;

// Material enviado por el ASESOR (los adjuntos del cliente no cuentan):
// video (archivo de video o link de YouTube/Loom) · pdf (PDF, imagen, documento, captura)
// · varios (si mandó de las dos clases) · ninguno.
function materialSugerido(ms: Msg[]): string {
  let video = false, pdf = false;
  for (const m of ms) {
    if (m.de !== "asesor") continue;
    const t = (m.tipo ?? "chat").toLowerCase();
    if (t === "video") video = true;
    else if (["image", "document", "application", "pdf", "sticker"].includes(t)) pdf = true;
    if (/(youtube\.com|youtu\.be|loom\.com)/i.test(m.texto)) video = true;
  }
  if (video && pdf) return "varios";
  if (video) return "video";
  if (pdf) return "pdf";
  return "ninguno";
}

function tiempoActivoHoras(ms: Msg[]): number {
  const conv = ms.filter((m) => m.de === "cliente" || m.de === "asesor");
  let min = 0;
  let pidioConexion = false;
  for (let i = 1; i < conv.length; i++) {
    const a = conv[i - 1], b = conv[i];
    const gap = (new Date(b.at).getTime() - new Date(a.at).getTime()) / 60000;
    if (a.de === "asesor" && RE_CONEXION.test(a.texto)) pidioConexion = true;
    if (gap < 15) min += gap;
    else if (pidioConexion && a.de === "asesor" && b.de === "asesor" && RE_CIERRE.test(b.texto)) {
      min += gap; // trabajo por AnyDesk
      pidioConexion = false;
    }
  }
  min = Math.max(min, 5);
  return Math.round((min / 60) * 100) / 100;
}

// Frases de cierre / agradecimiento: no describen el problema ("ah listo listo, ahi lo encontré")
const RE_CIERRE_CLIENTE = /^(ah+[\s,.!]*)?(listo|ok(ey)?|dale|perfecto|gracias|muchas gracias|genial|buen[ií]simo|de nada|ya (lo )?(encontr|vi|pude|estar|est[aá])|ah[ií] (lo )?(encontr|est[aá])|jaj+a*|joya|b[aá]rbaro)\b/i;

// Detalle sugerido = el problema del cliente.
// Junta los primeros mensajes de texto "con contenido" (hasta 3, 400 caracteres),
// saltea saludos, textos cortos y frases de cierre. Si el chat arrancó con un audio
// y no hay texto útil, avisa que se explicó por audio (todavía no se transcribe).
function detalleSugerido(ms: Msg[]): string {
  const cli = ms.filter((m) => m.de === "cliente");
  const audioInicial = cli.length > 0 && cli[0].tipo === "audio";
  const utiles: string[] = [];
  for (const m of cli) {
    if (m.tipo === "audio") continue;
    const t = m.texto.trim();
    if (t.length < 15 || RE_SALUDO.test(t) || RE_CIERRE_CLIENTE.test(t)) continue;
    utiles.push(t);
    if (utiles.length >= 3) break;
  }
  let texto = utiles.join(" ").slice(0, 400);
  if (audioInicial) {
    const aviso = "🎤 El cliente lo explicó por audio (sin transcribir).";
    texto = texto ? `${aviso} ${texto}` : aviso;
  }
  return texto;
}

// ── Catálogo de categorías y subtemas (mantener igual a CATS de js/data.js) ──
const CATALOGO: Record<string, { label: string; sub: string[] }> = {
  liquidacion: { label: "Liquidación de sueldos", sub: ["Vacaciones", "Horas extras", "Feriados", "SAC / Aguinaldo", "Licencias", "Descuentos", "Embargos", "Sueldo basico y bruto", "Liquidacion final"] },
  errores: { label: "Errores del sistema", sub: ["Recibos / PDF", "Importacion de datos", "AFIP / Presentaciones", "Calculo incorrecto", "Pantalla bloqueada", "Error al guardar", "Impresion"] },
  configuracion: { label: "Configuración", sub: ["Feriados", "Convenios colectivos", "Parametros generales", "Usuarios y permisos", "Conceptos de liquidacion", "Banco / CBU", "Categorias de empleados"] },
  actualizaciones: { label: "Actualizaciones", sub: ["Version", "Cambios en liquidacion", "Nuevos modulos", "Migracion de datos", "Cambios en AFIP"] },
  fuera: { label: "Fuera del sistema", sub: ["Consulta contable", "Consulta laboral", "Consulta AFIP", "Otro software", "Problema de PC / red"] },
};
let _catCache: { at: number; texto: string; mapa: Record<string, string[]> } | null = null;

// Catálogo fijo + categorías/subtemas "propios" que el equipo ya usó al menos 2 veces
async function cargarCatalogo() {
  if (_catCache && Date.now() - _catCache.at < 600_000) return _catCache;
  const mapa: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(CATALOGO)) mapa[k] = [...v.sub];
  try {
    const { data } = await sb.from("consultas").select("categoria,subtema").limit(5000);
    const cuenta = new Map<string, number>();
    for (const r of data ?? []) {
      if (!r.categoria || !r.subtema) continue;
      let cat = String(r.categoria);
      const key = Object.keys(CATALOGO).find((k) => norm(k) === norm(cat) || norm(CATALOGO[k].label) === norm(cat));
      if (key) cat = key;
      if (norm(cat) === "programacion") continue;
      const id = cat + "||" + r.subtema;
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
    for (const [id, n] of cuenta) {
      if (n < 2) continue;
      const [cat, sub] = id.split("||");
      if (!mapa[cat]) mapa[cat] = [];
      if (!mapa[cat].some((x) => norm(x) === norm(sub))) mapa[cat].push(sub);
    }
  } catch (e) {
    console.error("catalogo", e);
  }
  const texto = Object.entries(mapa)
    .map(([k, subs]) => `- ${k}${CATALOGO[k] ? ` (${CATALOGO[k].label})` : ""}: ${subs.join(" | ")}`)
    .join("\n");
  _catCache = { at: Date.now(), texto, mapa };
  return _catCache;
}

// ── Resumen con IA (Claude) ─────────────────────────────────────────
// Secreto opcional: ANTHROPIC_API_KEY. Sin key (o si la API falla) se usa la regla simple.
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const IA_MODELO = Deno.env.get("IA_MODELO") ?? "claude-haiku-5-5";

async function resumirConIA(ms: Msg[]): Promise<{ problema: string; solucion: string; categoria: string | null; subtema: string | null } | null> {
  if (!ANTHROPIC_KEY) return null;
  const lineas = ms
    .filter((m) => m.de === "cliente" || m.de === "asesor")
    .map((m) => {
      const quien = m.de === "cliente" ? "Cliente" : "Asesor";
      const txt = m.texto?.trim() || (m.tipo === "audio" ? "[audio sin transcribir]" : m.tipo !== "chat" ? `[${m.tipo}]` : "");
      return txt ? `${quien}: ${txt}` : "";
    })
    .filter(Boolean);
  if (!lineas.length) return null;
  const conversacion = lineas.join("\n").slice(0, 12000);
  const catalogo = await cargarCatalogo();

  const prompt = `Sos un asistente de un equipo de soporte del software de liquidación de sueldos "Salario" (Argentina). Te paso la conversación de WhatsApp entre un cliente y un asesor. Redactá el registro de la consulta.

Devolvé SOLO un JSON válido, sin texto extra ni bloques de código, con esta forma:
{"problema": "...", "solucion": "...", "categoria": "...", "subtema": "..."}

Reglas:
- "problema": qué necesitaba o qué problema tenía el cliente, en 1 o 2 oraciones claras, en tercera persona y tono neutro (ej: "El cliente consulta por cómo cargar el adicional por antigüedad cuando el recibo calcula distinto al esperado"). Sin saludos ni agradecimientos.
- "solucion": cómo lo resolvió el asesor, en 1 a 4 pasos cortos, uno por línea, con el formato "Paso 1: ...". Si no se entiende cómo se resolvió, dejalo como cadena vacía.
- No inventes datos que no estén en la conversación. Si el cliente explicó el problema por audio y no hay otra pista, escribí en "problema": "El cliente explicó la consulta por audio (sin transcribir)."
- "categoria" y "subtema": elegí la que mejor describa la consulta de ESTE catálogo (formato "clave (nombre): subtemas"). "categoria" debe ser exactamente la clave (la palabra antes del paréntesis) y "subtema" exactamente uno de los subtemas de esa categoría. Si ninguno encaja con claridad, poné null en "subtema" (o en ambos).
${catalogo.texto}
- Español rioplatense neutro, sin emojis.

Conversación:
${conversacion}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: IA_MODELO, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { console.error("IA http", r.status, await r.text()); return null; }
    const data = await r.json();
    // Juntar TODOS los bloques de texto (puede haber bloques de "pensamiento" antes)
    const bloques: any[] = Array.isArray(data.content) ? data.content : [];
    const txt: string = bloques.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("\n").trim();
    // Extraer el JSON aunque venga con texto o bloques de código alrededor
    const i = txt.indexOf("{"), f = txt.lastIndexOf("}");
    if (i === -1 || f <= i) {
      console.error("IA sin JSON. stop_reason:", data.stop_reason, "respuesta:", JSON.stringify(data).slice(0, 600));
      return null;
    }
    const j = JSON.parse(txt.slice(i, f + 1));
    if (!j.problema) return null;
    // La categoría y el subtema solo valen si existen en el catálogo (nunca se inventan)
    let categoria: string | null = null, subtema: string | null = null;
    const ck = Object.keys(catalogo.mapa).find((k) => norm(k) === norm(String(j.categoria ?? "")));
    if (ck) {
      categoria = ck;
      subtema = catalogo.mapa[ck].find((x) => norm(x) === norm(String(j.subtema ?? ""))) ?? null;
    }
    return { problema: String(j.problema).slice(0, 600), solucion: String(j.solucion ?? "").slice(0, 1500), categoria, subtema };
  } catch (e) {
    console.error("IA error", e);
    return null;
  }
}

// ── Usuarios de Whaticket (1 vez por hora) ──────────────────────────
async function syncUsuarios() {
  const { data: est } = await sb.from("whaticket_sync").select("valor,updated_at").eq("clave", "usuarios").maybeSingle();
  if (est && Date.now() - new Date(est.updated_at).getTime() < 3600_000) return;
  const res = await wt("/users");
  const users: any[] = Array.isArray(res) ? res : (res.users ?? []);
  const { data: team } = await sb.from("team_members").select("email");
  const emails = new Set((team ?? []).map((t: any) => t.email.toLowerCase()));
  for (const u of users) {
    const coincide = u.email && emails.has(u.email.toLowerCase()) ? u.email.toLowerCase() : null;
    const { data: ex } = await sb.from("whaticket_usuarios").select("team_email").eq("whaticket_user_id", u.id).maybeSingle();
    await sb.from("whaticket_usuarios").upsert({
      whaticket_user_id: u.id, nombre_whaticket: u.name, email_whaticket: u.email ?? null,
      team_email: ex?.team_email ?? coincide, // no pisa un vínculo hecho a mano
    });
  }
  await sb.from("whaticket_sync").upsert({ clave: "usuarios", valor: {}, updated_at: new Date().toISOString() });
}

// Normaliza texto: sin acentos, minúsculas, sin símbolos ("A.I.V.E.L. S.A." → "a i v e l s a")
const norm = (x: string) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

// El contacto se agenda como "Persona - Empresa": se usa la empresa para sugerir el cliente.
// Devuelve el id solo si hay UNA coincidencia clara; si hay dudas, null (lo elige el asesor).
async function sugerirCliente(contactoNombre: string | null | undefined): Promise<string | null> {
  const partes = String(contactoNombre ?? "").split(/\s+[-–—]\s+/);
  if (partes.length < 2) return null;
  const empresa = norm(partes.slice(1).join(" "));
  if (empresa.length < 3) return null;
  const { data } = await sb.from("clientes").select("id,nombre");
  const coinc = (data ?? []).filter((c: any) => {
    const n = norm(c.nombre);
    return n === empresa || n.includes(empresa) || (n.length >= 4 && empresa.includes(n));
  });
  return coinc.length === 1 ? coinc[0].id : null;
}

// Los cierres anteriores a este momento no generan borradores (son de antes de activar la integración)
const INICIO_SYNC = new Date("2026-10-20T00:00:00Z");

// ── Reglas de qué es una consulta ────────────────────────────────────
// 1) Cada vez que se resuelve un chat termina UNA consulta y empieza la siguiente: un cierre = un borrador.
//    Si el mismo cliente vuelve más tarde con otro problema, es otro borrador.
// 2) El borrador se genera apenas se resuelve el chat (sin esperar).
// 3) Un tramo con menos de MIN_MENSAJES mensajes entre asesor y cliente (sin contar bot ni notas)
//    es insignificante y NO genera borrador. Para cambiar el mínimo, editar MIN_MENSAJES.
const MIN_MENSAJES = 4;

// ── Procesar un ticket: genera el borrador de cada conversación cerrada ──
// Se consultan tickets en cualquier estado (abiertos, pendientes y cerrados), porque un chat que se
// resuelve y el cliente vuelve a escribir enseguida queda "abierto" y su cierre se perdería.
async function procesarTicket(t: any, _profundo = false): Promise<{ r: string; esperando: boolean }> {
  if (t.isGroup) return { r: "grupo", esperando: false };
  if (t.snoozedUntil) return { r: "pospuesto", esperando: false };

  // Cierres de este ticket que ya tienen borrador (en cualquier estado)
  const { data: previos } = await sb.from("consultas_borradores").select("ultimo_mensaje_id").eq("ticket_id", t.id);
  const procesados = new Set((previos ?? []).map((p: any) => p.ultimo_mensaje_id));

  // "Viejo" = cierre ya procesado o anterior al inicio de la integración
  const esViejo = (m: Msg) => !!m._resuelto && (new Date(m.at) < INICIO_SYNC || procesados.has(m.id));

  // Se retrocede hasta encontrar un cierre viejo: de ahí en adelante está todo lo nuevo
  const todos = await traerMensajes(t.id, (ms) => ms.some(esViejo));
  const idx = todos.map((m, i) => (m._resuelto ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { r: "sin-resuelto", esperando: false };

  const esConv = (m: Msg) => m.de === "cliente" || m.de === "asesor";
  let ini = 0;
  let creados = 0, chicos = 0, otros = 0;
  for (const i of idx) {
    const fin = todos[i];
    if (esViejo(fin)) { ini = i + 1; continue; }

    const tramo = todos.slice(ini, i + 1); // desde el cierre anterior hasta este
    ini = i + 1;

    if (tramo.filter(esConv).length < MIN_MENSAJES) { chicos++; continue; } // insignificante

    const r = await procesarTramo(t, tramo, fin);
    if (r === "creado") creados++; else otros++;
  }
  const r = creados ? "creado" : chicos ? "muy-corto" : otros ? "sin-cliente-msgs" : "sin-novedad";
  return { r, esperando: false };
}

// Un tramo = lo que pasó entre un "resuelto" y el siguiente. `fin` es la nota de cierre.
async function procesarTramo(t: any, tramo: Msg[], fin: Msg): Promise<string> {
  const conv = tramo.filter((m) => m.de !== "nota" && m.de !== "bot");
  if (!tramo.some((m) => m.de === "cliente")) return "sin-cliente-msgs";

  // ── Quién cerró el chat: el borrador es SIEMPRE de esa persona ──
  // La nota automática dice "<Nombre> *resuelto* la conversación". Si no se puede leer, se usa el asesor del ticket.
  const nombreCierre = (fin.texto.match(/^(.*?)\s+\*?resuelto\*?/i)?.[1] ?? "").replace(/\*/g, "");
  const { data: usuarios } = await sb.from("whaticket_usuarios").select("whaticket_user_id,team_email,nombre_whaticket");
  const quien = (usuarios ?? []).find((u: any) => nombreCierre && norm(u.nombre_whaticket ?? "") === norm(nombreCierre))
             ?? (usuarios ?? []).find((u: any) => u.whaticket_user_id === t.userId);
  const cierreUserId: string | null = quien?.whaticket_user_id ?? t.userId ?? null;

  const limpios = tramo.map(({ _resuelto, ...m }) => m);
  const mensajes = limpios;
  const convTotal = mensajes.filter((m: any) => m.de === "cliente" || m.de === "asesor");

  // Cliente vinculado
  const usr = quien ? { team_email: quien.team_email } : null;
  const { data: con } = await sb.from("whaticket_contactos").select("cliente_id").eq("whaticket_contact_id", t.contact?.id ?? "").maybeSingle();
  const cliente_id = con?.cliente_id ?? (await sugerirCliente(t.contact?.name)) ?? null;

  // Repetida: otra consulta del cliente en los últimos 30 días
  let repetida_consulta_id: string | null = null;
  if (cliente_id) {
    const desde30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: prev } = await sb.from("consultas").select("id")
      .eq("cliente_id", cliente_id).gte("created_at", desde30)
      .order("created_at", { ascending: false }).limit(1);
    repetida_consulta_id = prev?.[0]?.id ?? null;
  }

  const ia = await resumirConIA(convTotal as Msg[]);

  const fila = {
    ticket_id: t.id,
    whaticket_contact_id: t.contact?.id ?? null,
    contacto_nombre: t.contact?.name ?? null,
    contacto_numero: t.contact?.number ?? null,
    whaticket_user_id: cierreUserId,
    asesor_email: usr?.team_email ?? null,
    cliente_id,
    inicio_at: conv[0]?.at ?? tramo[0].at,
    cierre_at: fin.at,
    ultimo_mensaje_id: fin.id,
    tiempo_sugerido: tiempoActivoHoras(convTotal as Msg[]),
    conexion_sugerida: convTotal.some((m: any) => RE_CONEXION.test(m.texto) || RE_ID_ANYDESK.test(m.texto)),
    material_sugerido: materialSugerido(convTotal as Msg[]),
    repetida_sugerida: !!repetida_consulta_id,
    repetida_consulta_id,
    detalle_sugerido: ia?.problema ?? detalleSugerido(convTotal as Msg[]),
    solucion_sugerida: ia?.solucion || null,
    ia_generado: !!ia,
    categoria_sugerida: ia?.categoria ?? null,
    subtema_sugerido: ia?.subtema ?? null,
    tiene_audio: convTotal.some((m: any) => m.tipo === "audio"),
    mensajes,
    cant_mensajes: convTotal.length,
    tramos: 1,
  };

  const { error } = await sb.from("consultas_borradores").insert(fila);
  if (error) {
    if (String(error.code) === "23505") return "ya-procesado"; // otra corrida lo creó primero
    throw error;
  }
  return "creado";
}

// ── Vinculación inicial clientes ↔ contactos (se llama a mano) ──────
// Body: {"accion":"vincular_clientes"}
// Usa clientes.whaticket_url (https://app.whaticket.com/tickets/<uuid>):
// trae ese ticket, toma su contacto y lo vincula con el cliente.
// No pisa vínculos ya existentes.
async function vincularClientes() {
  const { data: clientes } = await sb.from("clientes").select("id,nombre,whaticket_url").not("whaticket_url", "is", null);
  const r = { vinculados: 0, ya_estaban: 0, sin_uuid: 0, error: 0, conflictos: [] as string[] };
  for (const c of clientes ?? []) {
    const m = String(c.whaticket_url).match(/tickets\/([0-9a-f-]{36})/i);
    if (!m) { r.sin_uuid++; continue; }
    try {
      const t = await wt(`/tickets/${m[1]}`);
      const contacto = t.contact;
      if (!contacto?.id) { r.error++; continue; }
      const { data: ex } = await sb.from("whaticket_contactos").select("cliente_id").eq("whaticket_contact_id", contacto.id).maybeSingle();
      if (ex?.cliente_id) {
        if (ex.cliente_id !== c.id) r.conflictos.push(`${c.nombre}: el contacto "${contacto.name}" ya está vinculado a otro cliente`);
        else r.ya_estaban++;
        continue;
      }
      await sb.from("whaticket_contactos").upsert({
        whaticket_contact_id: contacto.id, nombre: contacto.name ?? null,
        numero: contacto.number ?? null, ticket_id: t.id, cliente_id: c.id, vinculado_por: "auto",
      });
      r.vinculados++;
    } catch (e) {
      console.error("vincular", c.nombre, e);
      r.error++;
    }
  }
  return r;
}

// Recalcula el detalle de los borradores abiertos con la regla actual (usa los mensajes ya guardados)
// Body: {"accion":"recalcular_detalles"}
async function recalcularDetalles() {
  const { data } = await sb.from("consultas_borradores").select("id,mensajes,cliente_id,contacto_nombre").eq("estado", "borrador");
  let n = 0;
  let fallidos = 0;
  for (const b of data ?? []) {
    try {
      const conv = (b.mensajes ?? []).filter((m: any) => m.de === "cliente" || m.de === "asesor");
      const ia = await resumirConIA(conv as Msg[]);
      const sugerido = b.cliente_id ? null : await sugerirCliente(b.contacto_nombre);
      const { error } = await sb.from("consultas_borradores").update({
        ...(sugerido ? { cliente_id: sugerido } : {}),
        detalle_sugerido: ia?.problema ?? detalleSugerido(conv as Msg[]),
        solucion_sugerida: ia?.solucion || null,
        ia_generado: !!ia,
        categoria_sugerida: ia?.categoria ?? null,
        subtema_sugerido: ia?.subtema ?? null,
        material_sugerido: materialSugerido((b.mensajes ?? []) as Msg[]),
      }).eq("id", b.id);
      if (error) { console.error("update borrador", b.id, error.message); fallidos++; } else n++;
    } catch (e) {
      console.error("recalcular", b.id, e);
      fallidos++;
    }
  }
  return { recalculados: n, fallidos };
}

// ── Handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const resumen: Record<string, number> = {};
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.accion === "recalcular_detalles") {
      return new Response(JSON.stringify({ ok: true, ...(await recalcularDetalles()) }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (body?.accion === "vincular_clientes") {
      return new Response(JSON.stringify({ ok: true, ...(await vincularClientes()) }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    await syncUsuarios();

    // Reprocesar a mano los últimos N horas (recupera cierres que se perdieron). No mueve el cursor.
    // Body: {"accion":"reprocesar","horas":48}
    if (body?.accion === "reprocesar") {
      const desdeR = new Date(Date.now() - Number(body.horas ?? 48) * 3600_000);
      const lista: any[] = [];
      let cr: { u: string; id: string } | null = null;
      for (let p = 0; p < 10; p++) {
        const params: Record<string, string> = { status: "open,pending,closed" };
        if (cr) { params.cursorUpdatedAt = cr.u; params.cursorId = cr.id; }
        const res = await wt("/tickets", params);
        const l: any[] = res.tickets ?? [];
        for (const t of l) if (new Date(t.updatedAt) >= desdeR) lista.push(t);
        const ult = l[l.length - 1];
        if (!res.hasMore || !ult || new Date(ult.updatedAt) < desdeR) break;
        cr = { u: ult.updatedAt, id: ult.id };
      }
      // Opcional: filtrar por contacto y "rehacer" (borra los borradores abiertos de esos tickets y los arma de nuevo)
      const filtro = body.contacto ? norm(String(body.contacto)) : "";
      const objetivo = lista.filter((t) => !filtro || norm(t.contact?.name ?? "").includes(filtro));
      const res: Record<string, number> = {};
      for (const t of objetivo.slice(0, 40)) {
        try {
          if (body.rehacer) await sb.from("consultas_borradores").delete().eq("ticket_id", t.id).eq("estado", "borrador");
          const { r } = await procesarTicket(t, true);
          res[r] = (res[r] ?? 0) + 1;
        } catch (e) { console.error("reprocesar", t.id, e); res["error"] = (res["error"] ?? 0) + 1; }
      }
      return new Response(JSON.stringify({ ok: true, tickets: objetivo.length, resumen: res }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: est } = await sb.from("whaticket_sync").select("valor").eq("clave", "tickets_cerrados").single();
    const desde = new Date(est!.valor.desde as string);
    const enEspera: string[] = Array.isArray(est!.valor.esperando) ? est!.valor.esperando : [];

    // Paginar cerrados hasta pasar `desde`
    const tickets: any[] = [];
    let cur: { u: string; id: string } | null = null;
    for (let p = 0; p < 10; p++) {
      const params: Record<string, string> = { status: "open,pending,closed" };
      if (cur) { params.cursorUpdatedAt = cur.u; params.cursorId = cur.id; }
      const res = await wt("/tickets", params);
      const lista: any[] = res.tickets ?? [];
      for (const t of lista) if (new Date(t.updatedAt) > desde) tickets.push(t);
      const ultimo = lista[lista.length - 1];
      if (!res.hasMore || !ultimo || new Date(ultimo.updatedAt) < desde) break;
      cur = { u: ultimo.updatedAt, id: ultimo.id };
    }

    // Del más viejo al más nuevo, con tope por corrida
    tickets.sort((a, b) => +new Date(a.updatedAt) - +new Date(b.updatedAt));
    const lote = tickets.slice(0, MAX_TICKETS_POR_CORRIDA);
    let maxUpd = desde;
    const nuevosEnEspera = new Set<string>();

    // Chats cuyo cierre estaba esperando los 30 minutos: se vuelven a mirar
    const idsLote = new Set(lote.map((t) => t.id));
    for (const id of enEspera) {
      if (idsLote.has(id)) continue;
      try {
        const t = await wt(`/tickets/${id}`);
        const { r, esperando } = await procesarTicket(t);
        resumen[r] = (resumen[r] ?? 0) + 1;
        if (esperando) nuevosEnEspera.add(id);
      } catch (e) {
        console.error("espera", id, e);
        nuevosEnEspera.add(id); // reintentar la próxima
      }
    }

    for (const t of lote) {
      try {
        const { r, esperando } = await procesarTicket(t);
        resumen[r] = (resumen[r] ?? 0) + 1;
        if (esperando) nuevosEnEspera.add(t.id);
        const u = new Date(t.updatedAt);
        if (u > maxUpd) maxUpd = u;
      } catch (e) {
        console.error("ticket", t.id, e);
        resumen["error"] = (resumen["error"] ?? 0) + 1;
        break; // no avanzar el cursor más allá de un ticket fallido
      }
    }
    // +1 ms para no reprocesar el último; el chequeo ultimo_mensaje_id igual lo evita
    await sb.from("whaticket_sync").update({
      valor: { desde: maxUpd.toISOString(), esperando: [...nuevosEnEspera] }, updated_at: new Date().toISOString(),
    }).eq("clave", "tickets_cerrados");

    return new Response(JSON.stringify({ ok: true, tickets: lote.length, resumen }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
