-- 043_impl_sin_predecesoras.sql
-- Cambia crear_implementacion_para_cliente() para que las tareas de un
-- cliente NUEVO se creen SIN predecesoras (predecesoras_ids = vacío en
-- todas). Las predecesoras se configuran a mano, tarea por tarea, desde la
-- planilla de cada cliente.
--
-- Importante:
--   * Solo afecta a las implementaciones que se creen DE ACÁ EN ADELANTE.
--   * NO modifica ninguna planilla de implementación ya existente (la
--     función solo inserta filas nuevas; no hace UPDATE sobre nada).
--   * NO toca implementacion_plantilla: su columna predecesoras_orden queda
--     como está (simplemente deja de copiarse a los clientes nuevos).
--
-- Idempotente: CREATE OR REPLACE.

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
  -- Inserta las tareas de la plantilla del tipo elegido, todas con
  -- predecesoras_ids vacío (el default de la columna es ARRAY[]::UUID[],
  -- pero lo dejamos explícito para que quede a la vista).
  -- OJO: también se copia "fase" (la plantilla la define por tarea). Si se
  -- omite, todas caen en el default 'relevamiento' (Fase 1).
  INSERT INTO implementacion_tareas (cliente_id, orden, tarea, responsable_tipo, duracion_dias, fase, predecesoras_ids)
  SELECT p_cliente_id, p.orden, p.tarea, p.responsable_tipo, COALESCE(p.duracion_dias, 3), COALESCE(p.fase, 'relevamiento'), ARRAY[]::UUID[]
  FROM implementacion_plantilla p
  WHERE p.tipo = p_tipo
    AND NOT EXISTS (
      SELECT 1 FROM implementacion_tareas t
      WHERE t.cliente_id = p_cliente_id AND t.orden = p.orden
    )
  ORDER BY p.orden;

  GET DIAGNOSTICS insertadas = ROW_COUNT;

  -- (Antes acá había un "Paso 2" que mapeaba predecesoras_orden de la
  -- plantilla a predecesoras_ids del cliente. Se eliminó a propósito.)

  RETURN insertadas;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_implementacion_para_cliente(UUID, TEXT) TO authenticated;
