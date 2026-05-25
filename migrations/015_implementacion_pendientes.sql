-- 015_implementacion_pendientes.sql
-- Agrega columnas:
--   - fecha_estimada (DATE): cuando deberia estar lista la tarea
--   - pendiente_id (UUID): pendiente vinculado al asignar asesor a la tarea
--   - notas: ya existia desde 014
--
-- Idempotente: se puede correr varias veces sin error.

ALTER TABLE implementacion_tareas
  ADD COLUMN IF NOT EXISTS fecha_estimada DATE;

ALTER TABLE implementacion_tareas
  ADD COLUMN IF NOT EXISTS pendiente_id UUID REFERENCES pendientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS impl_tareas_pendiente_idx
  ON implementacion_tareas(pendiente_id)
  WHERE pendiente_id IS NOT NULL;

-- Verificacion
SELECT
  COUNT(*) AS total_tareas,
  COUNT(*) FILTER (WHERE pendiente_id IS NOT NULL) AS tareas_con_pendiente,
  COUNT(*) FILTER (WHERE fecha_estimada IS NOT NULL) AS tareas_con_fecha
FROM implementacion_tareas;
