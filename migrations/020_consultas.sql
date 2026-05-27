-- ════════════════════════════════════════════════════════════════
-- 020_consultas.sql
-- La tabla consultas ya existe desde 001_schema.sql.
-- Esta migración solo agrega lo que faltaba:
--   1. Columna solucion_id (FK a soluciones)
--   2. Realtime habilitado para sincronizar entre el equipo
-- Idempotente — se puede correr más de una vez sin error.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Agregar solucion_id si no existe ─────────────────────────
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS solucion_id uuid REFERENCES soluciones(id) ON DELETE SET NULL;

-- ── 2. Habilitar realtime (solo si no está ya habilitado) ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'consultas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE consultas;
  END IF;
END $$;
