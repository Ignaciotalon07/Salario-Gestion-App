-- 013_soluciones.sql
-- La tabla 'soluciones' ya existe desde 001_schema.sql con columnas:
-- (id, titulo, cat, sub, pasos, material, aplica, autor, usos, fecha_revision,
--  created_at, updated_at, created_by).
-- Las 8 soluciones seed estan cargadas por 003_seed.sql.
--
-- Esta migracion solo:
-- 1. Habilita realtime sobre la tabla soluciones (faltaba en 002_rls.sql)
-- 2. Verifica que existan las soluciones esperadas
--
-- Idempotente: se puede correr varias veces sin error.

-- ────────── Realtime ──────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE soluciones;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- ────────── Verificacion ──────────
SELECT
  COUNT(*) AS total_soluciones,
  COUNT(*) FILTER (WHERE cat = 'liquidacion')     AS liquidacion,
  COUNT(*) FILTER (WHERE cat = 'errores')         AS errores,
  COUNT(*) FILTER (WHERE cat = 'configuracion')   AS configuracion,
  COUNT(*) FILTER (WHERE cat = 'actualizaciones') AS actualizaciones,
  COUNT(*) FILTER (WHERE cat = 'fuera')           AS fuera
FROM soluciones;
