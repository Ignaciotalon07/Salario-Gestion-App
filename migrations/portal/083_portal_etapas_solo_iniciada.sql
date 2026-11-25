-- ====================================================================
-- 083_PORTAL_ETAPAS_SOLO_INICIADA — El cliente NO ve sus tareas hasta que el equipo
-- confirma el inicio de la implementación.
--
-- Flujo: el cliente completa su Preparación → el equipo arma el cronograma (duración,
-- responsable, predecesoras) en Gestión → confirma "Inicio de la implementación"
-- (función iniciar_implementacion, migración 081) → recién ahí el cliente ve sus tareas,
-- su avance y sus fechas.
-- Se hace en la base (no en el navegador): antes de iniciar, la vista no devuelve filas.
-- Idempotente. Correr en Supabase → SQL Editor. Requiere la 081 (columna implementacion_iniciada_at).
-- ====================================================================

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
  WHERE t.cliente_id = portal_cliente_id()
    AND EXISTS (
      SELECT 1 FROM portal_prep pp
      WHERE pp.cliente_id = t.cliente_id AND pp.implementacion_iniciada_at IS NOT NULL
    );

REVOKE ALL ON portal_etapas FROM PUBLIC, anon;
GRANT SELECT ON portal_etapas TO authenticated;

-- Verificación: para un cliente sin inicio confirmado, esto tiene que dar 0
SELECT 'vista_creada' AS que, count(*)::text AS cuantos FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'portal_etapas';
