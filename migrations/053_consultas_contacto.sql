-- ====================================================================
-- 053_consultas_contacto.sql
-- Persona del cliente que hizo la consulta (ej: "Angie", "Fabián").
-- Permite ver, en el historial de una empresa, quién consultó.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS contacto TEXT;

CREATE INDEX IF NOT EXISTS idx_consultas_cliente_contacto
  ON consultas(cliente_id, contacto);

SELECT COUNT(*) AS consultas, COUNT(contacto) AS con_contacto FROM consultas;
