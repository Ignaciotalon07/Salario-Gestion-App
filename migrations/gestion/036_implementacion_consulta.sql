-- 036_implementacion_consulta.sql
-- Agrega 'implementacion' como valor válido de tipo_consulta.
-- Se usa cuando se cierra un pendiente de implementación y se registran las horas.
--
-- Idempotente.
-- ====================================================================

ALTER TABLE consultas
  DROP CONSTRAINT IF EXISTS consultas_tipo_consulta_check;

ALTER TABLE consultas
  ADD CONSTRAINT consultas_tipo_consulta_check
  CHECK (tipo_consulta IN ('soporte', 'programacion', 'comercial', 'programacion_interna', 'implementacion'));
