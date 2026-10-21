-- ====================================================================
-- 056_borradores_categoria.sql
-- Categoría y subtema sugeridos por la IA en los borradores de Whaticket.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
ALTER TABLE consultas_borradores ADD COLUMN IF NOT EXISTS categoria_sugerida text;
ALTER TABLE consultas_borradores ADD COLUMN IF NOT EXISTS subtema_sugerido text;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'consultas_borradores' AND column_name IN ('categoria_sugerida', 'subtema_sugerido');
-- Esperado: 2 filas
