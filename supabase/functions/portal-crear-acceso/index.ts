// ====================================================================
// portal-crear-acceso — Edge Function (Supabase, Deno)
// Crea y administra el acceso de un CLIENTE a la app "Salario Gestión - Clientes".
// Solo la puede usar el equipo (usuarios de team_members activos).
//
// Acciones (POST, JSON):
//   { accion: "crear",  cliente_id, email, password }  → crea el usuario de Auth y lo vincula al cliente
//   { accion: "alta",   nombre, email, tipo, password }    → crea el CLIENTE nuevo (implementación) + su usuario del portal
//   { accion: "clave",  cliente_id, user_id, password } → cambia la contraseña
//   { accion: "estado", cliente_id, user_id, activo }   → activa o desactiva el acceso (sin borrar nada)
//
// Seguridad:
//   - Se despliega CON "Verify JWT" activado (valor por defecto).
//   - Comprueba que quien llama esté en team_members (activo = true).
//   - Usa la clave de servicio (SUPABASE_SERVICE_ROLE_KEY, la inyecta Supabase sola): jamás sale al navegador.
//   - 1 usuario por cliente. No permite usar el email de alguien del equipo.
//   - Nunca devuelve ni guarda la contraseña: solo la recibe y se la pasa a Auth.
// ====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // 1) ¿Quién llama? Tiene que ser del equipo
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ses, error: eSes } = await admin.auth.getUser(token);
    if (eSes || !ses?.user?.email) return json({ error: "Sesión inválida" }, 401);
    const { data: miembro } = await admin.from("team_members").select("email, nombre")
      .eq("email", ses.user.email).eq("activo", true).maybeSingle();
    if (!miembro) return json({ error: "Solo el equipo puede crear accesos" }, 403);

    const b = await req.json().catch(() => ({}));
    const accion = String(b.accion ?? "");

    // ── Alta de cliente nuevo + acceso, todo junto (solo nombre, email y tipo) ──
    if (accion === "alta") {
      const nombre = String(b.nombre ?? "").trim().replace(/\s+/g, " ");
      const email = String(b.email ?? "").trim().toLowerCase();
      const password = String(b.password ?? "");
      const tipo = String(b.tipo ?? "");
      if (!nombre) return json({ error: "Falta el nombre del cliente" }, 400);
      if (!["empresa", "estudio", "colegio", "municipalidad"].includes(tipo)) return json({ error: "Tipo de cliente inválido" }, 400);
      if (!EMAIL_OK.test(email)) return json({ error: "El email no es válido" }, 400);
      if (password.length < 8) return json({ error: "La clave tiene que tener al menos 8 caracteres" }, 400);

      const { data: dup } = await admin.from("clientes").select("id").ilike("nombre", nombre).maybeSingle();
      if (dup) return json({ error: "Ya existe un cliente con ese nombre" }, 409);
      const { data: esEquipo } = await admin.from("team_members").select("email").eq("email", email).maybeSingle();
      if (esEquipo) return json({ error: "Ese email es de una persona del equipo" }, 400);

      const palabras = nombre.replace(/[^A-Za-z0-9áéíóúÁÉÍÓÚñÑ ]/g, " ").split(" ").filter((x) => x);
      const iniciales = palabras.length >= 2 ? (palabras[0][0] + palabras[1][0]).toUpperCase() : (palabras[0] || "XX").substring(0, 2).toUpperCase();
      const { data: cli, error: eCli } = await admin.from("clientes")
        .insert({ nombre, tipo, area: "impl", iniciales, autonomia: "media", adopcion: 0, score: 0 }).select("*").single();
      if (eCli || !cli) return json({ error: "No se pudo crear el cliente: " + (eCli?.message ?? "") }, 500);

      const { data: nuevo, error: eNuevo } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (eNuevo || !nuevo?.user) {
        await admin.from("clientes").delete().eq("id", cli.id);
        const yaEx = /already|registered|exists/i.test(eNuevo?.message ?? "");
        return json({ error: yaEx ? "Ya existe un usuario con ese email" : "No se pudo crear el usuario: " + (eNuevo?.message ?? "") }, yaEx ? 409 : 500);
      }
      const { error: eVinc } = await admin.from("portal_usuarios").insert({
        user_id: nuevo.user.id, cliente_id: cli.id, email, activo: true, creado_por: miembro.nombre ?? miembro.email,
      });
      if (eVinc) {
        await admin.auth.admin.deleteUser(nuevo.user.id);
        await admin.from("clientes").delete().eq("id", cli.id);
        return json({ error: "No se pudo vincular el acceso: " + eVinc.message }, 500);
      }
      return json({ ok: true, cliente: cli, user_id: nuevo.user.id, email });
    }

    const clienteId = String(b.cliente_id ?? "");
    if (!clienteId) return json({ error: "Falta el cliente" }, 400);
    const { data: cliente } = await admin.from("clientes").select("id, nombre").eq("id", clienteId).maybeSingle();
    if (!cliente) return json({ error: "No encontré al cliente" }, 404);

    // ── Crear acceso ──
    if (accion === "crear") {
      const email = String(b.email ?? "").trim().toLowerCase();
      const password = String(b.password ?? "");
      if (!EMAIL_OK.test(email)) return json({ error: "El email no es válido" }, 400);
      if (password.length < 8) return json({ error: "La clave tiene que tener al menos 8 caracteres" }, 400);

      const { data: ya } = await admin.from("portal_usuarios").select("user_id").eq("cliente_id", clienteId).maybeSingle();
      if (ya) return json({ error: "Este cliente ya tiene un acceso. Podés cambiarle la clave o desactivarlo." }, 409);
      const { data: esEquipo } = await admin.from("team_members").select("email").eq("email", email).maybeSingle();
      if (esEquipo) return json({ error: "Ese email es de una persona del equipo" }, 400);

      const { data: nuevo, error: eNuevo } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (eNuevo || !nuevo?.user) {
        const ya = /already|registered|exists/i.test(eNuevo?.message ?? "");
        return json({ error: ya ? "Ya existe un usuario con ese email" : "No se pudo crear el usuario: " + (eNuevo?.message ?? "") }, ya ? 409 : 500);
      }
      const { error: eVinc } = await admin.from("portal_usuarios").insert({
        user_id: nuevo.user.id, cliente_id: clienteId, email, activo: true, creado_por: miembro.nombre ?? miembro.email,
      });
      if (eVinc) {                                    // si no se pudo vincular, se deshace el usuario
        await admin.auth.admin.deleteUser(nuevo.user.id);
        return json({ error: "No se pudo vincular el acceso al cliente: " + eVinc.message }, 500);
      }
      return json({ ok: true, user_id: nuevo.user.id, email });
    }

    // Las demás acciones trabajan sobre un usuario ya vinculado a ESTE cliente
    const userId = String(b.user_id ?? "");
    const { data: vinc } = await admin.from("portal_usuarios").select("user_id, email")
      .eq("user_id", userId).eq("cliente_id", clienteId).maybeSingle();
    if (!vinc) return json({ error: "Ese acceso no pertenece a este cliente" }, 404);

    if (accion === "clave") {
      const password = String(b.password ?? "");
      if (password.length < 8) return json({ error: "La clave tiene que tener al menos 8 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: "No se pudo cambiar la clave: " + error.message }, 500);
      return json({ ok: true });
    }
    if (accion === "estado") {
      const activo = !!b.activo;
      const { error } = await admin.from("portal_usuarios").update({ activo }).eq("user_id", userId);
      if (error) return json({ error: "No se pudo cambiar el estado: " + error.message }, 500);
      return json({ ok: true, activo });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: "Error inesperado: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
