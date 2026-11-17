-- 077_portal_novedades.sql
-- PORTAL DE CLIENTES — avisos al equipo cuando el cliente hace algo en el portal.
--
-- 1) team_members.avisos_portal: marca quién recibe los avisos del portal (por ahora solo
--    Ignacio; después se habilita a Matías con un UPDATE, ver abajo).
-- 2) portal_novedades: una fila por cosa que hizo el cliente (etapa completada, empresa
--    cargada/editada, archivo subido). Se llena SOLA con triggers: no depende de ningún
--    navegador. Si el cliente hace lo mismo varias veces seguidas (ej. guarda 5 veces la
--    misma ficha) se junta en una sola novedad durante 10 minutos.
-- 3) portal_novedades_vistas: hasta cuándo vio avisos cada integrante del equipo.
--
-- Los clientes del portal NO tienen acceso a estas dos tablas (solo el equipo).
-- Idempotente.

-- ── 1. Quién recibe avisos ───────────────────────────────────────────
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avisos_portal boolean NOT NULL DEFAULT false;

-- ── 2. Novedades ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_novedades (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        text        NOT NULL CHECK (tipo IN ('etapa_completada','empresa_cargada','empresa_editada','archivo_subido')),
  detalle     text,                 -- nombre de la etapa / razón social / nombre del archivo
  ref_id      uuid,                 -- tarea o empresa a la que se refiere (para juntar repetidas)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_novedades_fecha   ON portal_novedades (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_novedades_cliente ON portal_novedades (cliente_id, created_at DESC);

ALTER TABLE portal_novedades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo ve portal_novedades" ON portal_novedades;
CREATE POLICY "equipo ve portal_novedades" ON portal_novedades
  FOR SELECT TO authenticated USING (is_team_member());
-- Sin policy de escritura: solo escriben los triggers (SECURITY DEFINER).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE portal_novedades;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. "Visto hasta" por integrante Y por cliente ────────────────────
-- (versión final; si ya corriste la 077 anterior, la 078 la corrige)
CREATE TABLE IF NOT EXISTS portal_novedades_vistas (
  usuario_email text        NOT NULL,
  cliente_id    uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  visto_hasta   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, cliente_id)
);
ALTER TABLE portal_novedades_vistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cada uno su visto" ON portal_novedades_vistas;
CREATE POLICY "cada uno su visto" ON portal_novedades_vistas
  FOR ALL TO authenticated
  USING (is_team_member() AND usuario_email = (auth.jwt() ->> 'email'))
  WITH CHECK (is_team_member() AND usuario_email = (auth.jwt() ->> 'email'));

-- ── 4. Registro de una novedad (junta repetidas de los últimos 10 min) ──
CREATE OR REPLACE FUNCTION portal_registrar_novedad(p_cliente uuid, p_tipo text, p_detalle text, p_ref uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM portal_novedades
   WHERE cliente_id = p_cliente AND tipo = p_tipo
     AND ref_id IS NOT DISTINCT FROM p_ref
     AND created_at > now() - interval '10 minutes'
   ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE portal_novedades SET created_at = now(), detalle = p_detalle WHERE id = v_id;
  ELSE
    INSERT INTO portal_novedades (cliente_id, tipo, detalle, ref_id)
    VALUES (p_cliente, p_tipo, p_detalle, p_ref);
  END IF;
END $$;
REVOKE ALL ON FUNCTION portal_registrar_novedad(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Triggers ──────────────────────────────────────────────────────
-- a) Empresa cargada o editada POR EL CLIENTE (no cuenta lo que edita el equipo)
CREATE OR REPLACE FUNCTION trg_novedad_empresa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_team_member() THEN RETURN NEW; END IF;
  PERFORM portal_registrar_novedad(
    NEW.cliente_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'empresa_cargada' ELSE 'empresa_editada' END,
    NEW.razon_social, NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_novedad_empresa ON cliente_empresas;
CREATE TRIGGER trg_novedad_empresa AFTER INSERT OR UPDATE ON cliente_empresas
  FOR EACH ROW EXECUTE FUNCTION trg_novedad_empresa();

-- b) Etapa completada por el cliente (portal_completar_etapa deja ese evento)
CREATE OR REPLACE FUNCTION trg_novedad_etapa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t implementacion_tareas%ROWTYPE;
BEGIN
  SELECT * INTO t FROM implementacion_tareas WHERE id = NEW.tarea_id;
  IF FOUND THEN
    PERFORM portal_registrar_novedad(t.cliente_id, 'etapa_completada', t.tarea, t.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_novedad_etapa ON implementacion_tarea_eventos;
CREATE TRIGGER trg_novedad_etapa AFTER INSERT ON implementacion_tarea_eventos
  FOR EACH ROW WHEN (NEW.autor_nombre = 'Cliente (portal)')
  EXECUTE FUNCTION trg_novedad_etapa();

-- c) Archivo subido por el cliente (lo usará la subida de archivos del portal)
CREATE OR REPLACE FUNCTION trg_novedad_archivo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM portal_registrar_novedad(NEW.cliente_id, 'archivo_subido', NEW.nombre, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_novedad_archivo ON cliente_documentos;
CREATE TRIGGER trg_novedad_archivo AFTER INSERT ON cliente_documentos
  FOR EACH ROW WHEN (NEW.origen = 'cliente')
  EXECUTE FUNCTION trg_novedad_archivo();

-- ── Quién recibe los avisos (correr UNA VEZ a mano, NO forma parte de la migración) ──
--   Ver los integrantes:   SELECT email, nombre, avisos_portal FROM team_members ORDER BY nombre;
--   Activar a Ignacio:     UPDATE team_members SET avisos_portal = true WHERE nombre ILIKE 'Ignacio%';
--   Activar a Matías:      UPDATE team_members SET avisos_portal = true WHERE nombre ILIKE 'Mat%as%';
--   Desactivar a alguien:  UPDATE team_members SET avisos_portal = false WHERE nombre ILIKE '...';
