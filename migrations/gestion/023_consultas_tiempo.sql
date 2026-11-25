-- 023_consultas_tiempo.sql
-- Agrega columna tiempo_resolucion a la tabla consultas (en horas, ej: 1.5).
-- Se usa para medir cuánto consume cada cliente.

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS tiempo_resolucion numeric(6,2);
