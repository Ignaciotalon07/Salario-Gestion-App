-- ====================================================================
-- 085_PORTAL_ETAPAS_ESPERA_A — La vista portal_etapas suma "espera_a": nombres de las tareas
-- anteriores que todavía no se completaron (para decirle al cliente por qué una tarea aún no
-- está habilitada). Idempotente. Correr en Supabase → SQL Editor. Requiere la 083.
-- ====================================================================
CREATE OR REPLACE VIEW portal_etapas AS
  SELECT t.id, t.cliente_id, t.orden, t.tarea, t.fase, t.responsable_tipo, t.estado,
         t.fecha_inicio_calc AS fecha_inicio, t.fecha_estimada AS fecha_fin,
         t.fecha_completada, t.duracion_dias,
         (t.responsable_tipo = 'cliente') AS le_toca_cliente,
         EXISTS (
           SELECT 1 FROM implementacion_tareas p
           WHERE p.id = ANY (t.predecesoras_ids) AND p.estado <> 'completada'
         ) AS bloqueada,
         (SELECT string_agg(p.tarea, ', ' ORDER BY p.orden) FROM implementacion_tareas p
           WHERE p.id = ANY (t.predecesoras_ids) AND p.estado <> 'completada') AS espera_a
  FROM implementacion_tareas t
  WHERE t.cliente_id = portal_cliente_id()
    AND EXISTS (
      SELECT 1 FROM portal_prep pp
      WHERE pp.cliente_id = t.cliente_id AND pp.implementacion_iniciada_at IS NOT NULL
    );
REVOKE ALL ON portal_etapas FROM PUBLIC, anon;
GRANT SELECT ON portal_etapas TO authenticated;
SELECT 'ok' AS resultado;
