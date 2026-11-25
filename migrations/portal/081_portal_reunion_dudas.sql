-- ====================================================================
-- 081_PORTAL_REUNION_DUDAS — Portal de implementación: reunión, dudas, más tiempo,
-- avisos al cliente e "Iniciar implementación".
--
--   * portal_reuniones      → reunión de inicio: el cliente propone hasta 3 horarios,
--                              el equipo confirma uno y carga el link de Meet
--   * portal_hilos / portal_mensajes → "Dudas y notas": conversación por tarea o general
--   * portal_prorrogas      → pedidos de "Necesito más tiempo" (el equipo aprueba / rechaza)
--   * portal_avisos         → campanita del CLIENTE (reunión confirmada, te respondimos, etc.)
--   * portal_prep           → +implementacion_iniciada_at / iniciada_por
--   * RPC iniciar_implementacion (solo equipo): avisa al cliente que arrancó
--   * prep_pasos()          → el paso 8 se completa al solicitar la reunión
-- El cliente NO escribe las tablas directo: todo va por funciones que validan.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================

-- ── 1) Reuniones ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_reuniones (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo              text        NOT NULL DEFAULT 'inicio',
  estado            text        NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente','confirmada','realizada','cancelada')),
  propuestas        timestamptz[] NOT NULL DEFAULT '{}',   -- hasta 3 inicios (duración 60 min)
  comentario_cliente text,
  confirmado_inicio timestamptz,                           -- lo carga el equipo al confirmar
  meet_url          text,                                  -- link de Meet (lo carga el equipo)
  confirmado_por    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- Una sola reunión activa por cliente y tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_reunion_activa
  ON portal_reuniones (cliente_id, tipo) WHERE estado IN ('pendiente','confirmada');

-- ── 2) Dudas y notas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_hilos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tarea_id    uuid        REFERENCES implementacion_tareas(id) ON DELETE SET NULL,  -- NULL = consulta general
  asunto      text        NOT NULL CHECK (length(btrim(asunto)) BETWEEN 3 AND 160),
  estado      text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','respondida','cerrada')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_hilos_cliente ON portal_hilos (cliente_id, updated_at DESC);
-- Un hilo por tarea y cliente (la "caja" de notas de cada tarea)
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_hilo_tarea ON portal_hilos (cliente_id, tarea_id) WHERE tarea_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_mensajes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hilo_id      uuid        NOT NULL REFERENCES portal_hilos(id) ON DELETE CASCADE,
  cliente_id   uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  autor_tipo   text        NOT NULL CHECK (autor_tipo IN ('cliente','equipo')),
  autor_nombre text,
  texto        text        NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 4000),
  documento_id uuid        REFERENCES cliente_documentos(id) ON DELETE SET NULL,  -- adjunto opcional
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_mensajes_hilo ON portal_mensajes (hilo_id, created_at);

-- ── 3) Pedidos de "Necesito más tiempo" ──────────────────────────────
CREATE TABLE IF NOT EXISTS portal_prorrogas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tarea_id         uuid        NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  fecha_propuesta  date        NOT NULL,
  motivo           text,
  estado           text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  fecha_aprobada   date,                                   -- la que confirma el equipo
  comentario_equipo text,
  respondido_por   text,
  respondido_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_prorrogas_cliente ON portal_prorrogas (cliente_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_prorroga_pendiente ON portal_prorrogas (tarea_id) WHERE estado = 'pendiente';

-- ── 4) Avisos del cliente (su campanita) ─────────────────────────────
CREATE TABLE IF NOT EXISTS portal_avisos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        text        NOT NULL,   -- reunion_confirmada | respuesta_equipo | paso_revisado | paso_ajustes | tiempo_respondido | implementacion_iniciada
  titulo      text        NOT NULL,
  detalle     text,
  ref_id      uuid,
  leido_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_avisos_cliente ON portal_avisos (cliente_id, created_at DESC);

-- ── 5) Inicio de la implementación ───────────────────────────────────
ALTER TABLE portal_prep ADD COLUMN IF NOT EXISTS implementacion_iniciada_at timestamptz;
ALTER TABLE portal_prep ADD COLUMN IF NOT EXISTS iniciada_por text;

-- ── 6) RLS ───────────────────────────────────────────────────────────
ALTER TABLE portal_reuniones ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_hilos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_mensajes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_prorrogas ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_avisos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona portal_reuniones" ON portal_reuniones;
CREATE POLICY "equipo gestiona portal_reuniones" ON portal_reuniones
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus reuniones" ON portal_reuniones;
CREATE POLICY "cliente ve sus reuniones" ON portal_reuniones
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_hilos" ON portal_hilos;
CREATE POLICY "equipo gestiona portal_hilos" ON portal_hilos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus hilos" ON portal_hilos;
CREATE POLICY "cliente ve sus hilos" ON portal_hilos
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_mensajes" ON portal_mensajes;
CREATE POLICY "equipo gestiona portal_mensajes" ON portal_mensajes
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member() AND autor_tipo = 'equipo');
DROP POLICY IF EXISTS "cliente ve sus mensajes" ON portal_mensajes;
CREATE POLICY "cliente ve sus mensajes" ON portal_mensajes
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_prorrogas" ON portal_prorrogas;
CREATE POLICY "equipo gestiona portal_prorrogas" ON portal_prorrogas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus prorrogas" ON portal_prorrogas;
CREATE POLICY "cliente ve sus prorrogas" ON portal_prorrogas
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "equipo gestiona portal_avisos" ON portal_avisos;
CREATE POLICY "equipo gestiona portal_avisos" ON portal_avisos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus avisos" ON portal_avisos;
CREATE POLICY "cliente ve sus avisos" ON portal_avisos
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_reuniones; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_hilos;     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_mensajes;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_prorrogas; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE portal_avisos;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7) Novedades nuevas para la campanita del equipo ─────────────────
ALTER TABLE portal_novedades DROP CONSTRAINT IF EXISTS portal_novedades_tipo_check;
ALTER TABLE portal_novedades ADD CONSTRAINT portal_novedades_tipo_check
  CHECK (tipo IN ('etapa_completada','empresa_cargada','empresa_editada','archivo_subido',
                  'usuarios_cargados','cantidad_empresas','relevamiento_aprobado',
                  'reunion_solicitada','duda_cliente','tiempo_pedido'));

-- ── 8) Reunión: solicitar / cancelar (RPC del cliente) ───────────────
CREATE OR REPLACE FUNCTION portal_solicitar_reunion(p_propuestas timestamptz[], p_comentario text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli  uuid := portal_cliente_id();
  v_prop timestamptz[];
  x      timestamptz;
  v_id   uuid;
  v_est  text;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;

  v_prop := ARRAY(SELECT DISTINCT t FROM unnest(coalesce(p_propuestas,'{}')) AS t ORDER BY t);
  IF coalesce(array_length(v_prop,1),0) < 1 OR array_length(v_prop,1) > 3 THEN
    RAISE EXCEPTION 'Elegí entre 1 y 3 horarios';
  END IF;
  FOREACH x IN ARRAY v_prop LOOP
    IF x < now() OR x > now() + interval '90 days' THEN
      RAISE EXCEPTION 'Los horarios tienen que ser futuros (hasta 90 días)';
    END IF;
    -- Lunes a viernes (hora de Argentina)
    IF extract(isodow FROM x AT TIME ZONE 'America/Argentina/Buenos_Aires') > 5 THEN
      RAISE EXCEPTION 'Los horarios tienen que ser de lunes a viernes';
    END IF;
  END LOOP;

  SELECT id, estado INTO v_id, v_est FROM portal_reuniones
   WHERE cliente_id = v_cli AND tipo = 'inicio' AND estado IN ('pendiente','confirmada');
  IF v_est = 'confirmada' THEN
    RAISE EXCEPTION 'Ya hay una reunión confirmada. Escribinos si necesitás cambiarla.';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE portal_reuniones
       SET propuestas = v_prop, comentario_cliente = nullif(btrim(p_comentario),''), updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO portal_reuniones (cliente_id, propuestas, comentario_cliente)
    VALUES (v_cli, v_prop, nullif(btrim(p_comentario),'')) RETURNING id INTO v_id;
  END IF;

  PERFORM portal_registrar_novedad(v_cli, 'reunion_solicitada', array_length(v_prop,1)::text || ' horarios propuestos', v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION portal_cancelar_reunion()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cli uuid := portal_cliente_id();
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  UPDATE portal_reuniones SET estado = 'cancelada', updated_at = now()
   WHERE cliente_id = v_cli AND tipo = 'inicio' AND estado = 'pendiente';
END $$;

-- ── 9) Dudas y notas: enviar mensaje / cerrar (RPC del cliente) ──────
-- Si viene p_tarea se usa (o crea) el hilo de esa tarea; si viene p_hilo se responde en él;
-- si no viene ninguno, se crea una consulta general con el asunto indicado.
CREATE OR REPLACE FUNCTION portal_enviar_mensaje(
  p_texto  text,
  p_hilo   uuid DEFAULT NULL,
  p_tarea  uuid DEFAULT NULL,
  p_asunto text DEFAULT NULL,
  p_documento uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli   uuid := portal_cliente_id();
  v_hilo  uuid := p_hilo;
  v_asunto text := nullif(btrim(p_asunto),'');
  v_nom   text;
  v_msg   uuid;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  IF length(btrim(coalesce(p_texto,''))) < 1 THEN RAISE EXCEPTION 'Escribí tu mensaje'; END IF;
  IF p_documento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cliente_documentos WHERE id = p_documento AND cliente_id = v_cli) THEN
    RAISE EXCEPTION 'Adjunto inválido';
  END IF;

  IF v_hilo IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM portal_hilos WHERE id = v_hilo AND cliente_id = v_cli) THEN
      RAISE EXCEPTION 'Conversación inexistente';
    END IF;
  ELSIF p_tarea IS NOT NULL THEN
    SELECT tarea INTO v_asunto FROM implementacion_tareas WHERE id = p_tarea AND cliente_id = v_cli;
    IF v_asunto IS NULL THEN RAISE EXCEPTION 'Tarea inexistente'; END IF;
    SELECT id INTO v_hilo FROM portal_hilos WHERE cliente_id = v_cli AND tarea_id = p_tarea;
    IF v_hilo IS NULL THEN
      INSERT INTO portal_hilos (cliente_id, tarea_id, asunto) VALUES (v_cli, p_tarea, v_asunto) RETURNING id INTO v_hilo;
    END IF;
  ELSE
    IF v_asunto IS NULL OR length(v_asunto) < 3 THEN RAISE EXCEPTION 'Indicá un asunto'; END IF;
    INSERT INTO portal_hilos (cliente_id, asunto) VALUES (v_cli, left(v_asunto,160)) RETURNING id INTO v_hilo;
  END IF;

  SELECT coalesce(nombre, razon_social) INTO v_nom FROM clientes WHERE id = v_cli;
  INSERT INTO portal_mensajes (hilo_id, cliente_id, autor_tipo, autor_nombre, texto, documento_id)
  VALUES (v_hilo, v_cli, 'cliente', v_nom, btrim(p_texto), p_documento) RETURNING id INTO v_msg;

  PERFORM portal_registrar_novedad(v_cli, 'duda_cliente', (SELECT asunto FROM portal_hilos WHERE id = v_hilo), v_hilo);
  RETURN v_hilo;
END $$;

CREATE OR REPLACE FUNCTION portal_cerrar_hilo(p_hilo uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cli uuid := portal_cliente_id();
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  UPDATE portal_hilos SET estado = 'cerrada', updated_at = now() WHERE id = p_hilo AND cliente_id = v_cli;
END $$;

-- Cada mensaje nuevo actualiza el estado del hilo; si responde el equipo, avisa al cliente
CREATE OR REPLACE FUNCTION trg_portal_mensaje() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_asunto text;
BEGIN
  UPDATE portal_hilos
     SET estado = CASE WHEN NEW.autor_tipo = 'equipo' THEN 'respondida' ELSE 'abierta' END,
         updated_at = now()
   WHERE id = NEW.hilo_id
   RETURNING asunto INTO v_asunto;
  IF NEW.autor_tipo = 'equipo' THEN
    INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle, ref_id)
    VALUES (NEW.cliente_id, 'respuesta_equipo', 'Te respondimos', v_asunto, NEW.hilo_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_portal_mensaje ON portal_mensajes;
CREATE TRIGGER trg_portal_mensaje AFTER INSERT ON portal_mensajes
  FOR EACH ROW EXECUTE FUNCTION trg_portal_mensaje();

-- ── 10) "Necesito más tiempo" (RPC del cliente) ──────────────────────
CREATE OR REPLACE FUNCTION portal_pedir_tiempo(p_tarea uuid, p_fecha date, p_motivo text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli  uuid := portal_cliente_id();
  t      implementacion_tareas%ROWTYPE;
  v_id   uuid;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  SELECT * INTO t FROM implementacion_tareas WHERE id = p_tarea AND cliente_id = v_cli;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea inexistente'; END IF;
  IF t.responsable_tipo NOT IN ('cliente','ambos') THEN RAISE EXCEPTION 'Esa tarea no es tuya'; END IF;
  IF t.estado = 'completada' THEN RAISE EXCEPTION 'La tarea ya está completa'; END IF;
  IF p_fecha IS NULL OR p_fecha <= current_date OR p_fecha > current_date + 120 THEN
    RAISE EXCEPTION 'Elegí una fecha futura (hasta 120 días)';
  END IF;

  SELECT id INTO v_id FROM portal_prorrogas WHERE tarea_id = p_tarea AND estado = 'pendiente';
  IF v_id IS NOT NULL THEN
    UPDATE portal_prorrogas SET fecha_propuesta = p_fecha, motivo = nullif(btrim(p_motivo),''), created_at = now() WHERE id = v_id;
  ELSE
    INSERT INTO portal_prorrogas (cliente_id, tarea_id, fecha_propuesta, motivo)
    VALUES (v_cli, p_tarea, p_fecha, nullif(btrim(p_motivo),'')) RETURNING id INTO v_id;
  END IF;

  PERFORM portal_registrar_novedad(v_cli, 'tiempo_pedido', t.tarea, p_tarea);
  RETURN v_id;
END $$;

-- ── 11) Avisos automáticos al cliente ────────────────────────────────
-- Reunión confirmada
CREATE OR REPLACE FUNCTION trg_aviso_reunion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado IS DISTINCT FROM 'confirmada' THEN
    INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle, ref_id)
    VALUES (NEW.cliente_id, 'reunion_confirmada', 'Confirmamos tu reunión de inicio',
            to_char(NEW.confirmado_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' · ya está el link de Meet', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_reunion ON portal_reuniones;
CREATE TRIGGER trg_aviso_reunion AFTER UPDATE ON portal_reuniones
  FOR EACH ROW EXECUTE FUNCTION trg_aviso_reunion();

-- Respuesta del equipo a "más tiempo"
CREATE OR REPLACE FUNCTION trg_aviso_prorroga() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tarea text;
BEGIN
  IF NEW.estado IN ('aprobada','rechazada') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    SELECT tarea INTO v_tarea FROM implementacion_tareas WHERE id = NEW.tarea_id;
    INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle, ref_id)
    VALUES (NEW.cliente_id, 'tiempo_respondido',
            CASE WHEN NEW.estado = 'aprobada' THEN 'Aprobamos tu pedido de más tiempo' ELSE 'Revisamos tu pedido de más tiempo' END,
            v_tarea || CASE WHEN NEW.estado = 'aprobada' AND NEW.fecha_aprobada IS NOT NULL
                            THEN ' · nueva fecha: ' || to_char(NEW.fecha_aprobada, 'DD/MM') ELSE '' END,
            NEW.tarea_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_prorroga ON portal_prorrogas;
CREATE TRIGGER trg_aviso_prorroga AFTER UPDATE ON portal_prorrogas
  FOR EACH ROW EXECUTE FUNCTION trg_aviso_prorroga();

-- Revisión de un paso de Preparación (revisado / necesita ajustes)
CREATE OR REPLACE FUNCTION trg_aviso_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nombres text[] := ARRAY['Datos de tu empresa','Información requerida','Usuarios de Salario','Logo y firma',
                          'Liquidación y Excel de control','Cantidad de empresas','Relevamiento inicial','Reunión de inicio'];
BEGIN
  IF NEW.estado IN ('revisado','ajustes')
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado OR OLD.comentario IS DISTINCT FROM NEW.comentario) THEN
    INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle)
    VALUES (NEW.cliente_id,
            CASE WHEN NEW.estado = 'revisado' THEN 'paso_revisado' ELSE 'paso_ajustes' END,
            CASE WHEN NEW.estado = 'revisado' THEN 'Revisamos un paso tuyo' ELSE 'Un paso necesita un ajuste' END,
            nombres[NEW.paso] || coalesce(' · ' || nullif(btrim(NEW.comentario),''), ''));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_revision ON portal_prep_revision;
CREATE TRIGGER trg_aviso_revision AFTER INSERT OR UPDATE ON portal_prep_revision
  FOR EACH ROW EXECUTE FUNCTION trg_aviso_revision();

-- Marcar avisos como leídos (RPC del cliente)
CREATE OR REPLACE FUNCTION portal_marcar_avisos_leidos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cli uuid := portal_cliente_id();
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  UPDATE portal_avisos SET leido_at = now() WHERE cliente_id = v_cli AND leido_at IS NULL;
END $$;

-- ── 12) Iniciar implementación (solo el equipo) ──────────────────────
-- El equipo ya armó las tareas en Gestión; esto marca el inicio y le avisa al cliente.
CREATE OR REPLACE FUNCTION iniciar_implementacion(p_cliente uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tareas integer;
  v_fin    date;
BEGIN
  IF NOT is_team_member() THEN RAISE EXCEPTION 'Solo el equipo puede iniciar la implementación'; END IF;
  IF NOT EXISTS (SELECT 1 FROM relevamiento_aprobacion WHERE cliente_id = p_cliente) THEN
    RAISE EXCEPTION 'El cliente todavía no aprobó el relevamiento';
  END IF;
  SELECT count(*) INTO v_tareas FROM implementacion_tareas WHERE cliente_id = p_cliente;
  IF v_tareas = 0 THEN RAISE EXCEPTION 'El cliente no tiene tareas de implementación armadas'; END IF;
  SELECT fecha_fin_objetivo INTO v_fin FROM clientes WHERE id = p_cliente;

  INSERT INTO portal_prep (cliente_id, implementacion_iniciada_at, iniciada_por)
  VALUES (p_cliente, now(), coalesce(auth.jwt() ->> 'email', 'equipo'))
  ON CONFLICT (cliente_id) DO UPDATE
    SET implementacion_iniciada_at = coalesce(portal_prep.implementacion_iniciada_at, now()),
        iniciada_por = coalesce(portal_prep.iniciada_por, EXCLUDED.iniciada_por),
        updated_at = now();

  -- Aviso una sola vez
  IF NOT EXISTS (SELECT 1 FROM portal_avisos WHERE cliente_id = p_cliente AND tipo = 'implementacion_iniciada') THEN
    INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle)
    VALUES (p_cliente, 'implementacion_iniciada', '¡Arrancó tu implementación!',
            'Ya tenés ' || v_tareas || ' tareas listas para revisar' ||
            CASE WHEN v_fin IS NOT NULL THEN ' · fin estimado: ' || to_char(v_fin, 'DD/MM/YYYY') ELSE '' END);
  END IF;
END $$;

-- ── 13) prep_pasos: el paso 8 se completa al solicitar la reunión ────
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
      (1, e.id IS NOT NULL
          AND coalesce(btrim(e.razon_social),'') <> '' AND coalesce(btrim(e.cuit),'') <> ''
          AND coalesce(btrim(e.domicilio),'') <> ''    AND coalesce(btrim(e.tipo_empleador),'') <> ''
          AND e.cant_legajos IS NOT NULL),
      (2, e.id IS NOT NULL
          AND coalesce(btrim(e.obra_social),'') <> '' AND coalesce(btrim(e.art),'') <> ''
          AND coalesce(btrim(e.actividad_principal),'') <> '' AND coalesce(btrim(e.convenios),'') <> ''),
      (3, EXISTS (SELECT 1 FROM portal_usuarios_salario u WHERE u.cliente_id = p_cliente)),
      (4, e.id IS NOT NULL
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'logo')
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'firma')),
      (5, e.id IS NOT NULL
          AND (SELECT count(*) FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'liquidacion') >= 2),
      (6, v_prep.empresas_declaradas IS NOT NULL),
      (7, EXISTS (SELECT 1 FROM relevamiento_aprobacion a WHERE a.cliente_id = p_cliente)),
      -- 8 Reunión: completo si hay una reunión pendiente, confirmada o realizada
      (8, EXISTS (SELECT 1 FROM portal_reuniones m WHERE m.cliente_id = p_cliente AND m.tipo = 'inicio'
                  AND m.estado IN ('pendiente','confirmada','realizada')))
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

-- ── 14) Permisos de las funciones ────────────────────────────────────
REVOKE ALL ON FUNCTION portal_solicitar_reunion(timestamptz[], text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION portal_cancelar_reunion()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION portal_enviar_mensaje(text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION portal_cerrar_hilo(uuid)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION portal_pedir_tiempo(uuid, date, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION portal_marcar_avisos_leidos()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION iniciar_implementacion(uuid)                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_solicitar_reunion(timestamptz[], text)     TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancelar_reunion()                         TO authenticated;
GRANT EXECUTE ON FUNCTION portal_enviar_mensaje(text, uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cerrar_hilo(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION portal_pedir_tiempo(uuid, date, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION portal_marcar_avisos_leidos()                     TO authenticated;
GRANT EXECUTE ON FUNCTION iniciar_implementacion(uuid)                      TO authenticated;

-- ── Verificación ─────────────────────────────────────────────────────
-- Debe dar: tablas = 5, funciones = 7
SELECT 'tablas' AS que, count(*)::text AS cuantos
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('portal_reuniones','portal_hilos','portal_mensajes','portal_prorrogas','portal_avisos')
UNION ALL
SELECT 'funciones', count(*)::text
FROM pg_proc
WHERE proname IN ('portal_solicitar_reunion','portal_cancelar_reunion','portal_enviar_mensaje',
                  'portal_cerrar_hilo','portal_pedir_tiempo','portal_marcar_avisos_leidos','iniciar_implementacion');
