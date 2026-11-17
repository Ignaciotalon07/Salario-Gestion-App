-- 073_portal_clientes.sql
-- PORTAL DE CLIENTES ("Onboarding") — PASO 1: SEGURIDAD EN LA BASE.
--
-- Qué hace (todo idempotente):
--   1. Tabla portal_usuarios: vincula un usuario de Supabase Auth con SU cliente.
--   2. Función portal_cliente_id(): devuelve el cliente del usuario logueado (o NULL).
--   3. Documentos: marca el ORIGEN (equipo/cliente) y si un archivo del equipo es
--      "visible para el cliente". El cliente puede subir, ver y borrar SOLO lo que subió él.
--   4. Storage (bucket cliente-documentos): el cliente solo toca su carpeta (<cliente_id>/...).
--   5. Vistas seguras (portal_mi_cliente, portal_etapas): muestran al cliente solo los campos
--      que puede ver (nada de notas internas, asesores, pendientes, conexiones ni claves).
--
-- Por qué es seguro: los clientes NO están en team_members, así que TODAS las policies
-- actuales (is_team_member()) ya les niegan todo. Acá solo se abren permisos mínimos y
-- siempre filtrados por portal_cliente_id().
--
-- ANTES de usar el portal, en Supabase: Authentication → Sign In / Providers → Email →
-- desactivar "Allow new users to sign up" (los accesos los crea el equipo a mano).
-- Cómo crear el acceso de un cliente: ver el final de este archivo.

-- ── 1. Usuarios del portal ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_usuarios (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  email       text,
  activo      boolean     NOT NULL DEFAULT true,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_usuarios_cliente ON portal_usuarios (cliente_id);

ALTER TABLE portal_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona portal_usuarios" ON portal_usuarios;
CREATE POLICY "equipo gestiona portal_usuarios" ON portal_usuarios
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- El cliente solo puede ver SU propia fila (no puede crear ni cambiar accesos)
DROP POLICY IF EXISTS "cliente ve su acceso" ON portal_usuarios;
CREATE POLICY "cliente ve su acceso" ON portal_usuarios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 2. Funciones helper ──────────────────────────────────────────────
-- Cliente al que pertenece el usuario logueado (solo si su acceso está activo)
CREATE OR REPLACE FUNCTION portal_cliente_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM portal_usuarios
  WHERE user_id = auth.uid() AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION es_usuario_portal()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT portal_cliente_id() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION portal_cliente_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION es_usuario_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_cliente_id() TO authenticated;
GRANT EXECUTE ON FUNCTION es_usuario_portal() TO authenticated;

-- ── 3. Documentos: origen, visibilidad y categorías nuevas ───────────
ALTER TABLE cliente_documentos
  ADD COLUMN IF NOT EXISTS origen           text    NOT NULL DEFAULT 'equipo',
  ADD COLUMN IF NOT EXISTS visible_cliente  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subido_por_user  uuid;

ALTER TABLE cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_origen_check;
ALTER TABLE cliente_documentos
  ADD CONSTRAINT cliente_documentos_origen_check CHECK (origen IN ('equipo', 'cliente'));

-- Categorías: se suman 'sello' y 'empleados' (planilla de alta de empleados)
ALTER TABLE cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_categoria_check;
ALTER TABLE cliente_documentos
  ADD CONSTRAINT cliente_documentos_categoria_check
  CHECK (categoria IN ('documento','logo','firma','sello','liquidacion','control','empleados','explicativo','otro'));

-- Lo que el equipo ya subió NO es visible para el cliente (hay que marcarlo a propósito)
-- y lo que suba el cliente lleva origen = 'cliente'.
DROP POLICY IF EXISTS "cliente ve sus documentos" ON cliente_documentos;
CREATE POLICY "cliente ve sus documentos" ON cliente_documentos
  FOR SELECT TO authenticated
  USING (cliente_id = portal_cliente_id() AND (origen = 'cliente' OR visible_cliente = true));

DROP POLICY IF EXISTS "cliente sube documentos" ON cliente_documentos;
CREATE POLICY "cliente sube documentos" ON cliente_documentos
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id = portal_cliente_id() AND origen = 'cliente' AND subido_por_user = auth.uid());

-- Solo puede borrar lo que subió el cliente (nunca lo del equipo)
DROP POLICY IF EXISTS "cliente borra sus documentos" ON cliente_documentos;
CREATE POLICY "cliente borra sus documentos" ON cliente_documentos
  FOR DELETE TO authenticated
  USING (cliente_id = portal_cliente_id() AND origen = 'cliente');

-- ── 4. Storage (bucket: cliente-documentos) ──────────────────────────
-- Los archivos van en la carpeta <cliente_id>/... (así los guarda la plataforma del equipo).
-- Ver: solo los de su carpeta que sean suyos o que el equipo marcó como visibles.
DROP POLICY IF EXISTS "clidoc_storage_cliente_select" ON storage.objects;
CREATE POLICY "clidoc_storage_cliente_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cliente-documentos'
    AND portal_cliente_id() IS NOT NULL
    AND (storage.foldername(name))[1] = portal_cliente_id()::text
    AND EXISTS (
      SELECT 1 FROM cliente_documentos d
      WHERE d.storage_path = name
        AND d.cliente_id = portal_cliente_id()
        AND (d.origen = 'cliente' OR d.visible_cliente = true)
    )
  );

-- Subir: solo dentro de su propia carpeta
DROP POLICY IF EXISTS "clidoc_storage_cliente_insert" ON storage.objects;
CREATE POLICY "clidoc_storage_cliente_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cliente-documentos'
    AND portal_cliente_id() IS NOT NULL
    AND (storage.foldername(name))[1] = portal_cliente_id()::text
  );

-- Borrar: solo archivos que figuran como subidos por el cliente (origen = 'cliente').
-- OJO al borrar desde el portal: primero se borra el ARCHIVO y después la fila de la tabla.
DROP POLICY IF EXISTS "clidoc_storage_cliente_delete" ON storage.objects;
CREATE POLICY "clidoc_storage_cliente_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cliente-documentos'
    AND portal_cliente_id() IS NOT NULL
    AND (storage.foldername(name))[1] = portal_cliente_id()::text
    AND EXISTS (
      SELECT 1 FROM cliente_documentos d
      WHERE d.storage_path = name
        AND d.cliente_id = portal_cliente_id()
        AND d.origen = 'cliente'
    )
  );

-- ── 5. Vistas seguras para el cliente ────────────────────────────────
-- Las columnas que el portal necesita (por si en tu base faltara alguna, no falla)
ALTER TABLE implementacion_tareas ADD COLUMN IF NOT EXISTS fase text;
ALTER TABLE implementacion_tareas ADD COLUMN IF NOT EXISTS fecha_estimada date;

-- Datos básicos de SU cliente (sin score, autonomía, id_api, links ni nada interno)
CREATE OR REPLACE VIEW portal_mi_cliente AS
  SELECT c.id, c.nombre, c.razon_social, c.cuit, c.tipo, c.area,
         c.fecha_inicio_implementacion, c.fecha_fin_objetivo
  FROM clientes c
  WHERE c.id = portal_cliente_id();

-- Etapas de SU implementación (sin asesor, notas, pendientes ni predecesoras)
CREATE OR REPLACE VIEW portal_etapas AS
  SELECT t.id, t.cliente_id, t.orden, t.tarea, t.fase, t.responsable_tipo, t.estado,
         t.fecha_inicio_calc AS fecha_inicio, t.fecha_estimada AS fecha_fin,
         t.fecha_completada, t.duracion_dias
  FROM implementacion_tareas t
  WHERE t.cliente_id = portal_cliente_id();

REVOKE ALL ON portal_mi_cliente FROM PUBLIC, anon;
REVOKE ALL ON portal_etapas     FROM PUBLIC, anon;
GRANT SELECT ON portal_mi_cliente TO authenticated;
GRANT SELECT ON portal_etapas     TO authenticated;

-- ── Cómo crear el acceso de un cliente (a mano, por ahora) ───────────
-- 1) Supabase → Authentication → Users → Add user → Create new user:
--      email = el que nos pasó el cliente · password = la clave que elijas
--      · tildar "Auto Confirm User".
-- 2) Copiar el UUID del usuario y correr (cambiando los valores):
--      INSERT INTO portal_usuarios (user_id, cliente_id, email, creado_por)
--      SELECT '<UUID_DEL_USUARIO>', c.id, 'email@del-cliente.com', 'Ignacio'
--      FROM clientes c WHERE c.nombre = '<NOMBRE EXACTO DEL CLIENTE>';
-- 3) Para quitarle el acceso sin borrar el usuario:
--      UPDATE portal_usuarios SET activo = false WHERE email = 'email@del-cliente.com';
-- Pruebas de seguridad: docs/portal-pruebas-seguridad.sql
