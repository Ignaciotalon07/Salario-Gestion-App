-- ====================================================================
-- 084_PORTAL_AVISOS_TAREAS_NOTAS — Avisos al cliente (campanita) cuando el EQUIPO:
--   (a) marca una tarea como completada, o
--   (b) deja una nota en una tarea marcada "visible para el cliente".
-- Además el cliente puede LEER esas notas (vista segura portal_tarea_notas).
-- Se hace en la base (triggers), así funciona desde cualquier lugar de Gestión.
-- Solo avisa si la implementación ya fue iniciada, y nunca por acciones del propio cliente.
-- Idempotente. Correr en Supabase → SQL Editor. Requiere 081 y 083.
-- ====================================================================

-- 1) Las notas nuevas pueden compartirse con el cliente (las anteriores quedan internas)
ALTER TABLE implementacion_tarea_notas
  ADD COLUMN IF NOT EXISTS visible_cliente boolean NOT NULL DEFAULT false;

-- 2) Aviso: el equipo completó una tarea
CREATE OR REPLACE FUNCTION trg_aviso_tarea_completada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'completada' AND OLD.estado IS DISTINCT FROM 'completada' AND is_team_member() THEN
    IF EXISTS (SELECT 1 FROM portal_prep WHERE cliente_id = NEW.cliente_id AND implementacion_iniciada_at IS NOT NULL) THEN
      INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle, ref_id)
      VALUES (NEW.cliente_id, 'tarea_completada', 'El equipo de Salario completó la tarea', '«' || NEW.tarea || '»', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aviso_tarea_completada ON implementacion_tareas;
CREATE TRIGGER aviso_tarea_completada AFTER UPDATE OF estado ON implementacion_tareas
  FOR EACH ROW EXECUTE FUNCTION trg_aviso_tarea_completada();

-- 3) Aviso: nota compartida con el cliente
CREATE OR REPLACE FUNCTION trg_aviso_nota_tarea() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cli uuid; v_tarea text;
BEGIN
  IF NEW.visible_cliente THEN
    SELECT cliente_id, tarea INTO v_cli, v_tarea FROM implementacion_tareas WHERE id = NEW.tarea_id;
    IF v_cli IS NOT NULL AND EXISTS (SELECT 1 FROM portal_prep WHERE cliente_id = v_cli AND implementacion_iniciada_at IS NOT NULL) THEN
      INSERT INTO portal_avisos (cliente_id, tipo, titulo, detalle, ref_id)
      VALUES (v_cli, 'nota_tarea', 'El equipo de Salario te dejó una nota en la tarea', '«' || v_tarea || '»', NEW.tarea_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aviso_nota_tarea ON implementacion_tarea_notas;
CREATE TRIGGER aviso_nota_tarea AFTER INSERT ON implementacion_tarea_notas
  FOR EACH ROW EXECUTE FUNCTION trg_aviso_nota_tarea();

-- 4) Vista segura: el cliente lee solo las notas compartidas de SUS tareas (y solo el nombre de pila del autor)
CREATE OR REPLACE VIEW portal_tarea_notas AS
  SELECT n.id, n.tarea_id, t.cliente_id, split_part(coalesce(n.autor_nombre, 'Equipo'), ' ', 1) AS autor, n.texto, n.created_at
  FROM implementacion_tarea_notas n
  JOIN implementacion_tareas t ON t.id = n.tarea_id
  WHERE n.visible_cliente
    AND t.cliente_id = portal_cliente_id()
    AND EXISTS (SELECT 1 FROM portal_prep pp WHERE pp.cliente_id = t.cliente_id AND pp.implementacion_iniciada_at IS NOT NULL);
REVOKE ALL ON portal_tarea_notas FROM PUBLIC, anon;
GRANT SELECT ON portal_tarea_notas TO authenticated;

SELECT 'ok' AS resultado,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('aviso_tarea_completada','aviso_nota_tarea')) AS triggers_esperado_2;
