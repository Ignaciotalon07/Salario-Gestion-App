-- ====================================================================
-- 035_programacion_interna.sql
-- Agrega soporte para registrar horas de programación interna
-- en el mismo formulario de consultas, sin asociarlas a un cliente.
--
-- Cambios:
--   1. cliente_nombre pasa a ser nullable (los registros internos no tienen cliente)
--   2. Se agrega 'programacion_interna' al CHECK de tipo_consulta
--
-- Idempotente.
-- ====================================================================

-- 1. Hacer cliente_nombre nullable
ALTER TABLE consultas
  ALTER COLUMN cliente_nombre DROP NOT NULL;

-- 2. Ampliar el CHECK de tipo_consulta
ALTER TABLE consultas
  DROP CONSTRAINT IF EXISTS consultas_tipo_consulta_check;

ALTER TABLE consultas
  ADD CONSTRAINT consultas_tipo_consulta_check
  CHECK (tipo_consulta IN ('soporte', 'programacion', 'comercial', 'programacion_interna'));

-- Verificación
SELECT
  COUNT(*) FILTER (WHERE tipo_consulta = 'programacion_interna') AS prog_interna,
  COUNT(*) FILTER (WHERE cliente_nombre IS NULL)                  AS sin_cliente,
  COUNT(*)                                                        AS total
FROM consultas;
