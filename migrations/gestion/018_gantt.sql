-- 018_gantt.sql
-- Base de datos para el Gantt con propagación automática.
--
-- Agrega:
--   - implementacion_plantilla.duracion_dias (cuanto dura la etapa por default)
--   - implementacion_plantilla.predecesoras_orden (que ordenes tienen que terminar antes)
--   - implementacion_tareas.duracion_dias (override por cliente)
--   - implementacion_tareas.predecesoras_ids (UUIDs de las tareas predecesoras del MISMO cliente)
--   - implementacion_tareas.fecha_inicio_calc (calculada por la propagación)
--   - clientes.fecha_inicio_implementacion (cuando arranca la implementacion)
--
-- Actualiza la funcion crear_implementacion_para_cliente para copiar duracion
-- y mapear predecesoras_orden → predecesoras_ids al crear las tareas para un cliente.
--
-- Idempotente.

-- ════════════════════════════════════════
-- 1. Columnas nuevas
-- ════════════════════════════════════════

ALTER TABLE implementacion_plantilla
  ADD COLUMN IF NOT EXISTS duracion_dias INTEGER NOT NULL DEFAULT 3;

ALTER TABLE implementacion_plantilla
  ADD COLUMN IF NOT EXISTS predecesoras_orden INTEGER[] DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE implementacion_tareas
  ADD COLUMN IF NOT EXISTS duracion_dias INTEGER NOT NULL DEFAULT 3;

ALTER TABLE implementacion_tareas
  ADD COLUMN IF NOT EXISTS predecesoras_ids UUID[] DEFAULT ARRAY[]::UUID[];

ALTER TABLE implementacion_tareas
  ADD COLUMN IF NOT EXISTS fecha_inicio_calc DATE;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS fecha_inicio_implementacion DATE;


-- ════════════════════════════════════════
-- 2. Backfill: defaults sensatos para la plantilla existente
-- ════════════════════════════════════════

-- Default predecesoras: cada etapa depende de la anterior (orden - 1)
-- excepto la primera, que no tiene predecesoras.
UPDATE implementacion_plantilla
SET predecesoras_orden = ARRAY[orden - 1]
WHERE orden > 1
  AND (predecesoras_orden IS NULL OR cardinality(predecesoras_orden) = 0);

UPDATE implementacion_plantilla
SET predecesoras_orden = ARRAY[]::INTEGER[]
WHERE orden = 1 AND predecesoras_orden IS NULL;


-- ════════════════════════════════════════
-- 3. Backfill tareas existentes (clientes que ya estan en implementacion)
-- ════════════════════════════════════════
-- Copiar duracion y predecesoras desde la plantilla a las tareas ya creadas.

UPDATE implementacion_tareas t
SET duracion_dias = p.duracion_dias
FROM implementacion_plantilla p
WHERE t.orden = p.orden
  AND t.duracion_dias = 3
  AND p.duracion_dias <> 3;

-- Mapear predecesoras_orden (de la plantilla) a predecesoras_ids (de las tareas del mismo cliente)
UPDATE implementacion_tareas t
SET predecesoras_ids = (
  SELECT COALESCE(array_agg(t2.id ORDER BY t2.orden), ARRAY[]::UUID[])
  FROM implementacion_plantilla p
  JOIN unnest(p.predecesoras_orden) AS pred_orden ON TRUE
  JOIN implementacion_tareas t2 ON t2.cliente_id = t.cliente_id AND t2.orden = pred_orden
  WHERE p.orden = t.orden
)
WHERE (t.predecesoras_ids IS NULL OR cardinality(t.predecesoras_ids) = 0)
  AND EXISTS (
    SELECT 1 FROM implementacion_plantilla p
    WHERE p.orden = t.orden
      AND cardinality(p.predecesoras_orden) > 0
  );


-- ════════════════════════════════════════
-- 4. Actualizar crear_implementacion_para_cliente
-- ════════════════════════════════════════

CREATE OR REPLACE FUNCTION crear_implementacion_para_cliente(p_cliente_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insertadas INTEGER;
BEGIN
  -- Paso 1: insertar las tareas con duracion (sin predecesoras todavia,
  -- porque necesitamos primero todos los UUIDs creados para mapear)
  INSERT INTO implementacion_tareas (cliente_id, orden, tarea, responsable_tipo, duracion_dias)
  SELECT p_cliente_id, p.orden, p.tarea, p.responsable_tipo, COALESCE(p.duracion_dias, 3)
  FROM implementacion_plantilla p
  WHERE NOT EXISTS (
    SELECT 1 FROM implementacion_tareas t
    WHERE t.cliente_id = p_cliente_id AND t.orden = p.orden
  )
  ORDER BY p.orden;

  GET DIAGNOSTICS insertadas = ROW_COUNT;

  -- Paso 2: mapear predecesoras_orden → predecesoras_ids (UUIDs reales)
  UPDATE implementacion_tareas t
  SET predecesoras_ids = (
    SELECT COALESCE(array_agg(t2.id ORDER BY t2.orden), ARRAY[]::UUID[])
    FROM implementacion_plantilla p
    JOIN unnest(p.predecesoras_orden) AS pred_orden ON TRUE
    JOIN implementacion_tareas t2 ON t2.cliente_id = p_cliente_id AND t2.orden = pred_orden
    WHERE p.orden = t.orden
  )
  WHERE t.cliente_id = p_cliente_id
    AND (t.predecesoras_ids IS NULL OR cardinality(t.predecesoras_ids) = 0)
    AND EXISTS (
      SELECT 1 FROM implementacion_plantilla p
      WHERE p.orden = t.orden
        AND cardinality(p.predecesoras_orden) > 0
    );

  RETURN insertadas;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_implementacion_para_cliente(UUID) TO authenticated;


-- ════════════════════════════════════════
-- 5. Verificacion
-- ════════════════════════════════════════

SELECT
  (SELECT COUNT(*) FROM implementacion_plantilla)                                  AS plantilla_etapas,
  (SELECT COUNT(*) FROM implementacion_plantilla WHERE cardinality(predecesoras_orden) > 0) AS con_predecesoras,
  (SELECT COUNT(*) FROM implementacion_tareas)                                     AS tareas_total,
  (SELECT COUNT(*) FROM implementacion_tareas WHERE cardinality(predecesoras_ids) > 0) AS tareas_con_pred,
  (SELECT COUNT(*) FROM clientes WHERE fecha_inicio_implementacion IS NOT NULL)    AS clientes_con_fecha_inicio;
