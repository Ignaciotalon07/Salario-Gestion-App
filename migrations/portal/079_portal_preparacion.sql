-- ====================================================================
-- 079_PORTAL_PREPARACION — Portal de implementación, rediseño, paso 1 de la base.
-- Etapa "Preparación" del cliente nuevo (8 pasos):
--   1 Datos de la empresa        2 Información requerida     3 Usuarios de Salario
--   4 Logo y firma               5 Liquidación y Excel       6 Cantidad de empresas
--   7 Relevamiento inicial       8 Reunión de inicio
-- Esta migración cubre los pasos 1 a 6 (7 y 8 se suman en migraciones siguientes).
--
-- Qué agrega:
--   * portal_prep               → estado por cliente (cantidad de empresas declarada, pendiente de accesos)
--   * portal_usuarios_salario   → nombres de quienes van a usar Salario (de acá salen los accesos)
--   * portal_prep_revision      → revisión del equipo por paso (en revisión / revisado / necesita ajustes + comentario)
--   * prep_pasos(cliente)       → estado de cada paso, CALCULADO de los datos (nunca queda desincronizado)
--   * portal_prep_estado        → vista para el cliente (usa prep_pasos con su propio cliente)
--   * RPC portal_guardar_usuarios / portal_guardar_cantidad_empresas
--     → el cliente NO escribe tablas del equipo: lo hace por funciones que validan todo.
--       Al guardar usuarios se crea (o actualiza) un pendiente para el programador
--       (Alfredo Cesar, prioridad "en la semana") para que cree los accesos.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================

-- ── 1) Estado de preparación por cliente ─────────────────────────────
CREATE TABLE IF NOT EXISTS portal_prep (
  cliente_id           uuid        PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  empresas_declaradas  integer     CHECK (empresas_declaradas IS NULL OR empresas_declaradas BETWEEN 1 AND 200),
  pendiente_accesos_id uuid,       -- pendiente creado para el programador (crear accesos)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 2) Usuarios de Salario (quiénes van a usar el sistema) ───────────
CREATE TABLE IF NOT EXISTS portal_usuarios_salario (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 120),
  orden       integer     NOT NULL DEFAULT 0,
  creado      boolean     NOT NULL DEFAULT false,   -- el programador marca cuando ya creó el acceso
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_usr_salario_cliente ON portal_usuarios_salario (cliente_id, orden);

-- ── 3) Revisión del equipo por paso ──────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_prep_revision (
  cliente_id   uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  paso         integer     NOT NULL CHECK (paso BETWEEN 1 AND 8),
  estado       text        NOT NULL DEFAULT 'en_revision' CHECK (estado IN ('en_revision','revisado','ajustes')),
  comentario   text,                -- lo ve el cliente ("Salario te dejó un comentario")
  revisado_por text,
  revisado_at  timestamptz,
  PRIMARY KEY (cliente_id, paso)
);

-- ── 4) RLS: el equipo gestiona todo; el cliente solo LEE lo suyo ─────
ALTER TABLE portal_prep             ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_usuarios_salario ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_prep_revision    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona portal_prep" ON portal_prep;
CREATE POLICY "equipo gestiona portal_prep" ON portal_prep
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve su portal_prep" ON portal_prep;
CREATE POLICY "cliente ve su portal_prep" ON portal_prep
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_usuarios_salario" ON portal_usuarios_salario;
CREATE POLICY "equipo gestiona portal_usuarios_salario" ON portal_usuarios_salario
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus usuarios salario" ON portal_usuarios_salario;
CREATE POLICY "cliente ve sus usuarios salario" ON portal_usuarios_salario
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_prep_revision" ON portal_prep_revision;
CREATE POLICY "equipo gestiona portal_prep_revision" ON portal_prep_revision
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve su revision" ON portal_prep_revision;
CREATE POLICY "cliente ve su revision" ON portal_prep_revision
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

-- Realtime: el equipo ve al instante lo que carga el cliente y el cliente ve las revisiones
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_prep;             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_usuarios_salario; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_prep_revision;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5) Estado de cada paso, calculado de los datos ───────────────────
-- Devuelve una fila por paso (1..8): completo + revisión del equipo.
-- Lo puede pedir el equipo (cualquier cliente) o el cliente (solo el suyo).
CREATE OR REPLACE FUNCTION prep_pasos(p_cliente uuid)
RETURNS TABLE (paso integer, completo boolean, revision text, comentario text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e   cliente_empresas%ROWTYPE;
  v_prep portal_prep%ROWTYPE;
BEGIN
  IF p_cliente IS NULL OR NOT (is_team_member() OR p_cliente = portal_cliente_id()) THEN
    RETURN;
  END IF;

  SELECT * INTO e      FROM cliente_empresas WHERE cliente_id = p_cliente AND es_principal LIMIT 1;
  SELECT * INTO v_prep FROM portal_prep      WHERE cliente_id = p_cliente;

  RETURN QUERY
  WITH calc(paso, completo) AS (
    VALUES
      -- 1 Datos de la empresa
      (1, e.id IS NOT NULL
          AND coalesce(btrim(e.razon_social),'') <> '' AND coalesce(btrim(e.cuit),'') <> ''
          AND coalesce(btrim(e.domicilio),'') <> ''    AND coalesce(btrim(e.tipo_empleador),'') <> ''
          AND e.cant_legajos IS NOT NULL),
      -- 2 Información requerida (obra social, ART, actividad, convenios)
      (2, e.id IS NOT NULL
          AND coalesce(btrim(e.obra_social),'') <> '' AND coalesce(btrim(e.art),'') <> ''
          AND coalesce(btrim(e.actividad_principal),'') <> '' AND coalesce(btrim(e.convenios),'') <> ''),
      -- 3 Usuarios de Salario
      (3, EXISTS (SELECT 1 FROM portal_usuarios_salario u WHERE u.cliente_id = p_cliente)),
      -- 4 Logo y firma (de la empresa principal)
      (4, e.id IS NOT NULL
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'logo')
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'firma')),
      -- 5 Liquidaciones (2 PDF). El Excel de control es opcional
      (5, e.id IS NOT NULL
          AND (SELECT count(*) FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'liquidacion') >= 2),
      -- 6 Cantidad de empresas
      (6, v_prep.empresas_declaradas IS NOT NULL),
      -- 7 y 8: se calculan en migraciones siguientes (relevamiento, reunión)
      (7, false),
      (8, false)
  )
  SELECT c.paso, c.completo,
         CASE WHEN r.estado IS NOT NULL THEN r.estado
              WHEN c.completo AND c.paso IN (1,2,4,5) THEN 'en_revision'
              ELSE NULL END,
         r.comentario
  FROM calc c
  LEFT JOIN portal_prep_revision r ON r.cliente_id = p_cliente AND r.paso = c.paso
  ORDER BY c.paso;
END $$;

REVOKE ALL ON FUNCTION prep_pasos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION prep_pasos(uuid) TO authenticated;

-- Vista para el portal: los pasos del propio cliente
CREATE OR REPLACE VIEW portal_prep_estado AS
  SELECT * FROM prep_pasos(portal_cliente_id());
REVOKE ALL ON portal_prep_estado FROM PUBLIC, anon;
GRANT SELECT ON portal_prep_estado TO authenticated;

-- ── 6) Guardar usuarios de Salario (RPC del cliente) ─────────────────
-- Reemplaza la lista completa. Crea / actualiza el pendiente del programador.
CREATE OR REPLACE FUNCTION portal_guardar_usuarios(p_nombres text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli      uuid := portal_cliente_id();
  v_nombre   text;
  v_nombres  text[];
  v_creados  text[];
  v_prog    text;
  v_pend_id  uuid;
  v_resuelto boolean;
  v_desc     text;
  n          integer;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;

  -- Limpiar: sin vacíos, sin espacios sobrantes, máx. 30
  SELECT coalesce(array_agg(btrim(x) ORDER BY ord), '{}') INTO v_nombres
  FROM unnest(coalesce(p_nombres, '{}')) WITH ORDINALITY AS t(x, ord)
  WHERE length(btrim(x)) >= 2;
  n := coalesce(array_length(v_nombres, 1), 0);
  IF n < 1  THEN RAISE EXCEPTION 'Indicá al menos una persona'; END IF;
  IF n > 30 THEN RAISE EXCEPTION 'Máximo 30 personas'; END IF;

  -- Conservar el estado "creado" de los que ya estaban (mismo nombre)
  v_creados := ARRAY(SELECT lower(nombre) FROM portal_usuarios_salario WHERE cliente_id = v_cli AND creado);

  DELETE FROM portal_usuarios_salario WHERE cliente_id = v_cli;
  INSERT INTO portal_usuarios_salario (cliente_id, nombre, orden, creado)
  SELECT v_cli, x, ord::int, lower(x) = ANY (v_creados)
  FROM unnest(v_nombres) WITH ORDINALITY AS t(x, ord);

  INSERT INTO portal_prep (cliente_id) VALUES (v_cli) ON CONFLICT (cliente_id) DO NOTHING;

  -- Pendiente para el programador (Alfredo Cesar), prioridad "en la semana"
  SELECT nombre INTO v_prog FROM team_members
   WHERE activo = true AND nombre ILIKE 'Alfredo%' ORDER BY created_at LIMIT 1;
  SELECT coalesce(nombre, razon_social) INTO v_nombre FROM clientes WHERE id = v_cli;

  v_desc := 'Crear accesos de Salario para ' || v_nombre || ' (' || n || ' ' ||
            CASE WHEN n = 1 THEN 'persona' ELSE 'personas' END || '): ' || array_to_string(v_nombres, ', ') || '.';

  IF v_prog IS NOT NULL THEN
    SELECT pendiente_accesos_id INTO v_pend_id FROM portal_prep WHERE cliente_id = v_cli;
    IF v_pend_id IS NOT NULL THEN
      SELECT resuelto INTO v_resuelto FROM pendientes WHERE id = v_pend_id;
      IF NOT FOUND THEN v_pend_id := NULL; END IF;
    END IF;

    IF v_pend_id IS NOT NULL AND coalesce(v_resuelto, true) = false THEN
      -- Sigue abierto: solo se actualiza el detalle con la lista nueva
      UPDATE pendientes SET descripcion = v_desc WHERE id = v_pend_id;
    ELSE
      INSERT INTO pendientes (cliente_id, cliente_nombre, asesor, prioridad, descripcion,
                              tipo_pendiente, fecha_vencimiento, interno)
      VALUES (v_cli, v_nombre, v_prog, 'semana', v_desc, 'implementacion', current_date + 10, true)
      RETURNING id INTO v_pend_id;

      INSERT INTO pendiente_eventos (pendiente_id, tipo, autor_email, autor_nombre, detalle)
      VALUES (v_pend_id, 'creado', 'portal@salariogestion', 'Portal · ' || v_nombre,
              'El cliente cargó sus usuarios de Salario en el portal');

      UPDATE portal_prep SET pendiente_accesos_id = v_pend_id, updated_at = now() WHERE cliente_id = v_cli;
    END IF;
  END IF;

  RETURN n;
END $$;

REVOKE ALL ON FUNCTION portal_guardar_usuarios(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_guardar_usuarios(text[]) TO authenticated;

-- ── 7) Guardar cantidad de empresas (RPC del cliente) ────────────────
CREATE OR REPLACE FUNCTION portal_guardar_cantidad_empresas(p_cant integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cli uuid := portal_cliente_id();
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  IF p_cant IS NULL OR p_cant < 1 OR p_cant > 200 THEN
    RAISE EXCEPTION 'Cantidad de empresas inválida';
  END IF;
  INSERT INTO portal_prep (cliente_id, empresas_declaradas) VALUES (v_cli, p_cant)
  ON CONFLICT (cliente_id) DO UPDATE SET empresas_declaradas = EXCLUDED.empresas_declaradas, updated_at = now();
END $$;

REVOKE ALL ON FUNCTION portal_guardar_cantidad_empresas(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_guardar_cantidad_empresas(integer) TO authenticated;

-- ── 8) Novedades al equipo (campanita de Gestión) ────────────────────
-- Se suman dos tipos nuevos al CHECK de portal_novedades.
ALTER TABLE portal_novedades DROP CONSTRAINT IF EXISTS portal_novedades_tipo_check;
ALTER TABLE portal_novedades ADD CONSTRAINT portal_novedades_tipo_check
  CHECK (tipo IN ('etapa_completada','empresa_cargada','empresa_editada','archivo_subido',
                  'usuarios_cargados','cantidad_empresas'));

CREATE OR REPLACE FUNCTION trg_novedad_usuarios() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    PERFORM portal_registrar_novedad(NEW.cliente_id, 'usuarios_cargados',
      (SELECT count(*)::text || ' personas' FROM portal_usuarios_salario WHERE cliente_id = NEW.cliente_id), NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_novedad_usuarios ON portal_usuarios_salario;
CREATE TRIGGER trg_novedad_usuarios AFTER INSERT ON portal_usuarios_salario
  FOR EACH ROW WHEN (NOT is_team_member())
  EXECUTE FUNCTION trg_novedad_usuarios();

CREATE OR REPLACE FUNCTION trg_novedad_cant_empresas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.empresas_declaradas IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.empresas_declaradas END)
     AND NEW.empresas_declaradas IS NOT NULL AND NOT is_team_member() THEN
    PERFORM portal_registrar_novedad(NEW.cliente_id, 'cantidad_empresas',
      NEW.empresas_declaradas::text || ' empresas', NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_novedad_cant_empresas ON portal_prep;
CREATE TRIGGER trg_novedad_cant_empresas AFTER INSERT OR UPDATE ON portal_prep
  FOR EACH ROW EXECUTE FUNCTION trg_novedad_cant_empresas();

-- ── Verificación ─────────────────────────────────────────────────────
-- Debe devolver 3 tablas y las funciones creadas:
SELECT 'tablas' AS que, count(*)::text AS cuantos
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('portal_prep','portal_usuarios_salario','portal_prep_revision')
UNION ALL
SELECT 'funciones', count(*)::text
FROM pg_proc WHERE proname IN ('prep_pasos','portal_guardar_usuarios','portal_guardar_cantidad_empresas');
