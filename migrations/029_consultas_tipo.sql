-- 029_consultas_tipo.sql
-- Agrega columna tipo_consulta a la tabla consultas.
-- Valores: 'soporte' | 'programacion' | 'comercial'
-- Por defecto 'soporte' para no romper registros existentes.

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS tipo_consulta text NOT NULL DEFAULT 'soporte';
