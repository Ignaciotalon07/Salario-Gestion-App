-- ====================================================================
-- 036_consultas_tipo_implementacion.sql
-- Agrega 'implementacion' al CHECK de tipo_consulta en consultas.
-- El cierre de pendientes de implementación registra horas con este tipo.
-- Idempotente.
-- ====================================================================

ALTER TABLE consultas
  DROP CONSTRAINT IF EXISTS consultas_tipo_consulta_check;

ALTER TABLE consultas
  ADD CONSTRAINT consultas_tipo_consulta_check
  CHECK (tipo_consulta IN ('soporte', 'programacion', 'comercial', 'programacion_interna', 'implementacion'));

-- Verificación
SELECT
  tipo_consulta,
  COUNT(*) AS total
FROM consultas
GROUP BY tipo_consulta
ORDER BY tipo_consulta;
