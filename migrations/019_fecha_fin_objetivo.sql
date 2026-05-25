-- 019_fecha_fin_objetivo.sql
-- Agrega fecha_fin_objetivo a clientes: deadline / fecha limite que el
-- equipo se compromete con el cliente. Se compara con la fecha de fin
-- calculada por el Gantt para detectar atrasos.
--
-- Idempotente.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS fecha_fin_objetivo DATE;

SELECT 'fecha_fin_objetivo agregada a clientes' AS resultado;
