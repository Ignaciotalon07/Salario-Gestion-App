// salario-api — Recibe datos del sistema Salario (Visual FoxPro) y los guarda en `salario_sync`.
//
// POST /functions/v1/salario-api      (1 request por cliente)
//   Headers: Content-Type: application/json
//            x-api-key: <valor del secreto SALARIO_API_KEY>
//   Body:    {
//              "id_api":    1234,                                   // número de cliente en Salario (4 cifras) — lo normal
//              "cliente_id": "uuid",                                // alternativa al id_api (uuid de la plataforma); si se manda id_api, este campo se ignora
//              "base":      "DATOS1",                               // opcional: nombre de la base (si el cliente tiene más de una)
//              "anio":      2026,                                   // opcional: año del dato (si no viene, el actual)
//              "mes":       10,                                     // opcional: mes del dato 1-12 (si no viene, el actual)
//              "legajos":   160,                                    // opcional: TODOS los legajos (una persona con 5 legajos suma 5)
//              "cuiles":    100,                                    // opcional: personas distintas (CUILes distintos)
//              "version":   "5.2.1",                                // opcional: versión de Salario del cliente
//              "motor":     "mysql",                                // opcional: "mysql" o "dbf"
//              "convenios": ["Comercio", "UOCRA"],                  // opcional
//              "empresas":  [{"nombre":"ACME SA","cuit":"30-1-2"}]  // opcional (empresas que tiene cargadas el cliente en Salario)
//            }
//   Solo se actualizan los campos que vengan; los demás quedan como estaban.
//   Cada POST se guarda en el HISTORIAL del mes indicado (anio/mes) y, si ese mes es el más reciente
//   que se mandó para la base, también pasa a ser el dato "actual". Se pueden mandar meses anteriores
//   (para cargar historia): quedan en el historial sin pisar el dato actual. No se aceptan meses futuros.
//   Si un cliente tiene varias bases, se manda UN POST por base con su nombre en "base" (el nombre de la
//   empresa o DATOS1, DATOS2…). Sin "base" se usa "principal". La plataforma suma los legajos y junta
//   convenios y empresas de todas las bases.
//   Las bases de PRUEBA (nombre "PRUEBA", "PRUEBAS", "TEST", "DEMO"…) NO deben enviarse; si llegan igual,
//   la función las ignora (responde 200 con "ignorada": true y no guarda nada).
//
// Secretos (Supabase → Edge Functions → Secrets):
//   SALARIO_API_KEY   clave compartida con el programador (inventar una larga y aleatoria)
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen solos)
//
// Esta función debe tener "Verify JWT" desactivado (el programador no usa token de usuario);
// la seguridad la da el header x-api-key.

import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_H = { "Content-Type": "application/json" };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_H });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Registra un envío que no se pudo asignar a ningún cliente, para que Gestión avise (botón Alertas).
// Agrupa los repetidos (mismo id_api + instalación + base + motivo) sumando la cantidad.
async function registrarRechazo(supabase: any, body: any, motivo: string) {
  try {
    const idEnv = String(body?.id_api ?? "").trim().slice(0, 40);
    const inst = String(body?.cliente_id ?? "").trim().slice(0, 200);
    const base = String(body?.base ?? "").trim().slice(0, 100);
    const detalle = {
      legajos: body?.legajos ?? null,
      convenios: Array.isArray(body?.convenios) ? body.convenios.slice(0, 12).map((c: any) => String(typeof c === "string" ? c : c?.nombre ?? "")) : null,
      empresas: Array.isArray(body?.empresas) ? body.empresas.slice(0, 12).map((e: any) => String(typeof e === "string" ? e : e?.nombre ?? e?.razon_social ?? "")) : null,
    };
    const ahora = new Date().toISOString();
    const { data: ex } = await supabase.from("salario_envios_rechazados").select("id, cantidad")
      .eq("id_api_enviado", idEnv).eq("instalacion", inst).eq("base", base).eq("motivo", motivo).maybeSingle();
    if (ex) {
      await supabase.from("salario_envios_rechazados").update({ cantidad: (ex.cantidad ?? 1) + 1, ultimo_at: ahora, detalle }).eq("id", ex.id);
    } else {
      await supabase.from("salario_envios_rechazados").insert({ id_api_enviado: idEnv, instalacion: inst, base, motivo, detalle, ultimo_at: ahora });
    }
  } catch (_e) { /* si el registro falla (¿falta la migración 063?), no se rompe la respuesta */ }
}

Deno.serve(async (req) => {
  if (req.method === "GET") return resp({ mensaje: "hola mundo desde Salario Gestión", version: "2026-11-04 id_api+base+rechazos+historial" });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  // ── Autenticación por clave compartida ──
  const clave = Deno.env.get("SALARIO_API_KEY");
  if (!clave) return resp({ error: "Falta configurar el secreto SALARIO_API_KEY en Supabase" }, 500);
  if (req.headers.get("x-api-key") !== clave) return resp({ error: "No autorizado" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return resp({ error: "El cuerpo no es un JSON válido" }, 400); }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { legajos, convenios, empresas, cuiles, version, motor } = body ?? {};
  const base = String(body?.base ?? "").trim().slice(0, 100) || "principal";
  // Bases de prueba: se ignoran (no cuentan legajos ni convenios de datos de prueba)
  if (/^(prueba|pruebas|test|testing|demo|ejemplo)[\s_-]*\d*$/i.test(base)) {
    return resp({ ok: true, ignorada: true, base, motivo: "Base de prueba: no se guarda" });
  }
  // El cliente se identifica por id_api (número de Salario) o, alternativamente, por cliente_id (uuid)
  const idApiRaw = body?.id_api;
  const uuidIn = body?.cliente_id;
  if ((idApiRaw === undefined || idApiRaw === null || idApiRaw === "") && !uuidIn) {
    await registrarRechazo(supabase, body, "Sin id_api ni cliente_id");
    return resp({ error: "Mandá id_api (número de cliente en Salario) o cliente_id (uuid)" }, 400);
  }
  let idApi: number | null = null;
  if (idApiRaw !== undefined && idApiRaw !== null && idApiRaw !== "") {
    idApi = Number(idApiRaw);
    if (!Number.isInteger(idApi) || idApi <= 0) {
      await registrarRechazo(supabase, body, "id_api inválido (0 o no numérico): falta cargar el número de cliente en Salario");
      return resp({ error: "id_api debe ser un entero positivo" }, 400);
    }
  }
  // Si viene id_api, el cliente_id se IGNORA (puede venir con cualquier texto). Solo se valida como uuid si es lo único que llegó.
  if (idApi === null && !UUID_RE.test(String(uuidIn))) {
    await registrarRechazo(supabase, body, "Sin id_api y el cliente_id no es un uuid válido");
    return resp({ error: "cliente_id debe ser un uuid" }, 400);
  }
  if (legajos === undefined && convenios === undefined && empresas === undefined
      && cuiles === undefined && version === undefined && motor === undefined) {
    return resp({ error: "Mandá al menos uno de: legajos, cuiles, convenios, empresas, version, motor" }, 400);
  }

  // ── Período (año/mes) del dato: por defecto el mes actual (hora de Argentina) ──
  const hoyAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const anioAct = hoyAR.getFullYear(), mesAct = hoyAR.getMonth() + 1;
  const anio = body?.anio === undefined || body?.anio === null || body?.anio === "" ? anioAct : Number(body.anio);
  const mes  = body?.mes  === undefined || body?.mes  === null || body?.mes  === "" ? mesAct  : Number(body.mes);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return resp({ error: "anio debe ser un año válido (ej. 2026)" }, 400);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return resp({ error: "mes debe ser un entero entre 1 y 12" }, 400);
  if (anio * 12 + mes > anioAct * 12 + mesAct) return resp({ error: "No se aceptan períodos futuros" }, 400);

  // ── Validación y normalización ──
  const fila: Record<string, unknown> = { base, updated_at: new Date().toISOString() };

  if (legajos !== undefined) {
    const n = Number(legajos);
    if (!Number.isInteger(n) || n < 0) return resp({ error: "legajos debe ser un entero >= 0" }, 400);
    fila.legajos = n;
  }
  if (cuiles !== undefined) {
    const n = Number(cuiles);
    if (!Number.isInteger(n) || n < 0) return resp({ error: "cuiles debe ser un entero >= 0" }, 400);
    fila.cuiles = n;
  }
  if (version !== undefined) {
    const v = String(version ?? "").trim().slice(0, 30);
    if (!v) return resp({ error: "version no puede estar vacía" }, 400);
    fila.version = v;
  }
  if (motor !== undefined) {
    const m = String(motor ?? "").trim().toLowerCase();
    if (m !== "mysql" && m !== "dbf") return resp({ error: 'motor debe ser "mysql" o "dbf"' }, 400);
    fila.motor = m;
  }
  if (convenios !== undefined) {
    if (!Array.isArray(convenios)) return resp({ error: "convenios debe ser una lista" }, 400);
    fila.convenios = convenios
      .map((c: any) => String(typeof c === "string" ? c : c?.nombre ?? "").trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 500);
  }
  if (empresas !== undefined) {
    if (!Array.isArray(empresas)) return resp({ error: "empresas debe ser una lista" }, 400);
    fila.empresas = empresas
      .map((e: any) => typeof e === "string"
        ? { nombre: e.trim(), cuit: "" }
        : { nombre: String(e?.nombre ?? e?.razon_social ?? "").trim(), cuit: String(e?.cuit ?? "").trim() })
      .filter((e: { nombre: string }) => e.nombre.length > 0)
      .slice(0, 2000);
  }

  // Se busca el cliente: por id_api (único en la plataforma) o por uuid. Si no existe, se avisa cuál falta.
  let q = supabase.from("clientes").select("id, nombre, id_api");
  q = idApi !== null ? q.eq("id_api", idApi) : q.eq("id", uuidIn);
  const { data: encontrados, error: errBusca } = await q.limit(2);
  if (errBusca) return resp({ error: errBusca.message }, 500);
  if (!encontrados || encontrados.length === 0) {
    await registrarRechazo(supabase, body, idApi !== null ? `El id_api ${idApi} no existe en Gestión: falta cargar ese cliente` : "cliente_id inexistente");
    return resp({ error: idApi !== null ? `No hay ningún cliente con id_api ${idApi} en la plataforma` : `Cliente no encontrado: ${uuidIn}` }, 404);
  }
  if (encontrados.length > 1) {
    await registrarRechazo(supabase, body, `Hay más de un cliente con id_api ${idApi}`);
    return resp({ error: `Hay más de un cliente con id_api ${idApi}: hay que corregirlo en la plataforma` }, 409);
  }
  const cliente = encontrados[0];
  fila.cliente_id = cliente.id;

  // 1) Historial del mes (una fila por cliente + base + año + mes; solo se pisan los campos que vinieron)
  const campos = Object.fromEntries(Object.entries(fila).filter(([k]) => !["cliente_id", "base", "updated_at"].includes(k)));
  const { error: errH } = await supabase.from("salario_historial")
    .upsert({ cliente_id: cliente.id, base, anio, mes, ...campos, updated_at: fila.updated_at }, { onConflict: "cliente_id,base,anio,mes" });
  if (errH) return resp({ error: errH.message }, 500);

  // 2) Dato "actual": solo si este período es igual o más nuevo que el que ya había para esa base
  const { data: act } = await supabase.from("salario_sync").select("anio, mes").eq("cliente_id", cliente.id).eq("base", base).maybeSingle();
  const perAct = act && act.anio && act.mes ? act.anio * 12 + act.mes : 0;
  let actualizoActual = false;
  if (anio * 12 + mes >= perAct) {
    const { error } = await supabase.from("salario_sync").upsert({ ...fila, anio, mes }, { onConflict: "cliente_id,base" });
    if (error) return resp({ error: error.message }, 500);
    actualizoActual = true;
  }

  return resp({
    ok: true,
    cliente: cliente.nombre,
    id_api: cliente.id_api,
    base,
    periodo: `${anio}-${String(mes).padStart(2, "0")}`,
    actual: actualizoActual,
    guardado: Object.keys(campos),
  });
});
