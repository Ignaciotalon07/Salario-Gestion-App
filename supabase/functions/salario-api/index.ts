// salario-api — Recibe datos del sistema Salario (Visual FoxPro) y los guarda en `salario_sync`.
//
// POST /functions/v1/salario-api      (1 request por cliente)
//   Headers: Content-Type: application/json
//            x-api-key: <valor del secreto SALARIO_API_KEY>
//   Body:    {
//              "cliente_id": "uuid",
//              "legajos":   123,                                    // opcional
//              "convenios": ["Comercio", "UOCRA"],                  // opcional
//              "empresas":  [{"nombre":"ACME SA","cuit":"30-1-2"}]  // opcional (estudios contables)
//            }
//   Solo se actualizan los campos que vengan; los demás quedan como estaban.
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

Deno.serve(async (req) => {
  if (req.method === "GET") return resp({ mensaje: "hola mundo desde Salario Gestión" });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  // ── Autenticación por clave compartida ──
  const clave = Deno.env.get("SALARIO_API_KEY");
  if (!clave) return resp({ error: "Falta configurar el secreto SALARIO_API_KEY en Supabase" }, 500);
  if (req.headers.get("x-api-key") !== clave) return resp({ error: "No autorizado" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return resp({ error: "El cuerpo no es un JSON válido" }, 400); }

  const { cliente_id, legajos, convenios, empresas } = body ?? {};
  if (!cliente_id || !UUID_RE.test(String(cliente_id))) {
    return resp({ error: "cliente_id es requerido y debe ser un uuid" }, 400);
  }
  if (legajos === undefined && convenios === undefined && empresas === undefined) {
    return resp({ error: "Mandá al menos uno de: legajos, convenios, empresas" }, 400);
  }

  // ── Validación y normalización ──
  const fila: Record<string, unknown> = { cliente_id, updated_at: new Date().toISOString() };

  if (legajos !== undefined) {
    const n = Number(legajos);
    if (!Number.isInteger(n) || n < 0) return resp({ error: "legajos debe ser un entero >= 0" }, 400);
    fila.legajos = n;
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // El cliente tiene que existir; si no, se avisa cuál falta
  const { data: cliente } = await supabase.from("clientes").select("id, nombre").eq("id", cliente_id).maybeSingle();
  if (!cliente) return resp({ error: `Cliente no encontrado: ${cliente_id}` }, 404);

  const { error } = await supabase.from("salario_sync").upsert(fila, { onConflict: "cliente_id" });
  if (error) return resp({ error: error.message }, 500);

  return resp({
    ok: true,
    cliente: cliente.nombre,
    guardado: Object.keys(fila).filter((k) => !["cliente_id", "updated_at"].includes(k)),
  });
});
