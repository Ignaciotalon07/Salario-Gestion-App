-- 025_plantillas_por_tipo.sql
-- Agrega columna "tipo" a implementacion_plantilla y crea 4 plantillas
-- (empresa, estudio, colegio, municipalidad).
-- Corrige el UNIQUE constraint para que sea por (orden, tipo).

-- ── 1. Columna tipo ──────────────────────────────────────────────────
ALTER TABLE implementacion_plantilla
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'empresa';

-- ── 2. Corregir el UNIQUE constraint ────────────────────────────────
-- El constraint viejo es solo en (orden), necesitamos (orden, tipo)
ALTER TABLE implementacion_plantilla
  DROP CONSTRAINT IF EXISTS implementacion_plantilla_orden_key;

ALTER TABLE implementacion_plantilla
  ADD CONSTRAINT implementacion_plantilla_orden_tipo_key
  UNIQUE (orden, tipo);

-- ── 3. Clonar plantilla existente para los otros 3 tipos ─────────────
INSERT INTO implementacion_plantilla
  (orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, tipo)
SELECT orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, 'estudio'
FROM implementacion_plantilla
WHERE tipo = 'empresa'
  AND NOT EXISTS (SELECT 1 FROM implementacion_plantilla WHERE tipo = 'estudio');

INSERT INTO implementacion_plantilla
  (orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, tipo)
SELECT orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, 'colegio'
FROM implementacion_plantilla
WHERE tipo = 'empresa'
  AND NOT EXISTS (SELECT 1 FROM implementacion_plantilla WHERE tipo = 'colegio');

INSERT INTO implementacion_plantilla
  (orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, tipo)
SELECT orden, tarea, responsable_tipo, duracion_dias, predecesoras_orden, 'municipalidad'
FROM implementacion_plantilla
WHERE tipo = 'empresa'
  AND NOT EXISTS (SELECT 1 FROM implementacion_plantilla WHERE tipo = 'municipalidad');

-- ── 4. Actualizar RPC para aceptar p_tipo ────────────────────────────
CREATE OR REPLACE FUNCTION crear_implementacion_para_cliente(
  p_cliente_id UUID,
  p_tipo       TEXT DEFAULT 'empresa'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insertadas INTEGER;
BEGIN
  INSERT INTO implementacion_tareas (cliente_id, orden, tarea, responsable_tipo, duracion_dias)
  SELECT p_cliente_id, p.orden, p.tarea, p.responsable_tipo, COALESCE(p.duracion_dias, 3)
  FROM implementacion_plantilla p
  WHERE p.tipo = p_tipo
    AND NOT EXISTS (
      SELECT 1 FROM implementacion_tareas t
      WHERE t.cliente_id = p_cliente_id AND t.orden = p.orden
    )
  ORDER BY p.orden;

  GET DIAGNOSTICS insertadas = ROW_COUNT;

  UPDATE implementacion_tareas t
  SET predecesoras_ids = (
    SELECT COALESCE(array_agg(t2.id ORDER BY t2.orden), ARRAY[]::UUID[])
    FROM implementacion_plantilla p
    JOIN unnest(p.predecesoras_orden) AS pred_orden ON TRUE
    JOIN implementacion_tareas t2 ON t2.cliente_id = p_cliente_id AND t2.orden = pred_orden
    WHERE p.orden = t.orden AND p.tipo = p_tipo
  )
  WHERE t.cliente_id = p_cliente_id
    AND (t.predecesoras_ids IS NULL OR cardinality(t.predecesoras_ids) = 0)
    AND EXISTS (
      SELECT 1 FROM implementacion_plantilla p
      WHERE p.orden = t.orden AND p.tipo = p_tipo
        AND cardinality(p.predecesoras_orden) > 0
    );

  RETURN insertadas;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_implementacion_para_cliente(UUID, TEXT) TO authenticated;
