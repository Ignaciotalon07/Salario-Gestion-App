-- 075_portal_etapas_cliente.sql
-- PORTAL DE CLIENTES — PASO 2: el cliente ve sus 23 etapas y marca como hechas las SUYAS.
--
-- 1) portal_etapas suma dos columnas (al final, sin tocar las anteriores):
--      le_toca_cliente  → la etapa es responsabilidad del cliente (responsable_tipo = 'cliente')
--      bloqueada        → tiene predecesoras sin completar (todavía no se puede hacer)
-- 2) Función portal_completar_etapa(tarea_id): ÚNICA forma en que el cliente escribe en las
--    etapas. Valida en la base (no en el navegador) que:
--      · la etapa sea de SU cliente y de responsable 'cliente' (las de 'equipo' y 'ambos'
--        las marca solo el equipo),
--      · no esté bloqueada por predecesoras,
--    marca la etapa como completada, cierra el pendiente vinculado y deja el evento en el
--    historial como "Completada por el cliente (portal)".
-- El recálculo del Gantt lo hace la plataforma del equipo al recibir el cambio (realtime).
-- Idempotente.

CREATE OR REPLACE VIEW portal_etapas AS
  SELECT t.id, t.cliente_id, t.orden, t.tarea, t.fase, t.responsable_tipo, t.estado,
         t.fecha_inicio_calc AS fecha_inicio, t.fecha_estimada AS fecha_fin,
         t.fecha_completada, t.duracion_dias,
         (t.responsable_tipo = 'cliente') AS le_toca_cliente,
         EXISTS (
           SELECT 1 FROM implementacion_tareas p
           WHERE p.id = ANY (t.predecesoras_ids) AND p.estado <> 'completada'
         ) AS bloqueada
  FROM implementacion_tareas t
  WHERE t.cliente_id = portal_cliente_id();

REVOKE ALL ON portal_etapas FROM PUBLIC, anon;
GRANT SELECT ON portal_etapas TO authenticated;

CREATE OR REPLACE FUNCTION portal_completar_etapa(p_tarea_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente uuid := portal_cliente_id();
  t         implementacion_tareas%ROWTYPE;
  v_email   text := auth.jwt() ->> 'email';
BEGIN
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Sin acceso al portal';
  END IF;

  SELECT * INTO t FROM implementacion_tareas WHERE id = p_tarea_id;
  IF NOT FOUND OR t.cliente_id <> v_cliente THEN
    RAISE EXCEPTION 'Etapa no encontrada';
  END IF;

  IF t.responsable_tipo <> 'cliente' THEN
    RAISE EXCEPTION 'Esta etapa la marca el equipo de implementación';
  END IF;

  IF t.estado = 'completada' THEN
    RETURN json_build_object('ok', true, 'ya_estaba', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM implementacion_tareas p
    WHERE p.id = ANY (t.predecesoras_ids) AND p.estado <> 'completada'
  ) THEN
    RAISE EXCEPTION 'Todavía hay etapas anteriores sin completar';
  END IF;

  UPDATE implementacion_tareas
     SET estado = 'completada', fecha_completada = now()
   WHERE id = t.id;

  -- Cierra el pendiente vinculado (igual que hace la plataforma del equipo)
  IF t.pendiente_id IS NOT NULL THEN
    UPDATE pendientes SET resuelto = true, resolved_at = now() WHERE id = t.pendiente_id;
  END IF;

  INSERT INTO implementacion_tarea_eventos (tarea_id, tipo, autor_email, autor_nombre, detalle)
  VALUES (t.id, 'estado', v_email, 'Cliente (portal)',
          'Completada por el cliente desde el portal');

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION portal_completar_etapa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_completar_etapa(uuid) TO authenticated;
