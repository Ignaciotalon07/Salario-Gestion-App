-- ====================================================================
-- 054_borradores_ia.sql
-- Resumen con IA en los borradores de Whaticket:
--   solucion_sugerida → lo que hizo el asesor para resolverlo (pasos)
--   ia_generado       → true si el detalle/solución los redactó la IA
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
ALTER TABLE consultas_borradores ADD COLUMN IF NOT EXISTS solucion_sugerida text;
ALTER TABLE consultas_borradores ADD COLUMN IF NOT EXISTS ia_generado boolean NOT NULL DEFAULT false;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'consultas_borradores' AND column_name IN ('solucion_sugerida', 'ia_generado');
-- Esperado: 2 filas
